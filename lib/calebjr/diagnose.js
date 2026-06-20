import { connectDB } from '@/lib/mongodb'
import { getSetting } from '@/lib/settings'
import AgentCursor from '@/lib/models/AgentCursor'
import AgentLog from '@/lib/models/AgentLog'
import AgentAction from '@/lib/models/AgentAction'
import { listBotChannels, listOwnerDMs, fetchHistory, addEyes, postBlocks, replaceMessage, getPermalink, dmOwner, replyInThread, postAsUser, userName } from './slack'
import { triage, friendlyComplete } from './triage'
import { handoff, getAgent, agentOutcome, prLinkOf, repoOptions, resolveRepo } from './cursor'
import { proposalBlocks, failedBlocks, statusBlocks } from './cards'

const BOT_TOKEN = () => process.env.CALEB_JR_BOT_TOKEN
const BOT = () => process.env.CALEB_JR_BOT_TOKEN
const USER = () => process.env.CALEB_JR_USER_TOKEN

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
  const [mode, enabled, scanOwner] = await Promise.all([getSetting('agentMode'), getSetting('agentEnabled'), getSetting('agentScanOwner')])
  return { mode: mode || DEFAULT_MODE, enabled: enabled !== false, scanOwner: scanOwner === true }
}

// Gate 1 — owner clicked Approve on a card. Launch the Cursor agent NOW and
// update the card in place. repoKey comes from the card's repo dropdown.
export async function approveTask(actionId, repoKey, responseUrl) {
  await connectDB()
  const a = await AgentAction.findById(actionId).catch(() => null)
  if (!a) return
  if (a.status !== 'pending') {
    await replaceMessage(responseUrl, statusBlocks(`This task was already handled (${a.status}).`), 'already handled')
    return
  }
  const repo = resolveRepo(repoKey) || (a.repoName ? resolveRepo(a.repoName) : null)
  if (!repo) {
    await replaceMessage(responseUrl, statusBlocks(`:warning: Pick a target repo before approving — "${a.summary}".`), 'pick a repo')
    return
  }
  const h = await handoff({ summary: a.summary, messageLink: a.messageLink, repoUrl: repo.url, repoRef: repo.ref })
  if (h.dispatched) {
    a.status = 'dispatched'
    a.cursorAgentId = h.agentId
    a.cursorUrl = h.cursorUrl
    a.branch = h.branch
    a.repoName = repo.name
    a.repoUrl = repo.url
    a.repoRef = repo.ref
    await a.save()
    await replaceMessage(responseUrl, statusBlocks(`:rocket: *Approved* — building “${a.summary}” on \`${repo.name}\`. You'll get the merge link when it's ready.`), 'approved')
  } else {
    await replaceMessage(responseUrl, statusBlocks(`:warning: Couldn't launch “${a.summary}”: ${h.reason}`), 'launch failed')
  }
}

// Owner clicked Skip — dismiss the task and clear the card.
export async function skipTask(actionId, responseUrl) {
  await connectDB()
  const a = await AgentAction.findById(actionId).catch(() => null)
  if (!a) return
  if (a.status === 'pending') {
    a.status = 'rejected'
    await a.save()
  }
  await replaceMessage(responseUrl, statusBlocks(`:wastebasket: *Dismissed* — ${a.summary}`), 'dismissed')
}

// Owner clicked Retry on a failed task — relaunch on its stored repo.
export async function retryTask(actionId, repoKey, responseUrl) {
  await connectDB()
  const a = await AgentAction.findById(actionId).catch(() => null)
  if (!a) return
  if (['dispatched', 'pr_ready', 'completed', 'merged'].includes(a.status)) {
    await replaceMessage(responseUrl, statusBlocks(`Already ${a.status} — nothing to retry.`), 'noop')
    return
  }
  const repo = resolveRepo(repoKey) || (a.repoName ? resolveRepo(a.repoName) : null)
  if (!repo) {
    await replaceMessage(responseUrl, statusBlocks(`:warning: Pick a target repo before retrying “${a.summary}”.`), 'pick a repo')
    return
  }
  const h = await handoff({ summary: a.summary, messageLink: a.messageLink, repoUrl: repo.url, repoRef: repo.ref })
  if (h.dispatched) {
    a.status = 'dispatched'
    a.cursorAgentId = h.agentId
    a.cursorUrl = h.cursorUrl
    a.branch = h.branch
    a.repoName = repo.name
    a.repoUrl = repo.url
    a.repoRef = repo.ref
    await a.save()
    await replaceMessage(responseUrl, statusBlocks(`:rocket: *Retrying* — “${a.summary}” on \`${repo.name}\`.`), 'retrying')
  } else {
    await replaceMessage(responseUrl, statusBlocks(`:warning: Retry couldn't launch: ${h.reason}`), 'retry failed')
  }
}

// Agent finished + PR open → DM the owner the merge link (Gate 2 input).
// The requester is NOT told yet — that waits until the owner actually merges.
async function reportReady(a, agent) {
  const prUrl = prLinkOf(agent, a.cursorUrl)
  a.status = 'pr_ready'
  a.prUrl = prUrl
  a.reportedAt = new Date()
  await a.save()

  await dmOwner(
    OWNER_ID,
    `:white_check_mark: *Ready to merge* — ${a.summary}\nChecks passed and review addressed. Squash & merge: ${prUrl}`,
    LOG_CHANNEL
  )
}

