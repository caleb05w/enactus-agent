import { NextResponse } from 'next/server'
import { pollDispatched } from '@/lib/calebjr/diagnose'

// Cursor calls this when an agent's status changes. We don't trust the payload —
// we just use it as a trigger to settle any finished agents (report-back now,
// instead of waiting for the cron/rescan tick). Token-guarded via the URL.
export async function POST(req) {
  const token = new URL(req.url).searchParams.get('token')
  const secret = process.env.CALEB_JR_SIGNING_SECRET
  if (secret && token !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const out = await pollDispatched()
  return NextResponse.json({ ok: true, ...out })
}
