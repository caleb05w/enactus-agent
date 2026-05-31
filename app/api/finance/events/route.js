import { NextResponse } from 'next/server'
import { listCalendarEvents } from '@/lib/calendar'

export async function GET() {
  try {
    const events = await listCalendarEvents()
    return NextResponse.json({ events })
  } catch (err) {
    console.error('[finance/events] Error:', err?.message ?? err)
    return NextResponse.json({ error: 'Failed to load events.' }, { status: 500 })
  }
}
