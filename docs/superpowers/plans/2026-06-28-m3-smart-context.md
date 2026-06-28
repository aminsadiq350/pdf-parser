# Notebook — M3 Smart Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add intelligent context handling to the chat: BM25 retrieval (via `minisearch`) decides per-message whether to send full doc text or just the top-k most relevant page-chunks; the model is instructed to cite specific pages; cited pages render as clickable chips that jump the PDF viewer (cross-doc if needed); the user can stop a stream mid-flight; per-chunk Dexie writes get debounced.

**Architecture:**

- **`src/lib/retrieval/`** — pure-TS `Retriever` interface + `Bm25Retriever` impl wrapping `minisearch`. Singleton instance via `getRetriever()`. Lazy-initialised at app start by walking all existing docs. Future `EmbeddingsRetriever` (M5) drops in behind the same interface.
- **`src/lib/citations.ts`** — pre-render rewriter that converts `[A:p3]` tokens in assistant text into inert HTML buttons (`.citation-chip`), keyed off the alias→docId map that was used when the prompt was built. `parseCitations` also returns the concrete `Citation[]` for persistence.
- **`src/lib/llm/promptBuilder.ts`** — takes a `contextSection: string` (built upstream in `useChat`). Identity preserved; no-doc and with-doc branches kept but the with-doc body now sits inside that contextSection.
- **`src/composables/useChat`** — owns the decision rule (full text vs top-k retrieval), builds legend + body + citation instructions, persists in 1s-debounced writes during stream + flush on close, exposes `abort()` for the Stop button, parses citations on the final text and persists them on the `Message` row.
- **`src/composables/usePdfViewer`** — adds `jumpToPage(docId, pageNumber)`: if the doc is already active, jump; if not, switch active doc + queue a pending jump that fires when the new PDF loads.
- **`src/composables/useDocuments`** — calls `retriever.indexDocument` on import and `retriever.removeDocument` on delete (transparent to existing callers).
- **`src/components/chat/ChatInput.vue`** — Send button morphs into Stop while `isStreaming`; click emits `stop`.
- **`src/components/chat/ChatMessage.vue`** — renders citation chips via event delegation; clicks call `jumpToPage`.

**Retrieval decision (per send):**

```
FULL_CONTEXT_BUDGET = 16_000 chars-as-tokens (chars/4 estimate * 4)
TOP_K = 8
totalChars = sum of all attached docs' pages text length
if totalChars / 4 <= FULL_CONTEXT_BUDGET:
    chunks = every page of every attached doc (sorted (docId, pageNumber))
else:
    chunks = retriever.search(userMessage, { docIds, topK: TOP_K })
            .sort((a,b) => a.docId - b.docId || a.pageNumber - b.pageNumber)
```

**Citation format (model contract):** legend `[A] DocA.pdf (12 pages)` in system prompt; model emits `[A:p3]` inline; alias map is per-send (rebuilt each turn) so deleting/adding docs between sends doesn't poison old messages — those stored `Citation[]` are concrete `{docId, pageNumber}`.

**Tech Stack additions:** none (`minisearch@^7` was installed in M1 Task 1).

**Reference for current behavior:** `git show m2-persistence:src/composables/useChat.ts` etc. — M3 must not regress the M2 behavior set; new behavior is strictly additive (Stop, citations, retrieval kicking in for large docs).

---

## File Structure (created/modified in M3)

**Created:**

```
src/
  lib/
    retrieval/
      types.ts                       Retriever interface + RetrievedChunk
      bm25.ts                        Bm25Retriever wrapping minisearch
      index.ts                       getRetriever() singleton + indexAll() helper
    citations.ts                     parseCitations + renderCitationsHtml
tests/
  lib/
    retrieval/
      bm25.spec.ts
    citations.spec.ts
```

**Modified:**

```
src/
  lib/llm/promptBuilder.ts           takes contextSection; no-doc branch unchanged
  composables/
    useChat.ts                       retrieval, citation parsing, debounced persist, abort
    usePdfViewer.ts                  jumpToPage(docId, pageNumber) with cross-doc switch
    useDocuments.ts                  indexDocument / removeDocument on import / delete
  components/
    chat/
      ChatInput.vue                  Send/Stop toggle
      ChatMessage.vue                citation chip rendering + click delegation
    ChatPanel.vue                    wires Stop emit + isStreaming flag
  styles/main.css                    .citation-chip styles
  main.ts                            retriever.indexAll(documents) after loadAll
tests/
  lib/promptBuilder.spec.ts          new contextSection signature
  composables/useChat.spec.ts        cover retrieval branch, citations, abort, debounce
```

---

## Task 1 — Retriever interface + tests scaffold

**Files:**
- Create: `src/lib/retrieval/types.ts`

- [ ] **Step 1.1 — Create `src/lib/retrieval/types.ts`**

```ts
import type { PageText } from '@/types/domain'

export interface RetrievedChunk {
  docId: number
  docName: string
  pageNumber: number
  text: string
  score: number
}

export interface IndexableDoc {
  id: number
  name: string
  pages: PageText[]
}

export interface Retriever {
  indexDocument(doc: IndexableDoc): Promise<void>
  removeDocument(docId: number): Promise<void>
  search(
    query: string,
    opts: { docIds: number[]; topK: number },
  ): Promise<RetrievedChunk[]>
  /** Bulk-init helper used at app start. */
  indexAll(docs: IndexableDoc[]): Promise<void>
  /** Test-only: drop everything. */
  __reset(): void
}
```

- [ ] **Step 1.2 — Typecheck**

```bash
npx vue-tsc --noEmit 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 1.3 — Commit**

```bash
git add src/lib/retrieval/types.ts
git commit -m "feat(m3): Retriever interface + RetrievedChunk types"
```

---

## Task 2 — `Bm25Retriever` (TDD)

**Files:**
- Create: `src/lib/retrieval/bm25.ts`, `src/lib/retrieval/index.ts`
- Create: `tests/lib/retrieval/bm25.spec.ts`

- [ ] **Step 2.1 — Write the failing tests**

```ts
// tests/lib/retrieval/bm25.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Bm25Retriever } from '@/lib/retrieval/bm25'
import type { IndexableDoc } from '@/lib/retrieval/types'

