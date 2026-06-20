import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { checkMerges } from '@/lib/calebjr/diagnose'

// checkMerges makes GitHub/Haiku/Slack round-trips; raise the function limit.
export const maxDuration = 60

// GitHub calls this when a PR event fires on a watched repo. When a PR is
// merged, we advance the pipeline so the requester is notified within seconds —
// no /rescan or cron wait. Verified via HMAC (X-Hub-Signature-256) using the
// shared signing secret.
export async function POST(req) {
  const raw = await req.text()
  const sig = req.headers.get('x-hub-signature-256') || ''
  // Accept any configured secret: a dedicated GitHub one (for repos owned by
  // someone else, so they never see the Slack secret) or the shared signing
  // secret (used on repos the owner controls directly, e.g. SKYES).
  const secrets = [process.env.GITHUB_WEBHOOK_SECRET, process.env.CALEB_JR_SIGNING_SECRET].filter(Boolean)
  if (secrets.length) {
    const a = Buffer.from(sig)
    const matches = secrets.some((s) => {
      const expected = 'sha256=' + crypto.createHmac('sha256', s).update(raw).digest('hex')
      const b = Buffer.from(expected)
      return a.length === b.length && crypto.timingSafeEqual(a, b)
    })
    if (!matches) return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }

  const event = req.headers.get('x-github-event')
  if (event === 'ping') return NextResponse.json({ ok: true, pong: true })

  let merged = 0
  if (event === 'pull_request') {
    const payload = JSON.parse(raw)
    if (payload.action === 'closed' && payload.pull_request?.merged) {
      merged = await checkMerges()
    }
  }
  return NextResponse.json({ ok: true, merged })
}
