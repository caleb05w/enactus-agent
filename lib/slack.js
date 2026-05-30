const CHANNELS = {
  agent_test: 'agent-test',           // #agent-test
  marketing_execs: 'marketing-execs', // #marketing-execs
}

async function postMessage(channel, blocks) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, blocks }),
  })

  const data = await res.json()
  if (!data.ok) throw new Error(`Slack error: ${data.error}`)
}

export async function postToSlack({ mode, message, name, email, fileUrls = [], channel = 'agent_test' }) {
  if (!process.env.SLACK_BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN is not defined')

  const slackChannel = CHANNELS[channel] ?? CHANNELS.agent_test

  const blocks = mode === 'message'
    ? [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Debug message:*\n${message}` },
        },
      ]
    : [
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
      ]

  await postMessage(slackChannel, blocks)
}