const docA: IndexableDoc = {
  id: 1,
  name: 'physics.pdf',
  pages: [
    { pageNumber: 1, text: 'Newton described inertia and the laws of motion.' },
    { pageNumber: 2, text: 'Einstein extended this with general relativity.' },
  ],
}

const docB: IndexableDoc = {
  id: 2,
  name: 'cooking.pdf',
  pages: [
    { pageNumber: 1, text: 'Tomatoes pair well with basil and garlic.' },
    { pageNumber: 2, text: 'Newton was not a chef but probably enjoyed soup.' },
  ],
}

describe('Bm25Retriever', () => {
  let r: Bm25Retriever
  beforeEach(() => {
    r = new Bm25Retriever()
  })

  it('returns matching chunks scored by BM25', async () => {
    await r.indexDocument(docA)
    const hits = await r.search('Newton inertia', { docIds: [docA.id], topK: 5 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].pageNumber).toBe(1)
    expect(hits[0].docName).toBe('physics.pdf')
    expect(hits[0].text).toContain('Newton')
  })

  it('filters by docIds (no cross-doc leakage)', async () => {
    await r.indexAll([docA, docB])
    const hits = await r.search('Newton', { docIds: [docA.id], topK: 5 })
    expect(hits.every((h) => h.docId === docA.id)).toBe(true)
  })

  it('searches across multiple docIds when included', async () => {
    await r.indexAll([docA, docB])
    const hits = await r.search('Newton', { docIds: [docA.id, docB.id], topK: 5 })
    const ids = new Set(hits.map((h) => h.docId))
    expect(ids.has(docA.id)).toBe(true)
    expect(ids.has(docB.id)).toBe(true)
  })

  it('respects topK', async () => {
    await r.indexAll([docA, docB])
    const hits = await r.search('the', { docIds: [docA.id, docB.id], topK: 2 })
    expect(hits.length).toBeLessThanOrEqual(2)
  })

  it('removeDocument removes that doc from search results', async () => {
    await r.indexAll([docA, docB])
    await r.removeDocument(docA.id)
    const hits = await r.search('Newton', { docIds: [docA.id, docB.id], topK: 5 })
    expect(hits.every((h) => h.docId !== docA.id)).toBe(true)
  })

  it('indexDocument replaces existing chunks for the same docId', async () => {
    await r.indexDocument(docA)
    await r.indexDocument({
      id: docA.id,
      name: 'physics-v2.pdf',
      pages: [{ pageNumber: 1, text: 'Brand new content about quarks.' }],
    })
    const oldHits = await r.search('Newton', { docIds: [docA.id], topK: 5 })
    expect(oldHits).toHaveLength(0)
    const newHits = await r.search('quarks', { docIds: [docA.id], topK: 5 })
    expect(newHits).toHaveLength(1)
    expect(newHits[0].docName).toBe('physics-v2.pdf')
  })

  it('__reset wipes everything', async () => {
    await r.indexDocument(docA)
    r.__reset()
    const hits = await r.search('Newton', { docIds: [docA.id], topK: 5 })
    expect(hits).toHaveLength(0)
  })
})
```

- [ ] **Step 2.2 — Run, expect failure**

- [ ] **Step 2.3 — Create `src/lib/retrieval/bm25.ts`**

```ts
import MiniSearch from 'minisearch'
import type { IndexableDoc, RetrievedChunk, Retriever } from './types'

interface ChunkRecord {
  id: string // `${docId}:${pageNumber}`
  docId: number
  docName: string
  pageNumber: number
  text: string
}

export class Bm25Retriever implements Retriever {
  private mini = this.fresh()
  private records = new Map<string, ChunkRecord>()

  private fresh(): MiniSearch<ChunkRecord> {
    return new MiniSearch<ChunkRecord>({
      idField: 'id',
      fields: ['text'],
      storeFields: ['docId', 'docName', 'pageNumber', 'text'],
    })
  }

  async indexDocument(doc: IndexableDoc): Promise<void> {
    await this.removeDocument(doc.id)
    for (const p of doc.pages) {
      const id = `${doc.id}:${p.pageNumber}`
      const rec: ChunkRecord = {
        id,
        docId: doc.id,
        docName: doc.name,
        pageNumber: p.pageNumber,
        text: p.text,
      }
      this.mini.add(rec)
      this.records.set(id, rec)
    }
  }

  async removeDocument(docId: number): Promise<void> {
    const toRemove: ChunkRecord[] = []
    for (const r of this.records.values()) {
      if (r.docId === docId) toRemove.push(r)
    }
    for (const r of toRemove) {
      this.mini.remove(r)
      this.records.delete(r.id)
    }
  }

  async search(
    query: string,
    opts: { docIds: number[]; topK: number },
  ): Promise<RetrievedChunk[]> {
    const allow = new Set(opts.docIds)
    const hits = this.mini.search(query, {
      filter: (r) => allow.has(r.docId as number),
    })
    return hits.slice(0, opts.topK).map((h) => ({
      docId: h.docId as number,
      docName: h.docName as string,
      pageNumber: h.pageNumber as number,
      text: h.text as string,
      score: h.score,
    }))
  }

  async indexAll(docs: IndexableDoc[]): Promise<void> {
    for (const d of docs) await this.indexDocument(d)
  }

  __reset(): void {
    this.mini = this.fresh()
    this.records.clear()
  }
}
```

- [ ] **Step 2.4 — Create `src/lib/retrieval/index.ts`** (singleton)

```ts
import { Bm25Retriever } from './bm25'
import type { Retriever } from './types'

let instance: Retriever | null = null

export function getRetriever(): Retriever {
  if (!instance) instance = new Bm25Retriever()
  return instance
}

