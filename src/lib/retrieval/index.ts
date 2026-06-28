import { Bm25Retriever } from './bm25'
import type { Retriever } from './types'

let instance: Retriever | null = null

export function getRetriever(): Retriever {
  if (!instance) instance = new Bm25Retriever()
  return instance
}

/** Test-only escape hatch. */
export function __setRetrieverForTests(r: Retriever | null): void {
  instance = r
}
