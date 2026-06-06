import { after } from 'next/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { connectDB } from '@/lib/mongodb'
import Profile from '@/lib/models/Profile'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function findSlackUser(text) {
  const idMatch = text.match(/^<@([A-Z0-9]+)(?:\|[^>]+)?>/)
  if (idMatch) {
    const res = await fetch(`https://slack.com/api/users.info?user=${idMatch[1]}`, {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
    })
    const data = await res.json()
    if (!data.ok) throw new Error(`Slack users.info error: ${data.error}`)
    return data.user
  }

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

async function buildAndSendGlaze(params, responseUrl) {
  const text = params.get('text') ?? ''
  const extra = parseExtra(text)

  let user
  try {
    user = await findSlackUser(text)
    if (!user) throw new Error('No user found')
  } catch (e) {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        text: `Couldn't find that user (${e.message}). Make sure the bot has \`users:read\` scope.`,
      }),
    })
    return
  }

  const slackUsername = user.name
  await connectDB()
  const dbProfile = await Profile.findOne({ slackUsername }).lean()

  let prompt
  if (dbProfile?.positions?.length || dbProfile?.headline) {
    const positions = dbProfile.positions
      ?.slice(0, 3)
      .map((p) => `- ${p.title} at ${p.company}${p.startDate ? ` (${p.startDate}${p.endDate ? ` – ${p.endDate}` : ' – present'})` : ''}`)
      .join('\n') ?? ''
    const education = dbProfile.education
      ?.map((e) => `- ${e.degree ? `${e.degree}, ` : ''}${e.school}`)
      .join('\n') ?? ''
    const skills = dbProfile.skills?.slice(0, 10).join(', ') ?? ''

    prompt = `You are writing a corporate shoutout for a team Slack channel. Glaze this person in a way that is warm, scannable, and commendable — like a manager publicly recognizing someone at an all-hands. Keep it short: 1 punchy opening sentence, then 2–3 tight bullet points highlighting what makes them exceptional. Draw from their background but lead with the vibe, not the resume. Corporate but human.

Name: ${dbProfile.name}
${dbProfile.headline ? `Headline: ${dbProfile.headline}` : ''}
${positions ? `Experience:\n${positions}` : ''}
${education ? `Education:\n${education}` : ''}
${skills ? `Skills: ${skills}` : ''}
${extra ? `Extra context: ${extra}` : ''}`
  } else {
    const slackName = user.profile?.real_name || user.real_name || user.name
    const title = user.profile?.title || ''
    const status = user.profile?.status_text || ''

    prompt = `You are writing a corporate shoutout for a team Slack channel. Glaze this person in a way that is warm, scannable, and commendable — like a manager publicly recognizing someone at an all-hands. Keep it short: 1 punchy opening sentence, then 2–3 tight bullet points. Corporate but human.

Name: ${slackName}
${title ? `Title: ${title}` : ''}
${status ? `Status: ${status}` : ''}
${extra ? `Extra context: ${extra}` : ''}`
  }

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const glaze = message.content[0].text

  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
    }),
  })
}

export async function POST(req) {
  const body = await req.text()
  const params = new URLSearchParams(body)
  const text = params.get('text') ?? ''
  const responseUrl = params.get('response_url')

  if (!text.trim()) {
    return NextResponse.json({
      response_type: 'ephemeral',
      text: 'Usage: `/glaze @someone` — tag a person to glaze them.',
    })
  }

  // Respond to Slack immediately to avoid the 3-second timeout,
  // then do the actual work after the response is sent
  after(() => buildAndSendGlaze(params, responseUrl))

  return NextResponse.json({ response_type: 'ephemeral', text: ':fire: Glazing...' })
}