/** Test-only escape hatch. */
export function __setRetrieverForTests(r: Retriever | null): void {
  instance = r
}
```

- [ ] **Step 2.5 — Run tests, expect pass**

```bash
npm run test:run -- tests/lib/retrieval/bm25.spec.ts
```
Expected: 7 tests pass.

- [ ] **Step 2.6 — Commit**

```bash
git add src/lib/retrieval/bm25.ts src/lib/retrieval/index.ts tests/lib/retrieval/bm25.spec.ts
git commit -m "feat(m3): Bm25Retriever (minisearch) + singleton factory"
```

---

## Task 3 — `lib/citations.ts` (TDD)

**Files:**
- Create: `src/lib/citations.ts`, `tests/lib/citations.spec.ts`

The module exposes two things:
1. `parseCitations(text, aliasToDocId)` — extract concrete `Citation[]` from raw assistant text. Used by `useChat` after stream close so we can persist citations alongside the message.
2. `renderCitationsHtml(text, citations, docs)` — rewrite the text, replacing each `[A:p3]` token with a `<button class="citation-chip" data-doc-id="…" data-page="…">DocName · p.N</button>` based on the stored `citations` array (sequential match). Used by `ChatMessage.vue` *before* markdown rendering.

The two pass over the same regex; the rendering side is decoupled from alias maps so re-render after reload works without remembering aliases.

- [ ] **Step 3.1 — Write the failing tests**

```ts
// tests/lib/citations.spec.ts
import { describe, it, expect } from 'vitest'
import { parseCitations, renderCitationsHtml } from '@/lib/citations'
import type { Citation, Document } from '@/types/domain'

describe('parseCitations', () => {
  it('returns Citation[] in match order using alias map', () => {
    const aliasToDocId = new Map([
      ['A', 7],
      ['B', 12],
    ])
    const text = 'See [A:p3] and also [B:p1] and [A:p5].'
    const { citations } = parseCitations(text, aliasToDocId)
    expect(citations).toEqual([
      { docId: 7, pageNumber: 3 },
      { docId: 12, pageNumber: 1 },
      { docId: 7, pageNumber: 5 },
    ])
  })

  it('skips tokens with unknown aliases', () => {
    const { citations } = parseCitations('hi [Z:p1] there', new Map([['A', 1]]))
    expect(citations).toEqual([])
  })

  it('returns the unchanged text', () => {
    const text = 'See [A:p3].'
    const out = parseCitations(text, new Map([['A', 1]]))
    expect(out.text).toBe(text)
  })
})

describe('renderCitationsHtml', () => {
  const docs: Document[] = [
    {
      id: 7,
      name: 'physics.pdf',
      size: 1,
      numPages: 5,
      pages: [],
      addedAt: 0,
    },
    {
      id: 12,
      name: 'cooking.pdf',
      size: 1,
      numPages: 2,
      pages: [],
      addedAt: 0,
    },
  ]
  const citations: Citation[] = [
    { docId: 7, pageNumber: 3 },
    { docId: 12, pageNumber: 1 },
  ]

  it('replaces tokens with citation-chip buttons in match order', () => {
    const html = renderCitationsHtml('See [A:p3] and also [B:p1].', citations, docs)
    expect(html).toContain('<button class="citation-chip"')
    expect(html).toContain('data-doc-id="7"')
    expect(html).toContain('data-page="3"')
    expect(html).toContain('physics.pdf · p.3')
    expect(html).toContain('data-doc-id="12"')
    expect(html).toContain('cooking.pdf · p.1')
  })

  it('renders stale chip (greyed, disabled) when the doc was deleted', () => {
    const html = renderCitationsHtml('See [A:p3].', citations, [docs[1]])
    expect(html).toContain('class="citation-chip stale"')
    expect(html).toContain('disabled')
    expect(html).toContain('(removed)')
  })

  it('leaves tokens alone when citations array is shorter than tokens', () => {
    const html = renderCitationsHtml('A [A:p3] B [B:p1].', [citations[0]], docs)
    expect(html).toContain('citation-chip')
    expect(html).toContain('[B:p1]')
  })

  it('escapes the alias/doc-name to avoid HTML injection', () => {
    const evil: Document[] = [
      { id: 1, name: '<script>x</script>', size: 1, numPages: 1, pages: [], addedAt: 0 },
    ]
    const html = renderCitationsHtml('[A:p1]', [{ docId: 1, pageNumber: 1 }], evil)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
```

- [ ] **Step 3.2 — Run, expect failure**

- [ ] **Step 3.3 — Implement `src/lib/citations.ts`**

```ts
import type { Citation, Document } from '@/types/domain'

const TOKEN_RE = /\[([A-Z]{1,2}):p(\d+)\]/g

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function parseCitations(
  text: string,
  aliasToDocId: Map<string, number>,
): { text: string; citations: Citation[] } {
  const citations: Citation[] = []
  for (const m of text.matchAll(TOKEN_RE)) {
    const alias = m[1]
    const pageNumber = Number.parseInt(m[2], 10)
    const docId = aliasToDocId.get(alias)
    if (docId == null || Number.isNaN(pageNumber)) continue
    citations.push({ docId, pageNumber })
  }
  return { text, citations }
}

/**
 * Replace each [A:pN] token in text with a citation-chip <button>, using the
 * already-resolved citations array (matched by sequential token order).
 * Output is HTML-safe: doc names are escaped before insertion.
 */
export function renderCitationsHtml(
  text: string,
  citations: Citation[] | undefined,
  docs: readonly Document[],
): string {
  if (!citations || citations.length === 0) return text
  let idx = 0
  return text.replace(TOKEN_RE, (match) => {
    const cite = citations[idx]
    idx++
    if (!cite) return match // ran out of stored citations; leave token as-is
    const doc = docs.find((d) => d.id === cite.docId)
    const stale = !doc
    const docName = doc?.name ?? '(removed)'
    const escaped = escapeHtml(docName)
    const classAttr = stale ? 'citation-chip stale' : 'citation-chip'
    const disabled = stale ? ' disabled title="document removed"' : ''
    return (
      `<button class="${classAttr}" data-doc-id="${cite.docId}" ` +
      `data-page="${cite.pageNumber}"${disabled}>${escaped} · p.${cite.pageNumber}</button>`
    )
  })
}
```

- [ ] **Step 3.4 — Run tests, expect pass**

```bash
npm run test:run -- tests/lib/citations.spec.ts
```
Expected: 7 tests pass.

- [ ] **Step 3.5 — Commit**

```bash
git add src/lib/citations.ts tests/lib/citations.spec.ts
git commit -m "feat(m3): parseCitations + renderCitationsHtml"
```

---

## Task 4 — Update `promptBuilder` to accept `contextSection` (TDD)

**Files:**
- Modify: `src/lib/llm/types.ts`, `src/lib/llm/promptBuilder.ts`
- Modify: `tests/lib/promptBuilder.spec.ts`

The new signature decouples *what context to send* (decided by `useChat`) from *how to wrap it for the provider*. `useChat` constructs a single `contextSection` string that already contains the legend, citation instructions, and chunk body.

- [ ] **Step 4.1 — Update `src/lib/llm/types.ts`**

```ts
import type { Message, Provider } from '@/types/domain'

export interface BuildPayloadInput {
  provider: Provider
  model: string
  history: Message[]
  /** Pre-formatted context block. Empty string = no-doc / general Q&A mode. */
  contextSection: string
}

export interface OpenRouterPayload {
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  stream: true
}

export interface GeminiPayload {
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
}

export type ApiPayload = OpenRouterPayload | GeminiPayload
```

- [ ] **Step 4.2 — Replace `tests/lib/promptBuilder.spec.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildPayload, NOTEBOOK_IDENTITY } from '@/lib/llm/promptBuilder'
import type { Message } from '@/types/domain'

const history: Message[] = [
  { id: 1, threadId: 1, role: 'user', text: 'Hi', createdAt: 1 },
  { id: 2, threadId: 1, role: 'assistant', text: 'Hello', createdAt: 2 },
]

describe('buildPayload (openrouter)', () => {
  it('includes identity in system prompt', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, contextSection: '' })
    expect('messages' in p).toBe(true)
    if ('messages' in p) {
      expect(p.messages[0].role).toBe('system')
      expect(p.messages[0].content).toContain(NOTEBOOK_IDENTITY)
    }
  })

  it('uses no-doc branch when contextSection is empty', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, contextSection: '' })
    if ('messages' in p) expect(p.messages[0].content).toMatch(/No PDF is currently loaded/i)
  })

  it('embeds contextSection verbatim when provided', () => {
    const ctx = 'Attached documents:\n  [A] foo.pdf\n\n[A] [Page 1]\nlorem'
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, contextSection: ctx })
    if ('messages' in p) expect(p.messages[0].content).toContain(ctx)
  })

  it('appends history with role mapping', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, contextSection: '' })
    if ('messages' in p) {
      expect(p.messages[1]).toEqual({ role: 'user', content: 'Hi' })
      expect(p.messages[2]).toEqual({ role: 'assistant', content: 'Hello' })
      expect(p.stream).toBe(true)
    }
  })
})

