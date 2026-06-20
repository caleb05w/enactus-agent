import { NextResponse } from 'next/server'
import { HOURS_REMINDER_CHANNEL_ID } from '../constants'

function authorized(req) {
  if (!process.env.CRON_SECRET) return true
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

function isWeeklyReminderDay() {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    weekday: 'short',
  }).format(new Date())
  return day === 'Fri'
}

function hoursPageUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/hours`
}

function spreadsheetUrl() {
  const id =
    process.env.GOOGLE_HOURS_SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null
}

async function postWeeklyReminder() {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN is not defined')

  const hoursUrl = hoursPageUrl()
  const sheetUrl = spreadsheetUrl()
  const linkLine = sheetUrl
    ? `<${hoursUrl}|Log your hours via Enactus Agent> · <${sheetUrl}|Open the spreadsheet>`
    : `<${hoursUrl}|Log your hours via Enactus Agent>`

  const text = `Weekly reminder: please update your Enactus hours. ${hoursUrl}`
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Weekly hour tracking reminder*\nPlease add or update your hours for this week.',
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: linkLine },
    },
  ]

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: HOURS_REMINDER_CHANNEL_ID,
      text,
      blocks,
    }),
  })

  const data = await res.json()
  if (!data.ok) throw new Error(`Slack error: ${data.error}`)
  return data
}

async function handle(req) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!isWeeklyReminderDay()) {
    return NextResponse.json({ skipped: 'not Friday (America/Vancouver)' })
  }

  try {
    const result = await postWeeklyReminder()
    return NextResponse.json({
      ok: true,
      channel: HOURS_REMINDER_CHANNEL_ID,
      ts: result.ts,
    })
  } catch (err) {
    console.error('[hours/remind]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req) {
  return handle(req)
}

export async function POST(req) {
  return handle(req)
}