// Tell the requester it's done, in plain non-technical language. Fires only
// after the PR is merged.
async function notifyRequester(a) {
  if (!a.requesterId) return
  const friendly = await friendlyComplete(a.summary)
  const channelId = a.source?.slice(3)
  if (a.source?.startsWith('ch:')) {
    await replyInThread(channelId, a.messageTs, `<@${a.requesterId}> ${friendly}`, BOT_TOKEN()).catch(() => {})
  } else if (a.source?.startsWith('dm:')) {
    await postAsUser(channelId, `${friendly}\n\n_(automated message sent by my agent)_`).catch(() => {})
  }
}

// Is this PR merged? (public repo — unauthenticated GitHub read.)
async function isPrMerged(prUrl) {
  const m = (prUrl || '').match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!m) return false
  try {
    const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/pulls/${m[3]}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'caleb-jr' },
    })
    if (!res.ok) return false
    const pr = await res.json()
    return pr.merged === true || !!pr.merged_at
  } catch {
    return false
  }
}

// PRs the owner has merged → notify the requester now.
export async function checkMerges() {
  const ready = await AgentAction.find({ status: { $in: ['pr_ready', 'completed'] } }).limit(25)
  let merged = 0
  for (const a of ready) {
    if (await isPrMerged(a.prUrl)) {
      a.status = 'merged'
      await a.save()
      await notifyRequester(a)
      merged++
    }
  }
  return merged
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
      // Post a failure card with a Retry button, and point the task's card link at it.
      if (LOG_CHANNEL) {
        const ts = await postBlocks(LOG_CHANNEL, failedBlocks(a, repoOptions()), `Task failed: ${a.summary}`).catch(() => null)
        if (ts) a.approvalTs = ts
      }
      await a.save()
      out.failed++
    } else {
      out.running++
    }
  }
  return out
}

// Cheap, no-LLM pipeline tick: report finished agents (→ DM owner the merge
// link) and notify requesters for any PRs the owner has since merged.
// (Approvals are instant via the card buttons, not polled here.)
export async function advancePipeline() {
  const dispatched = await pollDispatched()
  const merged = await checkMerges()
  return { dispatched, merged }
}

// Scan sources, triage, and (in live mode) post approval cards.
// - oldestOverride: scan from this ts instead of the per-source cursor (rescan).
// - advanceCursor: move the cursor forward after scanning (false for rescan).
// - maxPerSource: cap messages processed per source per run.
export async function runScan({ oldestOverride = null, advanceCursor = true, maxPerSource = 50 } = {}) {
  const { mode, scanOwner } = await getAgentControl()
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
    ...dms.map((d) => ({ key: `dm:${d.id}`, id: d.id, token: USER(), kind: 'dm', name: d.user === OWNER_ID ? 'self-DM' : 'DM', self: d.user === OWNER_ID })),
  ]

  const s = { mode, scanned: 0, flagged: 0, actionable: 0, redundant: 0, parked: 0, items: [] }

  for (const src of sources) {
    let oldest = oldestOverride
    if (!oldest) {
      const cur = await AgentCursor.findOne({ source: src.key })
      oldest = cur?.lastTs && cur.lastTs !== '0' ? cur.lastTs : nowFloor
    }

    let msgs = await fetchHistory(src.id, oldest, src.token)
    // Ignore the owner's own messages everywhere EXCEPT their self-DM (a task
    // inbox) — there, the owner messaging themselves IS the task. scanOwner
    // overrides this and includes owner messages everywhere (for testing).
    msgs = msgs.filter((m) => m.user && (scanOwner || src.self || m.user !== OWNER_ID))
    msgs = msgs.sort((a, b) => a.ts.localeCompare(b.ts)).slice(-maxPerSource)
    if (!msgs.length) continue

    s.scanned += msgs.length
    for (const m of msgs) m.fromName = await userName(m.user)

    const items = await triage(msgs, 'Caleb', existingTasks, repoOptions())
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

        const repo = resolveRepo(it.repo)

        if (it.redundant) {
          decision = 'redundant'
          reason = 'duplicates an existing task'
          s.redundant++
        } else if (confOk && allowOk && authOk && repo) {
          needsEyes = true
          if (mode === 'live' && LOG_CHANNEL) {
            if (!link) link = await getPermalink(src.id, m.ts, src.token)
            const a = await AgentAction.create({
              source: src.key,
              messageTs: m.ts,
              itemIndex: n,
              summary: it.summary,
              actionType: it.actionType,
              confidence: it.confidence,
              approvalChannel: LOG_CHANNEL,
              status: 'pending',
              requesterId: m.user,
              messageLink: link,
              sourceName: src.name,
              repoName: repo.name,
              repoUrl: repo.url,
              repoRef: repo.ref,
            })
            const cardTs = await postBlocks(LOG_CHANNEL, proposalBlocks(a, repoOptions()), `Proposed: ${it.summary}`)
            a.approvalTs = cardTs
            await a.save()
            existingTasks.push(it.summary) // dedup later items/messages this run
            decision = 'awaiting-approval'
            reason = `card posted (→ ${repo.name})`
          } else {
            decision = 'shadow-would-act'
            reason = 'shadow mode — no card posted'
          }
          s.actionable++
        } else {
          decision = 'parked'
          reason = !authOk ? 'requester not authorized' : !allowOk ? `actionType "${it.actionType}" not allowlisted` : !repo ? 'target repo unclear — assign manually' : `confidence ${it.confidence} < ${CONFIDENCE_MIN}`
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
