# Group B — UI Polish Basics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Ship B1 keyboard shortcuts, B2 quick prompts, B3 inline rename for docs/threads/chat-header, B4 chat export to markdown.

**Tech Stack additions:** none.

---

## File structure

**Created:**

```
src/lib/keyboard.ts                          matchShortcut pure helper
src/lib/quickPrompts.ts                      hardcoded prompt list
src/lib/exportThread.ts                      buildThreadMarkdown + downloadMarkdown
src/composables/useKeyboardShortcuts.ts      window listener wrapper
src/components/chat/QuickPrompts.vue         pill row
src/components/ui/EditableLabel.vue          shared dblclick→input
tests/lib/keyboard.spec.ts
tests/lib/exportThread.spec.ts
tests/lib/citations.spec.ts                  ← extended (renderCitationsText)
tests/components/ui/EditableLabel.spec.ts
tests/composables/useDocuments.spec.ts       ← extended (rename)
tests/composables/useThreads.spec.ts         ← extended (rename)
```

**Modified:**

```
src/lib/citations.ts                         + renderCitationsText
src/composables/useDocuments.ts              + rename(id, name)
src/composables/useThreads.ts                + rename(id, name)
src/components/App.vue                       wire useKeyboardShortcuts
src/components/AppSidebar.vue                expose chat-focus ref via provide
src/components/sidebar/DocItem.vue           wrap name with EditableLabel
src/components/sidebar/ThreadItem.vue        wrap name with EditableLabel
src/components/ChatPanel.vue                 thread-header rename, QuickPrompts,
                                              download button, accept inject ref
src/components/chat/ChatInput.vue            expose internal <input> ref via
                                              defineExpose for focus()
```

---

## Task 1 — Keyboard shortcut matcher (TDD)

**Files:** `src/lib/keyboard.ts`, `tests/lib/keyboard.spec.ts`

- [ ] **Step 1.1 — Write the failing test**

```ts
// tests/lib/keyboard.spec.ts
import { describe, it, expect } from 'vitest'
import { matchShortcut } from '@/lib/keyboard'

function k(opts: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', opts)
}

describe('matchShortcut', () => {
  it('Escape always returns closeOrBlur', () => {
    expect(matchShortcut(k({ key: 'Escape' }), null)).toBe('closeOrBlur')
    const input = document.createElement('input')
    expect(matchShortcut(k({ key: 'Escape' }), input)).toBe('closeOrBlur')
  })

  it('Meta+K returns focusChat from any element', () => {
    expect(matchShortcut(k({ key: 'k', metaKey: true }), null)).toBe('focusChat')
    expect(matchShortcut(k({ key: 'K', ctrlKey: true }), null)).toBe('focusChat')
  })

  it('Meta+Shift+K is not focusChat', () => {
    expect(matchShortcut(k({ key: 'k', metaKey: true, shiftKey: true }), null)).toBeNull()
  })

  it('ArrowLeft/Right outside inputs returns prev/next', () => {
    expect(matchShortcut(k({ key: 'ArrowLeft' }), null)).toBe('prev')
    expect(matchShortcut(k({ key: 'ArrowRight' }), null)).toBe('next')
  })

  it('ArrowLeft/Right inside inputs returns null', () => {
    const input = document.createElement('input')
    expect(matchShortcut(k({ key: 'ArrowLeft' }), input)).toBeNull()
    expect(matchShortcut(k({ key: 'ArrowRight' }), input)).toBeNull()
  })

  it('ArrowLeft/Right inside a textarea is also null', () => {
    const ta = document.createElement('textarea')
    expect(matchShortcut(k({ key: 'ArrowLeft' }), ta)).toBeNull()
  })

  it('ArrowLeft/Right inside a contenteditable is also null', () => {
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    expect(matchShortcut(k({ key: 'ArrowLeft' }), div)).toBeNull()
  })

  it('Other keys return null', () => {
    expect(matchShortcut(k({ key: 'a' }), null)).toBeNull()
    expect(matchShortcut(k({ key: 'Enter' }), null)).toBeNull()
  })
})
```

- [ ] **Step 1.2 — Run, expect failure**

