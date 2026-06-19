import { connectDB } from '@/lib/mongodb'
import { getSetting } from '@/lib/settings'
import AgentCursor from '@/lib/models/AgentCursor'
import AgentLog from '@/lib/models/AgentLog'
import AgentAction from '@/lib/models/AgentAction'
import { listBotChannels, listOwnerDMs, fetchHistory, addEyes, postMessage, getReactors, getPermalink, userName } from './slack'
import { triage } from './triage'
import { handoff } from './cursor'

const BOT = () => process.env.CALEB_JR_BOT_TOKEN
const USER = () => process.env.CALEB_JR_USER_TOKEN
const APPROVE = 'white_check_mark'
const REJECT = 'x'

// Operational config — plain constants (not secrets), change here in code.
const OWNER_ID = 'U0B5CMFR6MA'           // whose DMs to read; whose ✅ approves
const LOG_CHANNEL = 'C0B70PTF8PM'        // #agent-test — where cards/audit post
const AUTHORIZED = ['*']                  // Slack IDs allowed to request; '*' = anyone
const CONFIDENCE_MIN = 0.8
const ACTION_ALLOWLIST = ['copy', 'config', 'simple-component']
const REACT = true                        // 👀 on actionable items
const DEFAULT_MODE = 'shadow'

// mode + enabled are runtime-tunable via the Settings store (no redeploy).
export async function getAgentControl() {
  const [mode, enabled] = await Promise.all([getSetting('agentMode'), getSetting('agentEnabled')])
  return { mode: mode || DEFAULT_MODE, enabled: enabled !== false }
}

// Pre-phase: read reactions on outstanding approval cards. ✅ → dispatch to
// Cursor; ❌ → drop. Owner reactions only.
export async function processApprovals() {
  const out = { dispatched: 0, rejected: 0, pending: 0 }
  const pending = await AgentAction.find({ status: 'pending' }).limit(50)
  for (const a of pending) {
    const reactors = await getReactors(a.approvalChannel, a.approvalTs).catch(() => ({}))
    if ((reactors[APPROVE] || []).includes(OWNER_ID)) {
      const h = await handoff({ summary: a.summary, source: a.source, messageTs: a.messageTs })
      a.status = h.dispatched ? 'dispatched' : 'approved'
      a.prUrl = h.prUrl
      await a.save()
      out.dispatched++
    } else if ((reactors[REJECT] || []).includes(OWNER_ID)) {
      a.status = 'rejected'
      await a.save()
      out.rejected++
    } else {
      out.pending++
    }
  }
  return out
}

// Scan sources, triage, and (in live mode) post approval cards.
// - oldestOverride: scan from this ts instead of the per-source cursor (rescan).
// - advanceCursor: move the cursor forward after scanning (false for rescan).
// - maxPerSource: cap messages processed per source per run.
export async function runScan({ oldestOverride = null, advanceCursor = true, maxPerSource = 50 } = {}) {
  const { mode } = await getAgentControl()
  // First run for a source (no cursor) starts from "now" — no backfill.
  const nowFloor = `${Math.floor(Date.now() / 1000)}.000000`

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
      oldest = cur?.lastTs && cur.lastTs !== '0' ? cur.lastTs : nowFloor
    }

    let msgs = await fetchHistory(src.id, oldest, src.token)
    msgs = msgs.filter((m) => m.user && m.user !== OWNER_ID)
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

        const authOk = AUTHORIZED.includes('*') || AUTHORIZED.includes(m.user)
        const allowOk = ACTION_ALLOWLIST.includes(r.actionType)
        const confOk = r.confidence >= CONFIDENCE_MIN

        if (r.redundant) {
          // Semantic dedup: duplicates an existing/earlier task.
          decision = 'redundant'
          reason = 'duplicates an existing task'
          s.redundant++
        } else if (confOk && allowOk && authOk) {
          // Actionable + directed at the owner → react 👀 on the original message.
          if (REACT) await addEyes(src.id, m.ts, src.token).catch(() => {})
          if (mode === 'live') {
            const existing = await AgentAction.findOne({ source: src.key, messageTs: m.ts })
            if (!existing && LOG_CHANNEL) {
              const link = await getPermalink(src.id, m.ts, src.token)
              const linkLine = link ? `<${link}|View original message>\n` : ''
              const card = `:robot_face: *Proposed change*\n> ${r.summary}\n_${src.name} · ${r.actionType} · confidence ${r.confidence}_\n${linkLine}React :white_check_mark: to approve · :x: to skip`
              const cardTs = await postMessage(LOG_CHANNEL, card)
              await AgentAction.create({
                source: src.key,
                messageTs: m.ts,
                summary: r.summary,
                actionType: r.actionType,
                confidence: r.confidence,
                approvalChannel: LOG_CHANNEL,
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
          reason = !authOk ? 'requester not authorized' : !allowOk ? `actionType "${r.actionType}" not allowlisted` : `confidence ${r.confidence} < ${CONFIDENCE_MIN}`
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

  return s
}
