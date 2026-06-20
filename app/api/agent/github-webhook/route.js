import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { checkMerges } from '@/lib/calebjr/diagnose'

// GitHub calls this when a PR event fires on a watched repo. When a PR is
// merged, we advance the pipeline so the requester is notified within seconds —
// no /rescan or cron wait. Verified via HMAC (X-Hub-Signature-256) using the
// shared signing secret.
export async function POST(req) {
  const raw = await req.text()
  const secret = process.env.CALEB_JR_SIGNING_SECRET
  const sig = req.headers.get('x-hub-signature-256') || ''
  if (secret) {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'bad signature' }, { status: 401 })
    }
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
