import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function findSlackUser(text) {
  // Handle <@USERID> or <@USERID|username> format
  const idMatch = text.match(/^<@([A-Z0-9]+)(?:\|[^>]+)?>/)
  if (idMatch) {
    const res = await fetch(`https://slack.com/api/users.info?user=${idMatch[1]}`, {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
    })
    const data = await res.json()
    if (!data.ok) throw new Error(`Slack users.info error: ${data.error}`)
    return data.user
  }

  // Handle @username format — search users.list
  const usernameMatch = text.match(/^@([\w.\-]+)/)
  if (usernameMatch) {
    const username = usernameMatch[1].toLowerCase()
    const res = await fetch('https://slack.com/api/users.list', {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
    })
    const data = await res.json()
    if (!data.ok) throw new Error(`Slack users.list error: ${data.error}`)
    const user = data.members.find((m) => m.name?.toLowerCase() === username)
    if (!user) throw new Error(`User @${username} not found`)
    return user
  }

  return null
}

function parseExtra(text = '') {
  return text.replace(/^<@[A-Z0-9]+(?:\|[^>]+)?>/, '').replace(/^@[\w.\-]+/, '').trim()
}

export async function POST(req) {
  const body = await req.text()
  const params = new URLSearchParams(body)
  const text = params.get('text') ?? ''

  const extra = parseExtra(text)

  if (!text.trim()) {
    return NextResponse.json({
      response_type: 'ephemeral',
      text: 'Usage: `/glaze @someone` — tag a person to glaze them.',
    })
  }

  let user, profile
  try {
    user = await findSlackUser(text)
    if (!user) throw new Error('No user found')
    profile = {
      name: user.profile?.real_name || user.real_name || user.name,
      title: user.profile?.title || '',
      status: user.profile?.status_text || '',
    }
  } catch (e) {
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `Couldn't find that user (${e.message}). Make sure the bot has \`users:read\` scope.`,
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
          text: `:fire: *Glazing <@${user.id}>*\n\n${glaze}`,
        },
      },
    ],
  })
}
