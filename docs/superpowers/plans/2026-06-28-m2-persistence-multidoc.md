# Notebook — M2 Persistence + Multi-Doc Threads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace M1's in-memory document/chat state with IndexedDB-backed persistence (via Dexie), introduce many-to-many chat threads ↔ documents (one or more docs can be referenced in the same chat), and add the supporting UI (per-doc default thread, "+ New thread", attach/detach docs, doc delete with cascade).

**Architecture:**

- **`src/lib/db.ts`** — Dexie schema (`documents`, `documentBlobs`, `threads`, `messages`) with index strategy per §7 of the spec. Singleton instance imported by composables. Tests use `fake-indexeddb` for in-memory IDB under jsdom.
- **Composables** — `useDocuments` switches from `ref<PdfDocument[]>` to Dexie-backed; new `useThreads` owns thread CRUD + active-thread state + per-doc default-thread convention; `useChat` reads/writes messages from/to the active thread's row.
- **Components** — `AppSidebar` splits into a `DocList` section (with hover-delete) and a `ThreadList` section (sorted by `updatedAt`, doc-name chips, click to activate). `ChatPanel` gains an `AttachedDocsBar` (chip row of attached docs with `×` to detach + `+` to attach via a `DocPicker` dropdown). Header shows the active thread name (read-only in M2).
- **PDF lifecycle** — On import, persist binary to `documentBlobs`, persist metadata + extracted page text to `documents`. Viewer fetches blob lazily from `documentBlobs` on activation. `ChatPanel` now reads pre-extracted `pages` from the active thread's attached docs instead of re-extracting from the blob on every send.
- **Cascade on doc delete** — Drop blob → drop document → for each thread containing the doc, remove the id from `docIds` (threads with empty `docIds` survive as text-only).

> **Note on extract-once cache:** §15 of the spec calls out "extract-once cache on import" as an M3 task, but §7 puts `pages: PageText[]` on the `Document` row in the M2 schema. The pragmatic split: M2 populates `pages` on import (filling the schema) and stops the per-send re-extraction. M3 wraps a `Retriever` around those already-extracted pages and decides full-text-vs-top-k context.

**Tech Stack additions:** `dexie@^4.0`, `fake-indexeddb@^6.0`. No other new runtime deps.

**Reference for current behavior:** `git show m1-foundation:src/composables/useChat.ts` etc. — M1 is the baseline that M2 must preserve all user-facing behavior of, *plus* the new persistence + multi-doc semantics.

---

## File Structure (created/modified in M2)

**Created:**

```
src/
  lib/
    db.ts                            Dexie schema + instance
  composables/
    useThreads.ts                    create/switch/attach/detach/delete + active state
  components/
    sidebar/
      DocItem.vue                    doc row + delete-on-hover
      DocList.vue                    section wrapping DocItem rows
      ThreadItem.vue                 thread row + doc-name chips
      ThreadList.vue                 section wrapping ThreadItem rows
    chat/
      AttachedDocsBar.vue            chips + attach picker trigger
      DocPicker.vue                  dropdown of unattached library docs
tests/
  lib/
    db.spec.ts
  composables/
    useDocuments.spec.ts             (new — wasn't tested in M1)
    useThreads.spec.ts
```

**Modified:**

```
src/
  types/domain.ts                    add Document, DocumentBlob, Thread, Message, PageText, Citation
  composables/
    useDocuments.ts                  Dexie-backed; extracts pages on import
    useChat.ts                       reads/writes via active thread; uses stored pages
    usePdfViewer.ts                  setActive takes a Promise<Blob | null> instead of ArrayBuffer
  components/
    AppSidebar.vue                   wraps DocList + ThreadList + New-Thread button
    ChatPanel.vue                    uses active thread; AttachedDocsBar; no per-send extract
    PdfViewer.vue                    unchanged (canvas binding stays the same)
  main.ts                            await initStore() before mount
tests/
  composables/useChat.spec.ts        update for new signature + thread persistence
  setup.ts                           install fake-indexeddb for IDB tests
```

**Deleted:** none. `PdfDocument` interface is removed in favor of `Document` + `DocumentBlob`.

---

## Task 1 — Install Dexie + fake-indexeddb

**Files:**
- Modify: `package.json`, `package-lock.json`, `tests/setup.ts`

- [ ] **Step 1.1 — Install runtime dep**

```bash
cd /Users/aminsadiq/Desktop/ValetProjects/pdf-parser
npm install dexie@^4.0
```

- [ ] **Step 1.2 — Install test dep**

```bash
npm install -D fake-indexeddb@^6.0
```

- [ ] **Step 1.3 — Wire `fake-indexeddb` into `tests/setup.ts`**

Append to the existing `tests/setup.ts`:

```ts
// IndexedDB shim for Dexie tests. Reset between specs is done per-test by
// dropping the DB; see lib/db.spec.ts for the helper.
import 'fake-indexeddb/auto'
```

- [ ] **Step 1.4 — Run existing tests to confirm nothing broke**

```bash
npm run test:run
```
Expected: still 26/26 passing.

- [ ] **Step 1.5 — Commit**

```bash
git add package.json package-lock.json tests/setup.ts
git commit -m "chore(m2): add dexie + fake-indexeddb"
```

---

## Task 2 — Extend domain types

**Files:**
- Modify: `src/types/domain.ts`

- [ ] **Step 2.1 — Rewrite `src/types/domain.ts`**

```ts
// Domain types for M2. Citation type lands now but isn't populated until M3.

export type Provider = 'openrouter' | 'gemini'

export interface PageText {
  pageNumber: number
  text: string
}

export interface Citation {
  docId: number
  pageNumber: number
}

/** Document metadata + extracted page text. Binary lives in DocumentBlob. */
export interface Document {
  id?: number                        // auto-increment in Dexie
  name: string
  size: number                       // bytes
  numPages: number
  pages: PageText[]                  // populated on import (background)
  addedAt: number                    // epoch ms
}

/** PDF binary, separated so listing documents doesn't load every blob. */
export interface DocumentBlob {
  docId: number                      // primary key, FK to Document.id
  blob: Blob
}

/** Many-to-many: a thread references 0+ documents; a document can be in many threads. */
export interface Thread {
  id?: number
  name: string                       // default = primary doc name
  docIds: number[]                   // multiEntry indexed; docIds[0] = primary doc
  createdAt: number
  updatedAt: number
}

export interface Message {
  id?: number
  threadId: number
  role: 'user' | 'assistant'
  text: string
  citations?: Citation[]             // M3 populates this
  createdAt: number
  error?: boolean
}

/** UI-only toast notification. */
export interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
  leaving?: boolean
}
```

> `PdfDocument` from M1 is intentionally removed. Any importer must switch to `Document`.

- [ ] **Step 2.2 — Verify nothing else compiles yet (expected: many errors)**

```bash
npx vue-tsc --noEmit
```
Expected: errors in `useDocuments.ts`, `usePdfViewer.ts`, `useChat.ts`, `AppSidebar.vue`, `PdfViewer.vue`, `ChatPanel.vue`. These get fixed in later tasks. **Do not commit yet** — wait until Task 6 brings useDocuments back online.

> If this feels unsafe, you may temporarily comment-out the broken imports to keep `npx vue-tsc` green and re-enable them per-task. Either approach is fine; the chain reaches green again by Task 14.

- [ ] **Step 2.3 — Commit the types** (typecheck failures are expected and tracked by subsequent tasks)

```bash
git add src/types/domain.ts
git commit -m "feat(m2): add domain types for Dexie persistence + threads

Document, DocumentBlob, Thread, Message, PageText, Citation.
Removes the M1 PdfDocument type — subsequent tasks rewire callers."
```

