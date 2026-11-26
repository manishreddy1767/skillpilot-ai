/**
 * Spelling tolerance for commands, like a search engine's "did you mean". Each word that is close to a
 * word SkillPilot knows, but not one itself, is replaced by it: "opn naukari" becomes "open naukri".
 */

/** Edits needed to turn one word into another, counting a swap of two letters as one. Stops above `limit`. */
export function editDistance(a: string, b: string, limit = 3): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) rows[0]![j] = j
  for (let i = 1; i <= a.length; i++) {
    let best = Number.POSITIVE_INFINITY
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2]![j - 2]! + 1)
      rows[i]![j] = value
      best = Math.min(best, value)
    }
    if (best > limit) return limit + 1
  }
  return rows[a.length]![b.length]!
}

/** How many mistakes a word of this length may have and still be recognised. */
export const allowedMistakes = (length: number): number => (length < 4 ? 0 : length < 7 ? 1 : 2)

/** Words that are fine as they are, so they are never "corrected" into something else. */
const LEAVE_ALONE = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'in', 'on', 'at', 'to', 'of', 'me', 'my', 'it', 'is', 'up', 'by', 'from',
  'with', 'using', 'near', 'about', 'what', 'when', 'where', 'which', 'how', 'who', 'why', 'this', 'that', 'some',
  'please', 'can', 'you', 'could', 'would', 'want', 'need', 'show', 'tell', 'give', 'find', 'look', 'make',
  'job', 'jobs', 'task', 'tasks', 'today', 'tomorrow', 'week', 'next', 'days', 'day', 'time', 'date', 'done',
  'new', 'role', 'roles', 'remote', 'fresher', 'freshers', 'junior', 'senior', 'developer', 'engineer', 'analyst',
  'list', 'read', 'learn', 'learning', 'practice', 'practise', 'study', 'guide', 'notes', 'note', 'book', 'books',
  'pune', 'mumbai', 'delhi', 'chennai', 'hyderabad', 'bengaluru', 'bangalore', 'kolkata', 'noida', 'gurgaon', 'gurugram'
])

/** The one known word a typed word most likely meant, or null when it is unclear or already right. */
export function closestWord(word: string, known: Set<string>): string | null {
  const lower = word.toLowerCase()
  if (known.has(lower) || LEAVE_ALONE.has(lower) || /\d/.test(lower)) return null
  const limit = allowedMistakes(lower.length)
  if (limit === 0) return null
  let best: string | null = null
  let bestDistance = limit + 1
  let tied = false
  for (const candidate of known) {
    if (candidate.includes(' ') || Math.abs(candidate.length - lower.length) > limit) continue
    const distance = editDistance(lower, candidate, limit)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
      tied = false
    } else if (distance === bestDistance) {
      tied = true
    }
  }
  // When two words are equally close, guessing could do the wrong thing, so nothing changes.
  return best && !tied ? best : null
}

/** A message with each misspelled word replaced by the known word it most likely meant. */
export function correctSpelling(text: string, known: Set<string>): { text: string; changed: boolean } {
  let changed = false
  const fixed = text.replace(/[A-Za-z][A-Za-z'.+#-]*/g, (word) => {
    const better = closestWord(word, known)
    if (!better) return word
    changed = true
    return better
  })
  return { text: fixed, changed }
}

/** The words of every name in a list, lower case, for spelling correction. */
export function wordsOf(names: Iterable<string>): Set<string> {
  const words = new Set<string>()
  for (const name of names) {
    for (const word of name.toLowerCase().split(/[^a-z0-9+#.]+/)) if (word.length >= 3 && /[a-z]/.test(word)) words.add(word)
  }
  return words
}
