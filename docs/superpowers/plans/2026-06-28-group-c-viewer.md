# Group C — Viewer Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Ship C1 zoom + thumbnails, C2 in-PDF text search, C3 hover-citation preview.

**Tech Stack additions:** none.

---

## File structure

**Created:**

```
src/lib/pdfSearch.ts
src/lib/pdfPreview.ts
src/composables/useCitationPreview.ts
src/components/viewer/PdfThumbnailStrip.vue
src/components/viewer/ThumbCell.vue
src/components/viewer/PdfSearchBar.vue
src/components/chat/CitationPreview.vue
tests/lib/pdfSearch.spec.ts
tests/lib/pdfPreview.spec.ts
```

**Modified:**

```
src/lib/keyboard.ts                          + zoom/search shortcut actions
src/composables/useKeyboardShortcuts.ts      handler map gets new keys
src/composables/usePdfViewer.ts              + scale ref + zoomIn/Out/Reset
src/composables/useDocuments.ts              invalidate preview cache on delete
src/components/App.vue                       wire new shortcuts + mount CitationPreview
src/components/PdfViewer.vue                 zoom controls, thumb toggle, search toggle
src/components/chat/ChatMessage.vue          + hover delegation
```

---

## Task 1 — `usePdfViewer` zoom (scale ref + zoomIn/Out/Reset)

**Files:** `src/composables/usePdfViewer.ts`

- [ ] **Step 1.1 — Add scale state + actions + wire into draw**

In `src/composables/usePdfViewer.ts`, add at the top of the module after the existing refs:

```ts
const SCALE_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0] as const
const DEFAULT_SCALE = 1.5
const scale = ref<number>(DEFAULT_SCALE)
```

Replace `page.getViewport({ scale: 1.5 })` inside `drawCurrent` with `page.getViewport({ scale: scale.value })`.

Extend the watch:

```ts
watch([currentPdf, currentPage, scale], () => {
  if (canvas) void drawCurrent()
})
```

Add:

```ts
function zoomIn() {
  const i = SCALE_STEPS.indexOf(scale.value as (typeof SCALE_STEPS)[number])
  if (i >= 0 && i < SCALE_STEPS.length - 1) scale.value = SCALE_STEPS[i + 1]
}
function zoomOut() {
  const i = SCALE_STEPS.indexOf(scale.value as (typeof SCALE_STEPS)[number])
  if (i > 0) scale.value = SCALE_STEPS[i - 1]
}
function resetZoom() {
  scale.value = DEFAULT_SCALE
}
```

Add `scale, zoomIn, zoomOut, resetZoom` to the return object.

- [ ] **Step 1.2 — Typecheck + commit**

```bash
npx vue-tsc --noEmit 2>&1 | tail -3
git add src/composables/usePdfViewer.ts
git commit -m "feat(c1): usePdfViewer scale ref + zoomIn/Out/Reset"
```

---

## Task 2 — Keyboard shortcuts for zoom + search (TDD)

**Files:** `src/lib/keyboard.ts`, `src/composables/useKeyboardShortcuts.ts`, `tests/lib/keyboard.spec.ts`

- [ ] **Step 2.1 — Extend test file** — add inside the existing `describe('matchShortcut')`:

```ts
it('Meta+= / Meta++ returns zoomIn', () => {
  expect(matchShortcut(k({ key: '=', metaKey: true }), null)).toBe('zoomIn')
  expect(matchShortcut(k({ key: '+', metaKey: true }), null)).toBe('zoomIn')
})

it('Meta+- returns zoomOut', () => {
  expect(matchShortcut(k({ key: '-', metaKey: true }), null)).toBe('zoomOut')
})

it('Meta+0 returns resetZoom', () => {
  expect(matchShortcut(k({ key: '0', metaKey: true }), null)).toBe('resetZoom')
})

it('Meta+F returns openSearch', () => {
  expect(matchShortcut(k({ key: 'f', metaKey: true }), null)).toBe('openSearch')
  expect(matchShortcut(k({ key: 'F', ctrlKey: true }), null)).toBe('openSearch')
})
```

- [ ] **Step 2.2 — Run, expect failure**

- [ ] **Step 2.3 — Extend `src/lib/keyboard.ts`**

Add the new actions and matchers:

