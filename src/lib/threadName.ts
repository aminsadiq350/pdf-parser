const MAX_LEN = 50

/**
 * Derive a short, human-readable thread title from a user message.
 * Returns '' when the input has no usable text.
 *
 * Rules:
 *  - Collapse all whitespace runs to a single space.
 *  - Take everything up to the first sentence-ending punctuation
 *    (`.`/`?`/`!`). Strip the punctuation itself.
 *  - If the resulting candidate is > MAX_LEN, hard-cut at the nearest
 *    word boundary <= MAX_LEN and append an ellipsis. (If no whitespace
 *    exists within the cap, cut exactly at MAX_LEN.)
 *  - If the candidate is <= MAX_LEN it's returned as-is, no ellipsis.
 */
export function suggestThreadName(text: string): string {
  if (!text) return ''
  const normalised = text.replace(/\s+/g, ' ').trim()
  if (!normalised) return ''

  // First sentence boundary.
  const match = normalised.match(/^([^.!?]+)[.!?]/)
  const candidate = match ? match[1].trim() : normalised

  if (candidate.length <= MAX_LEN) return candidate

  // Hard cut at a word boundary <= MAX_LEN.
  const slice = candidate.slice(0, MAX_LEN)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice
  return `${cut}…`
}
