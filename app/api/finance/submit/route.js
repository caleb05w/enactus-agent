import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { uploadReceiptToDrive } from '@/lib/drive'
import Finance from '@/lib/models/Finance'
import { appendFinanceRow } from '@/lib/sheets'
import { postFinanceToSlack } from '@/lib/slack'

export async function POST(req) {
  try {
    const formData = await req.formData()

    const type = formData.get('type')
    const item = formData.get('item')
    const date = formData.get('date')
    const amount = formData.get('amount')
    const etransferName = formData.get('etransferName')
    const etransferEmail = formData.get('etransferEmail')
    const event = formData.get('event')
    const receipt = formData.get('receipt')
    const hasReceipt = receipt instanceof File && receipt.size > 0

    if (!type || !item || !date || !amount || !etransferName || !etransferEmail || !event) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 })
    }

    if (type === 'reimbursement' && !hasReceipt) {
      return NextResponse.json({ error: 'Receipt is required for reimbursements.' }, { status: 400 })
    }

    const receiptUrl = hasReceipt
      ? await uploadReceiptToDrive(receipt, { item, etransferName, event })
      : ''

    const data = { type, item, date, amount, etransferName, etransferEmail, event, receiptUrl }

    await connectDB()
    await Finance.create(data)

    await Promise.all([appendFinanceRow(data), postFinanceToSlack(data)])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[finance/submit] Error:', err?.message ?? err)

    if (!process.env.GOOGLE_CLIENT_EMAIL) console.warn('[finance/submit] Missing env: GOOGLE_CLIENT_EMAIL')
    if (!process.env.GOOGLE_PRIVATE_KEY) console.warn('[finance/submit] Missing env: GOOGLE_PRIVATE_KEY')
    if (!process.env.GOOGLE_SPREADSHEET_ID) console.warn('[finance/submit] Missing env: GOOGLE_SPREADSHEET_ID')
    if (!process.env.GOOGLE_DRIVE_FOLDER_ID) console.warn('[finance/submit] Missing env: GOOGLE_DRIVE_FOLDER_ID')
    if (!process.env.MONGODB_URI) console.warn('[finance/submit] Missing env: MONGODB_URI')
    if (!process.env.SLACK_BOT_TOKEN) console.warn('[finance/submit] Missing env: SLACK_BOT_TOKEN')

    return NextResponse.json({ error: err?.message ?? 'Something went wrong.' }, { status: 500 })
  }
}