```ts
export type ShortcutAction =
  | 'prev'
  | 'next'
  | 'focusChat'
  | 'closeOrBlur'
  | 'zoomIn'
  | 'zoomOut'
  | 'resetZoom'
  | 'openSearch'

export function matchShortcut(
  e: KeyboardEvent,
  target: Element | null,
): ShortcutAction | null {
  if (e.key === 'Escape') return 'closeOrBlur'
  const meta = e.metaKey || e.ctrlKey
  if (meta && !e.shiftKey && !e.altKey) {
    const key = e.key.toLowerCase()
    if (key === 'k') return 'focusChat'
    if (key === 'f') return 'openSearch'
    if (e.key === '=' || e.key === '+') return 'zoomIn'
    if (e.key === '-') return 'zoomOut'
    if (e.key === '0') return 'resetZoom'
  }
  const inEditable = !!(
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.getAttribute('contenteditable') === 'true' ||
      (target as HTMLElement).isContentEditable)
  )
  if (!inEditable) {
    if (e.key === 'ArrowLeft') return 'prev'
    if (e.key === 'ArrowRight') return 'next'
  }
  return null
}
```

- [ ] **Step 2.4 — Update `ShortcutHandlers` in `useKeyboardShortcuts.ts`**

```ts
export interface ShortcutHandlers {
  prev(): void
  next(): void
  focusChat(): void
  closeOrBlur(): void
  zoomIn(): void
  zoomOut(): void
  resetZoom(): void
  openSearch(): void
}
```

- [ ] **Step 2.5 — Run + commit**

```bash
npm run test:run -- tests/lib/keyboard.spec.ts
git add src/lib/keyboard.ts src/composables/useKeyboardShortcuts.ts tests/lib/keyboard.spec.ts
git commit -m "feat(c1+c2): keyboard shortcuts for zoom and search"
```

---

## Task 3 — Zoom controls + thumbnails toggle in PdfViewer header

**Files:** `src/components/PdfViewer.vue`

- [ ] **Step 3.1 — Update `PdfViewer.vue` script**

```ts
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDocuments } from '@/composables/useDocuments'
import { usePdfViewer } from '@/composables/usePdfViewer'
import PdfThumbnailStrip from './viewer/PdfThumbnailStrip.vue'

const { activeDoc, activeId, getBlob } = useDocuments()
const {
  currentPage, numPages, bindCanvas, prev, next, setActive,
  scale, zoomIn, zoomOut, resetZoom,
} = usePdfViewer()

const thumbsOpen = ref(false)

watch(activeId, async (id) => {
  if (id == null) {
    await setActive(null)
    return
  }
  const blob = await getBlob(id)
  await setActive(blob)
}, { immediate: true })

const zoomLabel = () => `${Math.round(scale.value * 100)}%`
</script>
```

- [ ] **Step 3.2 — Update the header layout** — replace the existing `<div class="flex items-center gap-3">` with:

```vue
<div class="flex items-center gap-2">
  <button
    class="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition text-zinc-500"
    title="Zoom out (⌘−)"
    @click="zoomOut"
  >
    <i class="fa-solid fa-magnifying-glass-minus text-xs"></i>
  </button>
  <button
    class="px-2 py-1 text-[11px] font-medium rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition text-zinc-500"
    title="Reset zoom (⌘0)"
    @click="resetZoom"
  >
    {{ zoomLabel() }}
  </button>
  <button
    class="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition text-zinc-500"
    title="Zoom in (⌘+)"
    @click="zoomIn"
  >
    <i class="fa-solid fa-magnifying-glass-plus text-xs"></i>
  </button>
  <div class="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1"></div>
  <button
    :class="[
      'p-1.5 rounded transition',
      thumbsOpen
        ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300'
        : 'hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500',
    ]"
    title="Toggle page thumbnails"
    @click="thumbsOpen = !thumbsOpen"
  >
    <i class="fa-solid fa-table-cells text-xs"></i>
  </button>
  <div class="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1"></div>
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
```

- [ ] **Step 3.3 — Wrap the canvas pane** so thumbnails sit to the left:

```vue
<div class="flex-1 overflow-hidden flex">
  <PdfThumbnailStrip v-if="thumbsOpen" />
  <div class="flex-1 overflow-y-auto p-4 flex justify-center bg-zinc-100 dark:bg-zinc-950">
    <canvas
      :ref="(el) => bindCanvas(el as HTMLCanvasElement | null)"
      class="shadow-lg max-w-full h-auto"
    ></canvas>
  </div>
</div>
```

