import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({
    response_type: 'in_channel',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Enactus Agent — Help', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "Here's what you can do:",
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*📋 Submit a project*' },
          { type: 'mrkdwn', text: `<${process.env.NEXT_PUBLIC_APP_URL}/submit|Open submission form>` },
          { type: 'mrkdwn', text: '*🤖 Check bot status*' },
          { type: 'mrkdwn', text: 'Type `/ping`' },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `🌐 <${process.env.NEXT_PUBLIC_APP_URL}|Open Enactus Agent>` },
        ],
      },
    ],
  })
}
