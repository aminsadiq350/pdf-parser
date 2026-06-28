import type * as pdfjsLib from 'pdfjs-dist'
import { loadPdfFromBlob } from './pdf'

const cache = new Map<number, Promise<pdfjsLib.PDFDocumentProxy>>()

export function getCachedPdfFor(
	docId: number,
	blob: Blob,
): Promise<pdfjsLib.PDFDocumentProxy> {
	let p = cache.get(docId)
	if (!p) {
		p = loadPdfFromBlob(blob)
		cache.set(docId, p)
	}
	return p
}

export function invalidatePreviewCache(docId: number): void {
	cache.delete(docId)
}

/** Test-only escape hatch. */
export function __resetPreviewCacheForTests(): void {
	cache.clear()
}
