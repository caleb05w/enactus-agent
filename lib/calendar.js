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

// Returns deduplicated, alphabetically sorted event titles from a ±6 month window.
export async function listCalendarEvents() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID is not set.')

  const calendar = getCalendar()

  const now = new Date()
  const timeMin = new Date(now)
  timeMin.setMonth(timeMin.getMonth() - 6)
  const timeMax = new Date(now)
  timeMax.setMonth(timeMax.getMonth() + 6)

  const { data } = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  })

  const seen = new Set()
  const names = []

  for (const event of data.items ?? []) {
    const summary = event.summary?.trim()
    if (!summary) continue
    const key = summary.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      names.push(summary)
    }
  }

  return names.sort()
}
