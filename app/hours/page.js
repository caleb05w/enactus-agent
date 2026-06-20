import Link from 'next/link'

export const metadata = {
  title: 'Hour tracking — Enactus Agent',
  description: 'Log your weekly Enactus hours in the team spreadsheet.',
}

function isWeeklyReminderWindow() {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    weekday: 'short',
  }).format(new Date())
  return day === 'Fri' || day === 'Sat' || day === 'Sun'
}

export default function HoursPage() {
  const spreadsheetId =
    process.env.GOOGLE_HOURS_SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID
  const trackerUrl = spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : null
  const showReminder = isWeeklyReminderWindow()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-16">
      <div className="max-w-xl w-full space-y-8">
        <div className="space-y-1">
          <Link
            href="/"
            className="text-xs font-medium tracking-widest text-zinc-400 uppercase hover:text-zinc-600 transition-colors"
          >
            ← Enactus
          </Link>
          <h1 className="pt-2">Log your hours</h1>
          <p>
            Update the team hour tracker every week with the time you spent on
            Enactus projects and meetings. Weekly reminders are posted to
            #marketing-execs and link here.
          </p>
        </div>

        {showReminder && (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-sm font-medium text-zinc-800">
              Weekly reminder
            </p>
            <p className="pt-1 text-sm text-zinc-600">
              It&rsquo;s the end of the week — please add or update your hours
              in the spreadsheet before Monday.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {trackerUrl ? (
            <a
              href={trackerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center rounded-md bg-zinc-950 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              Open the hour tracker
            </a>
          ) : (
            <p className="text-sm text-zinc-500">
              The hour tracker spreadsheet isn&rsquo;t configured yet. Ask a
              team lead to set <code className="rounded bg-zinc-100 px-1 py-0.5">GOOGLE_HOURS_SPREADSHEET_ID</code>.
            </p>
          )}
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center rounded-md border border-zinc-200 px-6 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Back to home
          </Link>
        </div>

        <p className="text-xs text-zinc-400">
          Log meetings, project work, and prep time. If you&rsquo;re unsure
          which tab or column to use, check the sheet instructions or ask in
          Slack.
        </p>
      </div>
    </main>
  )
}
