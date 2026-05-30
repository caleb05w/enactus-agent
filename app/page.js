import Link from 'next/link'

export const metadata = {
  title: 'Enactus Agent',
  description: 'Submit your project or idea to Enactus.',
}

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="max-w-xl w-full space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-medium tracking-widest text-zinc-400 uppercase">Enactus</p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-950">
            Submit your project.
          </h1>
          <p className="text-base text-zinc-500 leading-relaxed">
            Share your idea, progress update, or supporting files with the Enactus team.
            Submissions go directly to our Slack channel for review.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/submit"
            className="inline-flex items-center justify-center rounded-md bg-zinc-950 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Make a submission
          </Link>
          <Link
            href="/finance"
            className="inline-flex items-center justify-center rounded-md border border-zinc-200 px-6 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Finance request
          </Link>
        </div>
      </div>
    </main>
  )
}