- [ ] **Step 3.4 — Typecheck + commit**

```bash
npx vue-tsc --noEmit 2>&1 | tail -3
git add src/components/PdfViewer.vue
git commit -m "feat(c1): zoom controls + thumbnail-toggle button in viewer header"
```

---

## Task 4 — `PdfThumbnailStrip.vue` + `ThumbCell.vue`

**Files:** `src/components/viewer/PdfThumbnailStrip.vue`, `src/components/viewer/ThumbCell.vue`

- [ ] **Step 4.1 — Create `ThumbCell.vue`**

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type * as pdfjsLib from 'pdfjs-dist'
import { usePdfViewer } from '@/composables/usePdfViewer'

const props = defineProps<{ pageNumber: number }>()

const { currentPdf } = usePdfViewer()
const canvas = ref<HTMLCanvasElement | null>(null)
let task: pdfjsLib.RenderTask | null = null
let observer: IntersectionObserver | null = null
let rendered = false

async function render() {
  if (rendered || !currentPdf.value || !canvas.value) return
  rendered = true
  const page = await currentPdf.value.getPage(props.pageNumber)
  const vp = page.getViewport({ scale: 0.2 })
  canvas.value.width = vp.width
  canvas.value.height = vp.height
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return
  task = page.render({ canvasContext: ctx, viewport: vp })
  try {
    await task.promise
  } catch (err) {
    if ((err as Error).name !== 'RenderingCancelledException') throw err
  } finally {
    task = null
  }
}

onMounted(() => {
  if (!canvas.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer?.disconnect()
        observer = null
        void render()
      }
    },
    { rootMargin: '100px' },
  )
  observer.observe(canvas.value.parentElement!)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  try {
    task?.cancel()
  } catch {
    /* ignore */
  }
})
</script>

<template>
  <canvas ref="canvas" class="block bg-white dark:bg-zinc-800"></canvas>
</template>
```

- [ ] **Step 4.2 — Create `PdfThumbnailStrip.vue`**

```vue
<script setup lang="ts">
import { usePdfViewer } from '@/composables/usePdfViewer'
import ThumbCell from './ThumbCell.vue'

const { currentPdf, numPages, currentPage, goTo } = usePdfViewer()
</script>

<template>
  <aside
    v-if="currentPdf"
    class="w-24 flex-shrink-0 overflow-y-auto bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 p-2 flex flex-col gap-2"
  >
    <button
      v-for="n in numPages"
      :key="n"
      :class="[
        'block w-full p-1 rounded border text-[10px] text-zinc-500 dark:text-zinc-400 transition',
        currentPage === n
          ? 'border-indigo-500 ring-1 ring-indigo-500'
          : 'border-zinc-200 dark:border-zinc-700 hover:border-indigo-300',
      ]"
      @click="goTo(n)"
    >
      <ThumbCell :page-number="n" />
      <span class="block mt-1">{{ n }}</span>
    </button>
  </aside>
</template>
```

- [ ] **Step 4.3 — Typecheck + commit**

```bash
npx vue-tsc --noEmit 2>&1 | tail -3
git add src/components/viewer
git commit -m "feat(c1): PdfThumbnailStrip with lazy-rendered ThumbCells"
```

---

## Task 5 — `lib/pdfSearch.ts` (TDD)

**Files:** `src/lib/pdfSearch.ts`, `tests/lib/pdfSearch.spec.ts`

- [ ] **Step 5.1 — Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { searchPages } from '@/lib/pdfSearch'
import type { PageText } from '@/types/domain'

const pages: PageText[] = [
  { pageNumber: 1, text: 'The quick brown fox jumps over the lazy dog.' },
  { pageNumber: 2, text: 'A second page mentions FOX twice; the fox here.' },
  { pageNumber: 3, text: 'No match on this page.' },
]

describe('searchPages', () => {
  it('returns empty for empty query', () => {
    expect(searchPages('', pages)).toEqual([])
    expect(searchPages('   ', pages)).toEqual([])
  })

  it('finds case-insensitive substring matches across pages', () => {
    const m = searchPages('fox', pages)
    expect(m.map((x) => x.pageNumber)).toEqual([1, 2, 2])
  })

  it('returns multiple matches on the same page in document order', () => {
    const m = searchPages('fox', pages.filter((p) => p.pageNumber === 2))
    expect(m).toHaveLength(2)
    expect(m[0].pageNumber).toBe(2)
  })

  it('produces snippets with ellipsis when context is truncated', () => {
    const m = searchPages('fox', pages)
    const first = m[0]
    expect(first.snippet.toLowerCase()).toContain('fox')
    expect(first.snippet.length).toBeLessThan(120)
  })

  it('matchOffset + matchLength point at the matched substring inside snippet', () => {
    const m = searchPages('fox', pages)
    const first = m[0]
    const slice = first.snippet.slice(first.matchOffset, first.matchOffset + first.matchLength)
    expect(slice.toLowerCase()).toBe('fox')
  })

  it('returns empty when no match', () => {
    expect(searchPages('xyzzy', pages)).toEqual([])
  })
})
```

