import { describe, it, expect, vi } from 'vitest'
import { runOcrPass, type OcrEngine } from '@/lib/ocr'
import type { PageText } from '@/types/domain'

const pages = (entries: Array<[number, string]>): PageText[] =>
	entries.map(([pageNumber, text]) => ({ pageNumber, text }))

describe('runOcrPass', () => {
	it('leaves pages with real text alone', async () => {
		const engine: OcrEngine = vi.fn(async () => 'FROM OCR')
		const input = pages([
			[1, 'This page already has plenty of extracted text content.'],
			[2, 'Another page with enough chars to satisfy needsOcr easily.'],
		])
		const out = await runOcrPass(input, engine)
		expect(out.map((p) => p.text)).toEqual(input.map((p) => p.text))
		expect(engine).not.toHaveBeenCalled()
	})

	it('replaces empty pages with OCR text', async () => {
		const engine: OcrEngine = vi.fn(async (n) => `recognised page ${n}`)
		const input = pages([
			[1, 'This page has real text we extracted from the PDF stream.'],
			[2, ''],
			[3, '  '],
		])
		const out = await runOcrPass(input, engine)
		expect(out[0].text).toBe(input[0].text)
		expect(out[1].text).toBe('recognised page 2')
		expect(out[2].text).toBe('recognised page 3')
		expect(engine).toHaveBeenCalledTimes(2)
	})

	it('keeps the original (empty) text when OCR returns nothing', async () => {
		const engine: OcrEngine = vi.fn(async () => '   ')
		const input = pages([[1, '']])
		const out = await runOcrPass(input, engine)
		expect(out[0].text).toBe('')
	})

	it('reports progress once per OCR-eligible page', async () => {
		const onProgress = vi.fn()
		const engine: OcrEngine = async (n) => `p${n}`
		const input = pages([
			[1, ''],
			[2, 'has real text content here that exceeds the threshold easily.'],
			[3, ''],
		])
		await runOcrPass(input, engine, { onProgress })
		expect(onProgress).toHaveBeenCalledTimes(2)
		expect(onProgress).toHaveBeenNthCalledWith(1, { page: 1, total: 2 })
		expect(onProgress).toHaveBeenNthCalledWith(2, { page: 2, total: 2 })
	})

	it('honours AbortSignal mid-loop', async () => {
		const controller = new AbortController()
		const engine: OcrEngine = vi.fn(async (n) => {
			if (n === 2) controller.abort()
			return `p${n}`
		})
		const input = pages([
			[1, ''],
			[2, ''],
			[3, ''],
		])
		const out = await runOcrPass(input, engine, { signal: controller.signal })
		expect(out[0].text).toBe('p1')
		expect(out[1].text).toBe('p2')
		// Page 3 was skipped because the signal aborted before its iteration.
		expect(out[2].text).toBe('')
		expect(engine).toHaveBeenCalledTimes(2)
	})
})
