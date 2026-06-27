# Notebook — M1 + M2 + M3 Design Spec

**Date:** 2026-06-27
**Status:** Draft — pending user review
**Repo:** `pdf-parser` (UI brand: **Notebook**)
**Scope:** Refactor to Vite + TypeScript + Vue SFCs, add IndexedDB persistence, add BM25 retrieval + citations.

---

## 1. Summary

Today the project is a single ~450-line `index.html` using Vue 3 + Tailwind + PDF.js via CDN. PDFs and chat live in memory only; the full document text is re-extracted and re-sent on **every** chat message, hard-truncated at 80,000 characters; a single chat is shared across all imported docs (switching docs does not switch the chat).

This spec covers three coupled milestones that together rebuild the app on a modular foundation, persist user state across reloads, and make the chat smart about which pages it cites:

- **M1 — Foundation refactor.** Vite + TypeScript + Vue 3 SFCs + Vitest. Module boundaries between pure logic (`lib/`), reactive glue (`composables/`), and presentation (`components/`). **Behavior parity** with today at ship.
- **M2 — Persistence + multi-doc threads.** IndexedDB via Dexie for PDFs (binary + extracted text + metadata) and chat threads (many-to-many with docs). One default thread per doc; users can attach additional docs to any thread.
- **M3 — Smart context.** Extract once on import (no per-message re-extraction). Page-aware chunking. BM25 retrieval via `minisearch` behind a `Retriever` interface that drops in embeddings later. Citation chips: model emits `[A:p3]`, UI renders `[ResearchPaper · p.3]`, click switches active doc and jumps to the page. Abort button cancels in-flight streams.

The app stays **100% frontend** at all times. No backend, no proxy, no server runtime. LLM requests go browser → OpenRouter or Gemini directly using a user-supplied key in `localStorage`, identical to today.

---

## 2. Goals

- Modular, testable codebase with no user-visible behavior change at v1 ship (M1).
- Persist PDFs and chat across browser refresh (M2).
- Let one chat thread reference 1+ PDFs (M2).
- Cite specific pages; clicking a citation jumps the viewer (M3).
- Cancel in-flight chat cleanly (M3).
- Stop re-extracting and re-sending the whole document on every message (M3).

## 3. Non-goals (deferred)

| Item | Milestone |
|---|---|
| Mobile-responsive layout | M4 |
| Zoom, keyboard nav, in-PDF text search | M4 |
| Doc rename, hover-preview citations, multiple named threads per doc | M4 |
| Quick-prompt chips, chat export, configurable abort timeout | M4 |
| Tesseract.js OCR for scanned PDFs | M5 |
| Provider-API or local-WASM embedding retriever | M5 |
| Serialised minisearch index in Dexie | M5 |
| PWA + offline shell | M5 |
| Real tokenizer (currently `chars / 4`) | M5 |
| Account system, sync, sharing | out of scope entirely |

## 4. Constraints

