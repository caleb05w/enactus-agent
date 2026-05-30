import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { uploadFile } from '@/lib/upload'
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
    const receipt = formData.get('receipt')
    const hasReceipt = receipt instanceof File && receipt.size > 0

    if (!type || !item || !date || !amount || !etransferName || !etransferEmail) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 })
    }

    if (type === 'reimbursement' && !hasReceipt) {
      return NextResponse.json({ error: 'Receipt is required for reimbursements.' }, { status: 400 })
    }

    const receiptUrl = hasReceipt ? await uploadFile(receipt) : ''
    const data = { type, item, date, amount, etransferName, etransferEmail, receiptUrl }

    await connectDB()
    await Finance.create(data)

    // Sheets and Slack are independent — run in parallel
    await Promise.all([appendFinanceRow(data), postFinanceToSlack(data)])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
