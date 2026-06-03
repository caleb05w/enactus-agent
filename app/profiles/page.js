'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

const inputClass = 'w-full rounded-md border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 bg-white'

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState([])
  const [slackUsername, setSlackUsername] = useState('')
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState(null) // null | 'uploading' | 'done' | 'error'
  const [error, setError] = useState('')
  const fileRef = useRef()

  async function loadProfiles() {
    const res = await fetch('/api/profiles')
    const data = await res.json()
    setProfiles(data)
  }

  useEffect(() => { loadProfiles() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!slackUsername || !file) return
    setStatus('uploading')
    setError('')

    const form = new FormData()
    form.append('slackUsername', slackUsername)
    form.append('file', file)

    const res = await fetch('/api/profiles/upload', { method: 'POST', body: form })
    const data = await res.json()

    if (!res.ok) {
      setStatus('error')
      setError(data.error ?? 'Upload failed')
      return
    }

    setStatus('done')
    setSlackUsername('')
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
    await loadProfiles()
    setTimeout(() => setStatus(null), 3000)
  }

  async function handleDelete(username) {
    await fetch('/api/profiles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slackUsername: username }),
    })
    await loadProfiles()
  }

  return (
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-12">
        <div className="space-y-2">
          <Link href="/" className="text-xs font-medium tracking-widest text-zinc-400 uppercase hover:text-zinc-600">
            Enactus
          </Link>
          <h1 className="text-3xl">Member Profiles</h1>
          <p className="text-sm text-zinc-500">
            Map a Slack username to a LinkedIn export so <code className="bg-zinc-100 px-1 rounded">/glaze</code> has rich data to work with.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 border border-zinc-200 rounded-lg p-6">
          <h2 className="text-sm font-medium text-zinc-900">Add / update profile</h2>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Slack username</label>
            <input
              className={inputClass}
              placeholder="justinpc.cheung"
              value={slackUsername}
              onChange={(e) => setSlackUsername(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">LinkedIn data export (.zip)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              className="w-full text-sm text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200 cursor-pointer"
              onChange={(e) => setFile(e.target.files[0] ?? null)}
            />
            <p className="text-xs text-zinc-400">
              LinkedIn → Settings → Data Privacy → Get a copy of your data → select Profile
            </p>
          </div>

          <button
            type="submit"
            disabled={!slackUsername || !file || status === 'uploading'}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
          >
            {status === 'uploading' ? 'Processing...' : 'Upload'}
          </button>

          {status === 'done' && <p className="text-sm text-green-600">Profile saved.</p>}
          {status === 'error' && <p className="text-sm text-red-500">{error}</p>}
        </form>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-900">{profiles.length} profile{profiles.length !== 1 ? 's' : ''}</h2>
          {profiles.length === 0 && (
            <p className="text-sm text-zinc-400">No profiles yet.</p>
          )}
          {profiles.map((p) => (
            <div key={p.slackUsername} className="flex items-center justify-between border border-zinc-100 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">{p.name}</p>
                <p className="text-xs text-zinc-400">@{p.slackUsername} · {p.positions?.length ?? 0} positions · {p.skills?.length ?? 0} skills</p>
              </div>
              <button
                onClick={() => handleDelete(p.slackUsername)}
                className="text-xs text-zinc-400 hover:text-red-500 transition"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
