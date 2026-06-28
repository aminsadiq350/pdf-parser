import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractTextByPage, loadPdf } from '@/lib/pdf'

const __dirname = dirname(fileURLToPath(import.meta.url))
let data: ArrayBuffer

beforeAll(() => {
	const buf = readFileSync(resolve(__dirname, '../fixtures/sample.pdf'))
	data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
})

describe('pdf.ts', () => {
	it('loadPdf returns a PDFDocumentProxy with numPages > 0', async () => {
		const pdf = await loadPdf(data)
		expect(pdf.numPages).toBeGreaterThan(0)
	})

	it('extractTextByPage returns one entry per page with text', async () => {
		const pages = await extractTextByPage(data)
		expect(pages.length).toBeGreaterThan(0)
		expect(pages[0]).toHaveProperty('pageNumber', 1)
		expect(pages[0]).toHaveProperty('text')
		expect(pages[0].text).toContain('Hello page one')
	})
})
