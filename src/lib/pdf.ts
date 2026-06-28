import * as pdfjsLib from 'pdfjs-dist'
// Vite resolves this URL at build time to a hashed asset.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export interface PageText {
  pageNumber: number
  text: string
}

/** Load a PDF from raw bytes. Caller is responsible for keeping `data` alive. */
export async function loadPdf(data: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy> {
  // Slice to detach from any caller's buffer that might be transferred.
  return pdfjsLib.getDocument({ data: data.slice(0) }).promise
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
