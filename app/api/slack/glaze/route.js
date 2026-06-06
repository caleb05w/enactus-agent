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

    prompt = `Write a Slack shoutout in satirical over-the-top corporate speak. Under 35 words. Anchor it in ONE real fact from their profile (a specific role, company, or school).

Every output must feel completely unique — deliberately vary your word choices, sentence structure, and which buzzwords you reach for. Avoid defaulting to tired standbys. Draw from this wide palette and pick surprising combinations each time:

Strategy & vision: thought leader, north star, value proposition, strategic alignment, go-to-market, flywheel, inflection point, hockey-stick growth, market mover, category-defining, whitespace, greenfield, defensible moat, differentiated, top-line, bottom-line, P&L impact, TAM, land and expand, product-market fit, blue-sky, moonshot, 10x thinking, big swing, bold bet

Execution & process: mission-critical, deliverable, KPI, OKR, roadmap, cadence, velocity, throughput, sprint, milestone, action item, RACI, ownership, accountability, next steps, checkpoint, post-mortem, retrospective, center of excellence, playbook, framework, lever, dial, tiger team, task force, proof of concept, MVP, pilot, incubate

Quality & performance: best-in-class, world-class, bar-raising, gold standard, benchmark, industry-leading, cutting-edge, state-of-the-art, top-tier, high-impact, high-caliber, high-velocity, overdeliver, exceed expectations, exceptional, distinguished, exemplary, elite, above and beyond, stellar

People & culture: high-performer, high-potential, HiPo, growth mindset, grit, bias for action, ownership mentality, customer obsession, results-oriented, T-shaped, generalizing specialist, cross-pollinate, dot connector, bridge builder, change agent, catalyst, champion, evangelist, intrapreneur, culture add, talent magnet, force multiplier, people-first

Consulting & analysis: ROI, net-net, holistic, granular, 360-degree, deep dive, peel back the onion, boil the ocean, low-hanging fruit, actionable insight, data-driven, evidence-based, hypothesis-driven, test-and-learn, right-size, rationalize, streamline, unlock, harness, capitalize, optimize, accelerate, commercialize, productize, monetize

Adjectives: agile, nimble, scrappy, robust, seamless, frictionless, end-to-end, enterprise-grade, future-proof, future-ready, bleeding-edge, cloud-native, AI-powered, human-centered, customer-centric, purpose-driven, impact-driven, outcome-based, proactive, resilient, adaptable, lean, resourceful, win-win, value-add, scalable, best-of-breed, seamless, holistic, blue-chip

No two glazes should sound alike. Treat this as a palette, not a script — pick unexpected combos.

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

    prompt = `Write a Slack shoutout in satirical over-the-top corporate speak. Under 35 words. Every output must feel completely unique — vary word choices, structure, and buzzwords every time. Draw from a wide palette: north star, flywheel, bar-raising, HiPo, bias for action, frictionless, go-to-market, post-mortem, tiger team, blue-chip, moonshot, force multiplier, dot connector, test-and-learn, future-proof, etc. Treat it as a palette not a script.

Name: ${slackName}
${title ? `Title: ${title}` : ''}
${status ? `Status: ${status}` : ''}
${extra ? `Extra context: ${extra}` : ''}`
  }

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 120,
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
