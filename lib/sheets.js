import { google } from 'googleapis'
import { getSpreadsheet } from './destinations.js'

// Cache the auth client so token refresh is reused across invocations
let cachedAuth = null

function getAuth() {
  if (cachedAuth) return cachedAuth
  cachedAuth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return cachedAuth
}

export async function appendFinanceRow(data, destination = 'finance') {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = getSpreadsheet(destination)

  console.log('[sheets] Writing to spreadsheet:', spreadsheetId)

  // Fetch first sheet name dynamically so tab renames don't break writes
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const sheetName = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1'

  console.log('[sheets] Tab name:', sheetName)

  const row = [
    data.item,
    data.date,
    data.amount,
    data.type === 'reimbursement' ? 'FALSE' : 'N/A',
    data.receiptUrl || '',
    data.etransferName,
    data.amount,
    data.etransferEmail,
  ]

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:H`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  })
}
