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

  const row = [
    data.item,           // A: Item
    data.date,           // B: Date
    data.amount,         // C: Specific Expenses ($ Amount)
    data.type === 'reimbursement' ? 'FALSE' : 'N/A', // D: Reimbursed? (FALSE = not yet paid)
    data.receiptUrl || '',  // E: Link to receipt/invoice
    data.etransferName,     // F: E-transfer Contact
    data.amount,            // G: Reimbursement amount per person
    data.etransferEmail,    // H: E-transfer info
  ]

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheet(destination),
    range: 'Sheet1!A:H',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  })
}
