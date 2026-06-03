import { NextResponse } from 'next/server'

export async function GET() {
  const res = await fetch('https://slack.com/api/users.list', {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  })
  const data = await res.json()
  if (!data.ok) return NextResponse.json({ error: data.error }, { status: 500 })

  const members = data.members
    .filter((m) => !m.is_bot && !m.deleted && m.id !== 'USLACKBOT')
    .map((m) => ({
      id: m.id,
      username: m.name,
      name: m.profile?.real_name || m.real_name || m.name,
      title: m.profile?.title || '',
      avatar: m.profile?.image_48 || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json(members)
}