```bash
npm run test:run -- tests/lib/keyboard.spec.ts
```

- [ ] **Step 1.3 — Implement `src/lib/keyboard.ts`**

```ts
export type ShortcutAction = 'prev' | 'next' | 'focusChat' | 'closeOrBlur'

export function matchShortcut(
  e: KeyboardEvent,
  target: Element | null,
): ShortcutAction | null {
  if (e.key === 'Escape') return 'closeOrBlur'
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.shiftKey && !e.altKey) {
    return 'focusChat'
  }
  const inEditable = !!(
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      (target as HTMLElement).isContentEditable)
  )
  if (!inEditable) {
    if (e.key === 'ArrowLeft') return 'prev'
    if (e.key === 'ArrowRight') return 'next'
  }
  return null
}
```

- [ ] **Step 1.4 — Run + commit**

```bash
npm run test:run -- tests/lib/keyboard.spec.ts
git add src/lib/keyboard.ts tests/lib/keyboard.spec.ts
git commit -m "feat(b1): pure shortcut matcher (matchShortcut)"
```

---

## Task 2 — `useKeyboardShortcuts` + wire into App.vue

**Files:** `src/composables/useKeyboardShortcuts.ts`, `src/components/App.vue`, `src/components/chat/ChatInput.vue`, `src/components/ChatPanel.vue`

- [ ] **Step 2.1 — Create `src/composables/useKeyboardShortcuts.ts`**

```ts
import { onBeforeUnmount, onMounted } from 'vue'
import { matchShortcut } from '@/lib/keyboard'

export interface ShortcutHandlers {
  prev(): void
  next(): void
  focusChat(): void
  closeOrBlur(): void
}

export function useKeyboardShortcuts(h: ShortcutHandlers): void {
  function onKey(e: KeyboardEvent) {
    const action = matchShortcut(e, document.activeElement)
    if (!action) return
    // ⌘K is the only shortcut we steal from inputs, so always preventDefault.
    e.preventDefault()
    h[action]()
  }
  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
```

- [ ] **Step 2.2 — Expose ChatInput's <input> via `defineExpose`**

In `src/components/chat/ChatInput.vue`, after the existing `const value = ref('')` block, add:

```ts
const input = ref<HTMLInputElement | null>(null)
function focus() {
  input.value?.focus()
}
defineExpose({ focus })
```

And change the template `<input v-model="value" ...>` to add `ref="input"`.

- [ ] **Step 2.3 — Make ChatPanel expose a `focusInput()` method**

In `src/components/ChatPanel.vue`:

```ts
const inputRef = ref<InstanceType<typeof ChatInput> | null>(null)
function focusInput() {
  inputRef.value?.focus()
}
defineExpose({ focusInput })
```

And change the template `<ChatInput ...>` to `<ChatInput ref="inputRef" ...>`.

- [ ] **Step 2.4 — Update `src/components/App.vue` to wire shortcuts**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import PdfViewer from './components/PdfViewer.vue'
import ChatPanel from './components/ChatPanel.vue'
import Toast from './components/ui/Toast.vue'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { usePdfViewer } from './composables/usePdfViewer'

const chatPanelRef = ref<InstanceType<typeof ChatPanel> | null>(null)
const { prev, next } = usePdfViewer()

useKeyboardShortcuts({
  prev,
  next,
  focusChat() {
    chatPanelRef.value?.focusInput()
  },
  closeOrBlur() {
    const a = document.activeElement as HTMLElement | null
    if (a && a !== document.body) a.blur()
  },
})
</script>

<template>
  <div class="h-full flex overflow-hidden relative">
    <AppSidebar />
    <PdfViewer />
    <ChatPanel ref="chatPanelRef" />
    <Toast />
  </div>