- [ ] **Step 5.2 — Implement `src/lib/pdfSearch.ts`**

```ts
import type { PageText } from '@/types/domain'

export interface SearchMatch {
  pageNumber: number
  /** Substring of original page text around the match. */
  snippet: string
  /** Offset of the match within `snippet`. */
  matchOffset: number
  matchLength: number
}

const SNIPPET_RADIUS = 40

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
      const leading = start > 0 ? '…' : ''
      const trailing = end < p.text.length ? '…' : ''
      const snippet = leading + p.text.slice(start, end) + trailing
      out.push({
        pageNumber: p.pageNumber,
        snippet,
        matchOffset: idx - start + leading.length,
        matchLength: needle.length,
      })
      from = idx + needle.length
    }
  }
  return out
}
```

- [ ] **Step 5.3 — Run + commit**

```bash
npm run test:run -- tests/lib/pdfSearch.spec.ts
git add src/lib/pdfSearch.ts tests/lib/pdfSearch.spec.ts
git commit -m "feat(c2): searchPages helper with snippet + offset"
```

---

## Task 6 — `PdfSearchBar.vue` component

**Files:** `src/components/viewer/PdfSearchBar.vue`

- [ ] **Step 6.1 — Create the component**

```vue
<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useDocuments } from '@/composables/useDocuments'
import { usePdfViewer } from '@/composables/usePdfViewer'
import { searchPages, type SearchMatch } from '@/lib/pdfSearch'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { activeDoc } = useDocuments()
const { goTo } = usePdfViewer()

const query = ref('')
const input = ref<HTMLInputElement | null>(null)
const activeIdx = ref(0)

const matches = computed<SearchMatch[]>(() =>
  activeDoc.value ? searchPages(query.value, activeDoc.value.pages) : [],
)

async function onOpen() {
  if (!props.open) return
  await nextTick()
  input.value?.focus()
  input.value?.select()
}

function snippetHtml(m: SearchMatch): string {
  const before = m.snippet.slice(0, m.matchOffset)
  const match = m.snippet.slice(m.matchOffset, m.matchOffset + m.matchLength)
  const after = m.snippet.slice(m.matchOffset + m.matchLength)
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  return `${esc(before)}<mark>${esc(match)}</mark>${esc(after)}`
}

function jumpTo(i: number) {
  if (i < 0 || i >= matches.value.length) return
  activeIdx.value = i
  goTo(matches.value[i].pageNumber)
}

function next() { jumpTo((activeIdx.value + 1) % Math.max(1, matches.value.length)) }
function prev() { jumpTo((activeIdx.value - 1 + matches.value.length) % Math.max(1, matches.value.length)) }

function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) prev()
    else next()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  void onOpen()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

import { watch } from 'vue'
watch(() => props.open, onOpen)
watch(query, () => { activeIdx.value = 0 })
</script>

<template>
  <div
    v-if="open"
    class="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex flex-col"
  >
    <div class="px-3 py-2 flex items-center gap-2">
      <i class="fa-solid fa-magnifying-glass text-zinc-400 text-xs"></i>
      <input
        ref="input"
        v-model="query"
        type="text"
        placeholder="Search in this PDF…"
        class="flex-1 bg-transparent border-0 outline-none text-sm placeholder-zinc-400"
      />
      <span v-if="matches.length > 0" class="text-[11px] text-zinc-500">
        {{ activeIdx + 1 }} of {{ matches.length }}
      </span>
      <button class="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500" @click="prev">
        <i class="fa-solid fa-chevron-up text-xs"></i>
      </button>
      <button class="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500" @click="next">
        <i class="fa-solid fa-chevron-down text-xs"></i>
      </button>
      <button class="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500" @click="$emit('close')">
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>
    </div>
    <div v-if="query && matches.length === 0" class="px-4 py-2 text-xs text-zinc-400">
      No matches
    </div>
    <div v-else-if="matches.length > 0" class="max-h-60 overflow-y-auto border-t border-zinc-200 dark:border-zinc-800">
      <button
        v-for="(m, i) in matches"
        :key="i"
        :class="[
          'w-full text-left px-3 py-2 text-xs flex gap-2 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0',
          i === activeIdx
            ? 'bg-indigo-50 dark:bg-indigo-900/30'
            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
        ]"
        @click="jumpTo(i)"
      >
        <span class="text-zinc-400 font-medium w-10 flex-shrink-0">p.{{ m.pageNumber }}</span>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span class="text-zinc-700 dark:text-zinc-300 truncate" v-html="snippetHtml(m)"></span>
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 6.2 — Commit**

```bash
git add src/components/viewer/PdfSearchBar.vue
git commit -m "feat(c2): PdfSearchBar with snippet results + prev/next"
```

---

## Task 7 — Wire search toggle into PdfViewer + Cmd/Ctrl+F shortcut

**Files:** `src/components/PdfViewer.vue`, `src/components/App.vue`

- [ ] **Step 7.1 — Add search state + toggle button + bar to `PdfViewer.vue`**

In `<script setup>`:
```ts
import PdfSearchBar from './viewer/PdfSearchBar.vue'
const searchOpen = ref(false)
function openSearch() { searchOpen.value = true }
function closeSearch() { searchOpen.value = false }
defineExpose({ openSearch })
```

In the header (after the thumbnails toggle), add:
```vue
<button
  :class="[
    'p-1.5 rounded transition',
    searchOpen
      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300'
      : 'hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500',
  ]"
  title="Search in document (⌘F)"
  @click="searchOpen = !searchOpen"
