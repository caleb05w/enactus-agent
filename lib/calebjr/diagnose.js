import { connectDB } from '@/lib/mongodb'
import { getSetting } from '@/lib/settings'
import AgentCursor from '@/lib/models/AgentCursor'
import AgentLog from '@/lib/models/AgentLog'
import AgentAction from '@/lib/models/AgentAction'
import { listBotChannels, listOwnerDMs, fetchHistory, addEyes, postMessage, getReactors, getPermalink, dmOwner, replyInThread, postAsUser, deleteMessage, userName } from './slack'
import { triage, friendlyComplete } from './triage'
import { handoff, getAgent, agentOutcome, prLinkOf } from './cursor'

const BOT_TOKEN = () => process.env.CALEB_JR_BOT_TOKEN

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
// ✅ → launch a Cursor agent; ❌ → drop. Owner reactions only.
export async function processApprovals() {
  const out = { dispatched: 0, rejected: 0, failed: 0, pending: 0 }
  const pending = await AgentAction.find({ status: 'pending' }).limit(50)
  for (const a of pending) {
    const reactors = await getReactors(a.approvalChannel, a.approvalTs).catch(() => ({}))
    if ((reactors[APPROVE] || []).includes(OWNER_ID)) {
      const h = await handoff({ summary: a.summary, messageLink: a.messageLink })
      if (h.dispatched) {
        a.status = 'dispatched'
        a.cursorAgentId = h.agentId
        a.cursorUrl = h.cursorUrl
        a.branch = h.branch
        await a.save()
        out.dispatched++
      } else {
        a.status = 'failed'
        await a.save()
        await dmOwner(OWNER_ID, `:warning: Couldn't launch the agent for "${a.summary}": ${h.reason}`, LOG_CHANNEL)
        out.failed++
      }
    } else if ((reactors[REJECT] || []).includes(OWNER_ID)) {
      a.status = 'rejected'
      await a.save()
      await deleteMessage(a.approvalChannel, a.approvalTs) // clear the card
      out.rejected++
    } else {
      out.pending++
    }
  }
  return out
}

// Report a finished agent: DM the owner the merge link, reply to the initiator.
async function reportReady(a, agent) {
  const prUrl = prLinkOf(agent, a.cursorUrl)
  a.status = 'completed'
  a.prUrl = prUrl
  a.reportedAt = new Date()
  await a.save()

  await dmOwner(
    OWNER_ID,
    `:white_check_mark: *Ready to merge* — ${a.summary}\nChecks passed and review addressed. Squash & merge: ${prUrl}`,
    LOG_CHANNEL
  )

  // Tell the requester it's done, in plain non-technical language.
  if (a.requesterId) {
    const friendly = await friendlyComplete(a.summary)
    const channelId = a.source?.slice(3)
    if (a.source?.startsWith('ch:')) {
      // Channel: the bot replies in-thread, mentioning the requester.
      await replyInThread(channelId, a.messageTs, `<@${a.requesterId}> ${friendly}`, BOT_TOKEN()).catch(() => {})
    } else if (a.source?.startsWith('dm:')) {
      // DM: reply as the owner's own account, flagged as automated.
      await postAsUser(channelId, `${friendly}\n\n_(automated message sent by my agent)_`).catch(() => {})
    }
  }
}

// Poll launched agents; report the ones that finished, flag the ones that failed.
export async function pollDispatched() {
  const out = { completed: 0, failed: 0, running: 0 }
  const dispatched = await AgentAction.find({ status: 'dispatched', cursorAgentId: { $ne: null } }).limit(25)
  for (const a of dispatched) {
    let agent
    try {
      agent = await getAgent(a.cursorAgentId)
    } catch {
      out.running++
      continue
    }
    const outcome = agentOutcome(agent)
    if (outcome === 'done') {
      await reportReady(a, agent)
      out.completed++
    } else if (outcome === 'failed') {
      a.status = 'failed'
      await a.save()
      await dmOwner(OWNER_ID, `:warning: The agent failed on "${a.summary}". Details: ${a.cursorUrl || ''}`, LOG_CHANNEL)
      out.failed++
    } else {
      out.running++
    }
  }
  return out
}

