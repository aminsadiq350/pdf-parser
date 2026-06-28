import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, initStore } from '@/lib/db'
import { useThreads } from '@/composables/useThreads'

async function resetAll() {
	await db.close()
	await db.delete()
	await initStore()
	const t = useThreads()
	t.threads.value = []
	t.activeThreadId.value = null
	t.activeMessages.value = []
	t.threadStats.value = {}
}

describe('useThreads.threadStats', () => {
	beforeEach(async () => {
		await resetAll()
	})

	it('starts at count 0 / empty snippet for a fresh thread', async () => {
		const t = useThreads()
		const thread = await t.create({ docIds: [] })
		await t.loadAll()
		const s = t.threadStats.value[thread.id!]
		expect(s).toEqual({ count: 0, lastSnippet: '' })
	})

	it('bumps count and snippet on each appendMessage', async () => {
		const t = useThreads()
		const thread = await t.create({ docIds: [] })
		await t.appendMessage({ threadId: thread.id!, role: 'user', text: 'first message' })
		expect(t.threadStats.value[thread.id!]).toEqual({
			count: 1,
			lastSnippet: 'first message',
		})
		await t.appendMessage({
			threadId: thread.id!,
			role: 'assistant',
			text: '**bold** answer',
		})
		expect(t.threadStats.value[thread.id!]).toEqual({
			count: 2,
			lastSnippet: 'bold answer',
		})
	})

	it('resets stats when clearMessages is called', async () => {
		const t = useThreads()
		const thread = await t.create({ docIds: [] })
		await t.appendMessage({ threadId: thread.id!, role: 'user', text: 'hi' })
		await t.clearMessages(thread.id!)
		expect(t.threadStats.value[thread.id!]).toEqual({ count: 0, lastSnippet: '' })
	})

	it('drops stats when a thread is deleted', async () => {
		const t = useThreads()
		const thread = await t.create({ docIds: [] })
		await t.appendMessage({ threadId: thread.id!, role: 'user', text: 'hi' })
		await t.deleteThread(thread.id!)
		expect(t.threadStats.value[thread.id!]).toBeUndefined()
	})

	it('updateMessage refreshes the snippet when patching the latest message', async () => {
		const t = useThreads()
		const thread = await t.create({ docIds: [] })
		await t.appendMessage({ threadId: thread.id!, role: 'user', text: 'who?' })
		const assistant = await t.appendMessage({
			threadId: thread.id!,
			role: 'assistant',
			text: 'partial',
		})
		await t.updateMessage(assistant.id!, { text: 'finalized reply' })
		expect(t.threadStats.value[thread.id!].lastSnippet).toBe('finalized reply')
	})

	it('loadAll seeds stats from messages already in the DB', async () => {
		const t = useThreads()
		const thread = await t.create({ docIds: [] })
		// Insert two messages directly (bypassing appendMessage's stat bump).
		await db.messages.add({
			threadId: thread.id!,
			role: 'user',
			text: 'one',
			createdAt: 1,
		})
		await db.messages.add({
			threadId: thread.id!,
			role: 'assistant',
			text: 'two',
			createdAt: 2,
		})
		// Force-clear the in-memory map.
		t.threadStats.value = {}
		await t.loadAll()
		expect(t.threadStats.value[thread.id!]).toEqual({ count: 2, lastSnippet: 'two' })
	})
})