</template>
```

- [ ] **Step 2.5 — Typecheck + commit**

```bash
npx vue-tsc --noEmit 2>&1 | tail -3
git add src/composables/useKeyboardShortcuts.ts src/components/App.vue src/components/chat/ChatInput.vue src/components/ChatPanel.vue
git commit -m "feat(b1): wire keyboard shortcuts globally (←→ pages, ⌘K chat, Esc blur)"
```

---

## Task 3 — Quick prompts

**Files:** `src/lib/quickPrompts.ts`, `src/components/chat/QuickPrompts.vue`, `src/components/ChatPanel.vue`

- [ ] **Step 3.1 — Create `src/lib/quickPrompts.ts`**

```ts
export const QUICK_PROMPTS: readonly string[] = [
  'Summarise this in 3 bullet points.',
  'What are the key takeaways?',
  'Quote the most important sentence from page 1.',
  "Explain this like I'm new to the topic.",
]
```

- [ ] **Step 3.2 — Create `src/components/chat/QuickPrompts.vue`**

```vue
<script setup lang="ts">
import { QUICK_PROMPTS } from '@/lib/quickPrompts'
import { useChat } from '@/composables/useChat'

const { send } = useChat()
function onPick(prompt: string) {
  void send(prompt)
}
</script>

<template>
  <div class="px-4 pb-3 flex flex-wrap gap-1.5">
    <button
      v-for="p in QUICK_PROMPTS"
      :key="p"
      class="px-3 py-1 text-[11px] rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-300 transition"
      @click="onPick(p)"
    >
      {{ p }}
    </button>
  </div>
</template>
```

- [ ] **Step 3.3 — Insert into `ChatPanel.vue`** inside the `v-if="messages.length === 0"` empty-state block, after the nudge paragraph:

```vue
<p class="text-xs text-zinc-400">{{ emptyStateNudge }}</p>
<QuickPrompts class="mt-4" />
```

(import `QuickPrompts from './chat/QuickPrompts.vue'`)

- [ ] **Step 3.4 — Commit**

```bash
git add src/lib/quickPrompts.ts src/components/chat/QuickPrompts.vue src/components/ChatPanel.vue
git commit -m "feat(b2): quick-prompt chips in empty chat"
```

---

## Task 4 — `useDocuments.rename` + `useThreads.rename` (TDD)

**Files:** `src/composables/useDocuments.ts`, `src/composables/useThreads.ts`, `tests/composables/useDocuments.spec.ts`, `tests/composables/useThreads.spec.ts`

- [ ] **Step 4.1 — Extend `tests/composables/useDocuments.spec.ts`** (append):

```ts
it('rename updates Dexie + reactive state + retriever', async () => {
  const docs = useDocuments()
  const [d] = await docs.importFiles([makeFile('a.pdf')])
  await docs.rename(d.id!, 'Renamed.pdf')
  expect(docs.documents.value[0].name).toBe('Renamed.pdf')
  expect((await db.documents.get(d.id!))?.name).toBe('Renamed.pdf')
})
```

- [ ] **Step 4.2 — Add `rename` to `src/composables/useDocuments.ts`**

```ts
async function rename(id: number, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await db.documents.update(id, { name: trimmed })
  documents.value = documents.value.map((d) => (d.id === id ? { ...d, name: trimmed } : d))
  // Re-index so BM25 retriever's stored docName stays in sync (citations show the right name).
  const doc = documents.value.find((d) => d.id === id)
  if (doc) {
    const { getRetriever } = await import('@/lib/retrieval/index')
    await getRetriever().indexDocument({ id, name: trimmed, pages: doc.pages })
  }
}

// in UseDocumentsReturn:
rename: typeof rename
// in useDocuments() return:
return { ..., rename }
```

- [ ] **Step 4.3 — Extend `tests/composables/useThreads.spec.ts`** (append):

```ts
it('rename updates the thread name + reactive state', async () => {
  const t = useThreads()
  const thread = await t.create({ docIds: [], name: 'Old' })
  await t.rename(thread.id!, 'New name')
  expect(t.threads.value[0].name).toBe('New name')
  expect((await db.threads.get(thread.id!))?.name).toBe('New name')
})
```

- [ ] **Step 4.4 — Add `rename` to `src/composables/useThreads.ts`**

```ts
async function rename(threadId: number, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await db.threads.update(threadId, { name: trimmed, updatedAt: Date.now() })
  bumpThreadInState(threadId, { name: trimmed })
}

