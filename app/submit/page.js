'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const MODES = [
  { id: 'message', label: 'Send a message' },
  { id: 'submission', label: 'Full submission' },
]

const CHANNELS = [
  { id: 'agent_test', label: '#agent-test' },
  { id: 'marketing_execs', label: '#marketing-execs' },
]

const CHANNEL_LABELS = { agent_test: '#agent-test', marketing_execs: '#marketing-execs' }

const SUBMISSION_STEPS = [
  { id: 'upload', label: 'Uploading files' },
  { id: 'db', label: 'Saving submission' },
  { id: 'slack', label: 'Notifying Slack' },
]

const DRAFT_KEY = 'submit-draft'

function StepList({ steps, currentStep, failedStep }) {
  return (
    <div className="space-y-2 pt-1">
      {steps.map((step, i) => {
        const done = currentStep > i
        const active = currentStep === i
        const failed = failedStep === i
        return (
          <div key={step.id} className="flex items-center gap-2.5">
            <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
              done ? 'bg-zinc-900' : active && failed ? 'bg-red-400' : active ? 'bg-zinc-300' : 'bg-zinc-100'
            }`}>
              {done && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {active && failed && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {active && !failed && <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" />}
            </div>
            <span className={`text-xs transition-colors ${
              done ? 'text-zinc-400 line-through' : active && failed ? 'text-red-500 font-medium' : active ? 'text-zinc-700 font-medium' : 'text-zinc-300'
            }`}>
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function SubmitPage() {
  const [mode, setMode] = useState('message')
  const [channel, setChannel] = useState('agent_test')
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [quickMessage, setQuickMessage] = useState('')
  const [files, setFiles] = useState([])
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [currentStep, setCurrentStep] = useState(-1)
  const [failedStep, setFailedStep] = useState(-1)
  const [successSummary, setSuccessSummary] = useState(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (!saved) return
      const { form: f, quickMessage: qm } = JSON.parse(saved)
      if (f) setForm(f)
      if (qm) setQuickMessage(qm)
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, quickMessage }))
    } catch {}
  }, [form, quickMessage])

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleFiles(e) {
    setFiles((prev) => [...prev, ...Array.from(e.target.files)])
    e.target.value = ''
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function handleModeChange(id) {
    setMode(id)
    setStatus('idle')
    setErrorMsg('')
    setCurrentStep(-1)
    setFailedStep(-1)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('loading')
    setCurrentStep(-1)
    setFailedStep(-1)
    setErrorMsg('')

    const formData = new FormData()
    formData.append('mode', mode)
    formData.append('channel', channel)

    try {
      if (mode === 'message') {
        formData.append('message', quickMessage)
        const res = await fetch('/api/submit', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Submission failed.')
        localStorage.removeItem(DRAFT_KEY)
        setQuickMessage('')
        setSuccessSummary({ mode: 'message', channel })
        setStatus('success')
        return
      }

      formData.append('name', form.name)
      formData.append('email', form.email)
      formData.append('message', form.message)
      for (const file of files) formData.append('files', file)

      const res = await fetch('/api/submit', { method: 'POST', body: formData })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Submission failed.')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let activeStep = -1

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop()

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          const payload = JSON.parse(part.slice(6))

          if (payload.step !== undefined) {
            activeStep = payload.step
            setCurrentStep(payload.step)
          }

          if (payload.error) {
            setFailedStep(activeStep)
            throw new Error(payload.error)
          }

          if (payload.done) {
            setCurrentStep(SUBMISSION_STEPS.length)
            setSuccessSummary(payload.summary)
            localStorage.removeItem(DRAFT_KEY)
            setForm({ name: '', email: '', message: '' })
            setFiles([])
            setStatus('success')
            return
          }
        }
      }
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  if (status === 'success' && successSummary) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
        <div className="max-w-xl w-full space-y-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100">
            <svg className="w-6 h-6 text-zinc-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2>
              {successSummary.mode === 'message' ? 'Message sent' : 'Submission received'}
            </h2>
            <p>
              {successSummary.mode === 'message'
                ? `Your message was posted to ${CHANNEL_LABELS[successSummary.channel]}.`
                : 'Your submission has been saved and the team has been notified on Slack.'}
            </p>
          </div>
          {successSummary.mode === 'submission' && (
            <div className="rounded-md border border-zinc-100 bg-zinc-50 px-5 py-4 text-left space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">From</span>
                <span className="font-medium text-zinc-900">{successSummary.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Channel</span>
                <span className="font-medium text-zinc-900">{CHANNEL_LABELS[successSummary.channel]}</span>
              </div>
              {successSummary.fileCount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Files</span>
                  <span className="font-medium text-zinc-900">{successSummary.fileCount} attached</span>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-center gap-3">
            <button
              onClick={() => { setStatus('idle'); setSuccessSummary(null) }}
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
          <h1 className="pt-2">New submission</h1>
        </div>

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
                <div className="relative flex items-center justify-center w-full rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-center hover:border-zinc-400 transition cursor-pointer">
                  <input
                    id="files"
                    name="files"
                    type="file"
                    multiple
                    onChange={handleFiles}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <p>Click or drag files here</p>
                </div>
                {files.length > 0 && (
                  <ul className="space-y-1">
                    {files.map((f, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 bg-zinc-50 px-3 py-1.5">
                        <span className="text-xs text-zinc-600 truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="flex-shrink-0 text-xs text-zinc-400 hover:text-red-500 transition-colors"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {status === 'error' && errorMsg && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-md bg-zinc-950 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? 'Sending…' : mode === 'message' ? 'Send message' : 'Submit'}
          </button>

          {mode === 'submission' && currentStep >= 0 && (
            <StepList steps={SUBMISSION_STEPS} currentStep={currentStep} failedStep={failedStep} />
          )}
        </form>
      </div>
    </main>
  )
}
