import type { PageText } from '@/types/domain'

export interface RetrievedChunk {
  docId: number
  docName: string
  pageNumber: number
  text: string
  score: number
}

export interface IndexableDoc {
  id: number
  name: string
  pages: PageText[]
}

export interface Retriever {
  indexDocument(doc: IndexableDoc): Promise<void>
  removeDocument(docId: number): Promise<void>
  search(
    query: string,
    opts: { docIds: number[]; topK: number },
  ): Promise<RetrievedChunk[]>
  /** Bulk-init helper used at app start. */
  indexAll(docs: IndexableDoc[]): Promise<void>
  /** Test-only: drop everything. */
  __reset(): void
}
