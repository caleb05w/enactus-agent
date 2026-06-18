import { NextResponse } from 'next/server'
import { listCalendarEvents } from '@/lib/calendar'
import { listEventFolders } from '@/lib/drive'

// Events are defined by two sources, unioned by name:
//   1. Google Calendar — the Events team's upcoming/recent events (±1 month)
//   2. Existing Drive folders — events we've already filed finances against
// If a name appears in both, the entry with the more recent date wins.
export async function GET() {
  try {
    const [calendar, folders] = await Promise.all([
      listCalendarEvents().catch((err) => {
        console.warn('[finance/events] calendar failed:', err?.message ?? err)
        return []
      }),
      listEventFolders().catch((err) => {
        console.warn('[finance/events] drive folders failed:', err?.message ?? err)
        return []
      }),
    ])

    const byName = new Map() // lowercased name -> { name, date }
    for (const ev of [...calendar, ...folders]) {
      const key = ev.name.toLowerCase()
      const existing = byName.get(key)
      if (!existing || (ev.date || '') > (existing.date || '')) byName.set(key, ev)
    }

    const events = [...byName.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return NextResponse.json({ events })
  } catch (err) {
    console.error('[finance/events] Error:', err?.message ?? err)
    return NextResponse.json({ error: 'Failed to load events.' }, { status: 500 })
  }
}
