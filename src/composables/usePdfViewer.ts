import { ref, shallowRef, watch } from 'vue'
import type * as pdfjsLib from 'pdfjs-dist'
import { loadPdf } from '@/lib/pdf'

const currentPdf = shallowRef<pdfjsLib.PDFDocumentProxy | null>(null)
const currentPage = ref(1)
const numPages = ref(0)
let canvas: HTMLCanvasElement | null = null

// Strict serialization: every drawCurrent() chains onto the previous one so
// PDF.js never sees two render() calls on the same canvas at once.
let drawChain: Promise<void> = Promise.resolve()
let activeRender: pdfjsLib.RenderTask | null = null

async function setActive(data: ArrayBuffer | null): Promise<void> {
  if (!data) {
    currentPdf.value = null
    numPages.value = 0
    return
  }
  const pdf = await loadPdf(data)
  // Setting these triggers the watch below, which schedules a draw.
  currentPdf.value = pdf
  numPages.value = pdf.numPages
  currentPage.value = 1
}

function bindCanvas(el: HTMLCanvasElement | null) {
  canvas = el
  // If a PDF is already loaded and the canvas just mounted (v-if), draw.
  if (canvas && currentPdf.value) void drawCurrent()
}

function drawCurrent(): Promise<void> {
  const next = drawChain.catch(() => {}).then(async () => {
    if (!currentPdf.value || !canvas) return
    if (activeRender) {
      try {
        activeRender.cancel()
        await activeRender.promise
      } catch {
        // RenderingCancelledException expected.
      }
      activeRender = null
    }
    const page = await currentPdf.value.getPage(currentPage.value)
    const vp = page.getViewport({ scale: 1.5 })
    canvas.height = vp.height
    canvas.width = vp.width
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const task = page.render({ canvasContext: ctx, viewport: vp })
    activeRender = task
    try {
      await task.promise
    } catch (err) {
      if ((err as Error)?.name !== 'RenderingCancelledException') throw err
    } finally {
      if (activeRender === task) activeRender = null
    }
  })
  drawChain = next
  return next
}

watch([currentPdf, currentPage], () => {
  if (canvas) void drawCurrent()
})

async function goTo(page: number) {
  if (!currentPdf.value) return
  if (page < 1 || page > numPages.value) return
  currentPage.value = page
}

function prev() {
  void goTo(currentPage.value - 1)
}
function next() {
  void goTo(currentPage.value + 1)
}

export function usePdfViewer() {
  return { currentPdf, currentPage, numPages, setActive, bindCanvas, drawCurrent, prev, next, goTo }
}