- **Frontend-only.** No backend services. No request proxy. Build output is static, deployable to any static host (or Valet's `public/`).
- Vue 3 + Composition API + SFCs.
- Tailwind v3 (preserves today's semantics).
- Existing localStorage keys (`api_key`, `provider`, `model`, `dark_mode`) must continue to work — zero-friction upgrade for current users.
- API key stays in browser. Same trust model as today.

---

## 5. Tooling

| Concern | Decision |
|---|---|
| Build | Vite |
| Language | TypeScript |
| UI framework | Vue 3 + SFC + Composition API |
| State | Composables + `provide/inject`. No Pinia for v1. |
| Styles | Tailwind v3 via official PostCSS plugin (drops the CDN script). |
| Persistence | Dexie.js (typed wrapper over IndexedDB). |
| Search | minisearch (BM25). |
| Markdown / sanitize / math | `marked`, `DOMPurify`, `KaTeX` (npm). |
| Icons | `@fortawesome/fontawesome-free` (npm). |
| Tests | Vitest + `@vue/test-utils` (component tests deferred to M4). |
| Lint / format | ESLint flat config + Prettier. |
| Router | None (single page). |

Every CDN `<script>` is removed. PDF.js worker is imported via `?url` so Vite emits it as a versioned asset.

---

## 6. File layout

```
src/
  main.ts                          app entry
  App.vue                          3-pane layout shell
  components/
    AppSidebar.vue                 docs section + threads section
    PdfViewer.vue                  canvas + page nav + jumpToPage host
    ChatPanel.vue                  header + settings + messages + input
    chat/
      ChatMessage.vue              markdown + CitationChip replacement
      ChatInput.vue                send / stop button
      TypingIndicator.vue
      AttachedDocsBar.vue          chips for active thread's docs
      CitationChip.vue
    ui/
      Toast.vue
  composables/
    useDocuments.ts                import, list, activate, delete
    useThreads.ts                  create, switch, attach/detach docs
    useChat.ts                     send, stream, abort
    useSettings.ts                 provider / key / model / dark
    useToasts.ts
    usePdfViewer.ts                render + jumpToPage event bus
  lib/
    db.ts                          Dexie schema + instance
    pdf.ts                         load, render, extractTextByPage
    retrieval/
      types.ts                     Retriever interface
      bm25.ts                      minisearch impl
      index.ts                     factory + default instance
    llm/
      types.ts                     LlmClient interface
      openrouter.ts
      gemini.ts
      promptBuilder.ts             system prompt + legend + branch logic
      streamParser.ts              SSE → text chunks (both providers)
    citations.ts                   parse [A:pN] tokens; alias → docId
    format.ts                      marked + DOMPurify
  styles/
    main.css                       Tailwind directives + scrollbar/anim
  types/
    domain.ts                      Document, Thread, Message, Chunk, Citation
tests/
  fixtures/sample.pdf              committed, <30 KB
  retrieval/bm25.spec.ts
  lib/citations.spec.ts
  lib/promptBuilder.spec.ts
  lib/streamParser.spec.ts
  lib/pdf.spec.ts
  composables/useThreads.spec.ts
index.html                         Vite entry (replaces the current monolith)
vite.config.ts
tsconfig.json
package.json
postcss.config.js
tailwind.config.ts
eslint.config.js
.prettierrc
```

**Module rules:**

- `lib/` is pure TypeScript. No Vue imports. Unit-testable in isolation.
- `composables/` glues `lib/` to Vue reactivity. This is where Dexie, `fetch`, and `AbortController` live.
- `components/` is presentational + thin glue. No direct `lib/` calls except via composables.

---

## 7. Data model

```ts
// src/types/domain.ts
export interface PageText {
  pageNumber: number
  text: string
}

export interface Citation {
  docId: number
  pageNumber: number
}

export interface Document {
  id?: number                        // auto-increment
  name: string
  size: number                       // bytes
  numPages: number
  pages: PageText[]                  // extracted once on import
  addedAt: number                    // epoch ms
}

export interface DocumentBlob {
  docId: number                      // PK; FK → documents.id
  blob: Blob                         // PDF binary, lazy-loaded
}

export interface Thread {
  id?: number
  name: string                       // default = primary doc name
  docIds: number[]                   // multi-entry indexed; first = primary
  createdAt: number
  updatedAt: number
}

export interface Message {
  id?: number
  threadId: number
  role: 'user' | 'assistant'
  text: string
  citations?: Citation[]             // parsed at receive time; stored for re-render
  createdAt: number
  error?: boolean
}
```

### Dexie schema

```ts
// src/lib/db.ts (sketch)
db.version(1).stores({
  documents:     '++id, addedAt',
  documentBlobs: 'docId',
  threads:       '++id, updatedAt, *docIds',        // *docIds = multiEntry
  messages:      '++id, threadId, [threadId+createdAt]',
})
```

**Index rationale:**

- `documents.addedAt` — sidebar sort.
- `threads.updatedAt` — "Recent threads" sort.
- `threads.*docIds` — reverse lookup ("which threads contain doc X") for delete cascade.
- `messages.[threadId+createdAt]` — ordered fetch of a thread's messages.

**Why split `documentBlobs`:** sidebar list reads from `documents` constantly; pulling every PDF binary on each list render is wasteful. The blob is fetched only when the viewer activates a doc.

**Why `pages` inline on `Document`:** retrieval always reads all pages of attached docs together; a separate `pages` table buys nothing and adds joins.

### Thread "primary doc"

`docIds[0]` is the **primary doc** — what the viewer shows when the thread becomes active. Set at thread creation (whichever doc was active). Detaching the primary doc shifts `docIds[1]` into the primary position. If the thread becomes empty, the viewer falls back to its "Select a document" empty state but the thread remains usable for general Q&A.

### Cascade on doc delete

1. Drop `documentBlobs` row.
2. Drop `documents` row (drops `pages` with it).
3. `retriever.removeDocument(id)`.
4. For each thread containing the doc: `docIds = docIds.filter(x => x !== id)`. Threads with zero docs survive as text-only conversations; their stale citation chips render as inert greyed text with tooltip `"document removed"`.

---

## 8. PDF lifecycle

### Import

1. User picks one or more files.
2. For each file: create `Document` row with metadata + empty `pages`, plus `DocumentBlob` row with the binary.
3. Background task per doc: extract text per page via PDF.js → update `document.pages`.
4. Background task per doc: `retriever.indexDocument({ id, name, pages })`.
5. Sidebar shows a per-doc indexing spinner during steps 3–4. Chat send works mid-indexing: it uses whatever pages exist, falling back to full-text mode for small docs.

### Open

- Click doc → set `activeDocId` → load blob lazily from `documentBlobs` → render via PDF.js → switch chat to that doc's default thread (creating it on first open).

### Render

- `usePdfViewer` keeps the current `PDFDocumentProxy`, the current page, and exposes `prev` / `next` / `jumpToPage(docId, pageNumber)`. `jumpToPage` activates the doc if needed, then scrolls.

---

## 9. Retrieval

### Decision rule (per send)

```
attached = activeThread.docIds
allChunks = concat(doc.pages for doc in attached)         // page-as-chunk
estimate  = sum(chunk.text.length) / 4                    // ~tokens

if estimate <= FULL_CONTEXT_BUDGET (default 16_000):
    context = allChunks                                   // send everything
else:
    context = retriever.search(userMessage, {
        docIds: attached,
        topK:   8,
    })
    // sort context back to (docId, pageNumber) order for readability
```

`FULL_CONTEXT_BUDGET` and `topK` are named constants in `lib/llm/promptBuilder.ts` for easy tuning.

### `Retriever` interface

```ts
// src/lib/retrieval/types.ts
export interface RetrievedChunk {
  docId: number
  docName: string
  pageNumber: number
  text: string
  score: number
}

export interface Retriever {
  indexDocument(doc: {
    id: number
    name: string
    pages: PageText[]
  }): Promise<void>
  removeDocument(docId: number): Promise<void>
  search(query: string, opts: {
    docIds: number[]
    topK: number
  }): Promise<RetrievedChunk[]>
}
```

### BM25 implementation

- Single global `MiniSearch` instance.
- Per-chunk record: `{ id: \`${docId}:${pageNumber}\`, docId, pageNumber, text }`.
- `indexDocument` removes any existing chunks for that `docId` first, then re-adds.
- `search` uses minisearch's `filter` option to scope to `docIds`.
- Index is rebuilt lazily on first use after app start by streaming all `documents.pages` from Dexie. Estimated cost: a few hundred ms for typical libraries; if it grows expensive we serialise to Dexie (M5).

### Future embeddings retriever (M5)

Same interface. Implementation calls a Gemini/OpenRouter embeddings endpoint on `indexDocument`, stores `Float32Array` vectors in a dedicated Dexie table, runs cosine similarity on `search`. Call sites do not change.

---

## 10. Citations

### Format the model emits

The system prompt embeds a per-doc legend at build time:

```
Attached documents:
  [A] ResearchPaper.pdf (12 pages)
  [B] Notes.pdf (4 pages)

When you reference these documents, cite using the format [A:p3] or [B:p1].
Cite the specific page that supports your statement. Do not invent pages.
```

Aliases are assigned in attached-order: `A`, `B`, `C`, …. For >26 docs we fall back to two-letter aliases (`AA`, `AB`); not a v1 concern.

### Parsing

`src/lib/citations.ts` exports `parseCitations(text, aliasMap)`:

- Regex: `/\[([A-Z]{1,2}):p(\d+)\]/g`
- Returns `{ text, citations: Citation[] }`.
- Tokens with unknown alias or invalid page are left as plain text.
- `aliasMap` is the alias → `docId` mapping used when the message was sent.

### Storage

Each `Message` stores `citations: Citation[]` (concrete `docId` + `pageNumber`) for re-render fidelity. Aliases are throwaway — they exist only inside one send.

### Rendering

`ChatMessage.vue`:

1. Render markdown → HTML via `format.ts`.
2. Walk text nodes; replace citation tokens with `<CitationChip>`.
3. `CitationChip.vue` props: `{ docId, docName, pageNumber }`. Renders `[DocName · p.N]`. Click → `usePdfViewer.jumpToPage(docId, pageNumber)`.
4. Stale (doc deleted): chip greys out with tooltip `"document removed"`; click is a no-op.

---

## 11. Chat lifecycle

### Send

1. Push user message to the active thread (Dexie + reactive state).
2. Build the payload in `promptBuilder.ts`:
   - System prompt with identity ("You are Notebook…").
   - Doc legend (if any docs attached).
   - Context block (full text or top-k chunks per §9).
   - Prior thread messages (user/assistant turns).
3. Open `AbortController`; stash on `useChat.activeAbort`. UI swaps Send → Stop.
4. POST stream to provider via `LlmClient`; parse SSE chunks via `streamParser`.
5. Stream into a placeholder assistant `Message`; persist to Dexie **every 1s during the stream and once on close**.
6. On close: post-process — strip safety-metadata artefacts (kept from today), parse citations against the legend used in step 2.
7. Clear `activeAbort`. UI swaps Stop → Send.

### Abort

- Click Stop → `controller.abort()` → fetch rejects with `AbortError`.
- The partial assistant message is **kept as-is** (no `error` flag), citations parsed on whatever streamed.

### Errors

- HTTP non-2xx: parse the error body, surface the message in chat with `error: true`, plus a toast.
- 60-second timeout: existing safety net; same handling as user-initiated abort but with `error: true` and a "Request timed out" toast.
- Empty stream: insert "I received an empty response. Please try again." with `error: true`.

### Edge states

- **No key on send:** auto-open settings drawer + toast. Message is **not** sent. (Today's behavior preserved.)
- **No doc attached to thread:** system prompt switches to "general Q&A; no document context." (Today's behavior preserved.)
- **Doc still extracting at send time:** uses whatever pages exist. If zero pages: include `"(text not yet extracted)"` placeholder; the model can still answer from general knowledge.

---

## 12. UI components

### Layout

3-column grid identical to today:

```
[sidebar 288px] [viewer 1fr] [chat panel 384px]
```

### `AppSidebar.vue`

- **Documents** section — name, page count, indexing spinner, hover-× delete. Click → activate doc.
- **+ New thread** button — creates a thread containing the active doc, sets it active.
- **Recent threads** section — sorted desc by `updatedAt`. Each row shows thread name + a row of doc-name chips (max 3 + `…+N`). Click → activate thread + viewer switches to primary doc.

### `PdfViewer.vue`

Same as today: canvas, prev/next, page indicator. Exposes `jumpToPage(n)` for citation clicks. Listens for the jump event bus exposed by `usePdfViewer`.

### `ChatPanel.vue`

- Header — thread name (read-only in M1–M3; inline rename lands in M4), settings gear, clear-thread button.
- **`AttachedDocsBar`** above messages — chips for each attached doc with `×` to detach; `+` opens a picker over the library.
- Settings drawer — same fields as today (provider, key, model).
- Messages list — `ChatMessage` components.
- **`ChatInput`** — Send button toggles to **Stop** (same shape, red) while a stream is in flight.

### Empty states

| State | Sidebar | Viewer | Chat |
|---|---|---|---|
| Fresh app, no docs | "Import your first PDF" CTA | "Import a PDF to get started" | hidden |
| Docs imported, none active | doc list | "Select a document" | hidden |
| Active doc, default thread auto-created | doc highlighted | rendering | "Ask anything about *DocName*" |
| Active multi-doc thread | primary doc highlighted | primary doc rendered | "Ask anything about *DocA*, *DocB*" |
| Active thread, all docs deleted | doc list | "Select a document" | thread visible; nudge "This conversation's documents were removed" |

---

## 13. Settings & migration

- `useSettings` reads existing `api_key`, `provider`, `model`, `dark_mode` from `localStorage` on first run. No migration code needed.
- Going forward, `useSettings` writes through the same keys.
- Settings are **not** moved to Dexie — keeps "clear site data" a single-step reset for users worried about the key.

---

## 14. Testing strategy

**Unit (ship in M3):**

- `tests/retrieval/bm25.spec.ts` — index/remove/search; multi-doc filter; topK ordering; reindex replaces old chunks for that docId.
- `tests/lib/citations.spec.ts` — alias→docId mapping; malformed tokens ignored; stale-doc degradation.
- `tests/lib/promptBuilder.spec.ts` — legend correctness; full-text vs retrieve branch boundary; no-doc fallback; identity line preserved.
- `tests/lib/streamParser.spec.ts` — OpenRouter + Gemini SSE chunking; partial-line buffering; `[DONE]`; malformed JSON ignored.
- `tests/lib/pdf.spec.ts` — `extractTextByPage` against `tests/fixtures/sample.pdf` (committed; <30 KB).

**Composable:**

- `tests/composables/useThreads.spec.ts` — create; attach/detach; default-thread-per-doc convention; delete cascade.

**Out of scope for this spec:**

- Component-render tests (Vue Test Utils) — land in M4 alongside UX polish.
- E2E tests — not in this roadmap.
- Coverage gate in CI — not in v1.

---

## 15. PR sequence

This spec ships as **three PRs**, in order:

### PR 1 — M1: Foundation refactor (behavior parity)

- Scaffold Vite + TS + Vue SFCs alongside the existing `index.html`.
- Recreate today's UI and behavior in the new layout with **in-memory state only** (no Dexie yet).
- Vendor libs moved from CDN to npm; PDF.js worker via `?url`.
- Vitest + ESLint + Prettier scaffolded; one smoke test passing.
- Delete old `index.html` once parity is confirmed manually.
- **DoD:** import → view → chat behaves exactly as the current app.

### PR 2 — M2: Persistence + multi-doc threads

- Add Dexie schema + composables (`useDocuments`, `useThreads`).
- Swap in-memory state for Dexie-backed state.
- Sidebar gets two sections; `AttachedDocsBar`, "New thread" button, attach/detach picker, doc delete with cascade.
- **DoD:** import a PDF, refresh — it's still there. Create a thread with two PDFs attached, refresh — thread + messages persist.

### PR 3 — M3: Smart context

- Extract-once cache on import.
- `Retriever` interface + minisearch BM25 impl + retrieval-vs-full-text branch in `promptBuilder`.
- Citation legend in system prompt; `parseCitations`; `CitationChip` rendering; viewer `jumpToPage` wiring.
- Abort button + `AbortController` plumbing.
- **DoD:** import a long PDF (>~16k token), ask a page-specific question, get a cited answer, click the citation, viewer jumps to the cited page. Click Stop mid-stream — partial text is preserved without an error.

---

## 16. Build & runtime

- `npm run dev` — Vite dev server (HMR).
- `npm run build` — static `dist/`.
- `npm run preview` — local preview of the production build.
- `npm test` — Vitest watch.
- `npm run test:run` — single-shot.
- `npm run lint` / `npm run format`.

Valet (or any static host) serves `dist/`.

---

## 17. Risks & open questions

| Risk | Mitigation |
|---|---|
| PDF.js worker setup under Vite is finicky | Use `?url` import; verify in M1. Fallback: copy worker to `/public`. |
| `minisearch` cold rebuild slow with large libraries | Measure in M3. If > 500 ms at app start, serialise the index to Dexie (M5). |
| Token estimate `chars/4` misses real budget | 25% safety buffer on `FULL_CONTEXT_BUDGET`. Real tokenizer in M5. |
| Tailwind v3 vs v4 churn | Pin v3 explicitly in `package.json`. |
| Large PDFs (>50 MB) bloat IndexedDB | Per-doc size displayed; max is browser quota; quota-exceeded toast on import failure. Durable-storage request defers to M4. |
| Browser may evict IndexedDB under quota pressure | Wrap import in try/catch; surface a toast; document as known limitation. |
| Streaming-persist debouncing may drop the last chunks on tab close | Persist every 1s during the stream + once on close; accept the rare loss-of-tail. |

---

## 18. Future work (sketched for context only)

- **M4 — UX polish:** mobile drawer, zoom + page thumbnails, keyboard shortcuts (← → for pages, ⌘K to focus chat), doc rename, hover-citation preview, in-PDF text search, quick-prompt chips, chat export (markdown), configurable timeout, durable-storage request, component-render tests.
- **M5 — Stretch:** Tesseract.js OCR for scanned PDFs, transformers.js local embeddings as `EmbeddingsRetriever`, serialised minisearch index in Dexie, PWA + offline shell, real tokenizer, multiple named threads per doc, library-wide search across all docs.
