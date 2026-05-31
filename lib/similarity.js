function normalize(s) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

// Iterative Levenshtein with two-row rolling array
function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array(n + 1)

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1])
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[n]
}

function levenshteinSim(a, b) {
  if (a === b) return 1
  const dist = levenshtein(a, b)
  return 1 - dist / Math.max(a.length, b.length)
}

// Sort tokens alphabetically before comparing — catches word-order variations
function tokenSortSim(a, b) {
  const sort = (s) => s.split(' ').sort().join(' ')
  return levenshteinSim(sort(a), sort(b))
}

// Combined score: best of character-level and token-order comparisons
export function similarity(a, b) {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  return Math.max(levenshteinSim(na, nb), tokenSortSim(na, nb))
}

// Returns events above threshold, sorted by score descending.
// Score of 1.0 means normalized-exact match (different casing/spacing only).
export function findSimilar(query, events, threshold = 0.80) {
  const q = normalize(query)
  return events
    .map((name) => ({ name, score: similarity(q, name) }))
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score)
}