---

## Task 3 — Create `lib/db.ts` Dexie schema

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 3.1 — Create `src/lib/db.ts`**

```ts
import Dexie, { type Table } from 'dexie'
import type { Document, DocumentBlob, Thread, Message } from '@/types/domain'

class NotebookDB extends Dexie {
  documents!: Table<Document, number>
  documentBlobs!: Table<DocumentBlob, number>
  threads!: Table<Thread, number>
  messages!: Table<Message, number>

  constructor() {
    super('notebook')
    this.version(1).stores({
      documents:     '++id, addedAt',
      documentBlobs: 'docId',
      threads:       '++id, updatedAt, *docIds',
      messages:      '++id, threadId, [threadId+createdAt]',
    })
  }
}

export const db = new NotebookDB()

/**
 * Optional pre-warm: opens the database explicitly so the first composable
 * call does not race with schema setup. Safe to call multiple times.
 */
export async function initStore(): Promise<void> {
  if (!db.isOpen()) await db.open()
}
```

> The `*docIds` multiEntry index lets us answer "which threads contain doc X" in O(log n) for the cascade.

- [ ] **Step 3.2 — Commit**

```bash
git add src/lib/db.ts
git commit -m "feat(m2): add Dexie schema + initStore"
```

---

## Task 4 — Test `lib/db.ts` (TDD-after — verify schema works under fake-indexeddb)

**Files:**
- Create: `tests/lib/db.spec.ts`

- [ ] **Step 4.1 — Write the test**

```ts
// tests/lib/db.spec.ts
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
      name: 'b.pdf', size: 1, numPages: 1, pages: [], addedAt: Date.now(),
    })
    await db.documentBlobs.put({ docId, blob: new Blob(['hi'], { type: 'application/pdf' }) })
    const blob = await db.documentBlobs.get(docId)
    expect(blob?.blob.size).toBe(2)
  })

  it('threads support multiEntry docIds index for reverse lookup', async () => {
    const t1 = await db.threads.add({
      name: 'A', docIds: [10, 20], createdAt: 1, updatedAt: 1,
    })
    const t2 = await db.threads.add({
      name: 'B', docIds: [20], createdAt: 2, updatedAt: 2,
    })
    const containing20 = await db.threads.where('docIds').equals(20).primaryKeys()
    expect(containing20.sort()).toEqual([t1, t2].sort())
    const containing10 = await db.threads.where('docIds').equals(10).primaryKeys()
    expect(containing10).toEqual([t1])
  })

  it('messages can be fetched ordered by createdAt within a thread', async () => {
    const threadId = await db.threads.add({
      name: 'T', docIds: [], createdAt: 0, updatedAt: 0,
    })
    await db.messages.add({ threadId, role: 'user',      text: 'hi',     createdAt: 1 })
    await db.messages.add({ threadId, role: 'assistant', text: 'hello',  createdAt: 2 })
    await db.messages.add({ threadId, role: 'user',      text: 'thanks', createdAt: 3 })
    const all = await db.messages
      .where('[threadId+createdAt]')
      .between([threadId, 0], [threadId, Infinity])
      .toArray()
    expect(all.map((m) => m.text)).toEqual(['hi', 'hello', 'thanks'])
  })
})
```

- [ ] **Step 4.2 — Run, expect pass**

```bash
npm run test:run -- tests/lib/db.spec.ts
```
Expected: 4 tests pass.

- [ ] **Step 4.3 — Commit**

```bash
git add tests/lib/db.spec.ts
git commit -m "test(m2): cover Dexie schema basics + multiEntry index"
```

---

## Task 5 — Rewrite `usePdfViewer` to accept a `Blob` (preparing for blob-based load)

**Files:**
- Modify: `src/composables/usePdfViewer.ts`
- Modify: `src/lib/pdf.ts` (add `loadPdfFromBlob` helper)

The current `setActive(data: ArrayBuffer | null)` is incompatible with Dexie blobs. We pivot to a `setActive(blob: Blob | null)` signature.

- [ ] **Step 5.1 — Extend `src/lib/pdf.ts`**

Add these at the bottom of `src/lib/pdf.ts` (do not touch `loadPdf` — it stays for tests):

```ts
/** Load a PDF from a Blob (used by the viewer; Blob comes from Dexie). */
export async function loadPdfFromBlob(blob: Blob): Promise<pdfjsLib.PDFDocumentProxy> {
  const ab = await blob.arrayBuffer()
  return loadPdf(ab)
}

/** One-pass load + extract used by useDocuments on import. */
export async function readPdf(data: ArrayBuffer): Promise<{ numPages: number; pages: PageText[] }> {
  const pdf = await loadPdf(data)
  const pages: PageText[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
    if (text.trim()) pages.push({ pageNumber: i, text })
  }
  return { numPages: pdf.numPages, pages }
}
```

- [ ] **Step 5.2 — Switch `usePdfViewer.setActive`**

Replace the signature and body of `setActive` in `src/composables/usePdfViewer.ts`:

```ts
import { loadPdfFromBlob } from '@/lib/pdf'

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
```

Remove the now-unused `loadPdf` import; replace with `loadPdfFromBlob`.

- [ ] **Step 5.3 — Typecheck (errors expected upstream; just verify pdf.ts/usePdfViewer compile in isolation)**

```bash
npx vue-tsc --noEmit 2>&1 | grep -E 'pdf\.ts|usePdfViewer'
```
Expected: no errors mentioning `lib/pdf.ts` or `composables/usePdfViewer.ts`.

- [ ] **Step 5.4 — Commit**

```bash
git add src/lib/pdf.ts src/composables/usePdfViewer.ts
git commit -m "refactor(m2): usePdfViewer takes Blob; add loadPdfFromBlob"
```

---

## Task 6 — Rewrite `useDocuments` on Dexie (TDD)

**Files:**
- Modify: `src/composables/useDocuments.ts`
- Create: `tests/composables/useDocuments.spec.ts`

This task replaces the entire module. The new API:

```ts
interface UseDocumentsReturn {
  documents: Ref<readonly Document[]>           // sorted by addedAt desc
  activeId: Ref<number | null>
  activeDoc: ComputedRef<Document | null>
  importFiles(files: FileList | File[]): Promise<Document[]>
  select(id: number): void
  delete(id: number): Promise<void>             // cascades to threads via useThreads
  getBlob(id: number): Promise<Blob | null>     // for PdfViewer
  loadAll(): Promise<void>                      // called by initStore in main.ts
}
```

- [ ] **Step 6.1 — Write the failing tests**

