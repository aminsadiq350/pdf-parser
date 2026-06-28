import { describe, it, expect } from 'vitest'
import { buildThreadMarkdown, slugify } from '@/lib/exportThread'
import type { Document, Message, Thread } from '@/types/domain'

const thread: Thread = {
	id: 1,
	name: 'Demo chat',
	docIds: [10, 20],
	createdAt: 0,
	updatedAt: 0,
}
const docs: Document[] = [
	{ id: 10, name: 'A.pdf', size: 0, numPages: 1, pages: [], addedAt: 0 },
	{ id: 20, name: 'B.pdf', size: 0, numPages: 1, pages: [], addedAt: 0 },
]
const messages: Message[] = [
	{ id: 1, threadId: 1, role: 'user', text: 'What is on page 1?', createdAt: 1 },
	{
		id: 2,
		threadId: 1,
		role: 'assistant',
		text: 'See [A:p1].',
		citations: [{ docId: 10, pageNumber: 1 }],
		createdAt: 2,
	},
]

describe('buildThreadMarkdown', () => {
	it('includes title + doc list + roles + resolved citation', () => {
		const md = buildThreadMarkdown(thread, messages, docs)
		expect(md).toContain('# Demo chat')
		expect(md).toContain('A.pdf, B.pdf')
		expect(md).toContain('## You')
		expect(md).toContain('What is on page 1?')
		expect(md).toContain('## Notebook')
		expect(md).toContain('[A.pdf · p.1]')
		expect(md).not.toContain('[A:p1]')
	})

	it('falls back to primary doc name when thread.name is empty', () => {
		const md = buildThreadMarkdown({ ...thread, name: '' }, [], docs)
		expect(md.startsWith('# A.pdf')).toBe(true)
	})

	it('shows (none) when no docs attached', () => {
		const md = buildThreadMarkdown({ ...thread, docIds: [], name: 'Foo' }, [], [])
		expect(md).toContain('**Documents:** (none)')
	})
})

describe('slugify', () => {
	it('lowercases and dashes', () => {
		expect(slugify('My Demo Chat #1')).toBe('my-demo-chat-1')
	})
	it('falls back to "thread" for empty input', () => {
		expect(slugify('!!!')).toBe('thread')
	})
})
