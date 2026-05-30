'use client'

import { useState } from 'react'
import Link from 'next/link'

const MODES = [
  { id: 'message', label: 'Send a message' },
  { id: 'submission', label: 'Full submission' },
]

const CHANNELS = [
  { id: 'agent_test', label: '#agent-test' },
  { id: 'marketing_execs', label: '#marketing-execs' },
]

export default function SubmitPage() {
  const [mode, setMode] = useState('message')
  const [channel, setChannel] = useState('agent_test')
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [quickMessage, setQuickMessage] = useState('')
  const [files, setFiles] = useState([])
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleFiles(e) {
    setFiles(Array.from(e.target.files))
  }

  function handleModeChange(id) {
    setMode(id)
    setStatus('idle')
    setErrorMsg('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    try {
      const formData = new FormData()
      formData.append('mode', mode)
      formData.append('channel', channel)

      if (mode === 'message') {
        formData.append('message', quickMessage)
      } else {
        formData.append('name', form.name)
        formData.append('email', form.email)
        formData.append('message', form.message)
        for (const file of files) {
          formData.append('files', file)
        }
      }

      const res = await fetch('/api/submit', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Submission failed.')

      setStatus('success')
      setQuickMessage('')
      setForm({ name: '', email: '', message: '' })
      setFiles([])
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
        <div className="max-w-xl w-full space-y-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100">
            <svg className="w-6 h-6 text-zinc-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-zinc-950">
              {mode === 'message' ? 'Message sent' : 'Submission received'}
            </h2>
            <p className="text-zinc-500 text-sm">
              {mode === 'message'
                ? 'Your message was posted to Slack.'
                : 'Your submission has been saved and the team has been notified on Slack.'}
            </p>
          </div>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setStatus('idle')}
              className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
            >
              Send another
            </button>
            <Link href="/" className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900">
              Go home
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-16">
      <div className="max-w-xl w-full space-y-8">
        <div className="space-y-1">
          <Link href="/" className="text-xs font-medium tracking-widest text-zinc-400 uppercase hover:text-zinc-600 transition-colors">
            ← Enactus
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 pt-2">New submission</h1>
        </div>

        {/* Ramp-style segment control */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleModeChange(m.id)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === m.id
                    ? 'bg-white text-zinc-950 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Channel selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Post to</span>
            <div className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 p-1">
              {CHANNELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannel(c.id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    channel === c.id
                      ? 'bg-white text-zinc-950 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'message' ? (
            <div className="space-y-1.5">
              <label htmlFor="quickMessage" className="block text-sm font-medium text-zinc-700">
                Message
              </label>
              <textarea
                id="quickMessage"
                required
                rows={4}
                value={quickMessage}
                onChange={(e) => setQuickMessage(e.target.value)}
                placeholder="Type anything to post to Slack..."
                className="w-full rounded-md border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition resize-none"
              />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor="name" className="block text-sm font-medium text-zinc-700">Name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Your full name"
                  className="w-full rounded-md border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-zinc-700">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="message" className="block text-sm font-medium text-zinc-700">Message</label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={5}
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Describe your project, idea, or update..."
                  className="w-full rounded-md border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="files" className="block text-sm font-medium text-zinc-700">
                  Attachments <span className="text-zinc-400 font-normal">(optional)</span>
                </label>
                <div className="relative flex items-center justify-center w-full rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center hover:border-zinc-400 transition cursor-pointer">
                  <input
                    id="files"
                    name="files"
                    type="file"
                    multiple
                    onChange={handleFiles}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="space-y-1">
                    <p className="text-sm text-zinc-500">
                      {files.length > 0
                        ? `${files.length} file${files.length > 1 ? 's' : ''} selected`
                        : 'Click or drag files here'}
                    </p>
                    {files.length > 0 && (
                      <p className="text-xs text-zinc-400">{files.map(f => f.name).join(', ')}</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {status === 'error' && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-md bg-zinc-950 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? 'Sending…' : mode === 'message' ? 'Send message' : 'Submit'}
          </button>
        </form>
      </div>
    </main>
  )
}