describe('buildPayload (gemini)', () => {
  it('emits contents[] with user/model roles and contextSection embedded', () => {
    const ctx = 'Attached documents:\n  [A] foo.pdf'
    const p = buildPayload({ provider: 'gemini', model: 'gemini-2.5-flash', history, contextSection: ctx })
    if ('contents' in p) {
      expect(p.contents[0].role).toBe('user')
      expect(p.contents[0].parts[0].text).toContain(ctx)
      expect(p.contents[1].role).toBe('model')
      expect(p.contents[2]).toEqual({ role: 'user', parts: [{ text: 'Hi' }] })
    }
  })
})
```

- [ ] **Step 4.3 — Run, expect failure** (signature mismatch)

- [ ] **Step 4.4 — Rewrite `src/lib/llm/promptBuilder.ts`**

```ts
import type { ApiPayload, BuildPayloadInput } from './types'

export const NOTEBOOK_IDENTITY =
  'You are "Notebook", an AI assistant built into a PDF reader app. ' +
  'Never claim to be made by OpenAI, GPT, or any other model. You are Notebook.'

function buildSystemPrompt(contextSection: string): string {
  if (!contextSection) {
    return (
      `${NOTEBOOK_IDENTITY}\n\n` +
      'No PDF is currently loaded. Let the user know they can import a PDF to ask questions about it. ' +
      'You can still answer general questions. Use markdown formatting.'
    )
  }
  return (
    `${NOTEBOOK_IDENTITY}\n\n` +
    `${contextSection}\n\n` +
    'Use markdown formatting. If the answer is not in the attached documents, say so clearly.'
  )
}

export function buildPayload(input: BuildPayloadInput): ApiPayload {
  const systemPrompt = buildSystemPrompt(input.contextSection)

  if (input.provider === 'gemini') {
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      {
        role: 'model',
        parts: [{ text: 'Understood. I will answer questions based on the provided documents.' }],
      },
    ]
    for (const m of input.history) {
      contents.push({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      })
    }
    return { contents }
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]
  for (const m of input.history) {
    messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })
  }
  return { model: input.model, messages, stream: true }
}
```

- [ ] **Step 4.5 — Run tests, expect pass**

```bash
npm run test:run -- tests/lib/promptBuilder.spec.ts
```

- [ ] **Step 4.6 — Commit**

```bash
git add src/lib/llm/types.ts src/lib/llm/promptBuilder.ts tests/lib/promptBuilder.spec.ts
git commit -m "refactor(m3): promptBuilder takes contextSection; logic moves to useChat"
```

> Note: this breaks `useChat.spec.ts` and `useChat.ts`. Both are rewritten in Task 6.

---

## Task 5 — `usePdfViewer.jumpToPage` (cross-doc switch)

**Files:**
- Modify: `src/composables/usePdfViewer.ts`

Adds `jumpToPage(docId, pageNumber)`. If `docId === activeId`, jump immediately. Else, set a pending jump, ask `useDocuments` to switch active doc; the existing `watch(currentPdf)` triggers the queued jump when the new PDF finishes loading.

- [ ] **Step 5.1 — Update `src/composables/usePdfViewer.ts`** — apply the following diff conceptually:

Replace the file with:

```ts
import { ref, shallowRef, watch } from 'vue'
import type * as pdfjsLib from 'pdfjs-dist'
import { loadPdfFromBlob } from '@/lib/pdf'
import { useDocuments } from './useDocuments'

const currentPdf = shallowRef<pdfjsLib.PDFDocumentProxy | null>(null)
const currentPage = ref(1)
const numPages = ref(0)
let canvas: HTMLCanvasElement | null = null

