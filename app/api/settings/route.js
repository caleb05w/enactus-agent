import { NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/settings'

const ALLOWED_KEYS = ['financeChannel']

export async function GET() {
  try {
    const financeChannel = await getSetting('financeChannel')
    return NextResponse.json({ financeChannel })
  } catch (err) {
    console.error('[settings] GET error:', err?.message ?? err)
    return NextResponse.json({ error: 'Failed to load settings.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const { key, value } = await req.json()
    if (!ALLOWED_KEYS.includes(key)) {
      return NextResponse.json({ error: `Unknown setting key: ${key}` }, { status: 400 })
    }
    await setSetting(key, value)
    return NextResponse.json({ ok: true, key, value })
  } catch (err) {
    console.error('[settings] POST error:', err?.message ?? err)
    return NextResponse.json({ error: 'Failed to save setting.' }, { status: 500 })
  }
}