>
  <i class="fa-solid fa-magnifying-glass text-xs"></i>
</button>
```

Insert `<PdfSearchBar :open="searchOpen" @close="closeSearch" />` between the header `<div class="p-4 border-b...">` block and the `<div class="flex-1 overflow-hidden flex">` block.

- [ ] **Step 7.2 — Wire `openSearch` action in `App.vue`**

In `src/App.vue`:

```ts
const viewerRef = ref<InstanceType<typeof PdfViewer> | null>(null)
const { prev, next, zoomIn, zoomOut, resetZoom } = usePdfViewer()

useKeyboardShortcuts({
  prev,
  next,
  focusChat() { chatPanelRef.value?.focusInput() },
  closeOrBlur() {
    const a = document.activeElement as HTMLElement | null
    if (a && a !== document.body) a.blur()
  },
  zoomIn,
  zoomOut,
  resetZoom,
  openSearch() { viewerRef.value?.openSearch() },
})
```

And `<PdfViewer ref="viewerRef" />` in the template.

- [ ] **Step 7.3 — Typecheck + commit**

```bash
npx vue-tsc --noEmit 2>&1 | tail -3
git add src/components/PdfViewer.vue src/App.vue
git commit -m "feat(c2): wire search toggle button + ⌘F shortcut"
```

---

## Task 8 — `lib/pdfPreview.ts` (cached PDF loader) + tests

**Files:** `src/lib/pdfPreview.ts`, `tests/lib/pdfPreview.spec.ts`

- [ ] **Step 8.1 — Create the helper**

```ts
import type * as pdfjsLib from 'pdfjs-dist'
import { loadPdfFromBlob } from './pdf'

const cache = new Map<number, Promise<pdfjsLib.PDFDocumentProxy>>()

export function getCachedPdfFor(
  docId: number,
  blob: Blob,
): Promise<pdfjsLib.PDFDocumentProxy> {
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

- [ ] **Step 8.2 — Write the test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getCachedPdfFor,
  invalidatePreviewCache,
  __resetPreviewCacheForTests,
} from '@/lib/pdfPreview'

const __dirname = dirname(fileURLToPath(import.meta.url))
const buf = readFileSync(resolve(__dirname, '../fixtures/sample.pdf'))
const blob = new Blob([buf], { type: 'application/pdf' })

