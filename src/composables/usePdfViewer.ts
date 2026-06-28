import { ref, shallowRef } from 'vue'
import type * as pdfjsLib from 'pdfjs-dist'
import { loadPdf, renderPage } from '@/lib/pdf'

const currentPdf = shallowRef<pdfjsLib.PDFDocumentProxy | null>(null)
const currentPage = ref(1)
const numPages = ref(0)
let canvas: HTMLCanvasElement | null = null

async function setActive(data: ArrayBuffer | null): Promise<void> {
  if (!data) {
    currentPdf.value = null
    numPages.value = 0
    return
  }
  const pdf = await loadPdf(data)
  currentPdf.value = pdf
  numPages.value = pdf.numPages
  currentPage.value = 1
  await drawCurrent()
}

function bindCanvas(el: HTMLCanvasElement | null) {
  canvas = el
}

async function drawCurrent() {
  if (!currentPdf.value || !canvas) return
  await renderPage(currentPdf.value, currentPage.value, canvas)
}

async function goTo(page: number) {
  if (!currentPdf.value) return
  if (page < 1 || page > numPages.value) return
  currentPage.value = page
  await drawCurrent()
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
