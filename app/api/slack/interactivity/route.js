import { NextResponse, after } from 'next/server'
import crypto from 'crypto'
import { approveTask, skipTask, retryTask } from '@/lib/calebjr/diagnose'

const OWNER_ID = 'U0B5CMFR6MA'

function verifySlack(rawBody, headers) {
  const secret = process.env.CALEB_JR_SIGNING_SECRET
  if (!secret) return true
  const ts = headers.get('x-slack-request-timestamp')
  const sig = headers.get('x-slack-signature')
  if (!ts || !sig) return false
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  const mine = 'v0=' + crypto.createHmac('sha256', secret).update(`v0:${ts}:${rawBody}`).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(sig))
  } catch {
    return false
  }
}

// Read the repo currently selected in the card's dropdown.
function selectedRepo(payload) {
  const values = payload.state?.values || {}
  for (const block of Object.values(values)) {
    const sel = block.repo_select?.selected_option
    if (sel) return sel.value
  }
  return null
}

// Slack posts here when the owner clicks a button on a proposal card.
export async function POST(req) {
  const raw = await req.text()
  if (!verifySlack(raw, req.headers)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }

  let payload
  try {
    payload = JSON.parse(new URLSearchParams(raw).get('payload'))
  } catch {
    return new Response(null, { status: 200 })
  }

  if (payload.user?.id !== OWNER_ID) {
    return NextResponse.json({ response_type: 'ephemeral', text: 'Only the owner can act on these.' })
  }

  const action = payload.actions?.[0]
  if (action?.action_id === 'approve') {
    after(() => approveTask(action.value, selectedRepo(payload), payload.response_url))
  } else if (action?.action_id === 'skip') {
    after(() => skipTask(action.value, payload.response_url))
  } else if (action?.action_id === 'retry') {
    after(() => retryTask(action.value, payload.response_url))
  }
  // repo_select and anything else: just ack (selection is read at approve time).
  return new Response(null, { status: 200 })
}
