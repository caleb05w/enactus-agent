const WEBHOOK_MAP = {
  agent_test: 'SLACK_WEBHOOK_AGENT_TEST',         // #agent-test
  marketing_execs: 'SLACK_WEBHOOK_MARKETING_EXECS', // #marketing-execs
}

export async function postToSlack({ mode, message, name, email, fileUrls = [], channel = 'agent_test' }) {
  const envKey = WEBHOOK_MAP[channel] ?? WEBHOOK_MAP.agent_test
  const webhookUrl = process.env[envKey]
  if (!webhookUrl) throw new Error(`Webhook not configured for channel: ${channel}`)

  const body = mode === 'message'
    ? {
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Debug message:*\n${message}` },
          },
        ],
      }
    : {
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'New Enactus Submission', emoji: true },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Name:*\n${name}` },
              { type: 'mrkdwn', text: `*Email:*\n${email}` },
            ],
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Message:*\n${message}` },
          },
          ...(fileUrls.length > 0
            ? [{
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Files:*\n${fileUrls.map((url, i) => `<${url}|Attachment ${i + 1}>`).join('\n')}`,
                },
              }]
            : []),
          { type: 'divider' },
        ],
      }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Slack webhook failed: ${res.status}`)
}
