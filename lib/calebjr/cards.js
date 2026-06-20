// Block Kit builders for the interactive proposal cards. Gate 1 (approve) is a
// button, so it acts in real time — no /rescan needed to process it.

// An actionable proposal: summary + context + a repo picker + Approve/Skip.
export function proposalBlocks(a, repos) {
  const repoSelect = {
    type: 'static_select',
    action_id: 'repo_select',
    placeholder: { type: 'plain_text', text: 'Target repo' },
    options: repos.map((r) => ({ text: { type: 'plain_text', text: r.key }, value: r.key })),
  }
  const selected = repos.find((r) => r.key === a.repoName)
  if (selected) {
    repoSelect.initial_option = { text: { type: 'plain_text', text: selected.key }, value: selected.key }
  }

  const ctx = [a.sourceName, a.actionType, `confidence ${a.confidence}`].filter(Boolean).join(' · ')
  const linkPart = a.messageLink ? ` · <${a.messageLink}|view request>` : ''

  return [
    { type: 'section', text: { type: 'mrkdwn', text: `:robot_face: *Proposed change*\n> ${a.summary}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: ctx + linkPart }] },
    {
      type: 'actions',
      block_id: 'card',
      elements: [
        repoSelect,
        { type: 'button', action_id: 'approve', text: { type: 'plain_text', text: 'Approve' }, style: 'primary', value: String(a._id) },
        { type: 'button', action_id: 'skip', text: { type: 'plain_text', text: 'Skip' }, style: 'danger', value: String(a._id) },
      ],
    },
  ]
}

// A plain status line — used to replace a card once it's approved/dismissed.
export function statusBlocks(text) {
  return [{ type: 'section', text: { type: 'mrkdwn', text } }]
}
