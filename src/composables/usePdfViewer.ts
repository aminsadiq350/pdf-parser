import { ref, shallowRef, watch } from 'vue'
import type * as pdfjsLib from 'pdfjs-dist'
import { loadPdfFromBlob } from '@/lib/pdf'
import { useDocuments } from './useDocuments'

const SCALE_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0] as const
const DEFAULT_SCALE = 1.5

const currentPdf = shallowRef<pdfjsLib.PDFDocumentProxy | null>(null)
const currentPage = ref(1)
const numPages = ref(0)
const scale = ref<number>(DEFAULT_SCALE)
let canvas: HTMLCanvasElement | null = null

// Strict serialization: every drawCurrent() chains onto the previous one so
// PDF.js never sees two render() calls on the same canvas at once.
let drawChain: Promise<void> = Promise.resolve()
let activeRender: pdfjsLib.RenderTask | null = null
let pendingJumpPage: number | null = null

async function setActive(blob: Blob | null): Promise<void> {
  if (!blob) {
    currentPdf.value = null
    numPages.value = 0
    return
  }
  const pdf = await loadPdfFromBlob(blob)
  currentPdf.value = pdf
  numPages.value = pdf.numPages
  currentPage.value = 1
}

function bindCanvas(el: HTMLCanvasElement | null) {
  canvas = el
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
    const vp = page.getViewport({ scale: scale.value })
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

watch([currentPdf, currentPage, scale], () => {
  if (canvas) void drawCurrent()
})

// When a new PDF finishes loading after a cross-doc jumpToPage, fire the
// queued page change.
watch(currentPdf, async () => {
  if (pendingJumpPage != null && currentPdf.value) {
    const target = pendingJumpPage
    pendingJumpPage = null
    await goTo(target)
  }
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

/**
 * Cross-doc-aware jump used by citation chips.
 * - Same doc, already loaded: just goTo(pageNumber).
 * - Different doc: switch active doc and queue the jump for when the PDF loads.
 */
async function jumpToPage(docId: number, pageNumber: number): Promise<void> {
  const { activeId, select } = useDocuments()
  if (activeId.value === docId && currentPdf.value) {
    await goTo(pageNumber)
    return
  }
  pendingJumpPage = pageNumber
  if (activeId.value !== docId) select(docId)
}

export function usePdfViewer() {
  return {
    currentPdf,
    currentPage,
    numPages,
    scale,
    setActive,
    bindCanvas,
    drawCurrent,
    prev,
    next,
    goTo,
    jumpToPage,
    zoomIn,
    zoomOut,
    resetZoom,
  }
}
