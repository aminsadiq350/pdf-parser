# Notebook — Group B: UI Polish Basics Design Spec

**Date:** 2026-06-28
**Status:** Approved
**Scope:** Four small UI improvements. All frontend-only, no new runtime deps.

---

## 1. Summary

- **B1.** Keyboard shortcuts (←→ for pages, ⌘K/Ctrl+K to focus chat, Esc to close drawers).
- **B2.** Quick-prompt chips in an empty chat (4 starter prompts; click = fill + send).
- **B3.** Inline rename for documents, threads, and the chat header (double-click → edit; Enter saves; Esc cancels; blur saves).
- **B4.** Chat export to markdown — download button in `ChatPanel` header that produces a clean `.md` of the active thread with resolved citations.

## 2. Goals

- Power users can navigate pages and focus the chat without touching the mouse.
- New users see useful starter prompts the first time a thread is opened.
- Doc / thread names can be renamed in place; persisted.
- Users can take their chat history with them as a portable markdown file.

## 3. Non-goals

- No custom-prompt UI (M5 could allow it). Quick prompts are a hardcoded list.
- No shortcut customisation. Keys are baked in.
- No bulk export of all threads. One thread at a time.
- No round-trip import (we export only; re-import lands later if ever).
- No PDF text-search shortcut (lands in Group C).

## 4. Constraints

- 100% frontend, no backend.
- No new deps.
- No regression in existing 74 tests.

## 5. Design

### B1 — `useKeyboardShortcuts` composable

```ts
// src/lib/keyboard.ts — pure shortcut matcher (TDD-friendly)
export type ShortcutAction = 'prev' | 'next' | 'focusChat' | 'closeOrBlur'

export function matchShortcut(e: KeyboardEvent, target: Element | null): ShortcutAction | null {
  const inEditable = !!(target && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    (target as HTMLElement).isContentEditable
  ))

  if (e.key === 'Escape') return 'closeOrBlur'
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.shiftKey && !e.altKey) {
    return 'focusChat'
  }
  if (!inEditable) {
    if (e.key === 'ArrowLeft') return 'prev'
    if (e.key === 'ArrowRight') return 'next'
  }
  return null
}
```

```ts
// src/composables/useKeyboardShortcuts.ts — installs the listener
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
    e.preventDefault()
    h[action]()
  }
  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
```

Wired in `App.vue` with handlers that pull from `usePdfViewer().prev/next`, focus a chat-input ref, and a single Escape handler that the chat panel exposes via a new tiny composable `useDrawerState` (or just a `provide`/`inject` for `showSettings`).

Simplest path: skip the central drawer registry. Escape just blurs `document.activeElement`. Settings drawer can listen for Escape itself.

### B2 — Quick prompts

```ts
// src/lib/quickPrompts.ts
export const QUICK_PROMPTS: readonly string[] = [
  'Summarise this in 3 bullet points.',
  'What are the key takeaways?',
  'Quote the most important sentence from page 1.',
  "Explain this like I'm new to the topic.",
]
```

```vue
<!-- src/components/chat/QuickPrompts.vue -->
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
      class="px-3 py-1 text-[11px] rounded-full border border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-300 transition"
      @click="onPick(p)"
    >
      {{ p }}
    </button>
  </div>
</template>
```

Rendered in `ChatPanel.vue` inside the empty-state block (so it disappears once the user sends or the assistant replies).

### B3 — Inline rename

Tiny shared component:

```vue
<!-- src/components/ui/EditableLabel.vue -->
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{
  'update:modelValue': [v: string]
  commit: [v: string]
  cancel: []
}>()

const editing = ref(false)
const draft = ref(props.modelValue)
const input = ref<HTMLInputElement | null>(null)

watch(
  () => props.modelValue,
  (v) => {
    if (!editing.value) draft.value = v
  },
)

async function startEdit() {
  draft.value = props.modelValue
  editing.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select()
}

function commit() {
  const v = draft.value.trim()
  editing.value = false
  if (v && v !== props.modelValue) {
    emit('update:modelValue', v)
    emit('commit', v)
  }
}

function cancel() {
  editing.value = false
  draft.value = props.modelValue
  emit('cancel')
}
</script>

<template>
  <span v-if="!editing" @dblclick.stop="startEdit" class="truncate cursor-text">
    {{ modelValue }}
  </span>
  <input
    v-else
    ref="input"
    v-model="draft"
    class="bg-white dark:bg-zinc-800 border border-indigo-400 rounded px-1 py-0 text-sm w-full outline-none"
    @keydown.enter.prevent="commit"
    @keydown.esc.prevent="cancel"
    @blur="commit"
    @click.stop
  />
</template>
```