let drawChain: Promise<void> = Promise.resolve()
let activeRender: pdfjsLib.RenderTask | null = null
let pendingJumpPage: number | null = null

async function setActive(blob: Blob | null): Promise<void> {
  if (!blob) {
    currentPdf.value = null
    numPages.value = 0
    return
  }
  const pdf = await loadPdfFromBlob(blob)
  currentPdf.value = pdf
  numPages.value = pdf.numPages
  currentPage.value = 1
}

function bindCanvas(el: HTMLCanvasElement | null) {
  canvas = el
  if (canvas && currentPdf.value) void drawCurrent()
}

function drawCurrent(): Promise<void> {
  const next = drawChain.catch(() => {}).then(async () => {
    if (!currentPdf.value || !canvas) return
    if (activeRender) {
      try {
        activeRender.cancel()
        await activeRender.promise
      } catch {
        /* RenderingCancelledException expected */
      }
      activeRender = null
    }
    const page = await currentPdf.value.getPage(currentPage.value)
    const vp = page.getViewport({ scale: 1.5 })
    canvas.height = vp.height
    canvas.width = vp.width
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const task = page.render({ canvasContext: ctx, viewport: vp })
    activeRender = task
    try {
      await task.promise
    } catch (err) {
      if ((err as Error)?.name !== 'RenderingCancelledException') throw err
    } finally {
      if (activeRender === task) activeRender = null
    }
  })
  drawChain = next
  return next
}

watch([currentPdf, currentPage], () => {
  if (canvas) void drawCurrent()
})

// When a new PDF finishes loading after a cross-doc jumpToPage, fire the
// queued page change.
watch(currentPdf, async () => {
  if (pendingJumpPage != null && currentPdf.value) {
    const target = pendingJumpPage
    pendingJumpPage = null
    await goTo(target)
  }
})

async function goTo(page: number) {
  if (!currentPdf.value) return
  if (page < 1 || page > numPages.value) return
  currentPage.value = page
}

function prev() {
  void goTo(currentPage.value - 1)
}
function next() {
  void goTo(currentPage.value + 1)
}

/**
 * Cross-doc-aware jump used by citation chips.
 * - Same doc, already loaded: just goTo(pageNumber).
 * - Different doc: switch active doc and queue the jump for when the PDF loads.
 */
async function jumpToPage(docId: number, pageNumber: number): Promise<void> {
  const { activeId, select } = useDocuments()
  if (activeId.value === docId && currentPdf.value) {
    await goTo(pageNumber)
    return
  }
  pendingJumpPage = pageNumber
  if (activeId.value !== docId) select(docId)
}

export function usePdfViewer() {
  return {
    currentPdf,
    currentPage,
    numPages,
    setActive,
    bindCanvas,
    drawCurrent,
    prev,
    next,
    goTo,
    jumpToPage,
  }
}
```

- [ ] **Step 5.2 — Typecheck**

```bash
npx vue-tsc --noEmit 2>&1 | tail -3
```
Expected: clean apart from `useChat.ts` mismatch (fixed in Task 6).

- [ ] **Step 5.3 — Commit**

```bash
git add src/composables/usePdfViewer.ts
git commit -m "feat(m3): usePdfViewer.jumpToPage with cross-doc switch + queued jump"
```

---

## Task 6 — Rewrite `useChat` for retrieval + debounce + abort + citations (TDD)

**Files:**
- Modify: `src/composables/useChat.ts`
- Modify: `tests/composables/useChat.spec.ts`

This is the centerpiece of M3. New responsibilities:

1. Build `aliasToDocId` map and `contextSection` per send (with legend + citation instructions + chunk body).
2. Decide full-text vs retrieval based on token estimate.
3. Run BM25 search for the user query when retrieving.
4. Hand the final `contextSection` to `buildPayload`.
5. Debounce per-chunk Dexie writes to ~1 Hz; flush on stream close.
6. After stream close: post-process safety markers, parse citations, persist citations on the assistant `Message`.
7. Expose `abort()` and an `isStreaming` ref the input button reads.

New exported API:

```ts
interface UseChatReturn {
  messages: Ref<readonly Message[]>
  isTyping: Ref<boolean>          // true between send start and assistant message creation
  isStreaming: Ref<boolean>       // true between assistant message creation and stream close
  send(text: string): Promise<void>
  abort(): void                   // cancels in-flight stream; preserves partial text
  clear(): Promise<void>
}
```

- [ ] **Step 6.1 — Update `tests/composables/useChat.spec.ts`**

Append these new specs after the existing five (and update the "builds PDF context" spec to use the new context shape):

> Also extend the existing `beforeEach` to reset the retriever singleton so the retrieval test starts from a clean index:
>
> ```ts
> beforeEach(async () => {
>   // ... existing reset code
>   const { getRetriever } = await import('@/lib/retrieval/index')
>   getRetriever().__reset()
> })
> ```

```ts
// REPLACE the existing "builds PDF context from all attached docs" test with:
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

  let captured: any
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init: RequestInit) => {
      captured = JSON.parse(init.body as string)
      return new Response(makeSseStream(['data: [DONE]\n\n']), { status: 200 })
    }),
  )

  await useChat().send('q')

  const sys = captured.messages[0].content as string
  expect(sys).toMatch(/Attached documents:/)
  expect(sys).toMatch(/\[A\] A\.pdf/)
  expect(sys).toMatch(/\[B\] B\.pdf/)
  expect(sys).toMatch(/cite using the format \[A:p3\]/i)
  expect(sys).toContain('alpha alpha alpha')
  expect(sys).toContain('beta beta beta')
})

