# Group A — Foundation Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship four independent foundation improvements: static-copy plugin for fonts (drop 800KB from git), real tokenizer (replace chars/4), durable storage request, and a component-render test scaffold for three SFCs.

**Architecture:** Each item is isolated. Order is dictated only by deps (A1 before deleting fonts; A2 before useChat wiring; A3 before main.ts wiring; A4 last).

**Tech Stack additions:** `vite-plugin-static-copy@^2.0`, `gpt-tokenizer@^2.5`. No removals.

---

## File structure

**Created:**

```
src/lib/tokenizer.ts
src/lib/durableStorage.ts
tests/lib/tokenizer.spec.ts
tests/components/chat/ChatMessage.spec.ts
tests/components/chat/ChatInput.spec.ts
tests/components/chat/AttachedDocsBar.spec.ts
```

**Modified:**

```
vite.config.ts            add viteStaticCopy plugin
.gitignore                add public/standard-fonts/
src/composables/useChat.ts  use estimateTokens
src/main.ts               call requestDurableStorage
```

**Deleted:**

```
public/standard-fonts/   (16 files, ~800KB) — regenerated at build
```

---

## Task 1 — A1: Install + wire vite-plugin-static-copy

**Files:** `package.json`, `vite.config.ts`, `.gitignore`, `public/standard-fonts/` (deleted)

- [ ] **Step 1.1 — Install**

```bash
cd /Users/aminsadiq/Desktop/ValetProjects/pdf-parser
npm install -D 'vite-plugin-static-copy@^2.0'
```

