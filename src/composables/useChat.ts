import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { db } from '@/lib/db'
import type { Message } from '@/types/domain'
import { buildPayload } from '@/lib/llm/promptBuilder'
import { OPENROUTER_URL, openRouterHeaders } from '@/lib/llm/openrouter'
import { geminiUrl, geminiHeaders } from '@/lib/llm/gemini'
import { SseReader, extractDelta } from '@/lib/llm/streamParser'
import { useSettings } from './useSettings'
import { useToasts } from './useToasts'
import { useThreads } from './useThreads'

const isTyping = ref(false)
const { provider, apiKey, model } = useSettings()
const { show } = useToasts()
const threads = useThreads()

async function buildPdfContext(docIds: number[]): Promise<string> {
  if (docIds.length === 0) return ''
  const parts: string[] = []
  for (const id of docIds) {
    const doc = await db.documents.get(id)
    if (!doc) continue
    parts.push(`[Document: ${doc.name}]`)
    for (const p of doc.pages) {
      parts.push(`[Page ${p.pageNumber}]\n${p.text}`)
    }
  }
  return parts.join('\n\n')
}

async function send(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed || isTyping.value) return

  const thread = threads.activeThread.value
  if (!thread) {
    show('Open or create a thread first', 'error')
    return
  }

  // Persist the user message immediately so it stays visible even if the API
  // call fails or the key is missing.
  await threads.appendMessage({ threadId: thread.id!, role: 'user', text: trimmed })

  if (!apiKey.value) {
    show('Please add an API key to get AI responses', 'error')
    return
  }

  isTyping.value = true
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)

  let assistant: Message | null = null

  try {
    const pdfText = await buildPdfContext(thread.docIds)
    const history = threads.activeMessages.value.filter((m) => !m.error)
    const payload = buildPayload({
      provider: provider.value,
      model:
        model.value ||
        (provider.value === 'gemini' ? 'gemini-2.5-flash' : 'google/gemini-2.5-flash'),
      history,
      pdfText,
    })

    const isGemini = provider.value === 'gemini'
    const url = isGemini
      ? geminiUrl(model.value || 'gemini-2.5-flash', apiKey.value)
      : OPENROUTER_URL
    const headers = isGemini ? geminiHeaders() : openRouterHeaders(apiKey.value)

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.text()
      let msg = `API error (${res.status})`
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string }
        msg = parsed.error?.message ?? parsed.message ?? msg
      } catch {
        /* not JSON */
      }
      throw new Error(msg)
    }

    assistant = await threads.appendMessage({
      threadId: thread.id!,
      role: 'assistant',
      text: '',
    })
    isTyping.value = false

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    const sse = new SseReader()
    let buffered = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const event of sse.feed(chunk)) {
        if (event.done) continue
        const delta = extractDelta(event.data, provider.value)
        if (delta) {
          buffered += delta
          // Update reactive + persisted state every chunk; M3 will debounce.
          await threads.updateMessage(assistant.id!, { text: buffered })
        }
      }
    }

    const cleaned = buffered.replace(/\n*(User|Response)\s*Safety\s*:\s*\w+/gi, '').trimEnd()
    if (!cleaned) {
      await threads.updateMessage(assistant.id!, {
        text: 'I received an empty response. Please try again.',
        error: true,
      })
    } else if (cleaned !== buffered) {
      await threads.updateMessage(assistant.id!, { text: cleaned })
    }
  } catch (err) {
    isTyping.value = false
    const e = err as Error
    const errText =
      e.name === 'AbortError'
        ? 'Request timed out. The PDF may be too large or the API is slow.'
        : e.message
    if (!assistant) {
      await threads.appendMessage({
        threadId: thread.id!,
        role: 'assistant',
        text: `**Error:** ${errText}`,
        error: true,
      })
    } else {
      await threads.updateMessage(assistant.id!, {
        text: `**Error:** ${errText}`,
        error: true,
      })
    }
    show(errText, 'error')
  } finally {
    clearTimeout(timeout)
    isTyping.value = false
  }
}

async function clear(): Promise<void> {
  const thread = threads.activeThread.value
  if (!thread) return
  await threads.clearMessages(thread.id!)
  show('Chat cleared', 'success')
}

const messages: ComputedRef<readonly Message[]> = computed(() => threads.activeMessages.value)

export interface UseChatReturn {
  messages: Ref<readonly Message[]>
  isTyping: Ref<boolean>
  send: typeof send
  clear: typeof clear
}

export function useChat(): UseChatReturn {
  return { messages, isTyping, send, clear }
}
