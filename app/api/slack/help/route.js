import { NextResponse } from 'next/server'

export async function POST() {
  const trackerUrl = process.env.GOOGLE_SPREADSHEET_ID
    ? `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SPREADSHEET_ID}/edit`
    : null

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
          { type: 'mrkdwn', text: '*📋 Submit a project*' },
          { type: 'mrkdwn', text: `<${process.env.NEXT_PUBLIC_APP_URL}/submit|Open submission form>` },
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
