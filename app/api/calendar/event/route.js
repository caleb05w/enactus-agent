import { NextResponse } from 'next/server'
import { createCalendarEvent } from '@/lib/calendar'

// Create a calendar event. Write endpoint — token-guarded and fail-closed: if no
// token is configured it refuses, so it's never an open calendar-write hole.
// Caller (Caleb Jr, or you testing) sends: Authorization: Bearer <token>.
export const maxDuration = 30

function check(req) {
  const token = process.env.CALENDAR_WRITE_TOKEN || process.env.CRON_SECRET
  if (!token) return 'unconfigured'
  return req.headers.get('authorization') === `Bearer ${token}` ? 'ok' : 'denied'
}

export async function POST(req) {
  const state = check(req)
  if (state === 'unconfigured') {
    return NextResponse.json({ error: 'calendar writes not enabled — set CALENDAR_WRITE_TOKEN' }, { status: 503 })
  }
  if (state !== 'ok') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  try {
    const event = await createCalendarEvent(body)
    return NextResponse.json({ ok: true, event })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
