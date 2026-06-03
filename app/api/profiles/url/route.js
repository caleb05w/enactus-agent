import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Profile from '@/lib/models/Profile'

// Save a LinkedIn URL for a member (creates a stub profile if none exists)
export async function POST(req) {
  const { slackUsername, linkedinUrl } = await req.json()
  if (!slackUsername || !linkedinUrl) {
    return NextResponse.json({ error: 'slackUsername and linkedinUrl are required' }, { status: 400 })
  }
  await connectDB()
  await Profile.findOneAndUpdate(
    { slackUsername },
    { $set: { linkedinUrl }, $setOnInsert: { name: slackUsername } },
    { upsert: true, new: true }
  )
  return NextResponse.json({ ok: true })
}

// Return all members with a saved LinkedIn URL
export async function GET() {
  await connectDB()
  const profiles = await Profile.find({ linkedinUrl: { $exists: true, $ne: '' } })
    .select('slackUsername linkedinUrl name')
    .lean()
  return NextResponse.json(profiles)
}
