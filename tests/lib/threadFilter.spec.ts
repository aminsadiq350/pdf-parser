import { describe, it, expect } from 'vitest'
import { filterThreads } from '@/lib/threadFilter'
import type { Document, Thread } from '@/types/domain'

const docs: Document[] = [
	{ id: 1, name: 'Quantum theory.pdf', size: 1, numPages: 1, addedAt: 1, pages: [] },
	{ id: 2, name: 'Pasta recipes.pdf', size: 1, numPages: 1, addedAt: 2, pages: [] },
]

const threads: Thread[] = [
	{ id: 1, name: 'Newton inertia', docIds: [1], createdAt: 1, updatedAt: 1 },
	{ id: 2, name: '', docIds: [2], createdAt: 2, updatedAt: 2 },
	{ id: 3, name: 'Random thoughts', docIds: [], createdAt: 3, updatedAt: 3 },
]

describe('filterThreads', () => {
	it('returns all threads for an empty query', () => {
		expect(filterThreads(threads, '', docs)).toHaveLength(3)
		expect(filterThreads(threads, '   ', docs)).toHaveLength(3)
	})

	it('matches thread name (case-insensitive)', () => {
		const result = filterThreads(threads, 'NEWTON', docs)
		expect(result.map((t) => t.id)).toEqual([1])
	})

	it('matches via attached doc name', () => {
		// Thread 2 has no name but its attached doc is "Pasta recipes.pdf".
		const result = filterThreads(threads, 'pasta', docs)
		expect(result.map((t) => t.id)).toEqual([2])
	})

	it('returns empty when nothing matches', () => {
		expect(filterThreads(threads, 'zzz', docs)).toEqual([])
	})

	it('matches partial substrings within names', () => {
		expect(filterThreads(threads, 'thoughts', docs).map((t) => t.id)).toEqual([3])
	})
})