Create `tests/composables/useDocuments.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db, initStore } from '@/lib/db'
import { useDocuments } from '@/composables/useDocuments'

async function resetDb() {
  await db.close()
  await db.delete()
  await initStore()
}

function makeFile(name: string, bytes: Uint8Array): File {
  return new File([bytes], name, { type: 'application/pdf' })
}

// Use the real fixture; PDF.js cannot parse arbitrary bytes.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtureBytes = new Uint8Array(readFileSync(resolve(__dirname, '../fixtures/sample.pdf')))

describe('useDocuments', () => {
  beforeEach(async () => {
    await resetDb()
    const docs = useDocuments()
    docs.documents.value = []
    docs.activeId.value = null
    await docs.loadAll()
  })

  it('importFiles persists Document + DocumentBlob + extracted pages', async () => {
    const docs = useDocuments()
    const created = await docs.importFiles([makeFile('a.pdf', fixtureBytes)])
    expect(created).toHaveLength(1)
    expect(created[0].name).toBe('a.pdf')
    expect(created[0].numPages).toBe(2)
    expect(created[0].pages.length).toBeGreaterThan(0)

    expect(await db.documents.count()).toBe(1)
    expect(await db.documentBlobs.count()).toBe(1)

    const blob = await docs.getBlob(created[0].id!)
    expect(blob).toBeInstanceOf(Blob)
  })

  it('importFiles auto-activates the first doc when none active', async () => {
    const docs = useDocuments()
    await docs.importFiles([makeFile('a.pdf', fixtureBytes)])
    expect(docs.activeId.value).not.toBeNull()
    expect(docs.activeDoc.value?.name).toBe('a.pdf')
  })

  it('loadAll reads existing docs into reactive state', async () => {
    await db.documents.add({
      name: 'pre.pdf', size: 1, numPages: 1, pages: [], addedAt: Date.now(),
    })
    const docs = useDocuments()
    await docs.loadAll()
    expect(docs.documents.value).toHaveLength(1)
    expect(docs.documents.value[0].name).toBe('pre.pdf')
  })

  it('delete removes document + blob from Dexie and reactive state', async () => {
    const docs = useDocuments()
    const [d] = await docs.importFiles([makeFile('a.pdf', fixtureBytes)])
    await docs.delete(d.id!)
    expect(await db.documents.count()).toBe(0)
    expect(await db.documentBlobs.count()).toBe(0)
    expect(docs.documents.value).toHaveLength(0)
  })

  it('delete also clears activeId if the deleted doc was active', async () => {
    const docs = useDocuments()
    const [d] = await docs.importFiles([makeFile('a.pdf', fixtureBytes)])
    docs.select(d.id!)
    await docs.delete(d.id!)
    expect(docs.activeId.value).toBeNull()
  })
})
```

- [ ] **Step 6.2 — Run, expect failure**