New composable methods:

```ts
// useDocuments.ts
async function rename(id: number, name: string): Promise<void>

// useThreads.ts
async function rename(id: number, name: string): Promise<void>
```

Both update Dexie + reactive state. `useDocuments.rename` ALSO re-indexes the doc with the BM25 retriever so `docName` in chunks stays in sync.

Three call sites:
- `DocItem.vue` — replaces `{{ doc.name }}` with `<EditableLabel :model-value="doc.name" @commit="rename(doc.id, $event)" />`.
- `ThreadItem.vue` — same for `thread.name` (falls back to primary doc name for display, but rename always writes `thread.name`).
- `ChatPanel.vue` header — same for the active thread.

### B4 — Markdown export

```ts
// src/lib/exportThread.ts
import type { Thread, Message, Document } from '@/types/domain'
import { renderCitationsText } from './citations'

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'thread'
}

export function buildThreadMarkdown(
  thread: Thread,
  messages: readonly Message[],
  docs: readonly Document[],
): string {
  const title = thread.name || (docs.find((d) => d.id === thread.docIds[0])?.name ?? 'Untitled chat')
  const docNames = thread.docIds
    .map((id) => docs.find((d) => d.id === id)?.name ?? '(removed)')
    .join(', ')
  const lines: string[] = [
    `# ${title}`,
    '',
    `**Documents:** ${docNames || '(none)'}`,
    `**Exported:** ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ]
  for (const m of messages) {
    lines.push(m.role === 'user' ? '## You' : '## Notebook')
    lines.push('')
    const body = m.role === 'assistant'
      ? renderCitationsText(m.text, m.citations, docs)
      : m.text
    lines.push(body)
    lines.push('')
  }
  return lines.join('\n')
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
```

New helper in `lib/citations.ts`:

```ts
export function renderCitationsText(
  text: string,
  citations: Citation[] | undefined,
  docs: readonly Document[],
): string {
  if (!citations || citations.length === 0) return text
  let idx = 0
  return text.replace(/\[([A-Z]{1,2}):p(\d+)\]/g, (match) => {
    const cite = citations[idx++]
    if (!cite) return match
    const doc = docs.find((d) => d.id === cite.docId)
    return `[${doc?.name ?? '(removed)'} · p.${cite.pageNumber}]`
  })
}
```

UI in `ChatPanel.vue`: add a download icon button (left of the trash icon) — disabled when `messages.length === 0`. Filename pattern: `notebook-<slug>-<YYYY-MM-DD>.md`. Toast on success.

## 6. Definition of Done

- ←→ change page when nothing is focused.
- ⌘K / Ctrl+K focuses the chat input even mid-typing elsewhere.
- Esc blurs the focused element (and closes settings via the existing close-on-outside-click handler).
- Quick-prompt chips show in an empty thread, hide after the first message.
- Double-clicking a doc / thread / chat-header name turns it into an editable input; Enter saves and persists; Esc cancels.
- A download icon in the chat header exports the thread as a `.md` with readable citations; disabled when chat is empty.
- All 74 prior tests pass + ≥ 10 new tests (`matchShortcut`, `buildThreadMarkdown`, `renderCitationsText`, rename methods, EditableLabel component).
- Tag `group-b-ui-polish`.

## 7. Risks

- **⌘K conflicts with VS Code Simple Browser** when previewing; users dev'ing in another browser are fine. Acceptable.
- **Double-click vs single-click selection** on doc rows — the EditableLabel emits `@dblclick.stop` so the underlying `select` handler doesn't fire mid-edit. Single-click still selects.
- **Markdown export with very long threads** could OOM on small devices. Acceptable; export is opt-in.
- **Quick prompts and active doc** — they go through `useChat.send` which already validates an active thread + API key, so the existing "Open or create a thread first" toast handles no-thread gracefully.
