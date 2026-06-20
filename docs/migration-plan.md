# Migration plan — split Caleb Jr from the Enactus portal

**Goal:** put the automation orchestrator (Caleb Jr) and the auto-editable
product (the Enactus portal / "enactus-bot") in **separate repos + deployments**,
so a Cursor-built change to the portal can never break Caleb Jr — and so the
portal's repo never sits next to Caleb Jr's powerful secrets.

**Principle:** the thing that performs automated changes must live *outside* the
blast radius of what it changes.

---

## Target architecture

| | `enactus-agent` (Caleb Jr) — **stays put** | `enactus-bot` (new repo) |
|---|---|---|
| Role | Headless automation agent (API routes only) | Public portal + the other Slack bot |
| Deploy | keeps `enactus-agent.vercel.app` | new `enactus-bot.vercel.app` |
| Cursor registry | **excluded + denylisted** (never self-edits) | **listed** (the auto-update target) |
| Powerful secrets | yes (Cursor key, user token, signing secrets) | no |
| Cron | `/api/agent/diagnose` (daily) | `/...hours/remind` (daily, self-gated to Fri) |

**Why Caleb Jr keeps the existing repo/URL:** its external wiring is the most
fragile — Slack interactivity URL (app `A0BBT99TL2Z`), `/rescan` + `/regurgitate`
slash commands, the Cursor webhook, and the GitHub merge webhooks all point at
`enactus-agent.vercel.app`. Keeping it stable means **zero reconfiguration** of
that wiring. The portal's URL is internal-tool links (re-shareable), so moving it
is the cheaper side to move.

---

## File inventory

### Stays in `enactus-agent` (Caleb Jr)
```
app/api/agent/control/route.js
app/api/agent/cursor-webhook/route.js
app/api/agent/diagnose/route.js          (cron)
app/api/agent/github-webhook/route.js
app/api/slack/interactivity/route.js
app/api/slack/regurgitate/route.js
app/api/slack/rescan/route.js
lib/calebjr/{cards,cursor,diagnose,slack,triage}.js
lib/models/{AgentAction,AgentCursor,AgentLog}.js
Settings keys: agentMode, agentEnabled, agentScanOwner
```

### Moves to `enactus-bot`
```
app/page.js  app/layout.js  app/globals.css  app/favicon.ico
app/finance/page.js          app/api/finance/{events,submit}/route.js
app/profiles/page.js         app/api/profiles/{ingest,route,upload,url}/route.js
app/submit/page.js           app/api/submit/route.js
app/settings/page.js         app/api/settings/route.js
                             app/api/slack/{channels,members,ping,help,glaze}/route.js
lib/{sheets,calendar,drive,destinations,parseLinkedIn,similarity,upload,slack}.js
lib/models/{Finance,Profile,Submission}.js
Settings key: financeChannel
PLUS: the hours/reminders feature from PR #4 (with token + cron fixes) lands HERE
```

### Duplicated in both (shared infra, copy verbatim)
```
lib/mongodb.js
lib/models/Settings.js   lib/settings.js
```
Both connect to the **same MongoDB cluster** — collections don't overlap
(`agentactions/agentcursors/agentlogs` vs `finances/profiles/submissions`), and
the shared `settings` collection uses disjoint keys. **No data migration.**

---

## Dependency split (`package.json`)

| Package | enactus-agent | enactus-bot |
|---|:--:|:--:|
| next, react, react-dom, mongoose | ✅ | ✅ |
| @anthropic-ai/sdk | ✅ (triage) | ✅ (glaze) |
| googleapis | ❌ | ✅ (sheets/calendar/drive) |
| @vercel/blob, jszip, papaparse | ❌ | ✅ (uploads/CSV) |
| @vercel/analytics | optional | ✅ |
| tailwindcss, eslint* (dev) | ✅ | ✅ |

Caleb Jr sheds googleapis, blob, jszip, papaparse — meaningfully smaller.

---