- [ ] **Step 1.2 — Update `vite.config.ts`** to add the plugin

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pdfjs-dist/standard_fonts/*',
          dest: 'standard-fonts',
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173, open: false },
  build: { sourcemap: true, target: 'es2022' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: { reporter: ['text', 'html'] },
  },
})
```

- [ ] **Step 1.3 — Extend `.gitignore`** (insert at the bottom):

```
# Generated at build by vite-plugin-static-copy
public/standard-fonts/
```

- [ ] **Step 1.4 — Remove the committed font directory**

```bash
git rm -r public/standard-fonts/
```

- [ ] **Step 1.5 — Build + smoke-check the output**

```bash
npm run build && ls -1 dist/standard-fonts/ | wc -l && du -sh public/ 2>/dev/null || echo "public/ is gone (or has only other files)"
```

Expected: `16` files in `dist/standard-fonts/`, `public/` either gone or under 1KB.

- [ ] **Step 1.6 — Commit**

```bash
git add -A
git commit -m "feat(a1): generate standard-fonts via vite-plugin-static-copy

Drops 800KB of binary fonts from git. Fonts now copied from
node_modules/pdfjs-dist/standard_fonts at dev + build time.
public/standard-fonts/ is .gitignored as a safety belt."
```

---

## Task 2 — A2: gpt-tokenizer + `estimateTokens` helper (TDD)

**Files:** `package.json`, `src/lib/tokenizer.ts`, `tests/lib/tokenizer.spec.ts`

- [ ] **Step 2.1 — Install**

```bash
npm install 'gpt-tokenizer@^2.5'
```

- [ ] **Step 2.2 — Write the failing test** (`tests/lib/tokenizer.spec.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { estimateTokens } from '@/lib/tokenizer'

describe('estimateTokens', () => {
  it('returns 0 for empty input', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('counts a short ASCII sentence', () => {
    // "Hello world" is two whitespace-split words but the tokenizer may
    // split differently. Assert a small positive number.
    const n = estimateTokens('Hello world')
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThan(10)
  })

  it('scales with text length', () => {
    const short = estimateTokens('the quick brown fox')
    const longer = estimateTokens('the quick brown fox '.repeat(100))
    expect(longer).toBeGreaterThan(short * 50)
  })
})
```

- [ ] **Step 2.3 — Run, expect failure** (module not found)

```bash
npm run test:run -- tests/lib/tokenizer.spec.ts
```

- [ ] **Step 2.4 — Implement `src/lib/tokenizer.ts`**

```ts
import { encode } from 'gpt-tokenizer'

/** Returns the cl100k_base token count of the given text. */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return encode(text).length
}
```

- [ ] **Step 2.5 — Run tests, expect pass**

- [ ] **Step 2.6 — Commit**

```bash
git add package.json package-lock.json src/lib/tokenizer.ts tests/lib/tokenizer.spec.ts
git commit -m "feat(a2): add estimateTokens via gpt-tokenizer (cl100k_base)"
```

---

## Task 3 — A2: Wire `estimateTokens` into useChat

**Files:** `src/composables/useChat.ts`

- [ ] **Step 3.1 — Replace the estimate**

In `src/composables/useChat.ts`, replace:

```ts
let totalChars = 0
for (const d of docs) for (const p of d.pages) totalChars += p.text.length
const estTokens = totalChars / 4
```

with:

```ts
const allText: string[] = []
for (const d of docs) for (const p of d.pages) allText.push(p.text)
const estTokens = estimateTokens(allText.join('\n'))
```

Add at the top of the file: `import { estimateTokens } from '@/lib/tokenizer'`.

- [ ] **Step 3.2 — Run all tests; useChat suite should still pass**

```bash
npm run test:run --silent | tail -5
```

> The retrieval test in `useChat.spec.ts` uses ~520k chars; cl100k_base counts that as ~130k tokens (still well above the 16k budget), so the assertion still holds.

- [ ] **Step 3.3 — Commit**

```bash
git add src/composables/useChat.ts
git commit -m "feat(a2): useChat uses gpt-tokenizer instead of chars/4 estimate"
```

---

## Task 4 — A3: Durable storage helper + main.ts wiring

**Files:** `src/lib/durableStorage.ts`, `src/main.ts`

- [ ] **Step 4.1 — Create `src/lib/durableStorage.ts`**

```ts
export async function requestDurableStorage(): Promise<{
  supported: boolean
  persisted: boolean
}> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return { supported: false, persisted: false }
  }
  try {
    if (await navigator.storage.persisted()) {
      return { supported: true, persisted: true }
    }
    return { supported: true, persisted: await navigator.storage.persist() }
  } catch {
    return { supported: true, persisted: false }
  }
}
```

- [ ] **Step 4.2 — Wire into `src/main.ts`** (after `await initStore()`):

```ts
import { requestDurableStorage } from '@/lib/durableStorage'
// ...
await initStore()
void requestDurableStorage()  // fire-and-forget
```

- [ ] **Step 4.3 — Build + commit**

```bash
npm run build 2>&1 | tail -5
git add src/lib/durableStorage.ts src/main.ts
git commit -m "feat(a3): request durable storage from browser at app start"
```

---

## Task 5 — A4: ChatMessage component test

**Files:** `tests/components/chat/ChatMessage.spec.ts`

- [ ] **Step 5.1 — Write the test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatMessage from '@/components/chat/ChatMessage.vue'
import type { Message } from '@/types/domain'

const jumpToPage = vi.fn()

vi.mock('@/composables/useDocuments', () => ({
  useDocuments: () => ({
    documents: { value: [{ id: 1, name: 'a.pdf', size: 0, numPages: 5, pages: [], addedAt: 0 }] },
  }),
}))

vi.mock('@/composables/usePdfViewer', () => ({
  usePdfViewer: () => ({ jumpToPage }),
}))

function userMsg(text = 'hi'): Message {
  return { id: 1, threadId: 1, role: 'user', text, createdAt: 1 }
}

function botMsg(text: string, citations?: Message['citations'], error = false): Message {
  return { id: 2, threadId: 1, role: 'assistant', text, citations, createdAt: 2, error }
}

describe('ChatMessage', () => {
  beforeEach(() => jumpToPage.mockReset())

  it('renders user message in the right-aligned bubble', () => {
    const wrap = mount(ChatMessage, { props: { msg: userMsg('hello world') } })
    expect(wrap.html()).toContain('hello world')
    expect(wrap.find('.bg-indigo-600').exists()).toBe(true)
  })

  it('renders assistant message in the left bubble', () => {
    const wrap = mount(ChatMessage, { props: { msg: botMsg('I am bot') } })
    expect(wrap.html()).toContain('I am bot')
    expect(wrap.find('.fa-robot').exists()).toBe(true)
  })

  it('shows the error footer when msg.error is true', () => {
    const wrap = mount(ChatMessage, {
      props: { msg: botMsg('**Error:** boom', undefined, true) },
    })
    expect(wrap.text()).toContain('Failed to get response')
  })

  it('renders a citation chip and calls jumpToPage on click', async () => {
    const wrap = mount(ChatMessage, {
      props: {
        msg: botMsg('See [A:p3].', [{ docId: 1, pageNumber: 3 }]),
      },
    })
    const chip = wrap.find('button.citation-chip')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('a.pdf · p.3')
    await chip.trigger('click')
    expect(jumpToPage).toHaveBeenCalledWith(1, 3)
  })

  it('does not call jumpToPage when chip is stale', async () => {
    const wrap = mount(ChatMessage, {
      props: {
        msg: botMsg('See [A:p3].', [{ docId: 999, pageNumber: 3 }]),
      },
    })
    const chip = wrap.find('button.citation-chip.stale')
    expect(chip.exists()).toBe(true)
    await chip.trigger('click')
    expect(jumpToPage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 5.2 — Run tests**

```bash
npm run test:run -- tests/components/chat/ChatMessage.spec.ts
```
Expected: 5 pass.

- [ ] **Step 5.3 — Commit**

```bash
git add tests/components/chat/ChatMessage.spec.ts
git commit -m "test(a4): component-render tests for ChatMessage (incl. citation chip)"
```

---

## Task 6 — A4: ChatInput component test

**Files:** `tests/components/chat/ChatInput.spec.ts`

- [ ] **Step 6.1 — Write the test**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatInput from '@/components/chat/ChatInput.vue'

describe('ChatInput', () => {
  it('emits send with the typed text on submit', async () => {
    const wrap = mount(ChatInput, { props: { disabled: false } })
    const input = wrap.find('input[type="text"]')
    await input.setValue('what is going on')
    await wrap.find('form').trigger('submit')
    expect(wrap.emitted('send')?.[0]).toEqual(['what is going on'])
  })

  it('does not emit when input is whitespace-only', async () => {
    const wrap = mount(ChatInput, { props: { disabled: false } })
    await wrap.find('input[type="text"]').setValue('   ')
    await wrap.find('form').trigger('submit')
    expect(wrap.emitted('send')).toBeUndefined()
  })

  it('shows the Stop button while streaming and emits stop on submit', async () => {
    const wrap = mount(ChatInput, { props: { disabled: false, streaming: true } })
    expect(wrap.find('button[title="Stop"]').exists()).toBe(true)
    expect(wrap.find('button[type="submit"] .fa-paper-plane').exists()).toBe(false)
    await wrap.find('form').trigger('submit')
    expect(wrap.emitted('stop')).toBeTruthy()
    expect(wrap.emitted('send')).toBeUndefined()
  })
})
```

