import { connectDB } from '@/lib/mongodb'
import AgentCursor from '@/lib/models/AgentCursor'
import AgentLog from '@/lib/models/AgentLog'
import AgentAction from '@/lib/models/AgentAction'
import { listBotChannels, listOwnerDMs, fetchHistory, addEyes, postLog, postMessage, getReactors, userName } from './slack'
import { triage } from './triage'
import { handoff } from './cursor'

const BOT = () => process.env.CALEB_JR_BOT_TOKEN
const USER = () => process.env.CALEB_JR_USER_TOKEN
const APPROVE = 'white_check_mark'
const REJECT = 'x'

// Pre-phase: read reactions on outstanding approval cards. ✅ → dispatch to
// Cursor; ❌ → drop. Owner reactions only.
export async function processApprovals(ownerId) {
  const out = { dispatched: 0, rejected: 0, pending: 0 }
  const pending = await AgentAction.find({ status: 'pending' }).limit(50)
  for (const a of pending) {
    const reactors = await getReactors(a.approvalChannel, a.approvalTs).catch(() => ({}))
    if ((reactors[APPROVE] || []).includes(ownerId)) {
      const h = await handoff({ summary: a.summary, source: a.source, messageTs: a.messageTs })
      a.status = h.dispatched ? 'dispatched' : 'approved'
      a.prUrl = h.prUrl
      await a.save()
      out.dispatched++
    } else if ((reactors[REJECT] || []).includes(ownerId)) {
      a.status = 'rejected'
      await a.save()
      out.rejected++
    } else {
      out.pending++
    }
  }
  return out
}

function summaryText(s, label) {
  const head = `:eyes: *Caleb Jr — ${label}* (mode: ${s.mode})`
  const stats = `scanned ${s.scanned} · flagged ${s.flagged} · actionable ${s.actionable} · redundant ${s.redundant} · parked ${s.parked}`
  const items = s.items
    .map((i) => `• [${i.decision}] _${i.source}_ — ${i.summary}${i.reason ? ` (${i.reason})` : ''}`)
    .join('\n')
  return `${head}\n${stats}${items ? `\n${items}` : ''}`
}

// Scan sources, triage, and (in live mode) post approval cards.
// - oldestOverride: scan from this ts instead of the per-source cursor (rescan).
// - advanceCursor: move the cursor forward after scanning (false for rescan).
// - maxPerSource: cap messages processed per source per run.
export async function runScan({ oldestOverride = null, advanceCursor = true, maxPerSource = 50, label = 'diagnostic run' } = {}) {
  const mode = process.env.AGENT_MODE || 'shadow'
  const confMin = parseFloat(process.env.AGENT_CONFIDENCE_MIN || '0.8')
  const allow = (process.env.AGENT_ACTION_ALLOWLIST || 'copy,config,simple-component').split(',').map((x) => x.trim())
  const ownerId = process.env.AGENT_OWNER_USER_ID
  const authorized = (process.env.AGENT_AUTHORIZED_USERS || ownerId || '').split(',').map((x) => x.trim()).filter(Boolean)
  const since = process.env.AGENT_SCRAPE_SINCE || ''

  await connectDB()

  // Open tasks for semantic dedup (Haiku flags new messages that duplicate these).
  const open = await AgentAction.find({ status: { $in: ['pending', 'approved', 'dispatched'] } }).select('summary').limit(100)
  const existingTasks = open.map((t) => t.summary).filter(Boolean)

  const channels = await listBotChannels()
  const dms = await listOwnerDMs()
  const sources = [
    ...channels.map((c) => ({ key: `ch:${c.id}`, id: c.id, token: BOT(), kind: 'channel', name: `#${c.name}` })),
    ...dms.map((d) => ({ key: `dm:${d.id}`, id: d.id, token: USER(), kind: 'dm', name: 'DM' })),
  ]

  const s = { mode, scanned: 0, flagged: 0, actionable: 0, redundant: 0, parked: 0, items: [] }

  for (const src of sources) {
    let oldest = oldestOverride
    if (!oldest) {
      const cur = await AgentCursor.findOne({ source: src.key })
      oldest = cur?.lastTs && cur.lastTs !== '0' ? cur.lastTs : since
    }

    let msgs = await fetchHistory(src.id, oldest, src.token)
    msgs = msgs.filter((m) => m.user && m.user !== ownerId)
    msgs = msgs.sort((a, b) => a.ts.localeCompare(b.ts)).slice(-maxPerSource)
    if (!msgs.length) continue

    s.scanned += msgs.length
    for (const m of msgs) m.fromName = await userName(m.user)

    const results = await triage(msgs, 'Caleb', existingTasks)
    let maxTs = oldest || '0'

    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i]
      if (m.ts > maxTs) maxTs = m.ts

      // Exact idempotency (G11): never re-process the same message.
      if (await AgentLog.findOne({ source: src.key, messageTs: m.ts })) continue

      const r = results.find((x) => x.index === i) || { directedAtOwner: false, actionType: 'none', confidence: 0, summary: '', redundant: false }
      let decision = 'ignored'
      let reason = ''

      if (r.directedAtOwner) {
        s.flagged++
        if (process.env.AGENT_REACT !== 'false') await addEyes(src.id, m.ts, src.token).catch(() => {})

        const authOk = authorized.includes('*') || authorized.includes(m.user)
        const allowOk = allow.includes(r.actionType)
        const confOk = r.confidence >= confMin

        if (r.redundant) {
          // Semantic dedup: duplicates an existing/earlier task.
          decision = 'redundant'
          reason = 'duplicates an existing task'
          s.redundant++
        } else if (confOk && allowOk && authOk) {
          if (mode === 'live') {
            const existing = await AgentAction.findOne({ source: src.key, messageTs: m.ts })
            if (!existing && process.env.AGENT_LOG_CHANNEL) {
              const card = `:robot_face: *Proposed change*\n> ${r.summary}\n_${src.name} · ${r.actionType} · confidence ${r.confidence}_\nReact :white_check_mark: to approve · :x: to skip`
              const cardTs = await postMessage(process.env.AGENT_LOG_CHANNEL, card)
              await AgentAction.create({
                source: src.key,
                messageTs: m.ts,
                summary: r.summary,
                actionType: r.actionType,
                confidence: r.confidence,
                approvalChannel: process.env.AGENT_LOG_CHANNEL,
                approvalTs: cardTs,
                status: 'pending',
              })
              existingTasks.push(r.summary) // dedup later messages in this run
            }
            decision = 'awaiting-approval'
            reason = 'card posted; awaiting ✅'
          } else {
            decision = 'shadow-would-act'
            reason = 'shadow mode — no card posted'
          }
          s.actionable++
        } else {
          decision = 'parked'
          reason = !authOk ? 'requester not authorized' : !allowOk ? `actionType "${r.actionType}" not allowlisted` : `confidence ${r.confidence} < ${confMin}`
          s.parked++
        }
        s.items.push({ decision, source: src.name, summary: r.summary, reason })
      }

      await AgentLog.create({
        source: src.key,
        messageTs: m.ts,
        requesterId: m.user,
        text: src.kind === 'dm' ? undefined : (m.text || '').slice(0, 280),
        summary: r.summary,
        directedAtOwner: r.directedAtOwner,
        actionType: r.actionType,
        confidence: r.confidence,
        decision,
        reason,
      })
    }

    if (advanceCursor) await AgentCursor.findOneAndUpdate({ source: src.key }, { lastTs: maxTs }, { upsert: true })
  }

  if (s.flagged > 0) await postLog(summaryText(s, label)).catch(() => {})
  return s
}
