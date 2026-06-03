import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Profile from '@/lib/models/Profile'

export async function GET() {
  await connectDB()
  const profiles = await Profile.find({}).sort({ updatedAt: -1 }).lean()
  return NextResponse.json(profiles)
}

export async function DELETE(req) {
  const { slackUsername } = await req.json()
  await connectDB()
  await Profile.deleteOne({ slackUsername })
  return NextResponse.json({ ok: true })
}