- [ ] **Step 6.2 — Run + commit**

```bash
npm run test:run -- tests/components/chat/ChatInput.spec.ts
git add tests/components/chat/ChatInput.spec.ts
git commit -m "test(a4): component-render tests for ChatInput (send/stop)"
```

---

## Task 7 — A4: AttachedDocsBar component test

**Files:** `tests/components/chat/AttachedDocsBar.spec.ts`

- [ ] **Step 7.1 — Write the test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import AttachedDocsBar from '@/components/chat/AttachedDocsBar.vue'

const attachDoc = vi.fn()
const detachDoc = vi.fn()
const docsRef = ref([
  { id: 1, name: 'a.pdf', size: 1, numPages: 1, pages: [], addedAt: 0 },
  { id: 2, name: 'b.pdf', size: 1, numPages: 1, pages: [], addedAt: 0 },
])
const activeThreadRef = computed(() => ({
  id: 99,
  name: '',
  docIds: [1],
  createdAt: 0,
  updatedAt: 0,
}))

vi.mock('@/composables/useDocuments', () => ({
  useDocuments: () => ({ documents: docsRef }),
}))

vi.mock('@/composables/useThreads', () => ({
  useThreads: () => ({ activeThread: activeThreadRef, attachDoc, detachDoc }),
}))

describe('AttachedDocsBar', () => {
  beforeEach(() => {
    attachDoc.mockReset()
    detachDoc.mockReset()
  })

  it('renders a chip for each attached doc', () => {
    const wrap = mount(AttachedDocsBar)
    const chipText = wrap.text()
    expect(chipText).toContain('a.pdf')
    expect(chipText).not.toContain('b.pdf') // b is unattached
  })

  it('emits detach via composable on chip × click', async () => {
    const wrap = mount(AttachedDocsBar)
    const xBtn = wrap.find('button[title="Detach"]')
    expect(xBtn.exists()).toBe(true)
    await xBtn.trigger('click')
    expect(detachDoc).toHaveBeenCalledWith(99, 1)
  })

  it('toggles the picker open on + click', async () => {
    const wrap = mount(AttachedDocsBar)
    expect(wrap.find('button[role="button"]')).toBeDefined()
    // Picker is closed initially
    expect(wrap.findAll('button').filter((b) => b.text() === 'b.pdf')).toHaveLength(0)
    // Click the "+ Attach" button
    const plus = wrap
      .findAll('button')
      .find((b) => b.text().includes('Attach') && !b.attributes('title'))
    expect(plus).toBeTruthy()
    await plus!.trigger('mousedown')
    // Picker now shows b.pdf (the only unattached doc)
    const pickerItems = wrap.findAll('button').filter((b) => b.text() === 'b.pdf')
    expect(pickerItems.length).toBe(1)
  })
})
```

- [ ] **Step 7.2 — Run + commit**

```bash
npm run test:run -- tests/components/chat/AttachedDocsBar.spec.ts
git add tests/components/chat/AttachedDocsBar.spec.ts
git commit -m "test(a4): component-render tests for AttachedDocsBar"
```

---

## Task 8 — Full green + tag

- [ ] **Step 8.1 — All checks**

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build 2>&1 | tail -8
```
Expected: typecheck 0, lint 0, tests ≥ 70 pass, build succeeds.

- [ ] **Step 8.2 — Commit any fixups; tag**

```bash
git status
git add -A
git commit -m "chore(group-a): fixups" --allow-empty
git tag -a group-a-foundation -m "Group A: vite-plugin-static-copy fonts,
gpt-tokenizer, durable storage, component test scaffold for
ChatMessage/ChatInput/AttachedDocsBar."
git log --oneline | head -12
```

---

## Definition of Done

- `public/standard-fonts/` removed from git; `dist/standard-fonts/` regenerated by `npm run build`.
- `useChat.buildContextSection` calls `estimateTokens` from `gpt-tokenizer`.
- `requestDurableStorage()` fires on app start; the result is logged or ignored at the call site.
- Component tests for `ChatMessage`, `ChatInput`, `AttachedDocsBar` pass.
- All M1–M3 unit tests still pass.
- Tag `group-a-foundation` exists.
