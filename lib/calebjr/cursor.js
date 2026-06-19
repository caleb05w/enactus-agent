// Handoff to the Cursor cloud agent (Plane 2). In shadow mode this is never
// called — the orchestrator only logs what it *would* dispatch. Once live,
// this POSTs the task to the Cursor Background Agent API, which checks out the
// repo, branches, makes the change, verifies it, and opens a PR per
// .cursor/rules. Left as a stub until CURSOR_API_KEY is wired.
export async function handoff(task) {
  if (!process.env.CURSOR_API_KEY) {
    return { dispatched: false, reason: 'CURSOR_API_KEY not set (stub)' }
  }

  // TODO: POST https://api.cursor.com/... with { repo, prompt: task.summary,
  // baseBranch: 'main' }. The agent's behaviour/guardrails live in .cursor/rules.
  return { dispatched: false, reason: 'cursor handoff not implemented yet' }
}
