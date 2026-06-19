// Plane 2 — hand a single approved task to a Cursor cloud agent that branches,
// implements, verifies, opens a PR, and babysits review until it's merge-ready.
// The agent does NOT merge; the owner squash-merges after the report-back.

const API = 'https://api.cursor.com/v0'
const KEY = () => process.env.CURSOR_API_KEY
const REPO = process.env.CURSOR_REPO || 'https://github.com/caleb05w/enactus-agent'
const BASE_REF = process.env.CURSOR_BASE_REF || 'main'
// composer-2.5 is Cursor's own model — the cheap option. These are small
// frontend fixes, so a frontier model isn't worth the cost. Override via
// CURSOR_MODEL if you ever want a Claude/GPT model for a harder task.
const MODEL = process.env.CURSOR_MODEL || 'composer-2.5'

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
// invoke Claude Code skills directly. The repo's .cursor/rules mirror this.
function buildPrompt(task) {
  const link = task.messageLink ? `\nOriginal request: ${task.messageLink}` : ''
  return `You are Caleb Jr's coding agent. Implement ONE scoped change and take it to a merge-ready PR. Do not merge — the owner squash-merges after review.

This is a frontend-only Next.js app (no backend). The bar for "done" is simple: the change must (a) build cleanly so it can't crash production, and (b) match the existing zinc/Tailwind styling. Keep the change small.

TASK: ${task.summary}${link}

Work in this order:

1. ACTION
   - You start from branch '${BASE_REF}'. Create a new branch named yourself (convention: agent/<short-slug>).
   - Make the smallest change that satisfies the task. Do not refactor unrelated code or expand scope.
   - Match the codebase: no semicolons, single quotes, 2-space indent, and the zinc Tailwind palette only (red is reserved for errors). Reuse existing components and helpers; do not invent new colors or styles.
   - HARD SCOPE LIMITS (CI enforces these — a PR that breaks them cannot be merged):
     • Edit ONLY frontend files under app/ (NOT app/api/). Allowed elsewhere: app/globals.css.
     • Do NOT touch: app/api/**, lib/**, .env*, package.json, pnpm-lock.yaml, vercel.json, next.config.*, .github/**, scripts/**, public/ET-data/**, or anything backend/secrets/CI.
     • Do NOT add, remove, or change dependencies.
     • At most ~8 files and ~200 changed lines total.
   - If the fix can't be done within these limits, STOP and explain what it needs — do not open a large PR.
   - Do not fix pre-existing lint warnings or unrelated code; only your change.

2. VERIFY (ui-nit-fix steps 2-3)
   - Fix using the existing design system: zinc palette only (red is reserved for errors). If a token doesn't exist, use the standard Tailwind scale; never introduce new colors.
   - 'pnpm build' MUST pass — this is the hard gate that keeps prod from crashing. Do not open the PR if it fails. (Run 'pnpm lint' too, but only make sure you didn't ADD new errors — ignore pre-existing ones.)
   - Then confirm it renders and matches the surrounding styling: run the dev server and look at the affected page (a screenshot in the PR is great if feasible, but build + a visual check is the floor). If you can't load the page, say so in the PR rather than claiming it's verified.

3. PR + REVIEW LOOP (/pr skill — guardrail-aware)
   - Open a pull request into '${BASE_REF}'. PR body: the task, the original request link, and what you verified.
   - This repo runs two required CI checks on your PR. Watch both and make them green:
     • "build" — 'pnpm build' must pass. If it's red, read the error, fix it, push.
     • "scope" — fails if the PR touches a forbidden path, changes >8 files, or >200 lines. If it's red, you went out of bounds: trim the PR back inside the limits (revert the out-of-scope or oversized edits). NEVER edit .github/ or the workflow to make a check pass. If the task genuinely can't fit the limits, close the PR with a comment explaining what it needs.
   - Self-review (no external review bots — review is internal). Re-read your own diff and confirm: it does ONLY what the task asked, matches the zinc styling, and stays within the scope limits. Fix anything off and push.
   - The PR is ready when both CI checks are green and your self-review is clean. If anyone does leave a review comment, address it. Cap at 3 fix rounds; if still blocked, summarize what's outstanding in the PR and stop.
   - Do NOT merge. Leave the PR ready for the owner to squash & merge.

Stay strictly in scope. One task = one focused PR.`
}

// Launch a background agent for one approved task.
export async function handoff(task) {
  if (!KEY()) return { dispatched: false, reason: 'CURSOR_API_KEY not set' }
  const body = {
    prompt: { text: buildPrompt(task) },
    source: { repository: REPO, ref: BASE_REF },
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
