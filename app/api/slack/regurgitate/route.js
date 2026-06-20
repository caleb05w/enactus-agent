import { NextResponse, after } from 'next/server'
import crypto from 'crypto'
import { connectDB } from '@/lib/mongodb'
import AgentAction from '@/lib/models/AgentAction'
import { getPermalink } from '@/lib/calebjr/slack'

const OWNER_ID = 'U0B5CMFR6MA'
const BOT = () => process.env.CALEB_JR_BOT_TOKEN

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
  completed: 'ready to merge',
}

// Open = not yet resolved by the agent (PR pushed) and not dismissed by you.
const OPEN_STATUSES = ['pending', 'dispatched', 'failed', 'completed']

// /regurgitate — show the owner their last 10 open tasks via their cards.
export async function POST(req) {
  const raw = await req.text()
  if (!verifySlack(raw, req.headers)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }

  const params = new URLSearchParams(raw)
  const responseUrl = params.get('response_url')

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

      const lines = []
      for (const t of tasks) {
        let link = t.messageLink || ''
        if (t.status === 'completed' && t.prUrl) {
          link = t.prUrl
        } else if (t.approvalChannel && t.approvalTs) {
          const p = await getPermalink(t.approvalChannel, t.approvalTs, BOT()).catch(() => '')
          if (p) link = p
        }
        const label = STATE[t.status] || t.status
        const repo = t.repoName ? ` _→ ${t.repoName}_` : ''
        lines.push(`• [${label}] ${t.summary}${repo}${link ? ` — <${link}|open>` : ''}`)
      }

      await reply(responseUrl, `:repeat: *Your last ${tasks.length} tasks*\n${lines.join('\n')}`)
    } catch (e) {
      await reply(responseUrl, `Couldn't fetch tasks: ${e.message}`)
    }
  })

  return NextResponse.json({ response_type: 'ephemeral', text: ':repeat: Fetching your tasks…' })
}
