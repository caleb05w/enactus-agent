import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getSlackUser(userId) {
  const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack users.info error: ${data.error}`)
  return data.user
}

function parseText(text = '') {
  // Slack encodes mentions as <@USERID> or <@USERID|username>
  const match = text.match(/^<@([A-Z0-9]+)(?:\|[^>]+)?>\s*(.*)$/)
  if (!match) return { userId: null, extra: text.trim() }
  return { userId: match[1], extra: match[2].trim() }
}

export async function POST(req) {
  const body = await req.text()
  const params = new URLSearchParams(body)
  const text = params.get('text') ?? ''

  const { userId, extra } = parseText(text)

  if (!userId) {
    return NextResponse.json({
      response_type: 'ephemeral',
      text: 'Usage: `/glaze @someone` — tag a person to glaze them.',
    })
  }

  let profile
  try {
    const user = await getSlackUser(userId)
    profile = {
      name: user.profile.real_name || user.real_name || user.name,
      title: user.profile.title || '',
      status: user.profile.status_text || '',
    }
  } catch {
    return NextResponse.json({
      response_type: 'ephemeral',
      text: "Couldn't fetch that user's profile. Make sure the bot has `users:read` scope.",
    })
  }

  const context = [
    profile.title && `Title: ${profile.title}`,
    profile.status && `Status: ${profile.status}`,
    extra && `Extra context: ${extra}`,
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = `You are a hype machine. Given someone's name and profile details, write an enthusiastic, over-the-top glaze (compliment) about them. Be specific to their actual details. Make it feel genuine, warm, and a little dramatic. 2-4 sentences max.

Name: ${profile.name}
${context}`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  })

  const glaze = message.content[0].text

  return NextResponse.json({
    response_type: 'in_channel',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:fire: *Glazing <@${userId}>*\n\n${glaze}`,
        },
      },
    ],
  })
}