```bash
npm run test:run -- tests/composables/useDocuments.spec.ts
```
Expected: FAIL (existing useDocuments doesn't match new API).

- [ ] **Step 6.3 — Replace `src/composables/useDocuments.ts`**

```ts
import { ref, computed, type ComputedRef, type Ref } from 'vue'
import { db } from '@/lib/db'
import type { Document } from '@/types/domain'
import { readPdf } from '@/lib/pdf'

const documents = ref<Document[]>([])
const activeId = ref<number | null>(null)
const activeDoc = computed(() => documents.value.find((d) => d.id === activeId.value) ?? null)

async function loadAll(): Promise<void> {
  const all = await db.documents.orderBy('addedAt').reverse().toArray()
  documents.value = all
}

async function importFiles(files: FileList | File[]): Promise<Document[]> {
  const created: Document[] = []
  for (const file of Array.from(files)) {
    const buffer = await file.arrayBuffer()
    const blob = new Blob([buffer], { type: 'application/pdf' })
    const { numPages, pages } = await readPdf(buffer)
    const doc: Document = {
      name: file.name,
      size: file.size,
      numPages,
      pages,
      addedAt: Date.now(),
    }
    const id = await db.documents.add(doc)
    await db.documentBlobs.put({ docId: id, blob })
    const persisted: Document = { ...doc, id }
    documents.value = [persisted, ...documents.value]
    created.push(persisted)
    if (activeId.value == null) activeId.value = id
  }
  return created
}

function select(id: number): void {
  activeId.value = id
}

async function deleteDoc(id: number): Promise<void> {
  await db.transaction('rw', db.documents, db.documentBlobs, async () => {
    await db.documents.delete(id)
    await db.documentBlobs.delete(id)
  })
  documents.value = documents.value.filter((d) => d.id !== id)
  if (activeId.value === id) activeId.value = null
  // Thread-side cascade is owned by useThreads (see Task 7). We invoke it
  // here once useThreads is loaded; for now the call site (sidebar) chains
  // useThreads.handleDocDeleted(id) after delete().
}

async function getBlob(id: number): Promise<Blob | null> {
  const row = await db.documentBlobs.get(id)
  return row?.blob ?? null
}

export interface UseDocumentsReturn {
  documents: Ref<Document[]>
  activeId: Ref<number | null>
  activeDoc: ComputedRef<Document | null>
  importFiles: typeof importFiles
  select: typeof select
  delete: typeof deleteDoc
  getBlob: typeof getBlob
  loadAll: typeof loadAll
}

export function useDocuments(): UseDocumentsReturn {
  return { documents, activeId, activeDoc, importFiles, select, delete: deleteDoc, getBlob, loadAll }
}
```

- [ ] **Step 6.4 — Run tests, expect pass**

```bash
npm run test:run -- tests/composables/useDocuments.spec.ts
```
Expected: 5 tests pass.

- [ ] **Step 6.5 — Commit**

```bash
git add src/composables/useDocuments.ts tests/composables/useDocuments.spec.ts
git commit -m "feat(m2): Dexie-backed useDocuments with import/delete/getBlob"
```

---

## Task 7 — Create `useThreads` composable (TDD)

**Files:**
- Create: `src/composables/useThreads.ts`
- Create: `tests/composables/useThreads.spec.ts`

API:

```ts
interface UseThreadsReturn {
  threads: Ref<readonly Thread[]>                  // sorted by updatedAt desc
  activeThreadId: Ref<number | null>
  activeThread: ComputedRef<Thread | null>
  activeMessages: Ref<readonly Message[]>          // messages of activeThread, ordered
  loadAll(): Promise<void>
  create(opts: { docIds?: number[]; name?: string }): Promise<Thread>
  ensureDefaultThreadForDoc(docId: number): Promise<Thread>   // creates if missing
  select(threadId: number): Promise<void>          // also loads activeMessages
  attachDoc(threadId: number, docId: number): Promise<void>
  detachDoc(threadId: number, docId: number): Promise<void>
  appendMessage(msg: Omit<Message, 'id' | 'createdAt'>): Promise<Message>
  updateMessage(id: number, patch: Partial<Pick<Message, 'text' | 'error' | 'citations'>>): Promise<void>
  clearMessages(threadId: number): Promise<void>
  handleDocDeleted(docId: number): Promise<void>   // cascade from useDocuments.delete
}
```

- [ ] **Step 7.1 — Write the failing tests**

Create `tests/composables/useThreads.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db, initStore } from '@/lib/db'
import { useThreads } from '@/composables/useThreads'

async function resetDb() {
  await db.close()
  await db.delete()
  await initStore()
}

describe('useThreads', () => {
  beforeEach(async () => {
    await resetDb()
    const t = useThreads()
    t.threads.value = []
    t.activeThreadId.value = null
    t.activeMessages.value = []
    await t.loadAll()
  })

  it('create persists a thread and updates threads ref', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [1, 2], name: 'demo' })
    expect(thread.id).toBe(1)
    expect(thread.docIds).toEqual([1, 2])
    expect(t.threads.value).toHaveLength(1)
  })

  it('ensureDefaultThreadForDoc creates a thread on first call, reuses on subsequent', async () => {
    const t = useThreads()
    const first = await t.ensureDefaultThreadForDoc(7)
    const second = await t.ensureDefaultThreadForDoc(7)
    expect(first.id).toBe(second.id)
    expect(t.threads.value).toHaveLength(1)
    expect(first.docIds).toEqual([7])
  })

  it('select loads messages of the chosen thread in createdAt order', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [], name: 'msgs' })
    await db.messages.add({ threadId: thread.id!, role: 'user', text: 'a', createdAt: 1 })
    await db.messages.add({ threadId: thread.id!, role: 'assistant', text: 'b', createdAt: 2 })
    await t.select(thread.id!)
    expect(t.activeMessages.value.map((m) => m.text)).toEqual(['a', 'b'])
  })

  it('attachDoc / detachDoc updates the thread', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [1] })
    await t.attachDoc(thread.id!, 2)
    expect(t.threads.value.find((x) => x.id === thread.id)!.docIds).toEqual([1, 2])
    await t.detachDoc(thread.id!, 1)
    expect(t.threads.value.find((x) => x.id === thread.id)!.docIds).toEqual([2])
  })

  it('appendMessage persists + appears in activeMessages when thread is active', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [] })
    await t.select(thread.id!)
    const m = await t.appendMessage({ threadId: thread.id!, role: 'user', text: 'hi' })
    expect(m.id).toBeDefined()
    expect(t.activeMessages.value.map((x) => x.text)).toEqual(['hi'])
    expect(await db.messages.count()).toBe(1)
  })

  it('updateMessage mutates Dexie + activeMessages', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [] })
    await t.select(thread.id!)
    const m = await t.appendMessage({ threadId: thread.id!, role: 'assistant', text: '' })
    await t.updateMessage(m.id!, { text: 'hello' })
    expect(t.activeMessages.value[0].text).toBe('hello')
    expect((await db.messages.get(m.id!))?.text).toBe('hello')
  })

  it('clearMessages deletes all messages for the thread', async () => {
    const t = useThreads()
    const thread = await t.create({ docIds: [] })
    await t.select(thread.id!)
    await t.appendMessage({ threadId: thread.id!, role: 'user', text: 'a' })
    await t.appendMessage({ threadId: thread.id!, role: 'user', text: 'b' })
    await t.clearMessages(thread.id!)
    expect(t.activeMessages.value).toEqual([])
    expect(await db.messages.count()).toBe(0)
  })

  it('handleDocDeleted removes docId from every thread that had it', async () => {
    const t = useThreads()
    const a = await t.create({ docIds: [1, 2] })
    const b = await t.create({ docIds: [2] })
    const c = await t.create({ docIds: [3] })
    await t.handleDocDeleted(2)
    expect(t.threads.value.find((x) => x.id === a.id)!.docIds).toEqual([1])
    expect(t.threads.value.find((x) => x.id === b.id)!.docIds).toEqual([])
    expect(t.threads.value.find((x) => x.id === c.id)!.docIds).toEqual([3])
  })
})
```

- [ ] **Step 7.2 — Run, expect failure**

- [ ] **Step 7.3 — Create `src/composables/useThreads.ts`**

```ts
import { ref, computed, type ComputedRef, type Ref } from 'vue'
import { db } from '@/lib/db'
import type { Message, Thread } from '@/types/domain'

const threads = ref<Thread[]>([])
const activeThreadId = ref<number | null>(null)
const activeMessages = ref<Message[]>([])
const activeThread = computed(
  () => threads.value.find((t) => t.id === activeThreadId.value) ?? null,
)

function sortThreads(list: Thread[]): Thread[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
}

async function loadAll(): Promise<void> {
  const all = await db.threads.orderBy('updatedAt').reverse().toArray()
  threads.value = all
}

async function create(opts: { docIds?: number[]; name?: string }): Promise<Thread> {
  const now = Date.now()
  const draft: Thread = {
    name: opts.name ?? '',
    docIds: opts.docIds ?? [],
    createdAt: now,
    updatedAt: now,
  }
  const id = await db.threads.add(draft)
  const persisted: Thread = { ...draft, id }
  threads.value = sortThreads([persisted, ...threads.value])
  return persisted
}

async function ensureDefaultThreadForDoc(docId: number): Promise<Thread> {
  const existing = threads.value.find(
    (t) => t.docIds.length === 1 && t.docIds[0] === docId,
  )
  if (existing) return existing
  return create({ docIds: [docId] })
}

async function select(threadId: number): Promise<void> {
  activeThreadId.value = threadId
  activeMessages.value = await db.messages
    .where('[threadId+createdAt]')
    .between([threadId, 0], [threadId, Infinity])
    .toArray()
}

function bumpThreadInState(threadId: number, patch: Partial<Thread>): void {
  threads.value = sortThreads(
    threads.value.map((t) => (t.id === threadId ? { ...t, ...patch, updatedAt: Date.now() } : t)),
  )
}

async function attachDoc(threadId: number, docId: number): Promise<void> {
  const t = threads.value.find((x) => x.id === threadId)
  if (!t) return
  if (t.docIds.includes(docId)) return
  const next = [...t.docIds, docId]
  await db.threads.update(threadId, { docIds: next, updatedAt: Date.now() })
  bumpThreadInState(threadId, { docIds: next })
}

async function detachDoc(threadId: number, docId: number): Promise<void> {
  const t = threads.value.find((x) => x.id === threadId)
  if (!t) return
  const next = t.docIds.filter((id) => id !== docId)
  await db.threads.update(threadId, { docIds: next, updatedAt: Date.now() })
  bumpThreadInState(threadId, { docIds: next })
}

async function appendMessage(
  msg: Omit<Message, 'id' | 'createdAt'>,
): Promise<Message> {
  const row: Message = { ...msg, createdAt: Date.now() }
  const id = await db.messages.add(row)
  const persisted: Message = { ...row, id }
  if (activeThreadId.value === msg.threadId) {
    activeMessages.value = [...activeMessages.value, persisted]
  }
  await db.threads.update(msg.threadId, { updatedAt: Date.now() })
  bumpThreadInState(msg.threadId, {})
  return persisted
}

async function updateMessage(
  id: number,
  patch: Partial<Pick<Message, 'text' | 'error' | 'citations'>>,
): Promise<void> {
  await db.messages.update(id, patch)
  activeMessages.value = activeMessages.value.map((m) => (m.id === id ? { ...m, ...patch } : m))
}

async function clearMessages(threadId: number): Promise<void> {
  await db.messages.where('threadId').equals(threadId).delete()
  if (activeThreadId.value === threadId) activeMessages.value = []
}

async function handleDocDeleted(docId: number): Promise<void> {
  // Update every thread that contains this doc.
  const affected = await db.threads.where('docIds').equals(docId).toArray()
  await db.transaction('rw', db.threads, async () => {
    for (const t of affected) {
      const next = t.docIds.filter((x) => x !== docId)
      await db.threads.update(t.id!, { docIds: next, updatedAt: Date.now() })
    }
  })
  threads.value = sortThreads(
    threads.value.map((t) =>
      t.docIds.includes(docId)
        ? { ...t, docIds: t.docIds.filter((x) => x !== docId), updatedAt: Date.now() }
        : t,
    ),
  )
}

export interface UseThreadsReturn {
  threads: Ref<Thread[]>
  activeThreadId: Ref<number | null>
  activeThread: ComputedRef<Thread | null>
  activeMessages: Ref<Message[]>
  loadAll: typeof loadAll
  create: typeof create
  ensureDefaultThreadForDoc: typeof ensureDefaultThreadForDoc
  select: typeof select
  attachDoc: typeof attachDoc
  detachDoc: typeof detachDoc
  appendMessage: typeof appendMessage
  updateMessage: typeof updateMessage
  clearMessages: typeof clearMessages
  handleDocDeleted: typeof handleDocDeleted
}

export function useThreads(): UseThreadsReturn {
  return {
    threads,
    activeThreadId,
    activeThread,
    activeMessages,
    loadAll,
    create,
    ensureDefaultThreadForDoc,
    select,
    attachDoc,
    detachDoc,
    appendMessage,
    updateMessage,
    clearMessages,
    handleDocDeleted,
  }
}
```

- [ ] **Step 7.4 — Run tests, expect pass**

```bash
npm run test:run -- tests/composables/useThreads.spec.ts
```
Expected: 8 tests pass.

- [ ] **Step 7.5 — Commit**

```bash
git add src/composables/useThreads.ts tests/composables/useThreads.spec.ts
git commit -m "feat(m2): useThreads with multi-doc CRUD + cascade"
```

---

## Task 8 — Rewrite `useChat` against `useThreads` (TDD update)

**Files:**
- Modify: `src/composables/useChat.ts`
- Modify: `tests/composables/useChat.spec.ts`

The new chat owns no message ref; it derives from `useThreads.activeMessages`. Sending requires an active thread; if none, refuse.

New API:

```ts
interface UseChatReturn {
  messages: Ref<readonly Message[]>   // alias of useThreads.activeMessages
  isTyping: Ref<boolean>
  send(text: string): Promise<void>   // builds context from active thread's attached docs
  clear(): Promise<void>              // clearMessages on active thread
}
```

> Notice: `pdfText` is no longer a `send()` argument — the composable builds it from the active thread's attached docs.

- [ ] **Step 8.1 — Rewrite `tests/composables/useChat.spec.ts`**

Replace the file with:

```ts
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
      vi.fn(async () => new Response(makeSseStream([
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
        'data: [DONE]\n\n',
      ]), { status: 200 })),
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

  it('refuses to send without an api key', async () => {
    useSettings().apiKey.value = ''
    const t = useThreads()
    const thread = await t.create({ docIds: [] })
    await t.select(thread.id!)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await useChat().send('hi')
    expect(fetchSpy).not.toHaveBeenCalled()
    // user message is still persisted (so they can see what they typed).
    expect(await db.messages.count()).toBe(1)
  })

  it('builds PDF context from all attached docs', async () => {
    const t = useThreads()
    const docAId = await db.documents.add({
      name: 'A.pdf', size: 1, numPages: 1, addedAt: 1,
      pages: [{ pageNumber: 1, text: 'alpha alpha alpha' }],
    })
    const docBId = await db.documents.add({
      name: 'B.pdf', size: 1, numPages: 1, addedAt: 2,
      pages: [{ pageNumber: 1, text: 'beta beta beta' }],
    })
    const thread = await t.create({ docIds: [docAId, docBId] })
    await t.select(thread.id!)

    let captured: any
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      captured = JSON.parse(init.body as string)
      return new Response(makeSseStream(['data: [DONE]\n\n']), { status: 200 })
    }))

    await useChat().send('q')

    const systemContent = captured.messages[0].content as string
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
```

- [ ] **Step 8.2 — Run, expect failure**

- [ ] **Step 8.3 — Rewrite `src/composables/useChat.ts`**

```ts
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
    const url = isGemini ? geminiUrl(model.value || 'gemini-2.5-flash', apiKey.value) : OPENROUTER_URL
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

    assistant = await threads.appendMessage({ threadId: thread.id!, role: 'assistant', text: '' })
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
      await threads.updateMessage(assistant.id!, { text: `**Error:** ${errText}`, error: true })
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
```

- [ ] **Step 8.4 — Run tests, expect pass**

```bash
npm run test:run -- tests/composables/useChat.spec.ts
```
Expected: 5 tests pass.

- [ ] **Step 8.5 — Commit**

```bash
git add src/composables/useChat.ts tests/composables/useChat.spec.ts
git commit -m "feat(m2): useChat persists to active thread; builds context from attached docs"
```

---

## Task 9 — Build `AttachedDocsBar` + `DocPicker`

**Files:**
- Create: `src/components/chat/AttachedDocsBar.vue`
- Create: `src/components/chat/DocPicker.vue`

These render attached-doc chips with × and a `+` button. `+` opens `DocPicker`, a small dropdown listing library docs not already attached.

- [ ] **Step 9.1 — Create `src/components/chat/DocPicker.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Document } from '@/types/domain'

const props = defineProps<{
  docs: readonly Document[]
  attachedIds: readonly number[]
  open: boolean
}>()
const emit = defineEmits<{ pick: [docId: number]; close: [] }>()

const candidates = computed(() => props.docs.filter((d) => !props.attachedIds.includes(d.id!)))
</script>

<template>
  <div
    v-if="open"
    class="absolute z-20 mt-1 w-64 max-h-64 overflow-y-auto rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-lg"
    @mousedown.stop
  >
    <div v-if="candidates.length === 0" class="px-3 py-4 text-xs text-zinc-400 text-center">
      No more documents to attach
    </div>
    <button
      v-for="d in candidates"
      :key="d.id"
      class="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
      @click="$emit('pick', d.id!); $emit('close')"
    >
      <i class="fa-solid fa-file-pdf text-zinc-400 text-xs"></i>
      <span class="truncate">{{ d.name }}</span>
    </button>
  </div>
</template>
```

- [ ] **Step 9.2 — Create `src/components/chat/AttachedDocsBar.vue`**

```vue
<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'
import DocPicker from './DocPicker.vue'

const { documents } = useDocuments()
const { activeThread, attachDoc, detachDoc } = useThreads()

const pickerOpen = ref(false)

const attached = computed(() => {
  const t = activeThread.value
  if (!t) return []
  return t.docIds
    .map((id) => documents.value.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d)
})

function onPick(docId: number) {
  if (!activeThread.value) return
  void attachDoc(activeThread.value.id!, docId)
}
function onDetach(docId: number) {
  if (!activeThread.value) return
  void detachDoc(activeThread.value.id!, docId)
}

function closeOnOutsideClick(_e: MouseEvent) {
  pickerOpen.value = false
}
onMounted(() => window.addEventListener('mousedown', closeOnOutsideClick))
onBeforeUnmount(() => window.removeEventListener('mousedown', closeOnOutsideClick))
</script>

<template>
  <div
    v-if="activeThread"
    class="relative px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40"
  >
    <div class="flex items-center gap-1.5 flex-wrap">
      <span
        v-for="d in attached"
        :key="d.id"
        class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-medium"
      >
        <i class="fa-solid fa-file-pdf text-[10px]"></i>
        <span class="max-w-[140px] truncate">{{ d.name }}</span>
        <button
          class="ml-1 text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-200"
          title="Detach"
          @click="onDetach(d.id!)"
        >
          <i class="fa-solid fa-xmark text-[10px]"></i>
        </button>
      </span>
      <button
        class="px-2 py-1 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700 text-[11px] text-zinc-500 hover:border-indigo-300 hover:text-indigo-600"
        @mousedown.stop="pickerOpen = !pickerOpen"
      >
        <i class="fa-solid fa-plus text-[10px]"></i> Attach
      </button>
    </div>
    <DocPicker
      :docs="documents"
      :attached-ids="attached.map((d) => d.id!)"
      :open="pickerOpen"
      @pick="onPick"
      @close="pickerOpen = false"
    />
  </div>
</template>
```

- [ ] **Step 9.3 — Typecheck**

```bash
npx vue-tsc --noEmit 2>&1 | grep -E 'AttachedDocsBar|DocPicker' || echo "ok"
```

- [ ] **Step 9.4 — Commit**

```bash
git add src/components/chat/AttachedDocsBar.vue src/components/chat/DocPicker.vue
git commit -m "feat(m2): AttachedDocsBar + DocPicker for multi-doc threads"
```

---

## Task 10 — Sidebar building blocks: `DocItem`, `DocList`, `ThreadItem`, `ThreadList`

**Files:**
- Create: `src/components/sidebar/DocItem.vue`, `DocList.vue`, `ThreadItem.vue`, `ThreadList.vue`

- [ ] **Step 10.1 — `src/components/sidebar/DocItem.vue`**

```vue
<script setup lang="ts">
import type { Document } from '@/types/domain'
defineProps<{ doc: Document; active: boolean }>()
defineEmits<{ select: []; delete: [] }>()
</script>

<template>
  <div
    :class="[
      'group p-3 rounded-lg cursor-pointer text-sm transition flex items-center gap-2 relative',
      active
        ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800'
        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
    ]"
    @click="$emit('select')"
  >
    <i class="fa-solid fa-file-pdf text-zinc-400"></i>
    <div class="flex-1 min-w-0">
      <div class="truncate">{{ doc.name }}</div>
      <div class="text-[10px] text-zinc-400">{{ doc.numPages }} pages</div>
    </div>
    <button
      class="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 transition"
      title="Delete document"
      @click.stop="$emit('delete')"
    >
      <i class="fa-solid fa-trash text-xs"></i>
    </button>
  </div>
</template>
```

- [ ] **Step 10.2 — `src/components/sidebar/DocList.vue`**

```vue
<script setup lang="ts">
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'
import DocItem from './DocItem.vue'

const { documents, activeId, select, delete: deleteDoc } = useDocuments()
const threads = useThreads()

async function onSelect(id: number) {
  select(id)
  const t = await threads.ensureDefaultThreadForDoc(id)
  await threads.select(t.id!)
}

async function onDelete(id: number) {
  await deleteDoc(id)
  await threads.handleDocDeleted(id)
}
</script>

<template>
  <section class="space-y-2">
    <h2 class="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
      Documents
    </h2>
    <p v-if="documents.length === 0" class="text-xs text-zinc-400 px-1 py-2">
      Import your first PDF to get started.
    </p>
    <DocItem
      v-for="doc in documents"
      :key="doc.id"
      :doc="doc"
      :active="activeId === doc.id"
      @select="onSelect(doc.id!)"
      @delete="onDelete(doc.id!)"
    />
  </section>
</template>
```

- [ ] **Step 10.3 — `src/components/sidebar/ThreadItem.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Thread, Document } from '@/types/domain'

const props = defineProps<{ thread: Thread; docs: readonly Document[]; active: boolean }>()
defineEmits<{ select: [] }>()

const attached = computed(() =>
  props.thread.docIds
    .map((id) => props.docs.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d),
)
const visibleChips = computed(() => attached.value.slice(0, 3))
const overflow = computed(() => Math.max(0, attached.value.length - visibleChips.value.length))

const label = computed(() => {
  if (props.thread.name) return props.thread.name
  if (attached.value[0]) return attached.value[0].name
  return 'Untitled chat'
})
</script>

<template>
  <div
    :class="[
      'p-2.5 rounded-lg cursor-pointer text-sm transition space-y-1',
      active
        ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800'
        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
    ]"
    @click="$emit('select')"
  >
    <div class="flex items-center gap-2">
      <i class="fa-solid fa-comments text-zinc-400 text-xs"></i>
      <span class="truncate">{{ label }}</span>
    </div>
    <div v-if="attached.length > 0" class="flex items-center gap-1 flex-wrap">
      <span
        v-for="d in visibleChips"
        :key="d.id"
        class="px-1.5 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-700/60 text-[10px] text-zinc-600 dark:text-zinc-300 truncate max-w-[90px]"
      >
        {{ d.name }}
      </span>
      <span v-if="overflow > 0" class="text-[10px] text-zinc-400">+{{ overflow }}</span>
    </div>
  </div>
</template>
```

- [ ] **Step 10.4 — `src/components/sidebar/ThreadList.vue`**

```vue
<script setup lang="ts">
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'
import ThreadItem from './ThreadItem.vue'

const { documents, activeId, select: selectDoc } = useDocuments()
const threads = useThreads()

async function onSelect(threadId: number) {
  await threads.select(threadId)
  // Switch viewer to the thread's primary doc, if any.
  const t = threads.threads.value.find((x) => x.id === threadId)
  if (t && t.docIds[0] != null) selectDoc(t.docIds[0])
}

async function onNew() {
  const docId = activeId.value
  const docIds = docId ? [docId] : []
  const created = await threads.create({ docIds })
  await threads.select(created.id!)
}
</script>

<template>
  <section class="space-y-2">
    <div class="flex items-center justify-between">
      <h2 class="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
        Recent threads
      </h2>
      <button
        class="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-600"
        title="New thread"
        @click="onNew"
      >
        <i class="fa-solid fa-plus text-xs"></i>
      </button>
    </div>
    <p v-if="threads.threads.value.length === 0" class="text-xs text-zinc-400 px-1 py-2">
      No conversations yet.
    </p>
    <ThreadItem
      v-for="t in threads.threads.value"
      :key="t.id"
      :thread="t"
      :docs="documents"
      :active="threads.activeThreadId.value === t.id"
      @select="onSelect(t.id!)"
    />
  </section>
</template>
```

- [ ] **Step 10.5 — Commit**

```bash
git add src/components/sidebar
git commit -m "feat(m2): sidebar building blocks — DocItem/List + ThreadItem/List"
```

---

## Task 11 — Refactor `AppSidebar.vue` to host `DocList` + `ThreadList`

**Files:**
- Modify: `src/components/AppSidebar.vue`

- [ ] **Step 11.1 — Replace `src/components/AppSidebar.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useDarkMode } from '@/composables/useDarkMode'
import { useDocuments } from '@/composables/useDocuments'
import DocList from './sidebar/DocList.vue'
import ThreadList from './sidebar/ThreadList.vue'

const { isDark, toggle } = useDarkMode()
const { importFiles } = useDocuments()

const fileInputRef = ref<HTMLInputElement | null>(null)

async function onPick(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) await importFiles(target.files)
  target.value = ''
}
</script>

<template>
  <aside
    class="w-72 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col"
  >
    <div class="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
      <h1 class="text-lg font-bold text-indigo-600 dark:text-indigo-400">Notebook</h1>
      <button
        class="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
        @click="toggle"
      >
        <i :class="['fa-solid', isDark ? 'fa-sun' : 'fa-moon']"></i>
      </button>
    </div>

    <div class="p-4">
      <button
        class="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        @click="fileInputRef?.click()"
      >
        Import PDF
      </button>
      <input ref="fileInputRef" type="file" multiple accept=".pdf" class="hidden" @change="onPick" />
    </div>

    <div class="flex-1 overflow-y-auto px-4 pb-4 space-y-6">
      <DocList />
      <ThreadList />
    </div>
  </aside>
</template>
```

- [ ] **Step 11.2 — Typecheck**

```bash
npx vue-tsc --noEmit 2>&1 | tail -10
```
Expected: clean now that sidebar is wired up.

- [ ] **Step 11.3 — Commit**

```bash
git add src/components/AppSidebar.vue
git commit -m "feat(m2): AppSidebar hosts DocList + ThreadList"
```

---

## Task 12 — Refactor `ChatPanel.vue` to use threads + AttachedDocsBar

**Files:**
- Modify: `src/components/ChatPanel.vue`

- [ ] **Step 12.1 — Replace `src/components/ChatPanel.vue`**

The diff vs M1: drop the per-send `extractTextByPage` call (the chat now takes context from `useThreads`), use `useChat().messages` (computed from active thread) instead of a local ref, add `AttachedDocsBar` between the settings drawer and the messages list, surface the thread name in the header (read-only — inline rename lands in M4), and update the empty-state nudges per §13 of the spec.

```vue
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import ChatMessage from './chat/ChatMessage.vue'
import ChatInput from './chat/ChatInput.vue'
import TypingIndicator from './chat/TypingIndicator.vue'
import AttachedDocsBar from './chat/AttachedDocsBar.vue'
import { useChat } from '@/composables/useChat'
import { useSettings } from '@/composables/useSettings'
import { useThreads } from '@/composables/useThreads'
import { useDocuments } from '@/composables/useDocuments'

const { messages, isTyping, send, clear } = useChat()
const { provider, apiKey, model, modelPlaceholder, modelHint } = useSettings()
const { activeThread } = useThreads()
const { documents } = useDocuments()

const showSettings = ref(false)
const showApiKey = ref(false)
const chatContainer = ref<HTMLElement | null>(null)
const isReady = computed(() => !!apiKey.value)

const headerLabel = computed(() => {
  const t = activeThread.value
  if (!t) return 'Chat'
  if (t.name) return t.name
  const first = t.docIds[0] != null ? documents.value.find((d) => d.id === t.docIds[0]) : null
  return first?.name ?? 'Untitled chat'
})

const emptyStateNudge = computed(() => {
  const t = activeThread.value
  if (!t) return 'Import a PDF or pick a thread to begin'
  const names = t.docIds
    .map((id) => documents.value.find((d) => d.id === id)?.name)
    .filter((x): x is string => !!x)
  if (names.length === 0) return 'No documents attached. Add one with the + button above.'
  if (names.length === 1) return `Ask anything about ${names[0]}`
  return `Ask anything about ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
})

