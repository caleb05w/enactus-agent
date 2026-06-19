import { NextResponse } from 'next/server'
import { runScan, processApprovals, getAgentControl } from '@/lib/calebjr/diagnose'

// Cron entry point (Vercel runs this on the schedule in vercel.json).
export async function GET(req) {
  // Cron auth: if CRON_SECRET is set, require it (Vercel Cron sends it).
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  if (!process.env.CALEB_JR_BOT_TOKEN || !process.env.CALEB_JR_USER_TOKEN) {
    return NextResponse.json({ error: 'Caleb Jr tokens not set' }, { status: 500 })
  }

  const { mode, enabled } = await getAgentControl()
  if (!enabled) return NextResponse.json({ skipped: 'disabled (agentEnabled=false)' })

  // Pre-phase: act on approval cards the owner reacted to since last run.
  const approvals = mode === 'live' ? await processApprovals() : { dispatched: 0, rejected: 0, pending: 0 }

  const s = await runScan({ advanceCursor: true, label: 'diagnostic run' })

  return NextResponse.json({ ...s, approvals })
}
