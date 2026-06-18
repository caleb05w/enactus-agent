import { NextResponse } from 'next/server'

// Lists the workspace's channels so they can be picked in the app.
// Needs channels:read for public channels; private channels also need groups:read.
async function listChannels(token, types) {
  const params = new URLSearchParams({ types, exclude_archived: 'true', limit: '1000' })
  const res = await fetch(`https://slack.com/api/conversations.list?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

export async function GET() {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'SLACK_BOT_TOKEN is not set' }, { status: 500 })

  // conversations.list rejects the whole call if any requested type lacks its
  // scope. Try public + private, then fall back to public-only when the bot
  // doesn't have groups:read.
  let data = await listChannels(token, 'public_channel,private_channel')
  if (!data.ok && data.error === 'missing_scope') {
    data = await listChannels(token, 'public_channel')
  }

  if (!data.ok) {
    const message = data.error === 'missing_scope'
      ? 'The bot is missing the channels:read scope. Add it in the Slack app settings and reinstall the app.'
      : `Slack error: ${data.error}`
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const channels = (data.channels ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      isMember: !!c.is_member,
      isPrivate: !!c.is_private,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({ channels })
}
