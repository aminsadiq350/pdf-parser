import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useChat } from '@/composables/useChat'
import { useSettings } from '@/composables/useSettings'

function makeSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
}

describe('useChat', () => {
  beforeEach(() => {
    localStorage.clear()
    const s = useSettings()
    s.apiKey.value = 'sk-test'
    s.provider.value = 'openrouter'
    s.model.value = 'x/y'
    useChat().clear()
    vi.unstubAllGlobals()
  })

  it('pushes user message and assistant message in order', async () => {
    const body = makeSseStream([
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    )

    const chat = useChat()
    await chat.send('hello', '')
    expect(chat.messages.value.map((m) => [m.role, m.text])).toEqual([
      ['user', 'hello'],
      ['assistant', 'Hi there'],
    ])
  })

  it('surfaces an error message when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'bad key' } }), {
            status: 401,
          }),
      ),
    )
    const chat = useChat()
    await chat.send('hi', '')
    const last = chat.messages.value.at(-1)!
    expect(last.role).toBe('assistant')
    expect(last.error).toBe(true)
    expect(last.text).toMatch(/bad key/)
  })

  it('refuses to send without an api key', async () => {
    const s = useSettings()
    s.apiKey.value = ''
    const chat = useChat()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await chat.send('hi', '')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(chat.messages.value.length).toBe(1)
  })

  it('strips safety metadata from final response', async () => {
    const body = makeSseStream([
      'data: {"choices":[{"delta":{"content":"Answer text.\\nUser Safety: SAFE"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    const chat = useChat()
    await chat.send('q', '')
    expect(chat.messages.value.at(-1)?.text).toBe('Answer text.')
  })
})
