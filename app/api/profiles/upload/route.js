import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Profile from '@/lib/models/Profile'
import { parseLinkedInExport } from '@/lib/parseLinkedIn'

export async function POST(req) {
  const formData = await req.formData()
  const slackUsername = formData.get('slackUsername')?.trim().replace(/^@/, '')
  const file = formData.get('file')

  if (!slackUsername || !file) {
    return NextResponse.json({ error: 'slackUsername and file are required' }, { status: 400 })
  }

  const buffer = await file.arrayBuffer()
  let parsed
  try {
    parsed = await parseLinkedInExport(Buffer.from(buffer))
  } catch (e) {
    return NextResponse.json({ error: `Failed to parse ZIP: ${e.message}` }, { status: 400 })
  }

  await connectDB()
  await Profile.findOneAndUpdate(
    { slackUsername },
    { slackUsername, ...parsed },
    { upsert: true, new: true }
  )

  return NextResponse.json({ ok: true, name: parsed.name })
}
