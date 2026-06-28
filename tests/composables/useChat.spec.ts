import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, initStore } from '@/lib/db'
import { useChat } from '@/composables/useChat'
import { useSettings } from '@/composables/useSettings'
import { useThreads } from '@/composables/useThreads'
import { getRetriever } from '@/lib/retrieval/index'

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

describe('useChat (Dexie + retrieval)', () => {
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
    getRetriever().__reset()
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

  it('builds contextSection with legend + citation instructions + chunk body', async () => {
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

    const sys = (captured as { messages: { content: string }[] }).messages[0].content
    expect(sys).toMatch(/Attached documents:/)
    expect(sys).toMatch(/\[A\] A\.pdf/)
    expect(sys).toMatch(/\[B\] B\.pdf/)
    expect(sys).toMatch(/cite using the format \[A:p3\]/i)
    expect(sys).toContain('alpha alpha alpha')
    expect(sys).toContain('beta beta beta')
  })

  it('uses retrieval when total context exceeds FULL_CONTEXT_BUDGET', async () => {
    const t = useThreads()
    const bigPage = 'lorem ipsum dolor sit amet '.repeat(4000) // ~104,000 chars
    const docId = await db.documents.add({
      name: 'big.pdf',
      size: 1,
      numPages: 5,
      addedAt: 1,
      pages: [
        { pageNumber: 1, text: bigPage + ' newton inertia' },
        { pageNumber: 2, text: bigPage + ' soup tomato' },
        { pageNumber: 3, text: bigPage + ' quantum entanglement' },
        { pageNumber: 4, text: bigPage + ' something else' },
        { pageNumber: 5, text: bigPage + ' final' },
      ],
    })

    await getRetriever().indexDocument({
      id: docId,
      name: 'big.pdf',
      pages: (await db.documents.get(docId))!.pages,
    })

    const thread = await t.create({ docIds: [docId] })
    await t.select(thread.id!)

    let captured: unknown
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: RequestInit) => {
        captured = JSON.parse(init.body as string)
        return new Response(makeSseStream(['data: [DONE]\n\n']), { status: 200 })
      }),
    )

    await useChat().send('newton inertia')

    const sys = (captured as { messages: { content: string }[] }).messages[0].content
    expect(sys).toContain('newton inertia')
    // Un-retrieved dump would be ~520k chars (5 pages * ~104k). Retrieval picks
    // the page that actually matches the query; system prompt drops to ~108k.
    expect(sys.length).toBeLessThan(200_000)
  })

  it('persists citations parsed from final assistant text', async () => {
    const t = useThreads()
    const docId = await db.documents.add({
      name: 'paper.pdf',
      size: 1,
      numPages: 5,
      addedAt: 1,
      pages: [{ pageNumber: 3, text: 'newton inertia' }],
    })
    const thread = await t.create({ docIds: [docId] })
    await t.select(thread.id!)

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            makeSseStream([
              'data: {"choices":[{"delta":{"content":"Per [A:p3] the answer is X."}}]}\n\n',
              'data: [DONE]\n\n',
            ]),
            { status: 200 },
          ),
      ),
    )

    await useChat().send('what does the doc say')
    const msgs = await db.messages.where('threadId').equals(thread.id!).toArray()
    const assistant = msgs.find((m) => m.role === 'assistant')!
    expect(assistant.citations).toEqual([{ docId, pageNumber: 3 }])
  })

  it('abort() preserves partial assistant text and clears isStreaming', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [] })
    await t.select(thread.id!)

    let streamCtrl: ReadableStreamDefaultController<Uint8Array> | null = null
    let chunkPushed = false
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        streamCtrl = c
      },
      async pull(controller) {
        if (!chunkPushed) {
          chunkPushed = true
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"partial..."}}]}\n\n',
            ),
          )
        } else {
          // Hang forever until aborted.
          await new Promise(() => {})
        }
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: RequestInit) => {
        // Real browsers propagate the AbortSignal into the response body; the
        // ReadableStream constructed in tests doesn't, so we wire it manually.
        init.signal?.addEventListener('abort', () => {
          streamCtrl?.error(new DOMException('Aborted', 'AbortError'))
        })
        return new Response(stream, { status: 200 })
      }),
    )

    const chat = useChat()
    const sendPromise = chat.send('hi')
    await new Promise((r) => setTimeout(r, 100))
    chat.abort()
    await sendPromise

    const msgs = await db.messages.where('threadId').equals(thread.id!).toArray()
    const assistant = msgs.find((m) => m.role === 'assistant')!
    expect(assistant.text).toBe('partial...')
    expect(assistant.error).toBeFalsy()
    expect(chat.isStreaming.value).toBe(false)
  })

  it('clear empties the active thread', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [] })
    await t.select(thread.id!)
    await t.appendMessage({ threadId: thread.id!, role: 'user', text: 'old' })
    await useChat().clear()
    expect(await db.messages.count()).toBe(0)
  })

  it('auto-names a nameless thread from the first user message', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [] })
    expect(thread.name).toBe('')
    await t.select(thread.id!)

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(makeSseStream(['data: [DONE]\n\n']), { status: 200 }),
      ),
    )

    await useChat().send('What is on page 1? Just the first line please.')

    const updated = await db.threads.get(thread.id!)
    expect(updated?.name).toBe('What is on page 1')
    expect(t.threads.value.find((x) => x.id === thread.id)?.name).toBe(
      'What is on page 1',
    )
  })

  it('does not auto-name a thread that already has a name', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [], name: 'My research' })
    await t.select(thread.id!)

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(makeSseStream(['data: [DONE]\n\n']), { status: 200 }),
      ),
    )

    await useChat().send('A completely different question entirely.')

    const updated = await db.threads.get(thread.id!)
    expect(updated?.name).toBe('My research')
  })
})