// add to UseThreadsReturn and return object
```

- [ ] **Step 4.5 — Run + commit**

```bash
npm run test:run -- tests/composables/useDocuments.spec.ts tests/composables/useThreads.spec.ts
git add src/composables/useDocuments.ts src/composables/useThreads.ts tests/composables/useDocuments.spec.ts tests/composables/useThreads.spec.ts
git commit -m "feat(b3): useDocuments.rename + useThreads.rename"
```

---

## Task 5 — `EditableLabel.vue` + component test

**Files:** `src/components/ui/EditableLabel.vue`, `tests/components/ui/EditableLabel.spec.ts`

- [ ] **Step 5.1 — Create the component** (full source in §5 of the spec).

- [ ] **Step 5.2 — Write the test**

```ts
// tests/components/ui/EditableLabel.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import EditableLabel from '@/components/ui/EditableLabel.vue'

describe('EditableLabel', () => {
  it('renders the value as a span by default', () => {
    const wrap = mount(EditableLabel, { props: { modelValue: 'Hello' } })
    expect(wrap.text()).toBe('Hello')
    expect(wrap.find('input').exists()).toBe(false)
  })

  it('double-click switches to an input pre-filled with the value', async () => {
    const wrap = mount(EditableLabel, { props: { modelValue: 'Hello' } })
    await wrap.find('span').trigger('dblclick')
    await nextTick()
    const input = wrap.find('input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('Hello')
  })

  it('Enter emits commit + update:modelValue with the new value', async () => {
    const wrap = mount(EditableLabel, { props: { modelValue: 'Hello' } })
    await wrap.find('span').trigger('dblclick')
    await nextTick()
    const input = wrap.find('input')
    await input.setValue('Renamed')
    await input.trigger('keydown.enter')
    expect(wrap.emitted('commit')?.[0]).toEqual(['Renamed'])
    expect(wrap.emitted('update:modelValue')?.[0]).toEqual(['Renamed'])
  })

  it('Esc cancels and reverts (no emit)', async () => {
    const wrap = mount(EditableLabel, { props: { modelValue: 'Hello' } })
    await wrap.find('span').trigger('dblclick')
    await nextTick()
    await wrap.find('input').setValue('Renamed')
    await wrap.find('input').trigger('keydown.esc')
    expect(wrap.emitted('commit')).toBeUndefined()
    expect(wrap.emitted('cancel')).toBeTruthy()
  })

  it('blur commits like Enter', async () => {
    const wrap = mount(EditableLabel, { props: { modelValue: 'Hello' } })
    await wrap.find('span').trigger('dblclick')
    await nextTick()
    await wrap.find('input').setValue('Blurred')
    await wrap.find('input').trigger('blur')
    expect(wrap.emitted('commit')?.[0]).toEqual(['Blurred'])
  })

  it('does not emit when value is unchanged', async () => {
    const wrap = mount(EditableLabel, { props: { modelValue: 'Hello' } })
    await wrap.find('span').trigger('dblclick')
    await nextTick()
    await wrap.find('input').trigger('keydown.enter')
    expect(wrap.emitted('commit')).toBeUndefined()
  })
})
```

- [ ] **Step 5.3 — Run + commit**

```bash
npm run test:run -- tests/components/ui/EditableLabel.spec.ts
git add src/components/ui/EditableLabel.vue tests/components/ui/EditableLabel.spec.ts
git commit -m "feat(b3): EditableLabel shared inline-rename component"
```

---

## Task 6 — Wire `EditableLabel` into DocItem, ThreadItem, ChatPanel header

**Files:** `src/components/sidebar/DocItem.vue`, `src/components/sidebar/ThreadItem.vue`, `src/components/ChatPanel.vue`

- [ ] **Step 6.1 — Update `DocItem.vue`**

Change:
```vue
<div class="truncate">{{ doc.name }}</div>
```
to:
```vue
<EditableLabel
  class="block truncate"
  :model-value="doc.name"
  @commit="(name) => $emit('rename', name)"
/>
```
…and accept a new `rename` emit. Import `EditableLabel from '@/components/ui/EditableLabel.vue'`.

`DocList.vue` wires it:
```vue
<DocItem
  ...
  @rename="(name) => onRename(doc.id!, name)"
/>
```
with a new handler:
```ts
async function onRename(id: number, name: string) {
  await rename(id, name)
}
```
where `rename` is destructured from `useDocuments()`.

- [ ] **Step 6.2 — Update `ThreadItem.vue`** the same way around the label `<span class="truncate">{{ label }}</span>` → `<EditableLabel :model-value="label" @commit="$emit('rename', $event)" class="truncate" />`. Add `rename` emit.

`ThreadList.vue`:
```ts
async function onRename(threadId: number, name: string) {
  await threads.rename(threadId, name)
}
```
and pass `@rename="(name) => onRename(t.id!, name)"`.

- [ ] **Step 6.3 — ChatPanel header** — wrap `{{ headerLabel }}` with `EditableLabel` that commits via `threads.rename(activeThread.value.id!, name)`. When no active thread or `headerLabel === 'Chat'`, fall back to plain text (not editable).

- [ ] **Step 6.4 — Typecheck + commit**

```bash
npx vue-tsc --noEmit 2>&1 | tail -3
git add src/components/sidebar src/components/ChatPanel.vue
git commit -m "feat(b3): inline rename for DocItem, ThreadItem, ChatPanel header"
```

---

## Task 7 — `renderCitationsText` + `exportThread` (TDD)

**Files:** `src/lib/citations.ts`, `src/lib/exportThread.ts`, `tests/lib/citations.spec.ts`, `tests/lib/exportThread.spec.ts`

- [ ] **Step 7.1 — Extend `src/lib/citations.ts`** with `renderCitationsText` (see spec §B4).

- [ ] **Step 7.2 — Extend `tests/lib/citations.spec.ts`** with:

```ts
describe('renderCitationsText', () => {
  const docs: Document[] = [
    { id: 7, name: 'physics.pdf', size: 1, numPages: 5, pages: [], addedAt: 0 },
  ]
  it('replaces tokens with readable text refs', () => {
    const t = renderCitationsText(
      'see [A:p3]',
      [{ docId: 7, pageNumber: 3 }],
      docs,
    )
    expect(t).toBe('see [physics.pdf · p.3]')
  })
  it('shows (removed) for stale citations', () => {
    const t = renderCitationsText(
      '[A:p3]',
      [{ docId: 999, pageNumber: 3 }],
      docs,
    )
    expect(t).toBe('[(removed) · p.3]')
  })
  it('leaves token untouched when citations run out', () => {
    const t = renderCitationsText('[A:p1] [B:p2]', [{ docId: 7, pageNumber: 1 }], docs)
    expect(t).toContain('[physics.pdf · p.1]')
    expect(t).toContain('[B:p2]')
  })
})
```

Also add: `import type { Citation, Document } from '@/types/domain'` to the file (already imported in citations.ts).

- [ ] **Step 7.3 — Run, expect failure, implement, expect pass**

- [ ] **Step 7.4 — Create `src/lib/exportThread.ts`** (see spec §B4).

- [ ] **Step 7.5 — Create `tests/lib/exportThread.spec.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildThreadMarkdown, slugify } from '@/lib/exportThread'
import type { Document, Message, Thread } from '@/types/domain'

