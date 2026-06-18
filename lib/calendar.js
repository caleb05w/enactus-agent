import { google } from 'googleapis'

let cachedAuth = null

function getAuth() {
  if (cachedAuth) return cachedAuth
  cachedAuth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  })
  return cachedAuth
}

function getCalendar() {
  return google.calendar({ version: 'v3', auth: getAuth() })
}

// Matches a leading "[Events]" team tag (any case, optional surrounding space).
const EVENTS_TAG = /^\s*\[events\]\s*/i

// Returns the Events team's events within a ±1 month window, deduplicated by
// name and ordered most-recent first. Recurring meetings are excluded and the
// [Events] team tag is stripped from each name. Shape: [{ name, date }].
export async function listCalendarEvents() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID is not set.')

  const calendar = getCalendar()

  const now = new Date()
  const timeMin = new Date(now)
  timeMin.setMonth(timeMin.getMonth() - 1)
  const timeMax = new Date(now)
  timeMax.setMonth(timeMax.getMonth() + 1)

  const { data } = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  })

  const byName = new Map() // lowercased name -> { name, date }

  for (const event of data.items ?? []) {
    const summary = event.summary?.trim()
    if (!summary) continue
    if (!EVENTS_TAG.test(summary)) continue   // Events team only
    if (/meeting/i.test(summary)) continue    // meetings aren't events

    const name = summary.replace(EVENTS_TAG, '').trim()
    if (!name) continue

    const date = event.start?.dateTime?.slice(0, 10) || event.start?.date || ''
    const key = name.toLowerCase()
    const existing = byName.get(key)
    // Keep the most recent occurrence for a repeated event name.
    if (!existing || (date && date > existing.date)) {
      byName.set(key, { name, date })
    }
  }

  return [...byName.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}
