import { NextResponse } from 'next/server'
import { getAgentControl } from '@/lib/calebjr/diagnose'
import { setSetting } from '@/lib/settings'

// Runtime toggle for the agent — flip mode (shadow|live) or the kill switch
// without a redeploy. Protected by CRON_SECRET when set.
function authed(req) {
  if (!process.env.CRON_SECRET) return true
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET() {
  return NextResponse.json(await getAgentControl())
}

export async function POST(req) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (body.mode === 'live' || body.mode === 'shadow') await setSetting('agentMode', body.mode)
  if (typeof body.enabled === 'boolean') await setSetting('agentEnabled', body.enabled)
  if (typeof body.scanOwner === 'boolean') await setSetting('agentScanOwner', body.scanOwner)
  return NextResponse.json(await getAgentControl())
}
