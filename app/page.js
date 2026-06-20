import Link from 'next/link'

export const metadata = {
  title: 'Enactus Agent',
  description: 'Submit your project or idea to Enactus.',
}

export default function Home() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID
  const trackerUrl = spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : null

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="max-w-xl w-full space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-medium tracking-widest text-zinc-400 uppercase">Enactus</p>
          <h1 className="text-4xl">
            File a finance request.
          </h1>
          <p className="text-base">
            Submit a reimbursement or money request — it&rsquo;s logged to the team
            spreadsheet and posted to Slack for review.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link
            href="/finance"
            className="font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
          >
            New finance request
          </Link>
          {trackerUrl && (
            <a
              href={trackerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
            >
              View the finance tracker
            </a>
          )}
        </div>
      </div>
    </main>
  )
}
