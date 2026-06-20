import { NextResponse, after } from 'next/server'
import crypto from 'crypto'
import { runScan, advancePipeline, getAgentControl } from '@/lib/calebjr/diagnose'

// Scan + pipeline make many external round-trips; raise the function limit.
export const maxDuration = 60

const OWNER_ID = 'U0B5CMFR6MA' // only the owner may trigger scans

// Verify the request really came from Slack (HMAC over the raw body).
function verifySlack(rawBody, headers) {
  const secret = process.env.CALEB_JR_SIGNING_SECRET
  if (!secret) return true // no secret configured (dev) — skip
  const ts = headers.get('x-slack-request-timestamp')
  const sig = headers.get('x-slack-signature')
  if (!ts || !sig) return false
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false // stale
  const base = `v0:${ts}:${rawBody}`
  const mine = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex')
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

export async function POST(req) {
  const raw = await req.text()
  if (!verifySlack(raw, req.headers)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }

  const params = new URLSearchParams(raw)
  const responseUrl = params.get('response_url')

  if (params.get('user_id') !== OWNER_ID) {
    return NextResponse.json({ response_type: 'ephemeral', text: 'Only the owner can run this.' })
  }

  const days = parseInt((params.get('text') || '').trim(), 10)

  if (!days || days < 1 || days > 90) {
    return NextResponse.json({
      response_type: 'ephemeral',
      text: 'Usage: `/rescan <days>` — e.g. `/rescan 10` to scan the last 10 days (1–90).',
    })
  }

  const oldest = `${Math.floor(Date.now() / 1000) - days * 86400}.000000`

  // Respond within Slack's 3s window, then do the scan in the background.
  after(async () => {
    try {
      // Push the pipeline forward too: launch any ✅'d tasks, report finished agents.
      const { mode } = await getAgentControl()
      if (mode === 'live') await advancePipeline()
      const s = await runScan({ oldestOverride: oldest, advanceCursor: false, maxPerSource: 200, label: `rescan last ${days}d` })
      await reply(
        responseUrl,
        `:mag: Rescanned last ${days} days — scanned ${s.scanned}, flagged ${s.flagged}, new cards ${s.actionable}, redundant ${s.redundant}, parked ${s.parked}.`
      )
    } catch (e) {
      await reply(responseUrl, `Rescan failed: ${e.message}`)
    }
  })

  return NextResponse.json({ response_type: 'ephemeral', text: `:mag: Rescanning the last ${days} days…` })
}
