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

const PREVIEW_W = 220
const PREVIEW_H = 300

const docName = computed(() => {
  if (state.value.docId == null) return ''
  return documents.value.find((d) => d.id === state.value.docId)?.name ?? '(removed)'
})

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
    class="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl p-2"
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
