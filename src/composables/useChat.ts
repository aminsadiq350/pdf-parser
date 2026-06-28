import { ref } from 'vue'
import type { ChatMessage } from '@/types/domain'
import { buildPayload } from '@/lib/llm/promptBuilder'
import { OPENROUTER_URL, openRouterHeaders } from '@/lib/llm/openrouter'
import { geminiUrl, geminiHeaders } from '@/lib/llm/gemini'
import { SseReader, extractDelta } from '@/lib/llm/streamParser'
import { useSettings } from './useSettings'
import { useToasts } from './useToasts'

const messages = ref<ChatMessage[]>([])
const isTyping = ref(false)
let nextId = 1

const { provider, apiKey, model } = useSettings()
const { show } = useToasts()

async function send(text: string, pdfText: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed || isTyping.value) return

  messages.value.push({ id: nextId++, role: 'user', text: trimmed })

  if (!apiKey.value) {
    show('Please add an API key to get AI responses', 'error')
    return
  }

  isTyping.value = true
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)

  let assistant: ChatMessage | null = null

  try {
    const history = messages.value.filter((m) => !m.error)
    const payload = buildPayload({
      provider: provider.value,
      model: model.value || (provider.value === 'gemini' ? 'gemini-2.5-flash' : 'google/gemini-2.5-flash'),
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
        // body wasn't JSON
      }
      throw new Error(msg)
    }

    assistant = { id: nextId++, role: 'assistant', text: '' }
    messages.value.push(assistant)
    isTyping.value = false

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    const sse = new SseReader()

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const event of sse.feed(chunk)) {
        if (event.done) continue
        const delta = extractDelta(event.data, provider.value)
        if (delta) assistant.text += delta
      }
    }

    assistant.text = assistant.text
      .replace(/\n*(User|Response)\s*Safety\s*:\s*\w+/gi, '')
      .trimEnd()

    if (!assistant.text) {
      assistant.text = 'I received an empty response. Please try again.'
      assistant.error = true
    }
  } catch (err) {
    isTyping.value = false
    const e = err as Error
    const errText =
      e.name === 'AbortError'
        ? 'Request timed out. The PDF may be too large or the API is slow.'
        : e.message
    if (!assistant) {
      messages.value.push({ id: nextId++, role: 'assistant', text: `**Error:** ${errText}`, error: true })
    } else if (!assistant.text) {
      assistant.text = `**Error:** ${errText}`
      assistant.error = true
    }
    show(errText, 'error')
  } finally {
    clearTimeout(timeout)
    isTyping.value = false
  }
}

function clear(): void {
  messages.value = []
  show('Chat cleared', 'success')
}

export function useChat() {
  return { messages, isTyping, send, clear }
}