it('uses retrieval when total context exceeds FULL_CONTEXT_BUDGET', async () => {
  const { getRetriever, __setRetrieverForTests } = await import('@/lib/retrieval/index')
  const t = useThreads()
  // Build a big doc so totalChars / 4 > 16_000
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

  // Index it manually since the test bypasses useDocuments.importFiles.
  await getRetriever().indexDocument({
    id: docId,
    name: 'big.pdf',
    pages: (await db.documents.get(docId))!.pages,
  })

  const thread = await t.create({ docIds: [docId] })
  await t.select(thread.id!)

  let captured: any
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init: RequestInit) => {
      captured = JSON.parse(init.body as string)
      return new Response(makeSseStream(['data: [DONE]\n\n']), { status: 200 })
    }),
  )

  await useChat().send('newton inertia')

  const sys = captured.messages[0].content as string
  // Should contain page 1 (which matches) but NOT every page verbatim.
  expect(sys).toContain('newton inertia')
  // The full ~520k char dump would blow past the budget; we expect retrieval
  // to have trimmed it. Assert system prompt is well under the un-retrieved size.
  expect(sys.length).toBeLessThan(80_000)

  // Cleanup so other tests don't see the indexed doc
  __setRetrieverForTests(null)
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

  let chunkPushed = false
  const stream = new ReadableStream<Uint8Array>({
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
  vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { status: 200 })))

  const chat = useChat()
  const sendPromise = chat.send('hi')
  // Give the stream time to push the first chunk and create the assistant msg.
  await new Promise((r) => setTimeout(r, 50))
  chat.abort()
  await sendPromise

  const msgs = await db.messages.where('threadId').equals(thread.id!).toArray()
  const assistant = msgs.find((m) => m.role === 'assistant')!
  expect(assistant.text).toBe('partial...')
  expect(assistant.error).toBeFalsy()
  expect(chat.isStreaming.value).toBe(false)
})
```

> Keep the existing "persists user + assistant messages...", "refuses to send if no active thread", "refuses to send without an api key but still persists the user message", and "clear empties the active thread" specs as-is.

- [ ] **Step 6.2 — Rewrite `src/composables/useChat.ts`**

```ts
import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { db } from '@/lib/db'
import type { Document, Message } from '@/types/domain'
import { buildPayload } from '@/lib/llm/promptBuilder'
import { OPENROUTER_URL, openRouterHeaders } from '@/lib/llm/openrouter'
import { geminiUrl, geminiHeaders } from '@/lib/llm/gemini'
import { SseReader, extractDelta } from '@/lib/llm/streamParser'
import { getRetriever } from '@/lib/retrieval/index'
import { parseCitations } from '@/lib/citations'
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
  let totalChars = 0
  for (const d of docs) for (const p of d.pages) totalChars += p.text.length
  const estTokens = totalChars / 4

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
    docs.map((d) => `  [${docIdToAlias.get(d.id!)}] ${d.name} (${d.numPages} pages)`).join('\n')
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
  let aborted = false

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
      aborted = true
      // User-initiated abort vs timeout — discriminated by `activeAbort === null`
      // after the timeout fired. Either way, keep partial text.
      if (assistant) {
        const finalText = buffered.replace(/\n*(User|Response)\s*Safety\s*:\s*\w+/gi, '').trimEnd()
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
    // Silence unused-var warning while keeping the variable for readability.
    void aborted
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
```

- [ ] **Step 6.3 — Run tests, expect pass**

```bash
npm run test:run -- tests/composables/useChat.spec.ts
```
Expected: all 8 specs pass (5 existing + 3 new: legend/citations, retrieval, abort).

> If the abort spec is flaky in CI (timing-sensitive `await new Promise((r) => setTimeout(r, 50))`), bump to 100ms.

- [ ] **Step 6.4 — Commit**

```bash
git add src/composables/useChat.ts tests/composables/useChat.spec.ts
git commit -m "feat(m3): useChat with retrieval, debounced persist, abort, citation parsing"
```

---

## Task 7 — Wire retriever into `useDocuments` (import + delete)

**Files:**
- Modify: `src/composables/useDocuments.ts`

Two-line additions to `importFiles` and `deleteDoc`.

- [ ] **Step 7.1 — Update `src/composables/useDocuments.ts`**

In `importFiles`, after `documents.value = [persisted, ...documents.value]`, add:

```ts
const { getRetriever } = await import('@/lib/retrieval/index')
await getRetriever().indexDocument({ id, name: doc.name, pages: doc.pages })
```

In `deleteDoc`, after the transactional Dexie delete, add:

```ts
const { getRetriever } = await import('@/lib/retrieval/index')
await getRetriever().removeDocument(id)
```

> The dynamic imports keep `lib/retrieval` out of the cold start path of useDocuments callers that don't need it (tests, etc.). Tree-shakes cleanly under Vite.

- [ ] **Step 7.2 — Run tests; existing useDocuments specs should still pass**

```bash
npm run test:run -- tests/composables/useDocuments.spec.ts
```
Expected: 5 pass.

- [ ] **Step 7.3 — Commit**

```bash
git add src/composables/useDocuments.ts
git commit -m "feat(m3): wire retriever into useDocuments import + delete"
```

---

## Task 8 — Pre-index existing docs at app start

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 8.1 — Update `src/main.ts`**

```ts
import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'
import { initStore } from '@/lib/db'
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'
import { getRetriever } from '@/lib/retrieval/index'

await initStore()
const docs = useDocuments()
const threads = useThreads()
await Promise.all([docs.loadAll(), threads.loadAll()])
await getRetriever().indexAll(
  docs.documents.value.map((d) => ({ id: d.id!, name: d.name, pages: d.pages })),
)

createApp(App).mount('#app')
```

- [ ] **Step 8.2 — Build to confirm everything still resolves**

```bash
npm run build 2>&1 | tail -5
```
Expected: build succeeds.

- [ ] **Step 8.3 — Commit**

```bash
git add src/main.ts
git commit -m "feat(m3): pre-index existing docs into BM25 retriever at startup"
```

---

## Task 9 — Stop button in `ChatInput`

**Files:**
- Modify: `src/components/chat/ChatInput.vue`

The button morphs into a red Stop button while `isStreaming` is true.

- [ ] **Step 9.1 — Replace `src/components/chat/ChatInput.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  disabled: boolean
  streaming?: boolean
  placeholder?: string
}>()
const emit = defineEmits<{ send: [text: string]; stop: [] }>()

const value = ref('')

function submit() {
  if (props.streaming) {
    emit('stop')
    return
  }
  const text = value.value.trim()
  if (!text || props.disabled) return
  emit('send', text)
  value.value = ''
}
</script>

