import Link from 'next/link'
import { SPREADSHEET_ID } from '@/lib/destinations'

export const metadata = {
  title: 'Enactus Agent',
  description: 'Submit your project or idea to Enactus.',
}

export default function Home() {
  const trackerUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`

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

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href="/finance"
            className="inline-flex items-center justify-center rounded-md bg-zinc-950 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            New finance request
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-sm">
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
          <Link
            href="/settings"
            className="font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
          >
            Settings
          </Link>
        </div>
      </div>
    </main>
  )
}
