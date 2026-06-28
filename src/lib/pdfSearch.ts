import type { PageText } from '@/types/domain'

export interface SearchMatch {
	pageNumber: number
	/** Substring of original page text around the match. */
	snippet: string
	/** Offset of the match within `snippet`. */
	matchOffset: number
	matchLength: number
}

const SNIPPET_RADIUS = 40

export function searchPages(
	query: string,
	pages: readonly PageText[],
): SearchMatch[] {
	const q = query.trim()
	if (!q) return []
	const needle = q.toLowerCase()
	const out: SearchMatch[] = []
	for (const p of pages) {
		const haystack = p.text.toLowerCase()
		let from = 0
		for (; ;) {
			const idx = haystack.indexOf(needle, from)
			if (idx === -1) break
			const start = Math.max(0, idx - SNIPPET_RADIUS)
			const end = Math.min(p.text.length, idx + needle.length + SNIPPET_RADIUS)
			const leading = start > 0 ? '…' : ''
			const trailing = end < p.text.length ? '…' : ''
			const snippet = leading + p.text.slice(start, end) + trailing
			out.push({
				pageNumber: p.pageNumber,
				snippet,
				matchOffset: idx - start + leading.length,
				matchLength: needle.length,
			})
			from = idx + needle.length
		}
	}
	return out
}
