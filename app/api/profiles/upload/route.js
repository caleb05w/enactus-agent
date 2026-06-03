import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { connectDB } from '@/lib/mongodb'
import Profile from '@/lib/models/Profile'
import { parseLinkedInExport } from '@/lib/parseLinkedIn'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function parseLinkedInPDF(buffer) {
  const base64 = Buffer.from(buffer).toString('base64')

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          {
            type: 'text',
            text: `Extract this LinkedIn profile into JSON with exactly this shape:
{
  "name": string,
  "headline": string,
  "summary": string,
  "positions": [{ "title": string, "company": string, "description": string, "startDate": string, "endDate": string }],
  "education": [{ "school": string, "degree": string, "field": string, "startDate": string, "endDate": string }],
  "skills": [string]
}
Return only the raw JSON, no markdown, no explanation.`,
          },
        ],
      },
    ],
  })

  const text = message.content[0].text.trim()
  return JSON.parse(text)
}

export async function POST(req) {
  const formData = await req.formData()
  const slackUsername = formData.get('slackUsername')?.trim().replace(/^@/, '')
  const file = formData.get('file')

  if (!slackUsername || !file) {
    return NextResponse.json({ error: 'slackUsername and file are required' }, { status: 400 })
  }

  const buffer = await file.arrayBuffer()
  const isPDF = file.type === 'application/pdf' || file.name?.endsWith('.pdf')

  let parsed
  try {
    parsed = isPDF
      ? await parseLinkedInPDF(buffer)
      : await parseLinkedInExport(Buffer.from(buffer))
  } catch (e) {
    return NextResponse.json({ error: `Failed to parse file: ${e.message}` }, { status: 400 })
  }

  await connectDB()
  await Profile.findOneAndUpdate(
    { slackUsername },
    { slackUsername, ...parsed },
    { upsert: true, new: true }
  )

  return NextResponse.json({ ok: true, name: parsed.name })
}
