import Link from 'next/link'

export const metadata = {
  title: 'Hour tracking — Enactus Agent',
  description: 'Log your weekly Enactus hours in the team spreadsheet.',
}

function isReminderWindow() {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    weekday: 'short',
  }).format(new Date())
  return day === 'Mon' || day === 'Tue'
}

export default function HoursPage() {
  const spreadsheetId =
    process.env.GOOGLE_HOURS_SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID
  const trackerUrl = spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : null

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-16">
      <div className="max-w-xl w-full space-y-8">
        <div className="space-y-1">
          <Link href="/" className="text-xs font-medium tracking-widest text-zinc-400 uppercase hover:text-zinc-600">
            ← Enactus
          </Link>
          <h1 className="pt-2">Log your hours</h1>
          <p>
            Update the team hour tracker every week. @Enactus Agent posts a reminder
            to #marketing-execs every Monday at 5:00&nbsp;pm with a link here.
          </p>
        </div>

        {isReminderWindow() && (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-sm font-medium text-zinc-800">Weekly reminder</p>
            <p className="pt-1 text-sm text-zinc-600">
              Please add or update your hours in the spreadsheet.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {trackerUrl ? (
            <a
              href={trackerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center rounded-md bg-zinc-950 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Open the hour tracker
            </a>
          ) : (
            <p className="text-sm text-zinc-500">
              Hour tracker not configured — ask a lead to set GOOGLE_HOURS_SPREADSHEET_ID.
            </p>
          )}
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center rounded-md border border-zinc-200 px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  )
}
