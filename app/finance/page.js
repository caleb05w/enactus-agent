'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { findSimilar } from '@/lib/similarity'

const TYPES = [
  { id: 'reimbursement', label: 'Reimbursement' },
  { id: 'request', label: 'Money Request' },
]

const STEPS = [
  { id: 'receipt', label: 'Uploading receipt' },
  { id: 'db', label: 'Saving to database' },
  { id: 'sheets', label: 'Logging to spreadsheet' },
  { id: 'slack', label: 'Notifying Slack' },
]

const DRAFT_KEY = 'finance-draft'
const SAVED_INFO_KEY = 'finance-saved-info'
const RECENTS_KEY = 'finance-recent-events'

const inputBase = 'w-full rounded-md border px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition bg-white'
const inputClass = `${inputBase} border-zinc-200 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100`
const inputErrorClass = `${inputBase} border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-50`

function fieldCls(hasError) {
  return hasError ? inputErrorClass : inputClass
}

// Wraps the matched substring of `text` in a subtle highlight.
function highlightMatch(text, query) {
  const q = query.trim()
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-zinc-200 px-0.5 font-medium text-zinc-900">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  )
}

function formatEventDate(d) {
  if (!d) return ''
  const dt = new Date(`${d}T00:00:00`)
  if (isNaN(dt)) return ''
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function EventSearch({ events, value, onChange, hasError }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [recents, setRecents] = useState([])
  const [duplicates, setDuplicates] = useState([])
  const containerRef = useRef(null)

  const eventNames = useMemo(() => events.map((e) => e.name), [events])

  useEffect(() => {
    function handler(e) {
      if (!containerRef.current?.contains(e.target)) {
        setOpen(false)
        setQuery('')
        setShowNew(false)
        setNewName('')
        setDuplicates([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]')
      setRecents(r.slice(0, 3))
    } catch {}
  }, [])

  function addToRecents(ev) {
    try {
      const current = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]')
      const updated = [ev, ...current.filter((e) => e !== ev)].slice(0, 3)
      localStorage.setItem(RECENTS_KEY, JSON.stringify(updated))
      setRecents(updated)
    } catch {}
  }

  function select(ev) {
    onChange(ev)
    addToRecents(ev)
    setOpen(false)
    setQuery('')
    setShowNew(false)
    setNewName('')
    setDuplicates([])
  }

  function handleAdd() {
    const name = newName.trim()
    if (!name) return

    // Exact case-insensitive match → silently use the existing event
    const exact = eventNames.find(
      (ev) => ev.toLowerCase().trim() === name.toLowerCase()
    )
    if (exact) { select(exact); return }

    // Fuzzy match — show warning if anything is close enough
    const matches = findSimilar(name, eventNames)
    if (matches.length > 0) { setDuplicates(matches); return }

    select(name)
  }

  const q = query.trim().toLowerCase()
  const filtered = q ? events.filter((ev) => ev.name.toLowerCase().includes(q)) : []
  const latest = events.slice(0, 6)

  return (
    <div ref={containerRef}>
      {/* Selected chip */}
      {value && (
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-900 text-white">{value}</span>
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            Change
          </button>
        </div>
      )}

      {/* Search input */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOpen(false); setQuery('') }
          if (e.key === 'Enter' && filtered.length === 1) { e.preventDefault(); select(filtered[0]) }
        }}
        placeholder="Search events..."
        autoComplete="off"
        className={fieldCls(hasError)}
      />

      {/* Animated inline panel */}
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="space-y-3 pt-3 pb-0.5">

            {/* Search results */}
            {query.trim() && filtered.length > 0 && (
              <ul className="rounded-md border border-zinc-100 bg-zinc-50 divide-y divide-zinc-100 overflow-hidden">
                {filtered.map((ev) => (
                  <li
                    key={ev.name}
                    onClick={() => select(ev.name)}
                    className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm cursor-pointer hover:bg-white text-zinc-700"
                  >
                    <span className="truncate">{highlightMatch(ev.name, query)}</span>
                    {ev.date && <span className="flex-shrink-0 text-xs text-zinc-400">{formatEventDate(ev.date)}</span>}
                  </li>
                ))}
              </ul>
            )}

            {query.trim() && filtered.length === 0 && (
              <p className="text-xs text-zinc-400">No events match &ldquo;{query}&rdquo;</p>
            )}

            {/* Recently used (this device) */}
            {!query.trim() && recents.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-zinc-400">Recently used</p>
                <div className="flex flex-wrap gap-1.5">
                  {recents.map((ev) => (
                    <button
                      key={ev}
                      type="button"
                      onClick={() => select(ev)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                        value === ev
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 hover:text-zinc-900'
                      }`}
                    >
                      {ev}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Latest Events-team events (±1 month) */}
            {!query.trim() && latest.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-zinc-400">Latest events</p>
                <ul className="rounded-md border border-zinc-100 bg-zinc-50 divide-y divide-zinc-100 overflow-hidden">
                  {latest.map((ev) => (
                    <li
                      key={ev.name}
                      onClick={() => select(ev.name)}
                      className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm cursor-pointer hover:bg-white text-zinc-700"
                    >
                      <span className="truncate">{ev.name}</span>
                      {ev.date && <span className="flex-shrink-0 text-xs text-zinc-400">{formatEventDate(ev.date)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!query.trim() && latest.length === 0 && (
              <p className="text-xs text-zinc-400">No recent events from the Events team.</p>
            )}

            {/* New event / duplicate warning */}
            {!showNew ? (
              <button
                type="button"
                onClick={() => setShowNew(true)}
                className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
              >
                + New event
              </button>
            ) : duplicates.length > 0 ? (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 space-y-2.5">
                <p className="text-xs font-medium text-zinc-500">Similar events found — is this the same?</p>
                <ul className="space-y-2">
                  {duplicates.slice(0, 3).map(({ name, score }) => (
                    <li key={name} className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-zinc-800 truncate">{name}</span>
                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        <span className="text-xs text-zinc-400">{Math.round(score * 100)}%</span>
                        <button
                          type="button"
                          onClick={() => select(name)}
                          className="text-xs font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900 transition-colors"
                        >
                          Use this
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between pt-2 border-t border-zinc-200">
                  <button
                    type="button"
                    onClick={() => select(newName.trim())}
                    className="text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
                  >
                    Create &ldquo;{newName.trim()}&rdquo; anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicates([])}
                    className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Event name"
                  autoFocus
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleAdd() }
                    if (e.key === 'Escape') { setShowNew(false); setNewName('') }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  className="px-3 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors whitespace-nowrap"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNew(false); setNewName(''); setDuplicates([]) }}
                  className="px-3 rounded-md border border-zinc-200 text-zinc-600 text-sm hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

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

export default function FinancePage() {
  const [type, setType] = useState('reimbursement')
  const [form, setForm] = useState({
    item: '',
    date: '',
    amount: '',
    etransferName: '',
    etransferEmail: '',
  })
  const [eventValue, setEventValue] = useState('')
  const submissionId = useRef(crypto.randomUUID())
  const [events, setEvents] = useState([])
  const [receipt, setReceipt] = useState(null)
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [currentStep, setCurrentStep] = useState(-1)
  const [failedStep, setFailedStep] = useState(-1)
  const [successSummary, setSuccessSummary] = useState(null)
  const [saveInfo, setSaveInfo] = useState(false)

  useEffect(() => {
    fetch('/api/finance/events')
      .then((r) => r.json())
      .then((data) => setEvents(data.events ?? []))
      .catch(() => setEvents([]))
  }, [])

  // Load saved info then draft on mount
  useEffect(() => {
    try {
      const si = localStorage.getItem(SAVED_INFO_KEY)
      if (si) {
        const info = JSON.parse(si)
        setSaveInfo(true)
        setForm((prev) => ({
          ...prev,
          etransferName: info.etransferName ?? prev.etransferName,
          etransferEmail: info.etransferEmail ?? prev.etransferEmail,
        }))
      }
    } catch {}

    try {
      const d = localStorage.getItem(DRAFT_KEY)
      if (!d) return
      const { type: t, eventValue: ev, form: f } = JSON.parse(d)
      if (t) setType(t)
      if (ev !== undefined) setEventValue(ev)
      if (f) setForm((prev) => ({
        ...prev,
        item: f.item ?? prev.item,
        date: f.date ?? prev.date,
        amount: f.amount ?? prev.amount,
      }))
    } catch {}
  }, [])

  // Save draft (excludes e-transfer fields — handled by saveInfo)
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        type,
        eventValue,
        form: { item: form.item, date: form.date, amount: form.amount },
      }))
    } catch {}
  }, [type, eventValue, form.item, form.date, form.amount])

  // Save e-transfer info when checkbox is on
  useEffect(() => {
    try {
      if (saveInfo) {
        localStorage.setItem(SAVED_INFO_KEY, JSON.stringify({
          etransferName: form.etransferName,
          etransferEmail: form.etransferEmail,
        }))
      } else {
        localStorage.removeItem(SAVED_INFO_KEY)
      }
    } catch {}
  }, [saveInfo, form.etransferName, form.etransferEmail])

  function clearError(field) {
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: '' }))
  }

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    clearError(e.target.name)
  }

  function handleAmountChange(e) {
    const val = e.target.value
    // Allow digits and at most one decimal point with up to 2 decimal places
    if (/^(\d*\.?\d{0,2})?$/.test(val)) {
      setForm((prev) => ({ ...prev, amount: val }))
    }
  }

  function handleAmountBlur() {
    const num = parseFloat(form.amount)
    setForm((prev) => ({ ...prev, amount: isNaN(num) ? '' : num.toFixed(2) }))
  }

  function handleTypeChange(id) {
    setType(id)
    setStatus('idle')
    setErrorMsg('')
    setFieldErrors({})
  }

  const steps = STEPS.map((s, i) =>
    i === 0 ? { ...s, label: type === 'reimbursement' ? 'Uploading receipt' : 'Preparing' } : s
  )

  async function handleSubmit(e) {
    e.preventDefault()

    const errors = {}
    if (!eventValue.trim()) errors.event = 'Please select or enter an event.'
    if (type === 'reimbursement' && !receipt) errors.receipt = 'Receipt is required for reimbursements.'
    if (!form.amount || isNaN(parseFloat(form.amount))) errors.amount = 'Please enter a valid amount.'
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setStatus('error')
      setErrorMsg('')
      return
    }

    setStatus('loading')
    setCurrentStep(-1)
    setFailedStep(-1)
    setErrorMsg('')
    setFieldErrors({})

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

    try {
      const res = await fetch('/api/finance/submit', { method: 'POST', body: formData })

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
            setCurrentStep(STEPS.length)
            setSuccessSummary(payload.summary)
            const name = eventValue.trim()
            const isNew = !events.some((e) => e.name.toLowerCase() === name.toLowerCase())
            if (isNew) {
              const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' })
              setEvents((prev) => [{ name, date: today }, ...prev])
            }
            submissionId.current = crypto.randomUUID()
            localStorage.removeItem(DRAFT_KEY)
            setForm((prev) => ({
              ...prev,
              item: '',
              date: '',
              amount: '',
              // Keep e-transfer fields if saveInfo is on
              etransferName: saveInfo ? prev.etransferName : '',
              etransferEmail: saveInfo ? prev.etransferEmail : '',
            }))
            setEventValue('')
            setReceipt(null)
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
            <h2>Request submitted</h2>
            <p>Saved, logged to the spreadsheet, and team notified on Slack.</p>
          </div>
          <div className="rounded-md border border-zinc-100 bg-zinc-50 px-5 py-4 text-left space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Amount</span>
              <span className="font-medium text-zinc-900">${parseFloat(successSummary.amount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Item</span>
              <span className="font-medium text-zinc-900 text-right max-w-[60%] truncate">{successSummary.item}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Event</span>
              <span className="font-medium text-zinc-900">{successSummary.event}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">E-transfer to</span>
              <span className="font-medium text-zinc-900">{successSummary.etransferName}</span>
            </div>
            {successSummary.hasReceipt && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Receipt</span>
                <span className="text-zinc-900">Uploaded</span>
              </div>
            )}
          </div>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => { setStatus('idle'); setSuccessSummary(null) }}
              className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
            >
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
          <h1 className="pt-2">Finance request</h1>
          <p>Submitted requests are logged to the team spreadsheet and posted to Slack.</p>
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 p-1">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTypeChange(t.id)}
              disabled={status === 'loading'}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all disabled:opacity-50 ${
                type === t.id ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">Event</label>
            <EventSearch
              events={events}
              value={eventValue}
              onChange={(v) => { setEventValue(v); clearError('event') }}
              hasError={!!fieldErrors.event}
            />
            {fieldErrors.event && <p className="text-xs text-red-500">{fieldErrors.event}</p>}
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
                type="text"
                inputMode="decimal"
                required
                value={form.amount}
                onChange={handleAmountChange}
                onBlur={handleAmountBlur}
                placeholder="0.00"
                className={fieldCls(fieldErrors.amount)}
              />
              {fieldErrors.amount && <p className="text-xs text-red-500">{fieldErrors.amount}</p>}
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
            <div className={`relative flex items-center justify-center w-full rounded-md border border-dashed px-4 py-6 text-center hover:border-zinc-400 transition cursor-pointer ${
              fieldErrors.receipt ? 'border-red-400 bg-red-50' : 'border-zinc-300 bg-zinc-50'
            }`}>
              <input
                id="receipt"
                name="receipt"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => { setReceipt(e.target.files[0] || null); clearError('receipt') }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="space-y-1">
                <p>
                  {receipt ? receipt.name : 'Click or drag receipt here'}
                </p>
                <p className="text-xs text-zinc-400">PNG, JPG, HEIC, PDF accepted</p>
              </div>
            </div>
            {fieldErrors.receipt && <p className="text-xs text-red-500">{fieldErrors.receipt}</p>}
          </div>

          {/* Save info checkbox */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveInfo}
              onChange={(e) => setSaveInfo(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-300 accent-zinc-900"
            />
            <span className="text-sm text-zinc-600">Save my name and e-transfer details for next time</span>
          </label>

          {status === 'error' && errorMsg && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-md bg-zinc-950 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? 'Submitting…' : 'Submit request'}
          </button>

          {currentStep >= 0 && (
            <StepList steps={steps} currentStep={currentStep} failedStep={failedStep} />
          )}
        </form>
      </div>
    </main>
  )
}
