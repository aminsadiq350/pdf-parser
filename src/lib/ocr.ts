import type * as pdfjsLib from 'pdfjs-dist'
import type { PageText } from '@/types/domain'

/** Group G: minimum non-whitespace chars on a page before we trust the
 *  extracted text and skip OCR. */
const MIN_TEXT_CHARS = 20
const RENDER_SCALE = 2.0

/**
 * Returns true when an extracted-text page looks empty enough that we should
 * try OCR on its rendered bitmap instead. Scanned-image PDFs typically yield
 * `''` or a handful of stray glyphs from page numbers / watermarks.
 */
export function needsOcr(text: string): boolean {
  if (!text) return true
  const nonWs = text.replace(/\s+/g, '').length
  return nonWs < MIN_TEXT_CHARS
}

export interface OcrProgress {
  page: number
  total: number
}
export type OcrProgressFn = (p: OcrProgress) => void

/** Anything that turns a 1-based page number into recognised plain text. */
export type OcrEngine = (pageNumber: number) => Promise<string>

export interface OcrRunOptions {
  onProgress?: OcrProgressFn
  signal?: AbortSignal
}

/**
 * Test-friendly orchestration loop. Walks `pages` once, asks `engine` to
 * recognise any page that fails `needsOcr`, and returns a fresh array with
 * the OCR'd text substituted in. Existing text is never overwritten.
 */
export async function runOcrPass(
  pages: PageText[],
  engine: OcrEngine,
  opts?: OcrRunOptions,
): Promise<PageText[]> {
  const next: PageText[] = pages.map((p) => ({ ...p }))
  let ocrIndex = 0
  const total = pages.filter((p) => needsOcr(p.text)).length
  for (const p of next) {
    if (opts?.signal?.aborted) break
    if (!needsOcr(p.text)) continue
    ocrIndex += 1
    const recognised = (await engine(p.pageNumber)).trim()
    if (recognised) p.text = recognised
    opts?.onProgress?.({ page: ocrIndex, total })
  }
  return next
}

let workerPromise: Promise<unknown> | null = null
async function getWorker(): Promise<{
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>
  terminate: () => Promise<unknown>
}> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract = await import('tesseract.js')
      return Tesseract.createWorker('eng')
    })()
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return workerPromise as any
}

/** Drops the cached worker. Called after each ingest run to free RAM. */
async function disposeWorker(): Promise<void> {
  if (!workerPromise) return
  try {
    const w = await workerPromise
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (w as any).terminate?.()
  } finally {
    workerPromise = null
  }
}

/**
 * Build an OcrEngine backed by Tesseract.js + a PDF.js document. Renders each
 * requested page to an off-screen canvas at RENDER_SCALE and feeds it to the
 * lazy-loaded worker.
 */
function tesseractEngine(pdf: pdfjsLib.PDFDocumentProxy): OcrEngine {
  return async (pageNumber: number) => {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    await page.render({ canvasContext: ctx, viewport }).promise
    const worker = await getWorker()
    const result = await worker.recognize(canvas)
    return result.data.text ?? ''
  }
}

/**
 * Convenience for production callers: pages that fail `needsOcr` are
 * re-extracted via Tesseract using the PDF.js document. Terminates the worker
 * on completion so we don't keep ~30MB resident.
 */
export async function ocrPagesIfNeeded(
  pdf: pdfjsLib.PDFDocumentProxy,
  pages: PageText[],
  opts?: OcrRunOptions,
): Promise<PageText[]> {
  if (!pages.some((p) => needsOcr(p.text))) return pages
  try {
    return await runOcrPass(pages, tesseractEngine(pdf), opts)
  } finally {
    await disposeWorker()
  }
}

/** Test-only: clears the cached worker so each spec starts clean. */
export function __resetOcrWorkerForTests(): void {
  workerPromise = null
}
