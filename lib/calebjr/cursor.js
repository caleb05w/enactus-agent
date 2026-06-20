// Plane 2 — hand a single approved task to a Cursor cloud agent that branches,
// implements, verifies, opens a PR, and babysits review until it's merge-ready.
// The agent does NOT merge; the owner squash-merges after the report-back.

const API = 'https://api.cursor.com/v0'
const KEY = () => process.env.CURSOR_API_KEY
// The Enactus marketing website — the site the requests are about.
const REPO = process.env.CURSOR_REPO || 'https://github.com/marketing-enactussfu/marketing-2025-2026'
const BASE_REF = process.env.CURSOR_BASE_REF || 'main'
// composer-2.5 is Cursor's own model — the cheap option. These are small
// frontend fixes, so a frontier model isn't worth the cost. Override via
// CURSOR_MODEL if you ever want a Claude/GPT model for a harder task.
const MODEL = process.env.CURSOR_MODEL || 'composer-2.5'

// Repo registry — Haiku routes each request to one of these by name. Add an
// entry per repo the agent should target (each needs Cursor's GitHub app
// installed on its org). Descriptions drive routing quality, so be specific.
export const REPOS = {
  'marketing-2025-2026': {
    name: 'marketing-2025-2026',
    url: 'https://github.com/marketing-enactussfu/marketing-2025-2026',
    ref: 'main',
    description: 'The public Enactus marketing website — pages, sections, and components (Next.js). Anything about the enactus.ca site, its pages, copy, buttons, or layout.',
  },
}

export function repoOptions() {
  return Object.values(REPOS).map((r) => ({ key: r.name, description: r.description }))
}

export function resolveRepo(name) {
  return REPOS[name] || null
}

async function cursor(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`cursor ${method} ${path}: ${data.error || res.status}`)
  return data
}

// The full task brief — bakes in the owner's Phase 2/3 workflow plus the
// /ui-nit-fix (steps 2-3) and /pr skill steps, since a Cursor agent can't
// invoke Claude Code skills directly.
function buildPrompt(task, ref) {
  const link = task.messageLink ? `\nOriginal request: ${task.messageLink}` : ''
  return `You are Caleb Jr's coding agent working on the Enactus marketing website (a Next.js app). Implement ONE scoped change and take it to a merge-ready PR. Do not merge — the owner squash-merges after review.

The bar for "done": the change must (a) build cleanly so it can't break the site, and (b) match the site's existing look and code style. Keep the change small.

TASK: ${task.summary}${link}

Work in this order:

1. ACTION
   - You start from branch '${ref}'. Create a new branch named yourself (convention: agent/<short-slug>).
   - Make the smallest change that satisfies the task. Do not refactor unrelated code or expand scope.
   - Match THIS repository's existing conventions — code style, component patterns, and design system. Reuse existing components, classes, and tokens. Do NOT introduce new colors, fonts, libraries, or dependencies.
   - HARD SCOPE LIMITS:
     • Edit only frontend files under app/ and public/.
     • Do NOT touch: config files (next.config.*, tailwind.config.*, eslint.config.*, postcss.config.*), package.json or any lockfile, .github/**, or anything with secrets.
     • Do NOT add, remove, or change dependencies.
     • At most ~8 files and ~200 changed lines total.
   - If the fix can't be done within these limits, STOP and explain what it needs — do not open a large PR.
   - Do not fix pre-existing lint warnings or unrelated code; only your change.

2. VERIFY (ui-nit-fix steps 2-3)
   - Use the site's existing design system — reuse its components, classes, and tokens. Never introduce new colors or styles.
   - Install dependencies and run the production build ('next build'). It MUST pass — that's the gate that keeps the site from breaking. Do not open the PR if the build fails.
   - Then confirm it renders and matches the surrounding design: run the dev server and look at the affected page (a screenshot in the PR is great if feasible, but build + a visual check is the floor). If you can't load the page, say so in the PR rather than claiming it's verified.

3. PR + SELF-REVIEW (/pr skill — review is internal, no external review bots)
   - Open a pull request into '${ref}'. PR body: the task, the original request link, and what you verified.
   - Re-read your own diff and confirm: it does ONLY what the task asked, matches the site's styling, and stays within the scope limits. Fix anything off and push.
   - If the repo has CI checks, make them green (never edit .github/ to pass one). If anyone leaves a review comment, address it. Cap at 3 fix rounds; if still blocked, summarize what's outstanding in the PR and stop.
   - Do NOT merge. Leave the PR ready for the owner to squash & merge.

Stay strictly in scope. One task = one focused PR.`
}

// Launch a background agent for one approved task.
export async function handoff(task) {
  if (!KEY()) return { dispatched: false, reason: 'CURSOR_API_KEY not set' }
  const repo = task.repoUrl || REPO
  const ref = task.repoRef || BASE_REF
  const body = {
    prompt: { text: buildPrompt(task, ref) },
    source: { repository: repo, ref },
    target: { autoCreatePr: true },
  }
  if (MODEL) body.model = MODEL
  try {
    const agent = await cursor('POST', '/agents', body)
    return {
      dispatched: true,
      agentId: agent.id,
      cursorUrl: agent.target?.url,
      branch: agent.target?.branchName,
    }
  } catch (e) {
    return { dispatched: false, reason: e.message }
  }
}

export async function getAgent(id) {
  return cursor('GET', `/agents/${id}`)
}

// Map Cursor status → our coarse lifecycle.
export function agentOutcome(agent) {
  const s = (agent?.status || '').toUpperCase()
  if (s === 'FINISHED' || s === 'COMPLETED') return 'done'
  if (s === 'ERROR' || s === 'FAILED' || s === 'EXPIRED' || s === 'CANCELLED') return 'failed'
  return 'running'
}

// Best-effort PR link from the status payload; falls back to the Cursor page.
export function prLinkOf(agent, fallback) {
  return agent?.target?.prUrl || agent?.prUrl || agent?.pullRequest?.url || fallback || agent?.target?.url || ''
}
