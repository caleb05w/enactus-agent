// Slack helpers for Caleb Jr (the diagnostic agent). Channels go through the
// bot token (gated by channel membership); DMs go through the owner's user
// token, because a bot can never read a user's private DMs.

const BOT = () => process.env.CALEB_JR_BOT_TOKEN
const USER = () => process.env.CALEB_JR_USER_TOKEN

async function slack(method, token, params = {}, post = false) {
  const url = `https://slack.com/api/${method}`
  let res
  if (post) {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  } else {
    const qs = new URLSearchParams(params).toString()
    res = await fetch(`${url}?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
  }
  const data = await res.json()
  if (!data.ok) throw new Error(`${method}: ${data.error}`)
  return data
}

// Every channel the bot has been invited to — this IS the watch list.
export async function listBotChannels() {
  const d = await slack('users.conversations', BOT(), {
    types: 'public_channel,private_channel',
    exclude_archived: true,
    limit: 200,
  })
  return d.channels.map((c) => ({ id: c.id, name: c.name, isPrivate: !!c.is_private }))
}

// The owner's open DMs and group DMs (read via the user token).
export async function listOwnerDMs() {
  const d = await slack('conversations.list', USER(), { types: 'im,mpim', limit: 200 })
  return d.channels.map((c) => ({ id: c.id, isIm: !!c.is_im }))
}

// New messages since `oldest` (exclusive). Drops joins/edits/bot noise.
export async function fetchHistory(channel, oldest, token) {
  const params = { channel, limit: 200 }
  if (oldest && oldest !== '0') params.oldest = oldest
  const d = await slack('conversations.history', token, params)
  return (d.messages || [])
    .filter((m) => m.type === 'message' && !m.subtype && m.text && m.ts > (oldest || '0'))
    .map((m) => ({ ts: m.ts, user: m.user, text: m.text }))
}

// "I've seen this" — the eyes reaction. already_reacted is not an error.
export async function addEyes(channel, ts, token) {
  try {
    await slack('reactions.add', token, { channel, timestamp: ts, name: 'eyes' }, true)
  } catch (e) {
    if (!/already_reacted/.test(e.message)) throw e
  }
}

// Audit / shadow-preview output. Posts to the given channel as the bot.
export async function postLog(channel, text) {
  if (!channel) return
  await slack('chat.postMessage', BOT(), { channel, text }, true)
}

// Post a message and return its ts (so we can watch it for reactions later).
export async function postMessage(channel, text) {
  const d = await slack('chat.postMessage', BOT(), { channel, text }, true)
  return d.ts
}

// Read the reactions on a single message via conversations.history (avoids
// needing the reactions:read scope). Returns { reactionName: [userId, ...] }.
export async function getReactors(channel, ts) {
  const d = await slack('conversations.history', BOT(), { channel, latest: ts, oldest: ts, inclusive: true, limit: 1 })
  const msg = (d.messages || [])[0]
  const out = {}
  for (const r of msg?.reactions || []) out[r.name] = r.users || []
  return out
}

// Permalink to a specific message (bot token for channels, user token for DMs).
export async function getPermalink(channel, ts, token) {
  try {
    const d = await slack('chat.getPermalink', token, { channel, message_ts: ts })
    return d.permalink || ''
  } catch {
    return ''
  }
}

// DM the owner. Needs the im:write bot scope to open the DM; if that's not
// granted, falls back to an @mention in the given fallback channel.
export async function dmOwner(ownerId, text, fallbackChannel) {
  try {
    const open = await slack('conversations.open', BOT(), { users: ownerId }, true)
    await slack('chat.postMessage', BOT(), { channel: open.channel.id, text }, true)
  } catch {
    await postLog(fallbackChannel, `<@${ownerId}> ${text}`)
  }
}

// Reply to the initiator in-thread on the original message (channels only).
export async function replyInThread(channel, threadTs, text, token) {
  await slack('chat.postMessage', token, { channel, thread_ts: threadTs, text }, true)
}

export async function userName(id) {
  if (!id) return 'unknown'
  try {
    const d = await slack('users.info', BOT(), { user: id })
    return d.user?.profile?.real_name || d.user?.real_name || d.user?.name || id
  } catch {
    return id
  }
}
