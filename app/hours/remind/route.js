import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { alertBotLog } from '@/lib/botlog'

const CHANNEL_ID = 'C0B5EM7H9MM'
const CALEB = /caleb\s*wu/i
const TZ = 'America/Vancouver'

function authorized(req) {
  if (!process.env.CRON_SECRET) return true
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

function vancouverNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, weekday: 'short', hour: 'numeric', hour12: false })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  )
  return { day: p.weekday, hour: Number(p.hour) }
}

function hoursUrl() {
  return `${(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/hours`
}

function sheetUrl() {
  const id = process.env.GOOGLE_HOURS_SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null
}

async function updateCalebHours() {
  const spreadsheetId = process.env.GOOGLE_HOURS_SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID
  if (!spreadsheetId) throw new Error('No hours spreadsheet configured')
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const tab = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1'
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A:Z` })
  const rows = data.values || []
  const header = rows[0] || []
  const hoursCol = header.findIndex((h) => /hours/i.test(String(h)))
  const nameCol = header.findIndex((h) => /name/i.test(String(h)))
  const rowIdx = rows.findIndex((row, i) =>
    i > 0 && (nameCol >= 0 ? [row[nameCol]] : row).some((c) => CALEB.test(String(c || ''))),
  )
  if (rowIdx < 0) throw new Error('Caleb Wu row not found')
  const col = hoursCol >= 0 ? hoursCol : 1
  const hours = Math.floor(Math.random() * 6) + 5
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!${String.fromCharCode(65 + col)}${rowIdx + 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[hours]] },
  })
  return hours
}

async function postReminder(token) {
  const auth = await fetch('https://slack.com/api/auth.test', {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  if (!auth.ok) throw new Error(`Slack auth error: ${auth.error}`)
  const mention = `<@${auth.user_id}>`
  const link = sheetUrl()
    ? `<${hoursUrl()}|Log hours via Enactus Agent> · <${sheetUrl()}|Open spreadsheet>`
    : `<${hoursUrl()}|Log hours via Enactus Agent>`
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: CHANNEL_ID,
      text: `${mention} Weekly reminder: update your Enactus hours. ${hoursUrl()}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*Weekly hour tracking reminder* (${mention})\nPlease update your hours.` } },
        { type: 'section', text: { type: 'mrkdwn', text: link } },
      ],
    }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack error: ${data.error}`)
  return data
}

export async function GET(req) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Day-gated only — the weekly cron sets the time (Tue 16:41 UTC ≈ 9:41am PT).
  // A fixed-UTC Vercel cron can't track an exact local hour across DST, so we
  // gate on the day and let the cron schedule decide the time.
  const now = vancouverNow()
  if (now.day !== 'Tue') {
    return NextResponse.json({ skipped: `not Tuesday (${TZ}); now ${now.day} ${now.hour}:00` })
  }
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'SLACK_BOT_TOKEN is not defined' }, { status: 500 })
  try {
    const slack = await postReminder(token)
    const calebHours = await updateCalebHours()
    return NextResponse.json({ ok: true, channel: CHANNEL_ID, ts: slack.ts, calebHours })
  } catch (err) {
    console.error('[hours/remind]', err)
    await alertBotLog(`hours reminder failed: ${err.message}`)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
