import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { connectDB } from '@/lib/mongodb'
import Profile from '@/lib/models/Profile'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  const { slackUsername, text } = await req.json()
  if (!slackUsername || !text) {
    return NextResponse.json({ error: 'slackUsername and text are required' }, { status: 400 })
  }

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Extract this LinkedIn profile page text into JSON with exactly this shape:
{
  "name": string,
  "headline": string,
  "summary": string,
  "positions": [{ "title": string, "company": string, "description": string, "startDate": string, "endDate": string }],
  "education": [{ "school": string, "degree": string, "field": string, "startDate": string, "endDate": string }],
  "skills": [string]
}
Return only the raw JSON, no markdown, no explanation.

Profile text:
${text.slice(0, 12000)}`,
      },
    ],
  })

  let parsed
  try {
    parsed = JSON.parse(message.content[0].text.trim())
  } catch (e) {
    return NextResponse.json({ error: `Claude returned invalid JSON: ${e.message}` }, { status: 500 })
  }

  await connectDB()
  await Profile.findOneAndUpdate(
    { slackUsername },
    { slackUsername, ...parsed },
    { upsert: true, new: true }
  )

  return NextResponse.json({ ok: true, name: parsed.name })
}