<template>
  <form
    class="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
    @submit.prevent="submit"
  >
    <div
      class="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl px-3 py-1 focus-within:ring-2 focus-within:ring-indigo-400/50 transition"
    >
      <input
        v-model="value"
        type="text"
        :disabled="props.disabled && !props.streaming"
        :placeholder="props.placeholder ?? 'Ask anything about the doc…'"
        class="flex-1 py-2.5 bg-transparent border-0 outline-none text-sm placeholder-zinc-400"
      />
      <button
        v-if="props.streaming"
        type="submit"
        class="p-2 rounded-lg bg-red-600 text-white hover:bg-red-700 shadow-sm transition-all duration-200"
        title="Stop"
      >
        <i class="fa-solid fa-stop text-xs"></i>
      </button>
      <button
        v-else
        type="submit"
        :disabled="!value.trim() || props.disabled"
        :class="[
          'p-2 rounded-lg transition-all duration-200',
          value.trim() && !props.disabled
            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm scale-100'
            : 'text-zinc-300 dark:text-zinc-600 scale-95 cursor-not-allowed',
        ]"
      >
        <i class="fa-solid fa-paper-plane text-xs"></i>
      </button>
    </div>
    <slot name="hint" />
  </form>
</template>
```

- [ ] **Step 9.2 — Commit**

```bash
git add src/components/chat/ChatInput.vue
git commit -m "feat(m3): Send/Stop toggle in ChatInput"
```

---

## Task 10 — Wire `isStreaming` + stop in `ChatPanel`

**Files:**
- Modify: `src/components/ChatPanel.vue`

- [ ] **Step 10.1 — Update `ChatPanel.vue`**

Change the `useChat()` destructure and the `<ChatInput>` usage:

```ts
const { messages, isTyping, isStreaming, send, clear, abort } = useChat()
```

```vue
<ChatInput :disabled="isTyping" :streaming="isStreaming" @send="onSend" @stop="abort">
  <template #hint>
    <p
      v-if="!isReady"
      class="text-[10px] text-amber-500 mt-2 flex items-center gap-1 px-1"
    >
      <i class="fa-solid fa-triangle-exclamation"></i>
      Add an API key in settings to enable AI responses
    </p>
  </template>
</ChatInput>
```

- [ ] **Step 10.2 — Typecheck**

```bash
npx vue-tsc --noEmit 2>&1 | tail -3
```

- [ ] **Step 10.3 — Commit**

```bash
git add src/components/ChatPanel.vue
git commit -m "feat(m3): wire isStreaming + abort through ChatPanel to ChatInput"
```

---

## Task 11 — Citation chip rendering in `ChatMessage` + styles

**Files:**
- Modify: `src/components/chat/ChatMessage.vue`
- Modify: `src/styles/main.css`

- [ ] **Step 11.1 — Replace `src/components/chat/ChatMessage.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, onUpdated, ref } from 'vue'
import type { Message as Msg } from '@/types/domain'
import { formatMessage } from '@/lib/format'
import { renderMath } from '@/lib/katex'
import { renderCitationsHtml } from '@/lib/citations'
import { useDocuments } from '@/composables/useDocuments'
import { usePdfViewer } from '@/composables/usePdfViewer'

const props = defineProps<{ msg: Msg }>()
const root = ref<HTMLElement | null>(null)

const { documents } = useDocuments()
const { jumpToPage } = usePdfViewer()

// For assistants: rewrite citation tokens to <button> chips BEFORE markdown.
// For users: skip — they don't emit citations.
const rendered = computed(() => {
  if (props.msg.role === 'user') return formatMessage(props.msg.text)
  const withChips = renderCitationsHtml(props.msg.text, props.msg.citations, documents.value)
  return formatMessage(withChips)
})

function paint() {
  if (root.value) renderMath(root.value)
}
onMounted(paint)
onUpdated(paint)

function onClick(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('button.citation-chip')
  if (!btn || btn.hasAttribute('disabled')) return
  e.preventDefault()
  const docId = Number.parseInt(btn.getAttribute('data-doc-id') ?? '', 10)
  const pageNumber = Number.parseInt(btn.getAttribute('data-page') ?? '', 10)
  if (Number.isFinite(docId) && Number.isFinite(pageNumber)) {
    void jumpToPage(docId, pageNumber)
  }
}
</script>

<template>
  <div class="msg-enter">
    <div v-if="props.msg.role === 'user'" class="flex justify-end">
      <div
        class="user-msg-prose max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-indigo-600 text-white text-sm shadow-sm"
      >
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div ref="root" v-html="rendered"></div>
      </div>
    </div>
    <div v-else class="flex justify-start gap-2.5">
      <div
        class="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0 mt-0.5"
      >
        <i class="fa-solid fa-robot text-[10px] text-zinc-500 dark:text-zinc-400"></i>
      </div>
      <div class="max-w-[85%]">
        <div
          class="px-4 py-2.5 rounded-2xl rounded-bl-md bg-zinc-100 dark:bg-zinc-800 text-sm prose dark:prose-invert prose-sm max-w-none"
        >
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div ref="root" v-html="rendered" @click="onClick"></div>
        </div>
        <div v-if="props.msg.error" class="flex items-center gap-1 mt-1 ml-1">
          <i class="fa-solid fa-circle-exclamation text-[10px] text-red-400"></i>
          <span class="text-[10px] text-red-400">Failed to get response</span>
        </div>
      </div>
    </div>
  </div>
