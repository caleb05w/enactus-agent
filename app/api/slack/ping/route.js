import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'

export async function POST() {
  const checks = { bot: true, db: false }

  try {
    await connectDB()
    checks.db = true
  } catch {
    checks.db = false
  }

  const allHealthy = checks.bot && checks.db
  const status = allHealthy ? '✅ All systems operational' : '⚠️ Some systems are down'

  return NextResponse.json({
    response_type: 'in_channel',
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Enactus Agent — Status*\n${status}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Bot*\n${checks.bot ? '✅ Online' : '❌ Offline'}` },
          { type: 'mrkdwn', text: `*Database*\n${checks.db ? '✅ Connected' : '❌ Unreachable'}` },
        ],
      },
    ],
  })
}
