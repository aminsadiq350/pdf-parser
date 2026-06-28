import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the OCR module so we never lazy-import tesseract.js or render canvases
// in jsdom.
vi.mock('@/lib/ocr', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ocr')>('@/lib/ocr')
  return {
    ...actual,
    ocrPagesIfNeeded: vi.fn(async (_pdf, pages) =>
      pages.map((p: { pageNumber: number; text: string }) =>
        p.text ? p : { ...p, text: `OCR'd page ${p.pageNumber}` },
      ),
    ),
  }
})

// Mock loadPdf so we don't need a real PDF buffer. The orchestrator iterates
// 1..numPages calling getPage(n).getTextContent(). Make page 1 return text,
// page 2 return nothing (scanned-style page).
vi.mock('@/lib/pdf', async () => ({
  loadPdf: vi.fn(async () => ({
    numPages: 2,
    async getPage(n: number) {
      return {
        async getTextContent() {
          if (n === 1) {
            return {
              items: [{ str: 'Hello page one with plenty of real text content.' }],
            }
          }
          // Scanned page yields nothing.
          return { items: [] }
        },
      }
    },
  })),
}))

import { ingestPdf } from '@/lib/pdfIngest'
import { ocrPagesIfNeeded } from '@/lib/ocr'

const fakeBuffer = new ArrayBuffer(8)

describe('ingestPdf', () => {
  beforeEach(() => {
    vi.mocked(ocrPagesIfNeeded).mockClear()
  })

  it('with ocr: false drops empty pages and never calls OCR', async () => {
    const { numPages, pages } = await ingestPdf(fakeBuffer, { ocr: false })
    expect(numPages).toBe(2)
    expect(pages.map((p) => p.pageNumber)).toEqual([1])
    expect(ocrPagesIfNeeded).not.toHaveBeenCalled()
  })

  it('with ocr: true calls OCR and keeps the newly recognised page', async () => {
    const { pages } = await ingestPdf(fakeBuffer, { ocr: true })
    expect(ocrPagesIfNeeded).toHaveBeenCalledTimes(1)
    expect(pages).toHaveLength(2)
    expect(pages[1].text).toBe("OCR'd page 2")
  })
})
