import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { useThreads } from '@/composables/useThreads'

async function resetAll() {
  // Wipe in-memory state by force-replacing module refs is fragile; easier:
  // wipe Dexie tables and reload.
  await db.threads.clear()
  await db.messages.clear()
  const t = useThreads()
  await t.loadAll()
  t.activeThreadId.value = null
  t.activeMessages.value = []
}

describe('useThreads.cleanupIfEmpty', () => {
  beforeEach(async () => {
    await resetAll()
  })

  it('deletes a nameless thread that has no messages', async () => {
    const t = useThreads()
    const created = await t.create({ docIds: [] })
    await t.cleanupIfEmpty(created.id!)
    expect(t.threads.value.find((x) => x.id === created.id)).toBeUndefined()
    const persisted = await db.threads.get(created.id!)
    expect(persisted).toBeUndefined()
  })

  it('preserves a named empty thread', async () => {
    const t = useThreads()
    const named = await t.create({ docIds: [], name: 'Saved for later' })
    await t.cleanupIfEmpty(named.id!)
    expect(t.threads.value.find((x) => x.id === named.id)).toBeTruthy()
  })

  it('preserves a thread that has at least one message', async () => {
    const t = useThreads()
    const created = await t.create({ docIds: [] })
    await t.appendMessage({ threadId: created.id!, role: 'user', text: 'hi' })
    await t.cleanupIfEmpty(created.id!)
    expect(t.threads.value.find((x) => x.id === created.id)).toBeTruthy()
  })

  it('is a no-op for a non-existent thread', async () => {
    const t = useThreads()
    await expect(t.cleanupIfEmpty(999_999)).resolves.toBeUndefined()
  })
})

describe('useThreads.select', () => {
  beforeEach(async () => {
    await resetAll()
  })

  it('cleans up the previous active thread when switching away if empty', async () => {
    const t = useThreads()
    const a = await t.create({ docIds: [] })
    const b = await t.create({ docIds: [] })
    await t.select(a.id!)
    // Switching to b should sweep a (no name, no messages).
    await t.select(b.id!)
    expect(t.threads.value.find((x) => x.id === a.id)).toBeUndefined()
    expect(t.activeThreadId.value).toBe(b.id)
  })

  it('does not clean up a previous thread that has messages', async () => {
    const t = useThreads()
    const a = await t.create({ docIds: [] })
    await t.appendMessage({ threadId: a.id!, role: 'user', text: 'hi' })
    const b = await t.create({ docIds: [] })
    await t.select(a.id!)
    await t.select(b.id!)
    expect(t.threads.value.find((x) => x.id === a.id)).toBeTruthy()
  })

  it('does not clean up a previous thread that has a name', async () => {
    const t = useThreads()
    const a = await t.create({ docIds: [], name: 'Renamed' })
    const b = await t.create({ docIds: [] })
    await t.select(a.id!)
    await t.select(b.id!)
    expect(t.threads.value.find((x) => x.id === a.id)).toBeTruthy()
  })
})

describe('useThreads.deleteThread', () => {
  beforeEach(async () => {
    await resetAll()
  })

  it('removes a thread plus all its messages', async () => {
    const t = useThreads()
    const a = await t.create({ docIds: [] })
    await t.appendMessage({ threadId: a.id!, role: 'user', text: 'hi' })
    await t.appendMessage({ threadId: a.id!, role: 'assistant', text: 'hello' })
    await t.deleteThread(a.id!)
    expect(t.threads.value.find((x) => x.id === a.id)).toBeUndefined()
    const msgs = await db.messages.where('threadId').equals(a.id!).count()
    expect(msgs).toBe(0)
  })

  it('clears active state when deleting the active thread', async () => {
    const t = useThreads()
    const a = await t.create({ docIds: [] })
    await t.select(a.id!)
    await t.deleteThread(a.id!)
    expect(t.activeThreadId.value).toBeNull()
    expect(t.activeMessages.value).toEqual([])
  })
})