const thread: Thread = {
  id: 1,
  name: 'Demo chat',
  docIds: [10, 20],
  createdAt: 0,
  updatedAt: 0,
}
const docs: Document[] = [
  { id: 10, name: 'A.pdf', size: 0, numPages: 1, pages: [], addedAt: 0 },
  { id: 20, name: 'B.pdf', size: 0, numPages: 1, pages: [], addedAt: 0 },
]
const messages: Message[] = [
  { id: 1, threadId: 1, role: 'user', text: 'What is on page 1?', createdAt: 1 },
  {
    id: 2,
    threadId: 1,
    role: 'assistant',
    text: 'See [A:p1].',
    citations: [{ docId: 10, pageNumber: 1 }],
    createdAt: 2,
  },
]

describe('buildThreadMarkdown', () => {
  it('includes title + doc list + roles + resolved citation', () => {
    const md = buildThreadMarkdown(thread, messages, docs)
    expect(md).toContain('# Demo chat')
    expect(md).toContain('A.pdf, B.pdf')
    expect(md).toContain('## You')
    expect(md).toContain('What is on page 1?')
    expect(md).toContain('## Notebook')
    expect(md).toContain('[A.pdf · p.1]')
    expect(md).not.toContain('[A:p1]')
  })

  it('falls back to primary doc name when thread.name is empty', () => {
    const md = buildThreadMarkdown({ ...thread, name: '' }, [], docs)
    expect(md.startsWith('# A.pdf')).toBe(true)
  })

  it('shows (none) when no docs attached', () => {
    const md = buildThreadMarkdown({ ...thread, docIds: [], name: 'Foo' }, [], [])
    expect(md).toContain('**Documents:** (none)')
  })
})

