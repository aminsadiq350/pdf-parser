import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { db } from '@/lib/db'
import type { Document, Message } from '@/types/domain'
import { buildPayload } from '@/lib/llm/promptBuilder'
import { OPENROUTER_URL, openRouterHeaders } from '@/lib/llm/openrouter'
import { geminiUrl, geminiHeaders } from '@/lib/llm/gemini'
import { SseReader, extractDelta } from '@/lib/llm/streamParser'
import { getRetriever } from '@/lib/retrieval/index'
import { parseCitations } from '@/lib/citations'
import { estimateTokens } from '@/lib/tokenizer'
import { useSettings } from './useSettings'
import { useToasts } from './useToasts'
import { useThreads } from './useThreads'

// Tuning knobs (kept here so they're easy to find).
const FULL_CONTEXT_BUDGET = 16_000 // ~tokens, char/4 estimate
const TOP_K = 8
const PERSIST_DEBOUNCE_MS = 1_000

const isTyping = ref(false)
const isStreaming = ref(false)
const { provider, apiKey, model } = useSettings()
const { show } = useToasts()
const threads = useThreads()

let activeAbort: AbortController | null = null

function buildAliasMap(docs: Document[]): {
  aliasToDocId: Map<string, number>
  docIdToAlias: Map<number, string>
} {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const aliasToDocId = new Map<string, number>()
  const docIdToAlias = new Map<number, string>()
  for (let i = 0; i < docs.length; i++) {
    const alias = i < 26 ? A[i] : `A${i - 25}`
    aliasToDocId.set(alias, docs[i].id!)
    docIdToAlias.set(docs[i].id!, alias)
  }
  return { aliasToDocId, docIdToAlias }
}

async function buildContextSection(
  docIds: number[],
  userQuery: string,
): Promise<{ section: string; aliasToDocId: Map<string, number> }> {
  if (docIds.length === 0) return { section: '', aliasToDocId: new Map() }

  const docs: Document[] = []
  for (const id of docIds) {
    const d = await db.documents.get(id)
    if (d) docs.push(d)
  }
  if (docs.length === 0) return { section: '', aliasToDocId: new Map() }

  const { aliasToDocId, docIdToAlias } = buildAliasMap(docs)

  // Decide full vs retrieve.
  const allText: string[] = []
  for (const d of docs) for (const p of d.pages) allText.push(p.text)
  const estTokens = estimateTokens(allText.join('\n'))

  let chunks: Array<{ alias: string; pageNumber: number; text: string }>
  if (estTokens <= FULL_CONTEXT_BUDGET) {
    chunks = []
    for (const d of docs) {
      const alias = docIdToAlias.get(d.id!)!
      for (const p of d.pages) chunks.push({ alias, pageNumber: p.pageNumber, text: p.text })
    }
  } else {
    const hits = await getRetriever().search(userQuery, {
      docIds: docs.map((d) => d.id!),
      topK: TOP_K,
    })
    hits.sort((a, b) => a.docId - b.docId || a.pageNumber - b.pageNumber)
    chunks = hits.map((h) => ({
      alias: docIdToAlias.get(h.docId)!,
      pageNumber: h.pageNumber,
      text: h.text,
    }))
  }

  const legend =
    'Attached documents:\n' +
    docs
      .map((d) => `  [${docIdToAlias.get(d.id!)}] ${d.name} (${d.numPages} pages)`)
      .join('\n')
  const instr =
    'When you reference these documents, cite using the format [A:p3] or [B:p1]. ' +
    'Cite the specific page that supports your statement. Do not invent pages.'
  const body = chunks.map((c) => `[${c.alias}] [Page ${c.pageNumber}]\n${c.text}`).join('\n\n')
  return { section: `${legend}\n\n${instr}\n\n${body}`, aliasToDocId }
}

async function send(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed || isTyping.value) return

  const thread = threads.activeThread.value
  if (!thread) {
    show('Open or create a thread first', 'error')
    return
  }

  await threads.appendMessage({ threadId: thread.id!, role: 'user', text: trimmed })

  if (!apiKey.value) {
    show('Please add an API key to get AI responses', 'error')
    return
  }

  isTyping.value = true
  const controller = new AbortController()
  activeAbort = controller
  const timeout = setTimeout(() => controller.abort(), 60_000)

  let assistant: Message | null = null
  let buffered = ''
  let pendingPersist = false
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  function schedulePersist() {
    if (persistTimer || !assistant) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      if (assistant && pendingPersist) {
        pendingPersist = false
        void threads.updateMessage(assistant.id!, { text: buffered })
      }
    }, PERSIST_DEBOUNCE_MS)
  }

  try {
    const { section, aliasToDocId } = await buildContextSection(thread.docIds, trimmed)
    const history = threads.activeMessages.value.filter((m) => !m.error)
    const payload = buildPayload({
      provider: provider.value,
      model:
        model.value ||
        (provider.value === 'gemini' ? 'gemini-2.5-flash' : 'google/gemini-2.5-flash'),
      history,
      contextSection: section,
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

    assistant = await threads.appendMessage({
      threadId: thread.id!,
      role: 'assistant',
      text: '',
    })
    isTyping.value = false
    isStreaming.value = true

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
        if (delta) {
          buffered += delta
          pendingPersist = true
          // Update reactive state every chunk for snappy UI; Dexie writes are debounced.
          threads.activeMessages.value = threads.activeMessages.value.map((m) =>
            m.id === assistant!.id ? { ...m, text: buffered } : m,
          )
          schedulePersist()
        }
      }
    }

    // Stream closed cleanly.
    const cleaned = buffered.replace(/\n*(User|Response)\s*Safety\s*:\s*\w+/gi, '').trimEnd()
    const { citations } = parseCitations(cleaned, aliasToDocId)
    if (!cleaned) {
      await threads.updateMessage(assistant.id!, {
        text: 'I received an empty response. Please try again.',
        error: true,
      })
    } else {
      await threads.updateMessage(assistant.id!, { text: cleaned, citations })
    }
  } catch (err) {
    const e = err as Error
    if (e.name === 'AbortError') {
      // User-initiated stop OR 60s timeout. Either way, keep partial text.
      if (assistant) {
        const finalText = buffered
          .replace(/\n*(User|Response)\s*Safety\s*:\s*\w+/gi, '')
          .trimEnd()
        await threads.updateMessage(assistant.id!, { text: finalText || '(stopped)' })
      } else {
        await threads.appendMessage({
          threadId: thread.id!,
          role: 'assistant',
          text: '**Stopped.** No response received.',
          error: true,
        })
      }
    } else {
      isTyping.value = false
      isStreaming.value = false
      const errText = e.message
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
    }
  } finally {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    clearTimeout(timeout)
    activeAbort = null
    isTyping.value = false
    isStreaming.value = false
  }
}

function abort(): void {
  if (activeAbort) {
    activeAbort.abort()
    activeAbort = null
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
  isStreaming: Ref<boolean>
  send: typeof send
  abort: typeof abort
  clear: typeof clear
}

export function useChat(): UseChatReturn {
  return { messages, isTyping, isStreaming, send, abort, clear }
}
