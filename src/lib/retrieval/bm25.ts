import MiniSearch from 'minisearch'
import type { IndexableDoc, RetrievedChunk, Retriever } from './types'

interface ChunkRecord {
	id: string // `${docId}:${pageNumber}`
	docId: number
	docName: string
	pageNumber: number
	text: string
}

export class Bm25Retriever implements Retriever {
	private mini = this.fresh()
	private records = new Map<string, ChunkRecord>()

	private fresh(): MiniSearch<ChunkRecord> {
		return new MiniSearch<ChunkRecord>({
			idField: 'id',
			fields: ['text'],
			storeFields: ['docId', 'docName', 'pageNumber', 'text'],
		})
	}

	async indexDocument(doc: IndexableDoc): Promise<void> {
		await this.removeDocument(doc.id)
		for (const p of doc.pages) {
			const id = `${doc.id}:${p.pageNumber}`
			const rec: ChunkRecord = {
				id,
				docId: doc.id,
				docName: doc.name,
				pageNumber: p.pageNumber,
				text: p.text,
			}
			this.mini.add(rec)
			this.records.set(id, rec)
		}
	}

	async removeDocument(docId: number): Promise<void> {
		const toRemove: ChunkRecord[] = []
		for (const r of this.records.values()) {
			if (r.docId === docId) toRemove.push(r)
		}
		for (const r of toRemove) {
			this.mini.remove(r)
			this.records.delete(r.id)
		}
	}

	async search(
		query: string,
		opts: { docIds: number[]; topK: number },
	): Promise<RetrievedChunk[]> {
		const allow = new Set(opts.docIds)
		const hits = this.mini.search(query, {
			filter: (r) => allow.has(r.docId as number),
		})
		return hits.slice(0, opts.topK).map((h) => ({
			docId: h.docId as number,
			docName: h.docName as string,
			pageNumber: h.pageNumber as number,
			text: h.text as string,
			score: h.score,
		}))
	}

	async indexAll(docs: IndexableDoc[]): Promise<void> {
		for (const d of docs) await this.indexDocument(d)
	}

	__reset(): void {
		this.mini = this.fresh()
		this.records.clear()
	}
}
