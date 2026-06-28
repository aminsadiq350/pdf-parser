import * as pdfjsLib from 'pdfjs-dist'
// Vite resolves this URL at build time to a hashed asset.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// PDF.js needs the standard fonts (Helvetica, Times, etc.) to render PDFs that
// reference them without embedding. We serve these from /standard-fonts/ which
// is populated from node_modules/pdfjs-dist/standard_fonts and committed under
// public/ for v1. Revisit with vite-plugin-static-copy in M5.
const STANDARD_FONT_DATA_URL = '/standard-fonts/'

export interface PageText {
  pageNumber: number
  text: string
}

/** Load a PDF from raw bytes. Caller is responsible for keeping `data` alive. */
export async function loadPdf(data: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy> {
  // Slice to detach from any caller's buffer that might be transferred.
  return pdfjsLib.getDocument({
    data: data.slice(0),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise
}

/** Extract per-page text. */
export async function extractTextByPage(data: ArrayBuffer): Promise<PageText[]> {
  const pdf = await loadPdf(data)
  const out: PageText[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
    if (text.trim()) out.push({ pageNumber: i, text })
  }
  return out
}

/** Render a single page onto a canvas at the given scale. */
export async function renderPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale = 1.5,
): Promise<void> {
  const page = await pdf.getPage(pageNumber)
  const vp = page.getViewport({ scale })
  canvas.height = vp.height
  canvas.width = vp.width
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2D context')
  await page.render({ canvasContext: ctx, viewport: vp }).promise
}

/** Load a PDF from a Blob (used by the viewer; Blob comes from Dexie). */
export async function loadPdfFromBlob(blob: Blob): Promise<pdfjsLib.PDFDocumentProxy> {
  const ab = await blob.arrayBuffer()
  return loadPdf(ab)
}

/** One-pass load + extract used by useDocuments on import. */
export async function readPdf(
  data: ArrayBuffer,
): Promise<{ numPages: number; pages: PageText[] }> {
  const pdf = await loadPdf(data)
  const pages: PageText[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
    if (text.trim()) pages.push({ pageNumber: i, text })
  }
  return { numPages: pdf.numPages, pages }
}