describe('pdfPreview cache', () => {
  beforeEach(() => __resetPreviewCacheForTests())

  it('returns a PDFDocumentProxy for a fresh docId', async () => {
    const pdf = await getCachedPdfFor(1, blob)
    expect(pdf.numPages).toBeGreaterThan(0)
  })

  it('returns the same Promise instance for the same docId', () => {
    const p1 = getCachedPdfFor(1, blob)
    const p2 = getCachedPdfFor(1, blob)
    expect(p1).toBe(p2)
  })

  it('invalidatePreviewCache drops the cached entry', async () => {
    const p1 = getCachedPdfFor(1, blob)
    invalidatePreviewCache(1)
    const p2 = getCachedPdfFor(1, blob)
    expect(p1).not.toBe(p2)
    await p1
    await p2
  })
})
```

- [ ] **Step 8.3 — Wire eviction into `useDocuments.delete`**

In `src/composables/useDocuments.ts`, after the existing `getRetriever().removeDocument(id)` line, add:

```ts
const { invalidatePreviewCache } = await import('@/lib/pdfPreview')
invalidatePreviewCache(id)
```

- [ ] **Step 8.4 — Run + commit**

```bash
npm run test:run -- tests/lib/pdfPreview.spec.ts
git add src/lib/pdfPreview.ts tests/lib/pdfPreview.spec.ts src/composables/useDocuments.ts
git commit -m "feat(c3): cached PDF loader for citation previews + eviction on delete"
```

---

## Task 9 — `useCitationPreview` composable + `CitationPreview.vue`

**Files:** `src/composables/useCitationPreview.ts`, `src/components/chat/CitationPreview.vue`, `src/App.vue`

- [ ] **Step 9.1 — Create the composable**

```ts
// src/composables/useCitationPreview.ts
import { ref } from 'vue'

export interface PreviewState {
  visible: boolean
  x: number
  y: number
  docId: number | null
  pageNumber: number | null
}

const state = ref<PreviewState>({ visible: false, x: 0, y: 0, docId: null, pageNumber: null })
let hideTimer: ReturnType<typeof setTimeout> | null = null

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

export function useCitationPreview() {
  return { state, show, scheduleHide, cancelHide }
}
```

- [ ] **Step 9.2 — Create the component**

```vue
<!-- src/components/chat/CitationPreview.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type * as pdfjsLib from 'pdfjs-dist'
import { useDocuments } from '@/composables/useDocuments'
import { useCitationPreview } from '@/composables/useCitationPreview'
import { getCachedPdfFor } from '@/lib/pdfPreview'

const { state, cancelHide, scheduleHide } = useCitationPreview()
const { documents, getBlob } = useDocuments()

const canvas = ref<HTMLCanvasElement | null>(null)
const loading = ref(false)
let task: pdfjsLib.RenderTask | null = null

const docName = computed(() => {
  if (state.value.docId == null) return ''
  return documents.value.find((d) => d.id === state.value.docId)?.name ?? '(removed)'
})

// Position with viewport clamping (popover ~ 220x300).
const PREVIEW_W = 220
const PREVIEW_H = 300
const posStyle = computed(() => {
  const x = Math.min(window.innerWidth - PREVIEW_W - 8, Math.max(8, state.value.x))
  const y = Math.min(window.innerHeight - PREVIEW_H - 8, Math.max(8, state.value.y))
  return `left: ${x}px; top: ${y}px;`
})

async function renderInto() {
  if (!state.value.visible || !canvas.value) return
  const { docId, pageNumber } = state.value
  if (docId == null || pageNumber == null) return
  loading.value = true
  try {
    const blob = await getBlob(docId)
    if (!blob) return
    const pdf = await getCachedPdfFor(docId, blob)
    const page = await pdf.getPage(pageNumber)
    const vp = page.getViewport({ scale: 1.0 })
    // Fit width into PREVIEW_W
    const fit = PREVIEW_W / vp.width
    const v2 = page.getViewport({ scale: fit })
    canvas.value.width = v2.width
    canvas.value.height = v2.height
    const ctx = canvas.value.getContext('2d')
    if (!ctx) return
    try {
      task?.cancel()
    } catch {
      /* ignore */
    }
    task = page.render({ canvasContext: ctx, viewport: v2 })
    await task.promise.catch((e) => {
      if ((e as Error).name !== 'RenderingCancelledException') throw e
    })
  } finally {
    loading.value = false
    task = null
  }
}

