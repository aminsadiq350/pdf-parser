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
