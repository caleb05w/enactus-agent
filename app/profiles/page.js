'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

const LAST_PULL_KEY = 'profiles-last-pull'

function timeAgo(ts) {
  if (!ts) return null
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function useFileUpload(username, onDone) {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef()

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setStatus('uploading')
    setError('')
    const form = new FormData()
    form.append('slackUsername', username)
    form.append('file', file)
    const res = await fetch('/api/profiles/upload', { method: 'POST', body: form })
    const data = await res.json()
    if (!res.ok) { setStatus('error'); setError(data.error ?? 'Upload failed'); return }
    setStatus('done')
    onDone()
    setTimeout(() => setStatus(null), 3000)
  }

  return { status, error, fileRef, handleFile, trigger: () => fileRef.current?.click() }
}

function MemberRow({ member, profiled, onUpload, onDelete }) {
  const { status, error, fileRef, handleFile, trigger } = useFileUpload(member.username, onUpload)

  return (
    <div className="flex items-center gap-3 border border-zinc-100 rounded-lg px-4 py-3">
      {member.avatar
        ? <img src={member.avatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
        : <div className="w-8 h-8 rounded-full bg-zinc-100 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 truncate">{member.name}</p>
        <p className="text-xs text-zinc-400 truncate">@{member.username}{member.title ? ` · ${member.title}` : ''}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {status === 'uploading' && <span className="text-xs text-zinc-400">Uploading…</span>}
        {status === 'done' && <span className="text-xs text-green-600">Saved</span>}
        {status === 'error' && <span className="text-xs text-red-500">{error}</span>}
        {profiled && status == null && <span className="text-xs text-emerald-600 font-medium">Profiled</span>}
        <button onClick={trigger} disabled={status === 'uploading'}
          className="text-xs rounded border border-zinc-200 px-2.5 py-1 text-zinc-600 hover:bg-zinc-50 transition disabled:opacity-40">
          {profiled ? 'Update' : 'Upload ZIP'}
        </button>
        {profiled && (
          <button onClick={() => onDelete(member.username)} className="text-xs text-zinc-300 hover:text-red-500 transition">✕</button>
        )}
        <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={handleFile} />
      </div>
    </div>
  )
}

function ProfileCard({ profile, member, onReplace, onDelete }) {
  const { status, error, fileRef, handleFile, trigger } = useFileUpload(profile.slackUsername, onReplace)

  return (
    <div className="border border-zinc-100 rounded-lg px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {member?.avatar
            ? <img src={member.avatar} alt="" className="w-9 h-9 rounded-full flex-shrink-0" />
            : <div className="w-9 h-9 rounded-full bg-zinc-100 flex-shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900">{profile.name}</p>
            <p className="text-xs text-zinc-400">@{profile.slackUsername}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {status === 'uploading' && <span className="text-xs text-zinc-400">Uploading…</span>}
          {status === 'done' && <span className="text-xs text-green-600">Replaced</span>}
          {status === 'error' && <span className="text-xs text-red-500">{error}</span>}
          <button onClick={trigger} disabled={status === 'uploading'}
            className="text-xs rounded border border-zinc-200 px-2.5 py-1 text-zinc-600 hover:bg-zinc-50 transition disabled:opacity-40">
            Replace ZIP
          </button>
          <button onClick={() => onDelete(profile.slackUsername)} className="text-xs text-zinc-300 hover:text-red-500 transition">✕</button>
          <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {profile.headline && (
        <p className="text-xs text-zinc-500 italic">{profile.headline}</p>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-400">
        {profile.positions?.length > 0 && (
          <span>{profile.positions.length} position{profile.positions.length !== 1 ? 's' : ''}</span>
        )}
        {profile.education?.length > 0 && (
          <span>{profile.education.length} education</span>
        )}
        {profile.skills?.length > 0 && (
          <span>{profile.skills.length} skills</span>
        )}
        <span>Updated {timeAgo(new Date(profile.updatedAt).getTime())}</span>
      </div>

      {profile.positions?.slice(0, 2).map((p, i) => (
        <div key={i} className="text-xs text-zinc-500 pl-2 border-l border-zinc-100">
          {p.title}{p.company ? ` · ${p.company}` : ''}{p.startDate ? ` · ${p.startDate}${p.endDate ? `–${p.endDate}` : '–present'}` : ''}
        </div>
      ))}
    </div>
  )
}

export default function ProfilesPage() {
  const [tab, setTab] = useState('members')
  const [members, setMembers] = useState([])
  const [profiles, setProfiles] = useState([])
  const [profiledSet, setProfiledSet] = useState(new Set())
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState('')
  const [lastPull, setLastPull] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem(LAST_PULL_KEY)
    if (stored) setLastPull(Number(stored))
    loadProfiles()
  }, [])

  async function loadProfiles() {
    const res = await fetch('/api/profiles')
    const data = await res.json()
    setProfiles(data)
    setProfiledSet(new Set(data.map((p) => p.slackUsername)))
  }

  async function pullMembers() {
    setPulling(true)
    setError('')
    try {
      const [membersRes] = await Promise.all([fetch('/api/slack/members'), loadProfiles()])
      const membersData = await membersRes.json()
      if (membersRes.ok) {
        setMembers(membersData)
        const now = Date.now()
        setLastPull(now)
        localStorage.setItem(LAST_PULL_KEY, String(now))
      } else {
        setError(membersData.error ?? 'Failed to load members')
      }
    } catch {
      setError('Failed to load')
    }
    setPulling(false)
  }

  async function handleDelete(username) {
    await fetch('/api/profiles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slackUsername: username }),
    })
    await loadProfiles()
  }

  const memberMap = Object.fromEntries(members.map((m) => [m.username, m]))
  const profiled = members.filter((m) => profiledSet.has(m.username))
  const unprofiled = members.filter((m) => !profiledSet.has(m.username))

  const tabs = [
    { id: 'members', label: 'Members' },
    { id: 'uploads', label: `Uploads${profiles.length ? ` · ${profiles.length}` : ''}` },
  ]

  return (
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">

        <div className="space-y-4">
          <Link href="/" className="text-xs font-medium tracking-widest text-zinc-400 uppercase hover:text-zinc-600">
            Enactus
          </Link>
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl">Member Profiles</h1>
              <p className="text-sm text-zinc-500">
                Upload LinkedIn exports so <code className="bg-zinc-100 px-1 rounded">/glaze</code> has rich context.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <button onClick={pullMembers} disabled={pulling}
                className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">
                {pulling ? 'Pulling…' : 'Pull members'}
              </button>
              {lastPull && <p className="text-xs text-zinc-400">Last pulled {timeAgo(lastPull)}</p>}
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-b border-zinc-100">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
                tab === t.id ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-600'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {tab === 'members' && (
          <div className="space-y-8">
            {members.length === 0 && !pulling && (
              <p className="text-sm text-zinc-400">Click "Pull members" to load your Slack workspace.</p>
            )}
            {profiled.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-medium tracking-widest text-zinc-400 uppercase">Profiled · {profiled.length}</h2>
                {profiled.map((m) => (
                  <MemberRow key={m.id} member={m} profiled onUpload={loadProfiles} onDelete={handleDelete} />
                ))}
              </div>
            )}
            {unprofiled.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-medium tracking-widest text-zinc-400 uppercase">No profile · {unprofiled.length}</h2>
                {unprofiled.map((m) => (
                  <MemberRow key={m.id} member={m} profiled={false} onUpload={loadProfiles} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'uploads' && (
          <div className="space-y-3">
            {profiles.length === 0 && (
              <p className="text-sm text-zinc-400">No profiles uploaded yet.</p>
            )}
            {profiles.map((p) => (
              <ProfileCard
                key={p.slackUsername}
                profile={p}
                member={memberMap[p.slackUsername]}
                onReplace={loadProfiles}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

      </div>
    </main>
  )
}