function scrollToBottom() {
  void nextTick(() => {
    const el = chatContainer.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
watch([messages, isTyping], scrollToBottom, { deep: true })

async function onSend(text: string) {
  await send(text)
}
</script>

<template>
  <section
    class="w-96 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 flex flex-col"
  >
    <div
      class="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900"
    >
      <div class="flex items-center gap-2 min-w-0">
        <i class="fa-solid fa-comments text-indigo-500 flex-shrink-0"></i>
        <span class="font-semibold text-sm truncate">{{ headerLabel }}</span>
        <span
          v-if="isReady"
          class="flex items-center gap-1 text-[10px] text-emerald-500 font-medium ml-1 flex-shrink-0"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot inline-block"></span>Ready
        </span>
        <span
          v-else
          class="flex items-center gap-1 text-[10px] text-zinc-400 font-medium ml-1 flex-shrink-0"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-zinc-400 inline-block"></span>No key
        </span>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <button
          class="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          title="Clear chat"
          @click="clear"
        >
          <i class="fa-solid fa-trash-can text-xs"></i>
        </button>
        <button
          :class="[
            'p-2 rounded-lg transition',
            showSettings
              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
              : 'hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300',
          ]"
          title="Settings"
          @click="showSettings = !showSettings"
        >
          <i class="fa-solid fa-gear text-xs"></i>
        </button>
      </div>
    </div>

    <div
      :class="[
        'settings-panel px-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50',
        { open: showSettings },
      ]"
    >
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Provider</label>
          <div class="flex gap-2">
            <button
              :class="[
                'flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition',
                provider === 'openrouter'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700',
              ]"
              @click="provider = 'openrouter'"
            >
              OpenRouter
            </button>
            <button
              :class="[
                'flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition',
                provider === 'gemini'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700',
              ]"
              @click="provider = 'gemini'"
            >
              Gemini
            </button>
          </div>
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">API Key</label>
          <div class="relative">
            <input
              v-model="apiKey"
              :type="showApiKey ? 'text' : 'password'"
              placeholder="Enter your API key…"
              class="w-full p-2.5 pr-9 text-sm rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition"
            />
            <button
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              @click="showApiKey = !showApiKey"
            >
              <i :class="['fa-solid text-xs', showApiKey ? 'fa-eye-slash' : 'fa-eye']"></i>
            </button>
          </div>
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Model</label>
          <input
            v-model="model"
            :placeholder="modelPlaceholder"
            class="w-full p-2.5 text-sm rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition"
          />
          <p class="text-[10px] text-zinc-400 mt-1">{{ modelHint }}</p>
        </div>
      </div>
    </div>

    <AttachedDocsBar />

    <div
      id="chat-container"
      ref="chatContainer"
      class="flex-1 overflow-y-auto p-4 space-y-3"
    >
      <div
        v-if="messages.length === 0"
        class="flex flex-col items-center justify-center h-full text-center px-6"
      >
        <div
          class="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4"
        >
          <i class="fa-solid fa-robot text-indigo-500 text-xl"></i>
        </div>
        <p class="text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-1">Ask me anything</p>
        <p class="text-xs text-zinc-400">{{ emptyStateNudge }}</p>
      </div>
      <ChatMessage v-for="m in messages" :key="m.id" :msg="m" />
      <TypingIndicator v-if="isTyping" />
    </div>

    <ChatInput :disabled="isTyping" @send="onSend">
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
  </section>
