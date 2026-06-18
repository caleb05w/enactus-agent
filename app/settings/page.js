'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function SettingsPage() {
  const [channels, setChannels] = useState([])
  const [selected, setSelected] = useState('') // channel id
  const [initial, setInitial] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('idle') // idle | saved | error
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [chRes, setRes] = await Promise.all([
          fetch('/api/slack/channels'),
          fetch('/api/settings'),
        ])
        const chData = await chRes.json()
        const setData = await setRes.json()
        if (!chRes.ok) throw new Error(chData.error || 'Could not load channels from Slack.')
        setChannels(chData.channels ?? [])
        const cur = setData.financeChannel?.id ?? ''
        setSelected(cur)
        setInitial(cur)
      } catch (err) {
        setLoadError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const selectedChannel = channels.find((c) => c.id === selected)
  const dirty = selected !== initial

  async function save() {
    setSaving(true)
    setStatus('idle')
    setSaveError('')
    try {
      const ch = channels.find((c) => c.id === selected)
      const value = ch ? { id: ch.id, name: ch.name } : null
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'financeChannel', value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save.')
      setInitial(selected)
      setStatus('saved')
    } catch (err) {
      setSaveError(err.message)
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-16">
      <div className="max-w-xl w-full space-y-8">
        <div className="space-y-1">
          <Link href="/" className="text-xs font-medium tracking-widest text-zinc-400 uppercase hover:text-zinc-600 transition-colors">
            ← Enactus
          </Link>
          <h1 className="pt-2">Settings</h1>
          <p>Choose where the agent posts notifications. Channels are pulled live from Slack.</p>
        </div>

        <div className="space-y-2.5">
          <label htmlFor="financeChannel" className="block text-sm font-medium text-zinc-700">
            Finance notification channel
          </label>
          <p className="text-xs text-zinc-400">
            New reimbursement and money requests are announced here.
          </p>

          {loading ? (
            <div className="h-11 rounded-md border border-zinc-200 bg-zinc-50 animate-pulse" />
          ) : loadError ? (
            <p className="text-sm text-red-600">{loadError}</p>
          ) : (
            <>
              <select
                id="financeChannel"
                value={selected}
                onChange={(e) => { setSelected(e.target.value); setStatus('idle') }}
                className="w-full rounded-md border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition"
              >
                <option value="">Default (#agent-test)</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.isPrivate ? '🔒 ' : '#'}{c.name}{c.isMember ? '' : ' — bot not in channel'}
                  </option>
                ))}
              </select>

              {selectedChannel && !selectedChannel.isMember && (
                <p className="text-xs text-zinc-500">
                  ⚠️ The bot isn&rsquo;t in #{selectedChannel.name} yet. Invite it with
                  {' '}<code className="rounded bg-zinc-100 px-1 py-0.5">/invite @Enactus Agent</code>{' '}
                  in that channel, or it can&rsquo;t post there.
                </p>
              )}
            </>
          )}
        </div>

        {status === 'saved' && !dirty && (
          <p className="text-sm text-zinc-600">Saved.</p>
        )}
        {status === 'error' && saveError && (
          <p className="text-sm text-red-600">{saveError}</p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={loading || saving || !dirty}
          className="w-full rounded-md bg-zinc-950 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </main>
  )
}
