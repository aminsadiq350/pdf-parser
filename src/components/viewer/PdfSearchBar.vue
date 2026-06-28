<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
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

async function focusInput() {
  if (!props.open) return
  await nextTick()
  input.value?.focus()
  input.value?.select()
}

function snippetHtml(m: SearchMatch): string {
  const before = m.snippet.slice(0, m.matchOffset)
  const match = m.snippet.slice(m.matchOffset, m.matchOffset + m.matchLength)
  const after = m.snippet.slice(m.matchOffset + m.matchLength)
  const esc = (s: string) =>
    s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  return `${esc(before)}<mark>${esc(match)}</mark>${esc(after)}`
}

function jumpTo(i: number) {
  if (i < 0 || i >= matches.value.length) return
  activeIdx.value = i
  goTo(matches.value[i].pageNumber)
}

function next() {
  if (matches.value.length === 0) return
  jumpTo((activeIdx.value + 1) % matches.value.length)
}
function prev() {
  if (matches.value.length === 0) return
  jumpTo((activeIdx.value - 1 + matches.value.length) % matches.value.length)
}

function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  } else if (e.key === 'Enter' && document.activeElement === input.value) {
    e.preventDefault()
    if (e.shiftKey) prev()
    else next()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  void focusInput()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

watch(() => props.open, focusInput)
watch(query, () => {
  activeIdx.value = 0
})
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
      <button
        class="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500"
        title="Previous match"
        @click="prev"
      >
        <i class="fa-solid fa-chevron-up text-xs"></i>
      </button>
      <button
        class="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500"
        title="Next match"
        @click="next"
      >
        <i class="fa-solid fa-chevron-down text-xs"></i>
      </button>
      <button
        class="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500"
        title="Close search"
        @click="$emit('close')"
      >
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>
    </div>
    <div v-if="query && matches.length === 0" class="px-4 py-2 text-xs text-zinc-400">
      No matches
    </div>
    <div
      v-else-if="matches.length > 0"
      class="max-h-60 overflow-y-auto border-t border-zinc-200 dark:border-zinc-800"
    >
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
