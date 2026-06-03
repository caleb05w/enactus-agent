import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { connectDB } from '@/lib/mongodb'
import Profile from '@/lib/models/Profile'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function extractJSON(raw) {
  // Strip markdown code fences Claude sometimes adds despite instructions
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  return JSON.parse(stripped)
}

async function callClaude(text) {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Extract this LinkedIn profile page text into JSON with exactly this shape. Return ONLY raw JSON — no markdown, no explanation, no code fences.

{
  "name": string,
  "headline": string,
  "summary": string,
  "positions": [{ "title": string, "company": string, "description": string, "startDate": string, "endDate": string }],
  "education": [{ "school": string, "degree": string, "field": string, "startDate": string, "endDate": string }],
  "skills": [string]
}

Profile text:
${text.slice(0, 20000)}`,
      },
    ],
  })
  return message.content[0].text
}

export async function POST(req) {
  const { slackUsername, text } = await req.json()
  if (!slackUsername || !text) {
    return NextResponse.json({ error: 'slackUsername and text are required' }, { status: 400 })
  }

  // Retry Claude up to 3 times
  let raw
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      raw = await callClaude(text)
      break
    } catch (err) {
      if (attempt === 3) {
        return NextResponse.json({ error: `Claude API failed after 3 attempts: ${err.message}` }, { status: 500 })
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }

  let parsed
  try {
    parsed = extractJSON(raw)
  } catch (e) {
    return NextResponse.json(
      { error: `Claude returned unparseable JSON: ${e.message}`, raw },
      { status: 500 }
    )
  }

  if (!parsed.name) {
    return NextResponse.json(
      { error: 'Extracted profile is missing name — page may not have loaded properly', raw },
      { status: 422 }
    )
  }

  await connectDB()
  // $set only the extracted fields — preserves linkedinUrl set earlier
  await Profile.findOneAndUpdate(
    { slackUsername },
    {
      $set: {
        name: parsed.name,
        headline: parsed.headline ?? '',
        summary: parsed.summary ?? '',
        positions: parsed.positions ?? [],
        education: parsed.education ?? [],
        skills: parsed.skills ?? [],
      },
    },
    { upsert: true, new: true }
  )

  return NextResponse.json({ ok: true, name: parsed.name })
}