watch(
  () => [state.value.visible, state.value.docId, state.value.pageNumber] as const,
  () => {
    if (state.value.visible) void renderInto()
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="state.visible"
    class="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl p-2 pointer-events-auto"
    :style="posStyle"
    @mouseenter="cancelHide"
    @mouseleave="scheduleHide()"
  >
    <div class="text-[10px] text-zinc-500 dark:text-zinc-400 px-1 pb-1 truncate">
      {{ docName }} · page {{ state.pageNumber }}
    </div>
    <canvas ref="canvas" class="block bg-white dark:bg-zinc-800 max-w-full"></canvas>
    <div v-if="loading" class="text-[10px] text-zinc-400 mt-1 text-center">Loading…</div>
  </div>
</template>
```

- [ ] **Step 9.3 — Mount `<CitationPreview />` in `App.vue`** alongside `<Toast />`

- [ ] **Step 9.4 — Typecheck + commit**

```bash
npx vue-tsc --noEmit 2>&1 | tail -3
git add src/composables/useCitationPreview.ts src/components/chat/CitationPreview.vue src/App.vue
git commit -m "feat(c3): CitationPreview popover + useCitationPreview state"
```

---

## Task 10 — Mouseover delegation in `ChatMessage.vue`

**Files:** `src/components/chat/ChatMessage.vue`

- [ ] **Step 10.1 — Add hover delegation**

In `<script setup>`:

```ts
import { useCitationPreview } from '@/composables/useCitationPreview'
const preview = useCitationPreview()

function onHover(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('button.citation-chip') as HTMLButtonElement | null
  if (!btn || btn.classList.contains('stale')) return
  const docId = Number.parseInt(btn.getAttribute('data-doc-id') ?? '', 10)
  const pageNumber = Number.parseInt(btn.getAttribute('data-page') ?? '', 10)
  if (!Number.isFinite(docId) || !Number.isFinite(pageNumber)) return
  const rect = btn.getBoundingClientRect()
  preview.show(rect.right + 8, rect.top - 8, docId, pageNumber)
}
function onUnhover(e: MouseEvent) {
  const next = (e.relatedTarget as HTMLElement | null)?.closest?.('button.citation-chip')
  if (next) return
  preview.scheduleHide()
}
```

In the assistant rendered div, change:

```vue
<div ref="root" v-html="rendered" @click="onClick"></div>
```

to:

```vue
<div
  ref="root"
  v-html="rendered"
  @click="onClick"
  @mouseover="onHover"
  @mouseout="onUnhover"
></div>
```

- [ ] **Step 10.2 — Run tests; existing ChatMessage specs still pass**

```bash
npm run test:run -- tests/components/chat/ChatMessage.spec.ts
```

- [ ] **Step 10.3 — Commit**

```bash
git add src/components/chat/ChatMessage.vue
git commit -m "feat(c3): chat-message hover delegation triggers CitationPreview"
```

---

## Task 11 — Full green + tag

- [ ] **Step 11.1**

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build 2>&1 | grep -E '\.(js|css)' | tail -5
```
Expected: ≥ 108 tests pass.

- [ ] **Step 11.2 — Tag**

```bash
git status
git add -A
git commit -m "chore(group-c): fixups" --allow-empty
git tag -a group-c-viewer -m "Group C: viewer enhancements

C1: zoom (7 discrete steps + ⌘+/-/0) + thumbnail strip
C2: in-PDF text search (lib/pdfSearch + ⌘F + PdfSearchBar)
C3: hover-citation preview (cached PDF loader + CitationPreview)"
git log --oneline | head -18
git tag --list
```

---

## DoD

- Viewer header: +/-/% zoom controls; thumbnail toggle; search toggle.
- Cmd/Ctrl+`=`/`-`/`0`/`F` work as expected.
- Thumbnails render lazily, highlight current page, click jumps.
- Search input lists matches with snippets + counter; Enter / Shift+Enter cycles; click jumps; Esc closes.
- Hovering an assistant citation chip pops up a mini PDF page preview (cached per doc); mouseleave hides after 200ms.
- All M1-B tests still pass + ≥ 10 new.
- Tag `group-c-viewer`.
