import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, initStore } from '@/lib/db'
import { useChat } from '@/composables/useChat'
import { useSettings } from '@/composables/useSettings'
import { useThreads } from '@/composables/useThreads'

async function resetDb() {
  await db.close()
  await db.delete()
  await initStore()
}

function makeSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const x of chunks) c.enqueue(encoder.encode(x))
      c.close()
    },
  })
}

describe('useChat (Dexie-backed)', () => {
  beforeEach(async () => {
    localStorage.clear()
    await resetDb()
    const s = useSettings()
    s.apiKey.value = 'sk-test'
    s.provider.value = 'openrouter'
    s.model.value = 'x/y'
    const t = useThreads()
    t.threads.value = []
    t.activeThreadId.value = null
    t.activeMessages.value = []
    await t.loadAll()
    vi.unstubAllGlobals()
  })

  it('persists user + assistant messages into the active thread', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [] })
    await t.select(thread.id!)

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            makeSseStream([
              'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
              'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
              'data: [DONE]\n\n',
            ]),
            { status: 200 },
          ),
      ),
    )

    const chat = useChat()
    await chat.send('hello')

    const persisted = await db.messages.where('threadId').equals(thread.id!).toArray()
    expect(persisted.map((m) => [m.role, m.text])).toEqual([
      ['user', 'hello'],
      ['assistant', 'Hi there'],
    ])
  })

  it('refuses to send if no active thread', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const chat = useChat()
    await chat.send('hi')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses to send without an api key but still persists the user message', async () => {
    useSettings().apiKey.value = ''
    const t = useThreads()
    const thread = await t.create({ docIds: [] })
    await t.select(thread.id!)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await useChat().send('hi')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await db.messages.count()).toBe(1)
  })

  it('builds PDF context from all attached docs', async () => {
    const t = useThreads()
    const docAId = await db.documents.add({
      name: 'A.pdf',
      size: 1,
      numPages: 1,
      addedAt: 1,
      pages: [{ pageNumber: 1, text: 'alpha alpha alpha' }],
    })
    const docBId = await db.documents.add({
      name: 'B.pdf',
      size: 1,
      numPages: 1,
      addedAt: 2,
      pages: [{ pageNumber: 1, text: 'beta beta beta' }],
    })
    const thread = await t.create({ docIds: [docAId, docBId] })
    await t.select(thread.id!)

    let captured: unknown
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: RequestInit) => {
        captured = JSON.parse(init.body as string)
        return new Response(makeSseStream(['data: [DONE]\n\n']), { status: 200 })
      }),
    )

    await useChat().send('q')

    const systemContent = (captured as { messages: { content: string }[] }).messages[0]
      .content
    expect(systemContent).toContain('alpha alpha alpha')
    expect(systemContent).toContain('beta beta beta')
    expect(systemContent).toContain('A.pdf')
    expect(systemContent).toContain('B.pdf')
  })

  it('clear empties the active thread', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [] })
    await t.select(thread.id!)
    await t.appendMessage({ threadId: thread.id!, role: 'user', text: 'old' })
    await useChat().clear()
    expect(await db.messages.count()).toBe(0)
  })
})