describe('slugify', () => {
  it('lowercases and dasheninates', () => {
    expect(slugify('My Demo Chat #1')).toBe('my-demo-chat-1')
  })
  it('falls back to "thread" for empty input', () => {
    expect(slugify('!!!')).toBe('thread')
  })
})
```

- [ ] **Step 7.6 — Run + commit**

```bash
npm run test:run -- tests/lib/citations.spec.ts tests/lib/exportThread.spec.ts
git add src/lib/citations.ts src/lib/exportThread.ts tests/lib/citations.spec.ts tests/lib/exportThread.spec.ts
git commit -m "feat(b4): renderCitationsText + buildThreadMarkdown + slugify + downloadMarkdown"
```

---

## Task 8 — Export button in ChatPanel header

**Files:** `src/components/ChatPanel.vue`

- [ ] **Step 8.1 — Add export wiring**

In `ChatPanel.vue` `<script setup>` add:

```ts
import { buildThreadMarkdown, downloadMarkdown, slugify } from '@/lib/exportThread'
import { useToasts } from '@/composables/useToasts'
const { show: showToast } = useToasts()

function onExport() {
  const t = activeThread.value
  if (!t || messages.value.length === 0) return
  const md = buildThreadMarkdown(t, [...messages.value], documents.value)
  const date = new Date().toISOString().slice(0, 10)
  const name = `notebook-${slugify(headerLabel.value)}-${date}.md`
  downloadMarkdown(name, md)
  showToast('Chat exported', 'success')
}
```

In the header `<div class="flex items-center gap-1 flex-shrink-0">` (above the Clear button), add:

```vue
<button
  class="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed"
  title="Export chat as markdown"
  :disabled="messages.length === 0"
  @click="onExport"
>
  <i class="fa-solid fa-download text-xs"></i>
</button>
```

- [ ] **Step 8.2 — Typecheck + commit**

```bash
npx vue-tsc --noEmit 2>&1 | tail -3
git add src/components/ChatPanel.vue
git commit -m "feat(b4): export-chat button in ChatPanel header"
```

---

## Task 9 — Full green + tag

- [ ] **Step 9.1**

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build 2>&1 | tail -8
```
Expected: ≥ 84 tests pass.

- [ ] **Step 9.2 — Commit fixups; tag**

```bash
git status
git add -A
git commit -m "chore(group-b): fixups" --allow-empty
git tag -a group-b-ui-polish -m "Group B: UI polish basics

B1: keyboard shortcuts (← → pages, ⌘K focus chat, Esc blur)
B2: quick-prompt chips in empty chats
B3: inline rename for docs / threads / chat header
B4: markdown export of active thread (download button + readable citations)"
git log --oneline | head -15
git tag --list
```

---

## DoD checklist

- ←→ change page when nothing is focused; ignored when typing in inputs.
- ⌘K / Ctrl+K focuses the chat input from anywhere.
- Esc blurs the focused element.
- Quick prompts visible in empty thread, hidden once messages arrive.
- Double-click name → input; Enter/blur saves; Esc cancels.
- Download button exports `.md` with readable citations; disabled when chat is empty.
- All M1-A unit tests still pass.
- Tag `group-b-ui-polish`.
