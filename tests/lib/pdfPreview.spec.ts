import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	getCachedPdfFor,
	invalidatePreviewCache,
	__resetPreviewCacheForTests,
} from '@/lib/pdfPreview'

const __dirname = dirname(fileURLToPath(import.meta.url))
const buf = readFileSync(resolve(__dirname, '../fixtures/sample.pdf'))
const blob = new Blob([buf], { type: 'application/pdf' })

describe('pdfPreview cache', () => {
	beforeEach(() => __resetPreviewCacheForTests())

	it('returns a PDFDocumentProxy for a fresh docId', async () => {
		const pdf = await getCachedPdfFor(1, blob)
		expect(pdf.numPages).toBeGreaterThan(0)
	})

	it('returns the same Promise instance for the same docId', () => {
		const p1 = getCachedPdfFor(1, blob)
		const p2 = getCachedPdfFor(1, blob)
		expect(p1).toBe(p2)
	})

	it('invalidatePreviewCache drops the cached entry', async () => {
		const p1 = getCachedPdfFor(1, blob)
		invalidatePreviewCache(1)
		const p2 = getCachedPdfFor(1, blob)
		expect(p1).not.toBe(p2)
		await p1
		await p2
	})
})
