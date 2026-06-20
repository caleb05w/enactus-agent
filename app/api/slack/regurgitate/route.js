import { NextResponse, after } from 'next/server'
import crypto from 'crypto'
import { connectDB } from '@/lib/mongodb'
import AgentAction from '@/lib/models/AgentAction'
import { postBlocks, deleteMessage, ownerDMChannel } from '@/lib/calebjr/slack'
import { proposalBlocks, failedBlocks } from '@/lib/calebjr/cards'
import { repoOptions } from '@/lib/calebjr/cursor'

const OWNER_ID = 'U0B5CMFR6MA'
const LOG_CHANNEL = 'C0B70PTF8PM'

function verifySlack(rawBody, headers) {
  const secret = process.env.CALEB_JR_SIGNING_SECRET
  if (!secret) return true
  const ts = headers.get('x-slack-request-timestamp')
  const sig = headers.get('x-slack-signature')
  if (!ts || !sig) return false
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  const mine = 'v0=' + crypto.createHmac('sha256', secret).update(`v0:${ts}:${rawBody}`).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(sig))
  } catch {
    return false
  }
}

async function reply(responseUrl, text) {
  if (!responseUrl) return
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response_type: 'in_channel', text }),
  })
}

const STATE = {
  pending: 'needs ✅ / ❌',
  dispatched: 'in progress',
  failed: 'failed — needs a retry',
  pr_ready: 'ready for you to merge',
  completed: 'ready for you to merge',
}

// Open = not yet resolved (still needs you to approve, retry, or merge). Once
// you merge — status 'merged' — the requester is notified and it drops off.
const OPEN_STATUSES = ['pending', 'dispatched', 'failed', 'pr_ready', 'completed']

// /regurgitate — show the owner their last 10 open tasks via their cards.
export async function POST(req) {
  const raw = await req.text()
  if (!verifySlack(raw, req.headers)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }

  const params = new URLSearchParams(raw)
  const responseUrl = params.get('response_url')
  const invokedIn = params.get('channel_id') // post cards back where it was run

  if (params.get('user_id') !== OWNER_ID) {
    return NextResponse.json({ response_type: 'ephemeral', text: 'These are the owner’s tasks — not available to you.' })
  }

  after(async () => {
    try {
      await connectDB()
      const tasks = await AgentAction.find({ status: { $in: OPEN_STATUSES } })
        .sort({ createdAt: -1 })
        .limit(10)

      if (!tasks.length) {
        await reply(responseUrl, ':repeat: No open tasks right now.')
        return
      }

      let requeued = 0
      const lines = []
      for (const t of tasks) {
        const repo = t.repoName ? ` _→ ${t.repoName}_` : ''
        const label = STATE[t.status] || t.status

        // Re-post a fresh interactive card for actionable tasks, in the channel
        // where /regurgitate was run (falls back to the owner DM if the bot
        // can't post there).
        if (t.status === 'pending' || t.status === 'failed') {
          if (t.approvalTs) await deleteMessage(t.approvalChannel || LOG_CHANNEL, t.approvalTs)
          const repos = await repoOptions()
          const blocks = t.status === 'pending' ? proposalBlocks(t, repos) : failedBlocks(t, repos)
          let dest = invokedIn || LOG_CHANNEL
          let ts
          try {
            ts = await postBlocks(dest, blocks, t.summary)
          } catch {
            dest = (await ownerDMChannel(OWNER_ID)) || LOG_CHANNEL
            ts = await postBlocks(dest, blocks, t.summary)
          }
          t.approvalChannel = dest
          t.approvalTs = ts
          await t.save()
          requeued++
          lines.push(`• [${label}] ${t.summary}${repo}`)
        } else {
          const link = (t.status === 'pr_ready' || t.status === 'completed') && t.prUrl ? ` — <${t.prUrl}|PR>` : ''
          lines.push(`• [${label}] ${t.summary}${repo}${link}`)
        }
      }

      await reply(responseUrl, `:repeat: *Open tasks* — ${requeued} re-queued as cards here\n${lines.join('\n')}`)
    } catch (e) {
      await reply(responseUrl, `Couldn't fetch tasks: ${e.message}`)
    }
  })

  return NextResponse.json({ response_type: 'ephemeral', text: ':repeat: Fetching your tasks…' })
}
