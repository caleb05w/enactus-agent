// Surface a portal failure to #bot-logs so it's never silent (the hours reminder
// failed invisibly for weeks because errors only went to Vercel logs). Posts via
// the portal bot (must be in #bot-logs). Best-effort — never throws.
const BOT_LOG_CHANNEL = 'C0BC5ER6XUP' // #bot-logs

export async function alertBotLog(text) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: BOT_LOG_CHANNEL,
        text: `:rotating_light: *enactus-agent (portal)* — ${text}`,
      }),
    })
  } catch {}
}
