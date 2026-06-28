import { describe, it, expect } from 'vitest'
import { searchPages } from '@/lib/pdfSearch'
import type { PageText } from '@/types/domain'

const pages: PageText[] = [
	{ pageNumber: 1, text: 'The quick brown fox jumps over the lazy dog.' },
	{ pageNumber: 2, text: 'A second page mentions FOX twice; the fox here.' },
	{ pageNumber: 3, text: 'No match on this page.' },
]

describe('searchPages', () => {
	it('returns empty for empty query', () => {
		expect(searchPages('', pages)).toEqual([])
		expect(searchPages('   ', pages)).toEqual([])
	})

	it('finds case-insensitive substring matches across pages', () => {
		const m = searchPages('fox', pages)
		expect(m.map((x) => x.pageNumber)).toEqual([1, 2, 2])
	})

	it('returns multiple matches on the same page in document order', () => {
		const m = searchPages('fox', [pages[1]])
		expect(m).toHaveLength(2)
		expect(m[0].pageNumber).toBe(2)
	})

	it('produces snippets with ellipsis when context is truncated', () => {
		const m = searchPages('fox', pages)
		const first = m[0]
		expect(first.snippet.toLowerCase()).toContain('fox')
		expect(first.snippet.length).toBeLessThan(120)
	})

	it('matchOffset + matchLength point at the matched substring inside snippet', () => {
		const m = searchPages('fox', pages)
		const first = m[0]
		const slice = first.snippet.slice(first.matchOffset, first.matchOffset + first.matchLength)
		expect(slice.toLowerCase()).toBe('fox')
	})

	it('returns empty when no match', () => {
		expect(searchPages('xyzzy', pages)).toEqual([])
	})
})
