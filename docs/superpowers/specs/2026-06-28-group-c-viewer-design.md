# Notebook — Group C: Viewer Enhancements Design Spec

**Date:** 2026-06-28
**Status:** Approved
**Scope:** Three viewer/PDF-touching improvements that share infrastructure (PDF.js render helpers, IntersectionObserver, popover positioning).

---

## 1. Summary

- **C1.** Zoom controls (discrete steps + keyboard) and page-thumbnail strip in the viewer pane.
- **C2.** In-PDF text search — search the already-extracted `documents.pages` text, list matches with snippets, click to jump.
- **C3.** Hover-citation preview — hovering a `.citation-chip` shows a popover with the cited page rendered inline.

## 2. Goals

- Page can be zoomed in / out (5 levels above + 2 below default).
- Long PDFs are navigable via a thumbnail rail.
- Cmd/Ctrl+F opens an in-app search bar; matches list shows surrounding context.
- Hovering a citation chip shows that page without leaving the chat.

## 3. Non-goals

- No PDF.js text-layer rendering (canvas-only stays). Search highlights are text snippets in the result list, not in-canvas overlays.
- No fit-to-width / fit-to-page modes — fixed scale steps only.
- No fuzzy / regex search (M5).
- No multi-doc search-within-results (Group E's library-wide retrieval handles cross-doc).
- No tablet/mobile-specific thumbnail UX — Group D handles responsive layout.

## 4. Constraints

- 100% frontend, no backend.
- No new runtime deps.
- No regression in the 98 existing tests.
- Don't touch BM25 retrieval (Group F is the next stop for retrieval changes).

## 5. Design

### C1 — Zoom + thumbnails

**Zoom (`usePdfViewer` extensions):**

```ts
const SCALE_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0] as const
const DEFAULT_SCALE = 1.5

const scale = ref<number>(DEFAULT_SCALE)

function zoomIn(): void {
  const i = SCALE_STEPS.indexOf(scale.value as (typeof SCALE_STEPS)[number])
  if (i >= 0 && i < SCALE_STEPS.length - 1) scale.value = SCALE_STEPS[i + 1]
}
function zoomOut(): void {
  const i = SCALE_STEPS.indexOf(scale.value as (typeof SCALE_STEPS)[number])
  if (i > 0) scale.value = SCALE_STEPS[i - 1]
}
function resetZoom(): void {
  scale.value = DEFAULT_SCALE
}
```

`drawCurrent` reads `scale.value` instead of hardcoded `1.5`. The existing `watch([currentPdf, currentPage])` is extended to `watch([currentPdf, currentPage, scale])`. Cancellation already handles overlapping renders.

**Viewer header buttons** (in `PdfViewer.vue`, alongside the page-nav block):

```
[− zoom] 150% [+ zoom]   [⊞ thumbnails toggle]   ← →   1/N
```

Thumbnails toggle uses `fa-solid fa-table-cells` icon. Highlighted state when open.

**Keyboard:** extend `lib/keyboard.ts` matcher:

- `Cmd/Ctrl + =` (or `+`) → `zoomIn`
- `Cmd/Ctrl + -` → `zoomOut`
- `Cmd/Ctrl + 0` → `resetZoom`

Add three new `ShortcutAction` variants. `useKeyboardShortcuts` handlers wired in `App.vue`.

**Thumbnail strip:**

New `components/viewer/PdfThumbnailStrip.vue`. Mounted inside `PdfViewer.vue` between the header bar and the canvas pane, on the left, with `v-if="thumbsOpen"`. Width ~96px.

```vue
<!-- abridged -->
<aside class="w-24 overflow-y-auto bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 p-2 flex flex-col gap-2">
  <button
    v-for="n in numPages"
    :key="n"
    :class="['border', currentPage === n ? 'border-indigo-500' : 'border-zinc-200 dark:border-zinc-700']"
    @click="goTo(n)"
  >
    <ThumbCell :pageNumber="n" />
  </button>
</aside>
```

`ThumbCell.vue` is a sub-component that:

1. Subscribes to an `IntersectionObserver` set up once at strip mount.
2. On first intersection, renders its page via `lib/pdf.ts`'s `renderPage(...)` at scale `0.2`.
3. Cancels in-flight render on unmount (each cell holds its own `RenderTask`).

The strip uses `usePdfViewer().currentPdf` directly — no new composable state.

Default `thumbsOpen = false`. State lives in the component (no reason to persist for v1).

### C2 — Text search

**Pure helper** `lib/pdfSearch.ts`:

```ts
import type { PageText } from '@/types/domain'

export interface SearchMatch {
  pageNumber: number
  /** Substring of original page text around the match, with the matched span uppercased for display safety. */
  snippet: string
  /** Offset of the match within `snippet` (UI uses this to wrap <mark>). */
  matchOffset: number
  matchLength: number
}

const SNIPPET_RADIUS = 40 // chars around match

export function searchPages(
  query: string,
  pages: readonly PageText[],
): SearchMatch[] {
  const q = query.trim()
  if (!q) return []
  const needle = q.toLowerCase()
  const out: SearchMatch[] = []
  for (const p of pages) {
    const haystack = p.text.toLowerCase()
    let from = 0
    for (;;) {
      const idx = haystack.indexOf(needle, from)
      if (idx === -1) break
      const start = Math.max(0, idx - SNIPPET_RADIUS)
      const end = Math.min(p.text.length, idx + needle.length + SNIPPET_RADIUS)
      const snippet = (start > 0 ? '…' : '') + p.text.slice(start, end) + (end < p.text.length ? '…' : '')
      out.push({
        pageNumber: p.pageNumber,
        snippet,
        matchOffset: idx - start + (start > 0 ? 1 : 0), // +1 for the leading ellipsis
        matchLength: needle.length,
      })
      from = idx + needle.length
    }
  }
  return out
}
```

**TDD** covers: empty query → empty; one match; multiple matches on one page; case-insensitivity; ellipsis prefix/suffix; offset correctness.

**`PdfSearchBar.vue`:** mounted between the viewer header and the canvas/thumbnails pane. Toggled by:

- The header search icon (new), or
- `Cmd/Ctrl + F` shortcut.

Slides down (existing `.settings-panel` CSS pattern fits — reusable class or new `.search-panel`).

Layout when open:

```
[ search box ]   [3 of 12]  [↑] [↓]  [×]
─────────────────────────────────────────
Page 3 · …some text [MATCH] more text…
Page 7 · …some text [MATCH] more text…
…
```

Click row → `usePdfViewer().goTo(pageNumber)` (does not auto-close; user may want to scan more matches).

Esc closes (component-local listener).

**Active doc binding:** the bar reads `useDocuments().activeDoc?.pages`. If no active doc, shows an empty state ("Open a document to search").

### C3 — Hover-citation preview

**Cached PDF loader** `lib/pdfPreview.ts`:

```ts
import type * as pdfjsLib from 'pdfjs-dist'
import { loadPdfFromBlob } from './pdf'

const cache = new Map<number, Promise<pdfjsLib.PDFDocumentProxy>>()

export function getCachedPdfFor(docId: number, blob: Blob): Promise<pdfjsLib.PDFDocumentProxy> {
  let p = cache.get(docId)
  if (!p) {
    p = loadPdfFromBlob(blob)
    cache.set(docId, p)
  }
  return p
}

export function invalidatePreviewCache(docId: number): void {
  cache.delete(docId)
}

export function __resetPreviewCacheForTests(): void {
  cache.clear()
}
```

`useDocuments.delete` calls `invalidatePreviewCache(id)` to evict.

**Global state** `composables/useCitationPreview.ts`:

```ts
import { ref } from 'vue'

interface PreviewState {
  visible: boolean
  x: number
  y: number
  docId: number | null
  pageNumber: number | null
}

const state = ref<PreviewState>({ visible: false, x: 0, y: 0, docId: null, pageNumber: null })
let hideTimer: ReturnType<typeof setTimeout> | null = null

export function useCitationPreview() {
  function show(x: number, y: number, docId: number, pageNumber: number) {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    state.value = { visible: true, x, y, docId, pageNumber }
  }
  function scheduleHide(delay = 200) {
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      state.value = { ...state.value, visible: false }
      hideTimer = null
    }, delay)
  }
  function cancelHide() {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }
  return { state, show, scheduleHide, cancelHide }
}
```

**Component** `components/chat/CitationPreview.vue`:

- Mounted once in `App.vue` (alongside `<Toast />`).
- Reads `useCitationPreview().state`.
- Computes positioned style from `state.x/y` with viewport clamping.
- When state changes to visible, loads the PDF via `getCachedPdfFor(...)` and renders the page at scale 1.0 onto an internal canvas (≈ 200x260 final size).
- Mouseenter on the popover cancels any pending hide (so the user can move the cursor to the popover); mouseleave schedules a hide.

**Mouseover delegation in `ChatMessage.vue`:**

```ts
function onHover(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('button.citation-chip') as HTMLButtonElement | null
  if (!btn || btn.classList.contains('stale')) return
  const docId = Number.parseInt(btn.getAttribute('data-doc-id') ?? '', 10)
  const pageNumber = Number.parseInt(btn.getAttribute('data-page') ?? '', 10)
  if (!Number.isFinite(docId) || !Number.isFinite(pageNumber)) return
  const rect = btn.getBoundingClientRect()
  preview.show(rect.right + 8, rect.top, docId, pageNumber)
}
function onUnhover(e: MouseEvent) {
  const btn = (e.relatedTarget as HTMLElement | null)?.closest?.('button.citation-chip')
  if (btn) return // moved to another chip — let its hover handler fire
  preview.scheduleHide()
}
```

Wired on the assistant message container only (user messages have no chips).

## 6. Definition of Done

- Viewer header has working `+` / `-` buttons + percent label; Cmd/Ctrl+`=`/`-`/`0` adjust zoom; canvas re-renders at the new scale without errors.
- Thumbnail toggle button reveals a left rail; thumbnails render lazily; current page highlighted; click jumps.
- Cmd/Ctrl+F opens a search bar; typing shows match list with snippets; click jumps; Esc closes.
- Hovering an assistant citation chip pops up a mini PDF page preview (cached per doc); mouseleave hides after 200ms.
- All 98 prior tests still pass + ~10 new (search, scale knob behavior, preview cache helpers).
- Tag `group-c-viewer`.

## 7. Risks

- **PDF.js render-task contention** between main viewer, thumbnail strip, and preview popover — each owns its own render task; cancellation already proven in M1. Verify under load (200-page doc).
- **Preview-cache memory leak** on rapid hover across many docs — cache is sized by # of docs, not pages, so should be bounded. `invalidatePreviewCache` called on delete.
- **Cmd+F overriding browser find** is a deliberate trade-off — search-in-PDF is what users actually want here, and the canvas-rendered text wouldn't match the browser find anyway.
- **IntersectionObserver in jsdom** isn't implemented — thumbnail tests would need a polyfill or component-test mock. Defer thumbnail rendering tests; cover via manual walk in Task 12.
- **Hover preview interferes with click** on chip — both work, mouseover doesn't block click. Verify in walkthrough.
