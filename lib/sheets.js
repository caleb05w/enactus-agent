import { google } from 'googleapis'
import { getSpreadsheet } from './destinations.js'

let cachedAuth = null
let cachedSheetName = null

function getAuth() {
  if (cachedAuth) return cachedAuth
  cachedAuth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return cachedAuth
}

function escapeForFormula(str) {
  return str.replace(/"/g, '""')
}

async function getSheetName(sheets, spreadsheetId) {
  if (cachedSheetName) return cachedSheetName
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  cachedSheetName = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1'
  return cachedSheetName
}

export async function appendFinanceRow(data, destination = 'finance') {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = getSpreadsheet(destination)
  const sheetName = await getSheetName(sheets, spreadsheetId)

  const label = escapeForFormula(`${data.item}-${data.etransferName.split(' ')[0].toLowerCase()}`)
  const url = escapeForFormula(data.receiptUrl || '')

  const row = [
    data.item,
    data.date,
    data.amount,
    data.type === 'reimbursement' ? 'FALSE' : 'N/A',
    data.receiptUrl ? `=HYPERLINK("${url}","${label}")` : '',
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
