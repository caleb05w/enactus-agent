import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { connectDB } from '@/lib/mongodb'
import { SPREADSHEET_ID } from '@/lib/destinations'

function makeAuth(scopes) {
  return new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes,
  })
}

function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), ms)),
  ])
}

async function checkDrive() {
  const drive = google.drive({ version: 'v3', auth: makeAuth(['https://www.googleapis.com/auth/drive.readonly']) })
  await drive.about.get({ fields: 'user' })
}

async function checkSheets() {
  const sheets = google.sheets({ version: 'v4', auth: makeAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']) })
  await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'spreadsheetId' })
}

async function checkCalendar() {
  if (!process.env.GOOGLE_CALENDAR_ID) throw new Error('not configured')
  const calendar = google.calendar({ version: 'v3', auth: makeAuth(['https://www.googleapis.com/auth/calendar.readonly']) })
  await calendar.events.list({ calendarId: process.env.GOOGLE_CALENDAR_ID, maxResults: 1 })
}

function icon(result) {
  return result.status === 'fulfilled' ? '✅' : '❌'
}

function detail(result) {
  if (result.status === 'fulfilled') return 'OK'
  return result.reason?.message ?? 'error'
}

export async function POST() {
  const [db, drive, sheets, calendar] = await Promise.allSettled([
    withTimeout(connectDB()),
    withTimeout(checkDrive()),
    withTimeout(checkSheets()),
    withTimeout(checkCalendar()),
  ])

  const allHealthy = [db, drive, sheets, calendar].every((r) => r.status === 'fulfilled')
  const summary = allHealthy ? '✅ All systems operational' : '⚠️ One or more systems are down'

  return NextResponse.json({
    response_type: 'in_channel',
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Enactus Agent — Status*\n${summary}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Bot*\n✅ Online` },
          { type: 'mrkdwn', text: `*Database*\n${icon(db)} ${detail(db)}` },
          { type: 'mrkdwn', text: `*Drive*\n${icon(drive)} ${detail(drive)}` },
          { type: 'mrkdwn', text: `*Sheets*\n${icon(sheets)} ${detail(sheets)}` },
          { type: 'mrkdwn', text: `*Calendar*\n${icon(calendar)} ${detail(calendar)}` },
        ],
      },
    ],
  })
}
