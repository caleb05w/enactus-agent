import { NextResponse } from 'next/server'
import { SPREADSHEET_ID } from '@/lib/destinations'

export async function POST() {
  const trackerUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`

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
          { type: 'mrkdwn', text: '*🧾 File a finance request*' },
          { type: 'mrkdwn', text: `<${process.env.NEXT_PUBLIC_APP_URL}/finance|Open finance form>` },
          ...(trackerUrl
            ? [
                { type: 'mrkdwn', text: '*📊 Finance tracker*' },
                { type: 'mrkdwn', text: `<${trackerUrl}|Open the spreadsheet>` },
              ]
            : []),
          { type: 'mrkdwn', text: '*🤖 Check bot status*' },
          { type: 'mrkdwn', text: 'Type `/ping`' },
          { type: 'mrkdwn', text: '*🔥 Glaze someone*' },
          { type: 'mrkdwn', text: 'Type `/glaze @someone`' },
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
