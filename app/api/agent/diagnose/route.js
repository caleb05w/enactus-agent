import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import AgentCursor from '@/lib/models/AgentCursor'
import AgentLog from '@/lib/models/AgentLog'
import AgentAction from '@/lib/models/AgentAction'
import { listBotChannels, listOwnerDMs, fetchHistory, addEyes, postLog, postMessage, getReactors, userName } from '@/lib/calebjr/slack'
import { triage } from '@/lib/calebjr/triage'
import { handoff } from '@/lib/calebjr/cursor'

const BOT = () => process.env.CALEB_JR_BOT_TOKEN
const USER = () => process.env.CALEB_JR_USER_TOKEN

const MAX_PER_SOURCE = 50
const APPROVE = 'white_check_mark'
const REJECT = 'x'

// Pre-phase: read reactions on outstanding approval cards. ✅ → dispatch to
// Cursor; ❌ → drop. Owner reactions only.
async function processApprovals(ownerId) {
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

function summaryText(s) {
  const head = `:eyes: *Caleb Jr — diagnostic run* (mode: ${s.mode})`
  const stats = `scanned ${s.scanned} · flagged ${s.flagged} · actionable ${s.actionable} · parked ${s.parked}`
  const items = s.items
    .map((i) => `• [${i.decision}] _${i.source}_ — ${i.summary}${i.reason ? ` (${i.reason})` : ''}`)
    .join('\n')
  return `${head}\n${stats}${items ? `\n${items}` : ''}`
}

export async function GET(req) {
  // Cron auth: if CRON_SECRET is set, require it (Vercel Cron sends it).
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  if (process.env.AGENT_ENABLED === 'false') {
    return NextResponse.json({ skipped: 'disabled (AGENT_ENABLED=false)' })
  }
  if (!process.env.CALEB_JR_BOT_TOKEN || !process.env.CALEB_JR_USER_TOKEN) {
    return NextResponse.json({ error: 'Caleb Jr tokens not set' }, { status: 500 })
  }

  const mode = process.env.AGENT_MODE || 'shadow'
  const confMin = parseFloat(process.env.AGENT_CONFIDENCE_MIN || '0.8')
  const allow = (process.env.AGENT_ACTION_ALLOWLIST || 'copy,config,simple-component').split(',').map((s) => s.trim())
  const ownerId = process.env.AGENT_OWNER_USER_ID
  const authorized = (process.env.AGENT_AUTHORIZED_USERS || ownerId || '').split(',').map((s) => s.trim()).filter(Boolean)
  const since = process.env.AGENT_SCRAPE_SINCE || ''

  await connectDB()

  // Pre-phase: act on any approval cards the owner has reacted to since last run.
  const approvals = mode === 'live' ? await processApprovals(ownerId) : { dispatched: 0, rejected: 0, pending: 0 }

  const channels = await listBotChannels()
  const dms = await listOwnerDMs()
  const sources = [
    ...channels.map((c) => ({ key: `ch:${c.id}`, id: c.id, token: BOT(), kind: 'channel', name: `#${c.name}` })),
    ...dms.map((d) => ({ key: `dm:${d.id}`, id: d.id, token: USER(), kind: 'dm', name: 'DM' })),
  ]

  const s = { mode, scanned: 0, flagged: 0, actionable: 0, parked: 0, items: [] }

  for (const src of sources) {
    const cur = await AgentCursor.findOne({ source: src.key })
    const oldest = cur?.lastTs && cur.lastTs !== '0' ? cur.lastTs : since

    let msgs = await fetchHistory(src.id, oldest, src.token)
    // DMs: only messages sent TO the owner (drop the owner's own). Channels:
    // drop messages without a user (bots/system).
    msgs = msgs.filter((m) => m.user && m.user !== ownerId)
    msgs = msgs.sort((a, b) => a.ts.localeCompare(b.ts)).slice(-MAX_PER_SOURCE)
    if (!msgs.length) continue

    s.scanned += msgs.length
    for (const m of msgs) m.fromName = await userName(m.user)

    const results = await triage(msgs, 'Caleb')
    let maxTs = oldest || '0'

    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i]
      if (m.ts > maxTs) maxTs = m.ts

      // Idempotency (G11): never act on the same message twice.
      if (await AgentLog.findOne({ source: src.key, messageTs: m.ts })) continue

      const r = results.find((x) => x.index === i) || { directedAtOwner: false, actionType: 'none', confidence: 0, summary: '' }
      let decision = 'ignored'
      let reason = ''

      if (r.directedAtOwner) {
        s.flagged++
        if (process.env.AGENT_REACT !== 'false') {
          await addEyes(src.id, m.ts, src.token).catch(() => {})
        }
        // "*" = anyone may request (gate then rests on confidence + allowlist + merge).
        const authOk = authorized.includes('*') || authorized.includes(m.user)
        const allowOk = allow.includes(r.actionType)
        const confOk = r.confidence >= confMin

        if (confOk && allowOk && authOk) {
          if (mode === 'live') {
            // Post an approval card (once per message) and wait for the owner's ✅.
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

    await AgentCursor.findOneAndUpdate({ source: src.key }, { lastTs: maxTs }, { upsert: true })
  }

  if (s.flagged > 0) await postLog(summaryText(s)).catch(() => {})

  return NextResponse.json({ ...s, approvals })
}
