import { NextResponse } from 'next/server'
import { advancePipeline } from '@/lib/calebjr/diagnose'

// Cursor calls this when an agent's status changes. We don't trust the payload —
// we just use it as a trigger to advance the pipeline (report finished agents,
// notify requesters for merged PRs) instead of waiting for the cron/rescan tick.
// Token-guarded via the URL.
export async function POST(req) {
  const token = new URL(req.url).searchParams.get('token')
  const secret = process.env.CALEB_JR_SIGNING_SECRET
  if (secret && token !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const out = await advancePipeline()
  return NextResponse.json({ ok: true, ...out })
}