// Cheap, no-LLM pipeline tick: act on approvals + report finished agents.
export async function advancePipeline() {
  const approvals = await processApprovals()
  const dispatched = await pollDispatched()
  return { approvals, dispatched }
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

    const items = await triage(msgs, 'Caleb', existingTasks)
    let maxTs = oldest || '0'

    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i]
      if (m.ts > maxTs) maxTs = m.ts

      // Message-level idempotency (G11): never re-process the same message.
      if (await AgentLog.findOne({ source: src.key, messageTs: m.ts })) continue

      const text = src.kind === 'dm' ? undefined : (m.text || '').slice(0, 280)
      const asks = items.filter((x) => x.messageIndex === i && x.directedAtOwner)

      // Nothing directed at the owner — log an idempotency marker and move on.
      if (!asks.length) {
        await AgentLog.create({ source: src.key, messageTs: m.ts, itemIndex: 0, requesterId: m.user, text, directedAtOwner: false, decision: 'ignored' })
        continue
      }

      // One message can yield several actionable items — handle each.
      const authOk = AUTHORIZED.includes('*') || AUTHORIZED.includes(m.user)
      let link = ''
      let needsEyes = false
      let n = 0

      for (const it of asks) {
        s.flagged++
        const allowOk = ACTION_ALLOWLIST.includes(it.actionType)
        const confOk = it.confidence >= CONFIDENCE_MIN
        let decision = 'ignored'
        let reason = ''

        if (it.redundant) {
          decision = 'redundant'
          reason = 'duplicates an existing task'
          s.redundant++
        } else if (confOk && allowOk && authOk) {
          needsEyes = true
          if (mode === 'live' && LOG_CHANNEL) {
            if (!link) link = await getPermalink(src.id, m.ts, src.token)
            const linkLine = link ? `<${link}|View original message>\n` : ''
            const card = `:robot_face: *Proposed change*\n> ${it.summary}\n_${src.name} · ${it.actionType} · confidence ${it.confidence}_\n${linkLine}React :white_check_mark: to approve · :x: to skip`
            const cardTs = await postMessage(LOG_CHANNEL, card)
            await AgentAction.create({
              source: src.key,
              messageTs: m.ts,
              itemIndex: n,
              summary: it.summary,
              actionType: it.actionType,
              confidence: it.confidence,
              approvalChannel: LOG_CHANNEL,
              approvalTs: cardTs,
              status: 'pending',
              requesterId: m.user,
              messageLink: link,
            })
            existingTasks.push(it.summary) // dedup later items/messages this run
            decision = 'awaiting-approval'
            reason = 'card posted; awaiting ✅'
          } else {
            decision = 'shadow-would-act'
            reason = 'shadow mode — no card posted'
          }
          s.actionable++
        } else {
          decision = 'parked'
          reason = !authOk ? 'requester not authorized' : !allowOk ? `actionType "${it.actionType}" not allowlisted` : `confidence ${it.confidence} < ${CONFIDENCE_MIN}`
          s.parked++
        }

        s.items.push({ decision, source: src.name, summary: it.summary, reason })
        await AgentLog.create({
          source: src.key,
          messageTs: m.ts,
          itemIndex: n,
          requesterId: m.user,
          text,
          summary: it.summary,
          directedAtOwner: true,
          actionType: it.actionType,
          confidence: it.confidence,
          decision,
          reason,
        })
        n++
      }

      // React 👀 once on the message if any item was actionable.
      if (needsEyes && REACT) await addEyes(src.id, m.ts, src.token).catch(() => {})
    }

    if (advanceCursor) await AgentCursor.findOneAndUpdate({ source: src.key }, { lastTs: maxTs }, { upsert: true })
  }

  return s
}
