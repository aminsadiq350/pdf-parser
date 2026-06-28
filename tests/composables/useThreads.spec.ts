import { describe, it, expect, beforeEach } from 'vitest'
import { db, initStore } from '@/lib/db'
import { useThreads } from '@/composables/useThreads'

async function resetDb() {
  await db.close()
  await db.delete()
  await initStore()
}

describe('useThreads', () => {
  beforeEach(async () => {
    await resetDb()
    const t = useThreads()
    t.threads.value = []
    t.activeThreadId.value = null
    t.activeMessages.value = []
    await t.loadAll()
  })

  it('create persists a thread and updates threads ref', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [1, 2], name: 'demo' })
    expect(thread.id).toBe(1)
    expect(thread.docIds).toEqual([1, 2])
    expect(t.threads.value).toHaveLength(1)
  })

  it('ensureDefaultThreadForDoc creates a thread on first call, reuses on subsequent', async () => {
    const t = useThreads()
    const first = await t.ensureDefaultThreadForDoc(7)
    const second = await t.ensureDefaultThreadForDoc(7)
    expect(first.id).toBe(second.id)
    expect(t.threads.value).toHaveLength(1)
    expect(first.docIds).toEqual([7])
  })

  it('select loads messages of the chosen thread in createdAt order', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [], name: 'msgs' })
    await db.messages.add({ threadId: thread.id!, role: 'user', text: 'a', createdAt: 1 })
    await db.messages.add({ threadId: thread.id!, role: 'assistant', text: 'b', createdAt: 2 })
    await t.select(thread.id!)
    expect(t.activeMessages.value.map((m) => m.text)).toEqual(['a', 'b'])
  })

  it('attachDoc / detachDoc updates the thread', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [1] })
    await t.attachDoc(thread.id!, 2)
    expect(t.threads.value.find((x) => x.id === thread.id)!.docIds).toEqual([1, 2])
    await t.detachDoc(thread.id!, 1)
    expect(t.threads.value.find((x) => x.id === thread.id)!.docIds).toEqual([2])
  })

  it('appendMessage persists + appears in activeMessages when thread is active', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [] })
    await t.select(thread.id!)
    const m = await t.appendMessage({ threadId: thread.id!, role: 'user', text: 'hi' })
    expect(m.id).toBeDefined()
    expect(t.activeMessages.value.map((x) => x.text)).toEqual(['hi'])
    expect(await db.messages.count()).toBe(1)
  })

  it('updateMessage mutates Dexie + activeMessages', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [] })
    await t.select(thread.id!)
    const m = await t.appendMessage({ threadId: thread.id!, role: 'assistant', text: '' })
    await t.updateMessage(m.id!, { text: 'hello' })
    expect(t.activeMessages.value[0].text).toBe('hello')
    expect((await db.messages.get(m.id!))?.text).toBe('hello')
  })

  it('clearMessages deletes all messages for the thread', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [] })
    await t.select(thread.id!)
    await t.appendMessage({ threadId: thread.id!, role: 'user', text: 'a' })
    await t.appendMessage({ threadId: thread.id!, role: 'user', text: 'b' })
    await t.clearMessages(thread.id!)
    expect(t.activeMessages.value).toEqual([])
    expect(await db.messages.count()).toBe(0)
  })

  it('handleDocDeleted removes docId from every thread that had it', async () => {
    const t = useThreads()
    const a = await t.create({ docIds: [1, 2] })
    const b = await t.create({ docIds: [2] })
    const c = await t.create({ docIds: [3] })
    await t.handleDocDeleted(2)
    expect(t.threads.value.find((x) => x.id === a.id)!.docIds).toEqual([1])
    expect(t.threads.value.find((x) => x.id === b.id)!.docIds).toEqual([])
    expect(t.threads.value.find((x) => x.id === c.id)!.docIds).toEqual([3])
  })
})