</template>
```

- [ ] **Step 12.2 — Typecheck**

```bash
npx vue-tsc --noEmit 2>&1 | tail -10
```
Expected: 0 errors.

- [ ] **Step 12.3 — Commit**

```bash
git add src/components/ChatPanel.vue
git commit -m "feat(m2): ChatPanel uses threads + AttachedDocsBar; drops per-send extract"
```

---

## Task 13 — Wire `ChatMessage.vue` to handle the `Message` type (id is optional now)

**Files:**
- Modify: `src/components/chat/ChatMessage.vue`

The `Message` interface has `id?: number` (because Dexie returns it as undefined until inserted). Keys in `v-for` need a safe value. The component itself uses `msg.text`, `msg.role`, `msg.error` which all still apply.

- [ ] **Step 13.1 — Update the prop type**

Change the import in `ChatMessage.vue`:

```ts
// Before:
import type { ChatMessage as Msg } from '@/types/domain'

// After:
import type { Message as Msg } from '@/types/domain'
```

> The old `ChatMessage` type from `domain.ts` was removed in Task 2; this aligns the component.

- [ ] **Step 13.2 — Typecheck**

```bash
npx vue-tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 13.3 — Commit**

```bash
git add src/components/chat/ChatMessage.vue
git commit -m "fix(m2): ChatMessage uses Message type (renamed from ChatMessage)"
```

