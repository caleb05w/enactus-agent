'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

const TYPES = [
  { id: 'reimbursement', label: 'Reimbursement' },
  { id: 'request', label: 'Money Request' },
]

const inputClass = 'w-full rounded-md border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition'

const STEPS = [
  { id: 'receipt', label: 'Uploading receipt' },
  { id: 'db', label: 'Saving to database' },
  { id: 'sheets', label: 'Logging to spreadsheet' },
  { id: 'slack', label: 'Notifying Slack' },
]

export default function FinancePage() {
  const [type, setType] = useState('reimbursement')
  const [form, setForm] = useState({
    item: '',
    date: '',
    amount: '',
    etransferName: '',
    etransferEmail: '',
  })
  const submissionId = useRef(crypto.randomUUID())
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState('')
  const [isNewEvent, setIsNewEvent] = useState(false)
  const [newEventName, setNewEventName] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [currentStep, setCurrentStep] = useState(-1)
  const stepTimer = useRef(null)

  useEffect(() => {
    fetch('/api/finance/events')
      .then((r) => r.json())
      .then((data) => setEvents(data.events ?? []))
      .catch(() => setEvents([]))
  }, [])

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleTypeChange(id) {
    setType(id)
    setStatus('idle')
    setErrorMsg('')
  }

  function handleEventChange(e) {
    if (e.target.value === '__new__') {
      setIsNewEvent(true)
      setSelectedEvent('')
    } else {
      setIsNewEvent(false)
      setSelectedEvent(e.target.value)
    }
  }

  const eventValue = isNewEvent ? newEventName : selectedEvent

  function startSteps() {
    setCurrentStep(0)
    let step = 0
    stepTimer.current = setInterval(() => {
      step += 1
      if (step < STEPS.length) setCurrentStep(step)
      else clearInterval(stepTimer.current)
    }, 900)
  }

  function stopSteps() {
    clearInterval(stepTimer.current)
    setCurrentStep(STEPS.length)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('loading')
    setCurrentStep(-1)
    setErrorMsg('')

    if (!eventValue.trim()) {
      setErrorMsg('Please select or enter an event.')
      setStatus('error')
      return
    }

    startSteps()

    try {
      const formData = new FormData()
      formData.append('submissionId', submissionId.current)
      formData.append('type', type)
      formData.append('item', form.item)
      formData.append('date', form.date)
      formData.append('amount', form.amount)
      formData.append('etransferName', form.etransferName)
      formData.append('etransferEmail', form.etransferEmail)
      formData.append('event', eventValue.trim())
      if (receipt) formData.append('receipt', receipt)

      const res = await fetch('/api/finance/submit', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Submission failed.')

      // Add new event to list if it was created
      if (isNewEvent && newEventName.trim()) {
        setEvents((prev) => [...prev, newEventName.trim()].sort())
      }

      stopSteps()
      submissionId.current = crypto.randomUUID()
      setStatus('success')
      setForm({ item: '', date: '', amount: '', etransferName: '', etransferEmail: '' })
      setReceipt(null)
      setSelectedEvent('')
      setIsNewEvent(false)
      setNewEventName('')
    } catch (err) {
      clearInterval(stepTimer.current)
      setCurrentStep(-1)
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
            <h2 className="text-2xl font-semibold text-zinc-950">Request submitted</h2>
            <p className="text-zinc-500 text-sm">Your request has been saved, logged to the spreadsheet, and the team has been notified on Slack.</p>
          </div>
          <div className="flex justify-center gap-3">
            <button onClick={() => setStatus('idle')} className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900">
              Submit another
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
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 pt-2">Finance request</h1>
          <p className="text-sm text-zinc-500">Submitted requests are logged to the team spreadsheet and posted to Slack.</p>
        </div>

        {/* Type selector */}
        <div className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 p-1">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTypeChange(t.id)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                type === t.id ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Event selector */}
          <div className="space-y-1.5">
            <label htmlFor="event" className="block text-sm font-medium text-zinc-700">Event</label>
            <select
              id="event"
              value={isNewEvent ? '__new__' : selectedEvent}
              onChange={handleEventChange}
              className={inputClass}
            >
              <option value="">Select an event...</option>
              {events.map((ev) => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
              <option value="__new__">+ Add new event</option>
            </select>
            {isNewEvent && (
              <input
                type="text"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder="New event name"
                className={inputClass}
                autoFocus
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="item" className="block text-sm font-medium text-zinc-700">Item / Description</label>
            <input
              id="item"
              name="item"
              type="text"
              required
              value={form.item}
              onChange={handleChange}
              placeholder="e.g. Marketing flyers for pitch event"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="date" className="block text-sm font-medium text-zinc-700">
                {type === 'reimbursement' ? 'Purchase date' : 'Date needed by'}
              </label>
              <input
                id="date"
                name="date"
                type="date"
                required
                value={form.date}
                onChange={handleChange}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="amount" className="block text-sm font-medium text-zinc-700">Amount ($)</label>
              <input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.amount}
                onChange={handleChange}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="etransferName" className="block text-sm font-medium text-zinc-700">E-transfer name</label>
              <input
                id="etransferName"
                name="etransferName"
                type="text"
                required
                value={form.etransferName}
                onChange={handleChange}
                placeholder="Full name"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="etransferEmail" className="block text-sm font-medium text-zinc-700">E-transfer email</label>
              <input
                id="etransferEmail"
                name="etransferEmail"
                type="email"
                required
                value={form.etransferEmail}
                onChange={handleChange}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="receipt" className="block text-sm font-medium text-zinc-700">
              Receipt / Invoice
              {type === 'reimbursement'
                ? <span className="text-red-500 ml-1">*</span>
                : <span className="text-zinc-400 font-normal ml-1">(optional)</span>
              }
            </label>
            <div className="relative flex items-center justify-center w-full rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center hover:border-zinc-400 transition cursor-pointer">
              <input
                id="receipt"
                name="receipt"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setReceipt(e.target.files[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="space-y-1">
                <p className="text-sm text-zinc-500">
                  {receipt ? receipt.name : 'Click or drag receipt here'}
                </p>
                <p className="text-xs text-zinc-400">PNG, JPG, HEIC, PDF accepted</p>
              </div>
            </div>
          </div>

          {status === 'error' && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-md bg-zinc-950 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? 'Submitting…' : 'Submit request'}
          </button>

          {status === 'loading' && (
            <div className="space-y-2 pt-1">
              {STEPS.map((step, i) => {
                const done = currentStep > i
                const active = currentStep === i
                return (
                  <div key={step.id} className="flex items-center gap-2.5">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                      done ? 'bg-zinc-900' : active ? 'bg-zinc-300' : 'bg-zinc-100'
                    }`}>
                      {done && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" />}
                    </div>
                    <span className={`text-xs transition-colors ${
                      done ? 'text-zinc-400 line-through' : active ? 'text-zinc-700 font-medium' : 'text-zinc-300'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </form>
      </div>
    </main>
  )
}