## Environment variables

### `enactus-agent` keeps (and we **remove** the portal ones)
```
KEEP:   ANTHROPIC_API_KEY, MONGODB_URI, NEXT_PUBLIC_APP_URL, CRON_SECRET,
        CALEB_JR_BOT_TOKEN, CALEB_JR_USER_TOKEN, CALEB_JR_SIGNING_SECRET,
        CURSOR_API_KEY, CURSOR_MODEL, GITHUB_WEBHOOK_SECRET
REMOVE: SLACK_BOT_TOKEN, GOOGLE_* (all), CURSOR_REPO, CURSOR_BASE_REF (legacy)
```

### `enactus-bot` (new project) gets
```
SLACK_BOT_TOKEN
GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SPREADSHEET_ID,
GOOGLE_CALENDAR_ID, GOOGLE_DRIVE_FOLDER_ID
GOOGLE_HOURS_SPREADSHEET_ID   (new — for the reminders feature)
ANTHROPIC_API_KEY
MONGODB_URI                   (same value — shared cluster)
NEXT_PUBLIC_APP_URL           (new — the enactus-bot.vercel.app URL)
CRON_SECRET                   (its own)
```

---

## External reconfiguration

| What | Where | Who |
|---|---|---|
| Create `caleb05w/enactus-bot` repo | GitHub | **me** (`gh repo create`) |
| New Vercel project + env vars | Vercel | **me** if `vercel` CLI is authed, else exact list for you to paste |
| Grant Cursor GitHub access to `enactus-bot` | Cursor app install | **you** (one click) |
| Add `enactus-bot` to Cursor registry; denylist `enactus-agent` | code | **me** |
| Portal bot slash-command URLs (`/help`, `/ping`, finance submit) → new URL | Slack app (the SLACK_BOT_TOKEN app) | **you** (or me if Slack config token available) |
| Caleb Jr wiring (interactivity, `/rescan`, `/regurgitate`, webhooks) | — | **unchanged** ✅ |

---

## Execution order (zero-downtime)

1. **Stand up `enactus-bot`** — create repo, copy the portal files + shared infra, prune `package.json`, add the PR #4 hours feature (token fix → `SLACK_BOT_TOKEN`; cron wired in `vercel.json`).
2. **New Vercel project** — set env vars, deploy, get the URL, set `NEXT_PUBLIC_APP_URL` to it.
3. **Verify the portal on the new URL** — finance form submits, events load, profiles, submission form, `/help` links resolve.
4. **Repoint the portal bot** — update its Slack slash-command request URLs to the new deploy.
5. **Cursor** — you grant access to `enactus-bot`; I add it to the registry and denylist `enactus-agent`.
6. **Gut `enactus-agent`** — delete the portal files, prune its deps, remove the portal env vars, keep only the agent cron in `vercel.json`.
7. **Verify Caleb Jr** — a request → 👀 → card in your DM → approve → Cursor PR (now targeting `enactus-bot`) → merge → requester notified. Webhooks unchanged, so this should "just work."
8. **Land the reminders** — the PR #4 feature now lives/merges in `enactus-bot`, not here. Close PR #4 on `enactus-agent`.

---

## Verification checklist
- [ ] Portal: every page + API route works on the new URL
- [ ] Reminders fire to **#marketing-execs only**, using `SLACK_BOT_TOKEN`, on Fridays
- [ ] Caleb Jr full loop works against the slimmed repo
- [ ] Cursor routes "enactus-web bot" requests to **enactus-bot**, never `enactus-agent`
- [ ] `enactus-agent` deploy no longer references any `GOOGLE_*` / `SLACK_BOT_TOKEN`
- [ ] No secret leakage: `enactus-bot` env has no Cursor key / user token / signing secrets

## Rollback
Both deploys are independent; if the portal misbehaves on the new project, the old
combined deploy stays live until step 6. Don't delete portal code from
`enactus-agent` until the new project is verified (step 3).
```