---

## Task 14 — Wire `PdfViewer.vue` to fetch blob from Dexie on doc activation

**Files:**
- Modify: `src/components/PdfViewer.vue`
- Modify: `src/composables/useDocuments.ts` (add a side-effect on `activeId`)

The cleanest split: when `activeId` changes, fetch the blob and hand it to `usePdfViewer.setActive`. Easiest place is a `watch` inside the `App.vue` setup or inside the `PdfViewer.vue` setup.

- [ ] **Step 14.1 — Update `PdfViewer.vue`**

```vue
<script setup lang="ts">
import { watch } from 'vue'
import { useDocuments } from '@/composables/useDocuments'
import { usePdfViewer } from '@/composables/usePdfViewer'

const { activeDoc, activeId, getBlob } = useDocuments()
const { currentPage, numPages, bindCanvas, prev, next, setActive } = usePdfViewer()

// Whenever the active doc changes, load its blob and feed the viewer.
watch(
  activeId,
  async (id) => {
    if (id == null) {
      await setActive(null)
      return
    }
    const blob = await getBlob(id)
    await setActive(blob)
  },
  { immediate: true },
)
</script>

<template>
  <main class="flex-1 flex flex-col bg-zinc-100 dark:bg-zinc-950 overflow-hidden">
    <div v-if="activeDoc" class="h-full flex flex-col p-6 overflow-hidden">
      <div
        class="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex-1 flex flex-col overflow-hidden"
      >
        <div
          class="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800"
        >
          <span class="font-medium truncate text-sm">{{ activeDoc.name }}</span>
          <div class="flex items-center gap-3">
            <button
              class="px-2 py-1 bg-white dark:bg-zinc-900 border rounded hover:bg-zinc-100"
              @click="prev"
            >
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <span class="text-xs">{{ currentPage }} / {{ numPages }}</span>
            <button
              class="px-2 py-1 bg-white dark:bg-zinc-900 border rounded hover:bg-zinc-100"
              @click="next"
            >
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
        <div
          class="flex-1 overflow-y-auto p-4 flex justify-center bg-zinc-100 dark:bg-zinc-950"
        >
          <canvas
            :ref="(el) => bindCanvas(el as HTMLCanvasElement | null)"
            class="shadow-lg max-w-full h-auto"
          ></canvas>
        </div>
      </div>
    </div>
    <div v-else class="flex-1 flex items-center justify-center text-zinc-400">
      Select a document to view
    </div>
  </main>
</template>
```

