import type { Document, Thread } from '@/types/domain'

/**
 * Group E: filter a thread list by a free-text query that matches either
 * the thread's name OR the name of any document currently attached.
 *
 * - Empty / whitespace query returns the original list unchanged.
 * - Matching is case-insensitive substring (no fuzzy yet).
 */
export function filterThreads(
  threads: readonly Thread[],
  query: string,
  docs: readonly Document[],
): Thread[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...threads]
  const docNameById = new Map<number, string>()
  for (const d of docs) {
    if (d.id != null) docNameById.set(d.id, d.name.toLowerCase())
  }
  return threads.filter((t) => {
    if (t.name && t.name.toLowerCase().includes(q)) return true
    for (const id of t.docIds) {
      const n = docNameById.get(id)
      if (n && n.includes(q)) return true
    }
    return false
  })
}
