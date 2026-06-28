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
  <canvas ref="canvas" class="block bg-white dark:bg-zinc-800 max-w-full mx-auto"></canvas>
</template>