- [ ] **Step 14.2 — Typecheck**

```bash
npx vue-tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 14.3 — Commit**

```bash
git add src/components/PdfViewer.vue
git commit -m "feat(m2): PdfViewer fetches blob from Dexie on active doc change"
```

---

## Task 15 — Wire `main.ts` to load store before mount

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 15.1 — Replace `src/main.ts`**

```ts
import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'
import { initStore } from '@/lib/db'
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'

await initStore()
await Promise.all([useDocuments().loadAll(), useThreads().loadAll()])

createApp(App).mount('#app')
```

> Top-level `await` requires `"target": "ES2022"` and `"module": "ESNext"`, which we already have in `tsconfig.json`.

- [ ] **Step 15.2 — Build to confirm top-level await works in the production bundle**

```bash
npm run build 2>&1 | tail -10
```
Expected: build succeeds.

- [ ] **Step 15.3 — Commit**

```bash
git add src/main.ts
git commit -m "feat(m2): pre-warm Dexie + load docs/threads before mount"
```

---

## Task 16 — Full green: typecheck + lint + tests + build

- [ ] **Step 16.1 — Typecheck**

```bash
npm run typecheck
```
Expected: 0 errors. Fix any inline.

- [ ] **Step 16.2 — Lint**

```bash
npm run lint
```
Expected: 0 errors. Fix any inline.

- [ ] **Step 16.3 — Tests**

```bash
npm run test:run
```
Expected: all suites pass. The M1 `useChat.spec.ts` was replaced in Task 8, so total test count rises (~40+). Re-baseline if anything regresses.

- [ ] **Step 16.4 — Build**

```bash
npm run build
```
Expected: builds clean.

- [ ] **Step 16.5 — Commit any fixups**

```bash
git status
git add -A
git commit -m "chore(m2): fixups for typecheck/lint/tests/build" --allow-empty
```

---

## Task 17 — Manual parity + persistence walkthrough

> Performed against `npm run dev` in the integrated browser. The plan executor (you) does this with the browser tools; the steps below are the same checklist any human would run.

- [ ] **Step 17.1 — Start dev server (if not already running)**

```bash
npm run dev
```

- [ ] **Step 17.2 — Walk the M1 parity checklist** (every item still behaves the same as M1)

  - [ ] Sidebar shows "Notebook" + dark toggle + "Import PDF".
  - [ ] Center pane shows "Select a document to view" when no doc active.
  - [ ] Chat panel shows "No key" / "Ready" indicator correctly.
  - [ ] Dark mode toggles + persists across reload.
  - [ ] Provider toggle updates placeholder + hint.
  - [ ] Clear chat shows the success toast.

- [ ] **Step 17.3 — Walk the M2 new behavior**

  - [ ] Import a PDF → sidebar's **Documents** section gets a new row showing name + page count + (hover) delete icon.
  - [ ] Sidebar's **Recent threads** section auto-creates a default thread for the imported PDF (visible after a click on the doc).
  - [ ] Active doc highlighted; viewer renders the PDF.
  - [ ] AttachedDocsBar above messages shows the doc as a chip.
  - [ ] Click **+ Attach** → DocPicker dropdown shows other library docs. Pick one → chip added; thread now references two docs.
  - [ ] Send a message in the thread → both user + assistant messages stream and persist.
  - [ ] **Refresh the page** → docs, threads, attached docs, and messages are all still there. Settings persist.
  - [ ] Click "New thread" (+) in Threads header → fresh thread attached to active doc; chat empties; messages list shows empty state.
  - [ ] Switch between threads → chat content updates to that thread's messages; viewer switches to thread's primary doc.
  - [ ] Delete a doc from sidebar (hover row → trash icon) → doc disappears; viewer falls back to empty state; any thread that referenced it loses the chip (refresh to confirm Dexie was updated).
  - [ ] Detach a doc from a thread via the chip × → chip disappears; refresh persists.

- [ ] **Step 17.4 — Note any regressions in this plan file as Risks for the M3 plan**, then fix inline if quick.

- [ ] **Step 17.5 — Commit any final fixes**

```bash
git status
git add -A
git commit -m "fix(m2): parity-walk followups" --allow-empty
```

---

## Task 18 — Tag M2

- [ ] **Step 18.1 — Tag**

```bash
git tag -a m2-persistence -m "M2: IndexedDB persistence + multi-doc threads

Dexie-backed documents, blobs, threads, messages. Many-to-many
docs ↔ threads with per-doc default thread. AttachedDocsBar, doc
delete with cascade. Chat builds context from all attached docs'
pre-extracted pages (no per-send re-extract). Messages stream in
and persist live."
```

- [ ] **Step 18.2 — Print summary**

```bash
git log --oneline | head -40
echo "---"
git tag --list
echo "---"
echo "M2 complete. Next: M3 plan (BM25 retrieval + citations + abort)."
```

---

## Definition of Done

- `npm run dev` opens the app at `localhost:5173`/`5174` and:
  - Imports a PDF → it appears in **Documents** with a delete affordance.
  - First import auto-creates a default thread; sending a message persists it.
  - Refresh restores docs, threads, attached docs, messages, and active selection (active selection may reset to none; that's acceptable for v1).
  - Attaching a second doc to a thread updates the system prompt to include both docs' page text in the next message.
  - Deleting a doc cascades: blob removed, doc removed, every thread's `docIds` cleaned; threads with zero docs survive as text-only.
- `npm run typecheck` passes.
- `npm run lint` passes with no errors.
- `npm run test:run` passes (~40+ tests across `db`, `useDocuments`, `useThreads`, `useChat`, plus M1's lib tests).
- `npm run build` produces a deployable `dist/`.
- Git history shows small, descriptive commits and an `m2-persistence` tag.

When all of the above are true, **M2 is done**. Write the M3 plan next.

---

## Risks & open questions for the M3 plan

- **Streaming-persist write amplification.** Task 8 persists every chunk to Dexie. With long replies (~1k tokens, ~hundreds of chunks) this is ~hundreds of IDB writes. Acceptable for M2 (correctness over perf); M3 should debounce to every 1s + on close as the spec specifies.
- **No "save in flight" UX.** If the user closes the tab mid-stream the assistant message may be missing trailing chunks. Spec's M3 risks table notes this; accept for M2.
- **Singleton reset for tests.** Several specs poke `composable.value = ...` directly to reset state. M3 could introduce a `__resetForTests()` helper to keep tests honest.
- **Thread name UX.** Auto-generated from first doc; no rename UI yet (M4).
