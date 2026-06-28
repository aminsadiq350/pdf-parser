import { describe, it, expect, beforeEach } from 'vitest'
import { db, initStore } from '@/lib/db'

async function resetDb() {
  await db.close()
  await db.delete()
  await initStore()
}

describe('db', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('inserts and reads documents with auto-increment id', async () => {
    const id = await db.documents.add({
      name: 'a.pdf',
      size: 1024,
      numPages: 2,
      pages: [],
      addedAt: Date.now(),
    })
    expect(id).toBe(1)
    const row = await db.documents.get(id)
    expect(row?.name).toBe('a.pdf')
  })

  it('stores blobs separately from documents', async () => {
    const docId = await db.documents.add({
      name: 'b.pdf',
      size: 1,
      numPages: 1,
      pages: [],
      addedAt: Date.now(),
    })
    await db.documentBlobs.put({
      docId,
      blob: new Blob(['hi'], { type: 'application/pdf' }),
    })
    const blob = await db.documentBlobs.get(docId)
    expect(blob?.blob.size).toBe(2)
  })

  it('threads support multiEntry docIds index for reverse lookup', async () => {
    const t1 = await db.threads.add({
      name: 'A',
      docIds: [10, 20],
      createdAt: 1,
      updatedAt: 1,
    })
    const t2 = await db.threads.add({
      name: 'B',
      docIds: [20],
      createdAt: 2,
      updatedAt: 2,
    })
    const containing20 = await db.threads.where('docIds').equals(20).primaryKeys()
    expect(containing20.sort()).toEqual([t1, t2].sort())
    const containing10 = await db.threads.where('docIds').equals(10).primaryKeys()
    expect(containing10).toEqual([t1])
  })

  it('messages can be fetched ordered by createdAt within a thread', async () => {
    const threadId = await db.threads.add({
      name: 'T',
      docIds: [],
      createdAt: 0,
      updatedAt: 0,
    })
    await db.messages.add({ threadId, role: 'user', text: 'hi', createdAt: 1 })
    await db.messages.add({ threadId, role: 'assistant', text: 'hello', createdAt: 2 })
    await db.messages.add({ threadId, role: 'user', text: 'thanks', createdAt: 3 })
    const all = await db.messages
      .where('[threadId+createdAt]')
      .between([threadId, 0], [threadId, Infinity])
      .toArray()
    expect(all.map((m) => m.text)).toEqual(['hi', 'hello', 'thanks'])
  })
})