</template>
```

> The click handler is on the assistant-rendered div only (user messages don't have citations).

- [ ] **Step 11.2 — Append citation-chip styles to `src/styles/main.css`**

Add at the bottom:

```css
.citation-chip {
  display: inline-flex;
  align-items: center;
  padding: 0 0.4rem;
  margin: 0 0.1rem;
  font-size: 0.72rem;
  line-height: 1.2;
  font-weight: 500;
  border-radius: 9999px;
  background: rgb(199 210 254); /* indigo-200 */
  color: rgb(67 56 202); /* indigo-700 */
  border: 1px solid rgb(165 180 252);
  cursor: pointer;
  vertical-align: baseline;
  text-decoration: none;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.citation-chip:hover {
  background: rgb(165 180 252); /* indigo-300 */
  color: rgb(49 46 129); /* indigo-900 */
}
.dark .citation-chip {
  background: rgba(99, 102, 241, 0.25);
  color: rgb(199 210 254);
  border-color: rgba(99, 102, 241, 0.45);
}
.dark .citation-chip:hover {
  background: rgba(99, 102, 241, 0.4);
}
.citation-chip.stale {
  background: rgb(228 228 231); /* zinc-200 */
  color: rgb(113 113 122); /* zinc-500 */
  border-color: rgb(212 212 216);
  cursor: not-allowed;
  text-decoration: line-through;
}
.dark .citation-chip.stale {
  background: rgba(82, 82, 91, 0.45);
  color: rgb(161 161 170);
  border-color: rgba(82, 82, 91, 0.7);
}
```

- [ ] **Step 11.3 — Typecheck + commit**

```bash
npx vue-tsc --noEmit 2>&1 | tail -3
git add src/components/chat/ChatMessage.vue src/styles/main.css
git commit -m "feat(m3): citation chip rendering in ChatMessage + styles"
```

---

## Task 12 — Full green pass

- [ ] **Step 12.1 — Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 12.2 — Lint**

```bash
npm run lint
```

- [ ] **Step 12.3 — Tests**

```bash
npm run test:run
```
Expected: all suites pass — should be ~52+ tests now (added 7 retrieval, 7 citations, ~3 new useChat specs).

- [ ] **Step 12.4 — Build**

```bash
npm run build
```

- [ ] **Step 12.5 — Commit any fixups**

```bash
git status
git add -A
git commit -m "chore(m3): fixups for typecheck/lint/tests/build" --allow-empty
```

---

## Task 13 — Manual walkthrough in browser

> Performed against `npm run dev` in the integrated browser. Uses the same fixture PDF; for the retrieval branch you'll want a longer real PDF (any paper > ~10 pages of text will do).

- [ ] **Step 13.1 — Start dev server**

```bash
npm run dev
```

- [ ] **Step 13.2 — Walk M1+M2 regression checklist** (everything must still work)

  - [ ] Sidebar still shows Documents + Recent threads.
  - [ ] Import PDF still works; default thread auto-creates; chat panel becomes usable.
  - [ ] Multi-doc threads still attach/detach.
  - [ ] Settings persist; doc + thread + messages persist across reload.

- [ ] **Step 13.3 — M3 new behavior**

  - [ ] Send a message with a real model (e.g. `openrouter/free`). Reply streams in.
  - [ ] Reply contains `[A:p3]`-style markers → renders as indigo chips inline (not raw `[A:p3]` text).
  - [ ] Hover chip → cursor changes to pointer; click chip → viewer jumps to that page (and switches active doc if necessary).
  - [ ] Reload page → previously-cited chips still render correctly (stored `citations` on `Message`).
  - [ ] Delete the cited doc → reload → chip becomes greyed `(removed) · p.N` with strikethrough; click does nothing.
  - [ ] Start a long reply → Send button morphs into red Stop button → click Stop → stream ends, partial text retained.
  - [ ] Import a large PDF (>~16k chars of text); ask a question; verify (via network panel or `console.log`) that the system prompt is significantly smaller than the full doc — retrieval is engaging.

- [ ] **Step 13.4 — Note and fix any regressions inline**, then commit:

```bash
git status
git add -A
git commit -m "fix(m3): walkthrough followups" --allow-empty
```

---

## Task 14 — Tag M3

- [ ] **Step 14.1 — Tag**

```bash
git tag -a m3-smart-context -m "M3: BM25 retrieval + citations + abort

Bm25Retriever (minisearch) with Retriever interface for future
embeddings drop-in. useChat decides full-text vs top-k per send,
builds legend + citation instructions, parses citations on stream
close, persists them on Message. CitationChip rendering via
event delegation; cross-doc jumpToPage. Send <-> Stop toggle on
the input. Per-chunk reactive updates with debounced Dexie
writes (1s)."
```

- [ ] **Step 14.2 — Summary**

```bash
git log --oneline | head -20
echo "---"
git tag --list
echo "---"
echo "M3 complete. M4/M5 are stretch milestones; spec it separately if/when desired."
```

---

## Definition of Done

- `npm run dev` opens the app and:
  - All M1+M2 behavior still works.
  - Assistant responses on doc-attached threads render with clickable citation chips.
  - Clicking a chip switches the viewer to the cited doc + jumps to the cited page.
  - Stale citations (deleted doc) render greyed-out with `(removed)` and don't navigate.
  - Sending mid-stream Stop preserves the partial assistant text without an error flag.
  - For docs whose total text would blow past `FULL_CONTEXT_BUDGET`, the outgoing system prompt is bounded (~ top-k chunks).
- `npm run typecheck` passes.
- `npm run lint` passes with no errors.
- `npm run test:run` passes (~52+ tests).
- `npm run build` produces a deployable `dist/`.
- Git history shows per-task commits and an `m3-smart-context` tag.

When all of the above are true, **M3 is done**. The original spec's M1+M2+M3 scope is complete.

---

## Risks & open questions

- **Streaming-persist UI lag.** Reactive updates are immediate (every chunk), but Dexie writes are throttled. If the tab is closed exactly during a 1s debounce window, the last seconds of an assistant message may be lost. Accepted tradeoff per spec §17.
- **Citation parsing depends on the model following the format.** Free-tier OpenRouter models sometimes hallucinate `[A:p999]` for pages that don't exist. `renderCitationsHtml` resolves the docName correctly but the page number won't actually be visible; clicking jumps to the closest valid page (clamped by `goTo`'s bounds check). M4 could add hover-preview to make this less confusing.
- **BM25 rebuild cost.** Re-indexing all docs at app start is O(total chunks). For typical libraries (< 1000 chunks) this is sub-100ms; spec §17 plans serialised index in M5 if it grows expensive.
- **Token estimate is chars/4.** Real tokenizers vary by model. The 16k budget has 25% headroom by design. Real tokenizer lands in M5.
- **`useChat` is now ~250 LoC.** Approaching the "this file is doing too much" threshold; M4 could split context-building into `lib/llm/context.ts`.
