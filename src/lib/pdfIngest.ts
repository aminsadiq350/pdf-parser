import { loadPdf } from '@/lib/pdf'
import type { PageText } from '@/types/domain'
import { ocrPagesIfNeeded, type OcrRunOptions } from '@/lib/ocr'

export interface IngestOptions extends OcrRunOptions {
  /** Run OCR over pages that look empty (~scanned-image PDFs). */
  ocr?: boolean
}

export interface IngestResult {
  numPages: number
  pages: PageText[]
}

/**
 * Single-pass ingest pipeline used on import.
 *
 * Walks every page in the PDF (NOT just non-empty ones the way `readPdf` does)
 * so the OCR step can flip scanned-image pages from empty text to recognised
 * text. The retriever and chat composable both tolerate empty-text pages, so
 * keeping them in the returned array is safe.
 */
export async function ingestPdf(
  data: ArrayBuffer,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const pdf = await loadPdf(data)
  const numPages = pdf.numPages
  const pages: PageText[] = []
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
      .trim()
    pages.push({ pageNumber: i, text })
  }
  if (!opts.ocr) {
    // Match readPdf's contract: drop empty pages so downstream callers behave
    // identically when OCR is off.
    return { numPages, pages: pages.filter((p) => p.text !== '') }
  }
  const final = await ocrPagesIfNeeded(pdf, pages, opts)
  // Drop any pages that are still empty after the OCR pass (truly blank pages).
  return { numPages, pages: final.filter((p) => p.text !== '') }
}
