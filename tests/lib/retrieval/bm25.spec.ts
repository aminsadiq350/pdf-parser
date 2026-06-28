import { describe, it, expect, beforeEach } from 'vitest'
import { Bm25Retriever } from '@/lib/retrieval/bm25'
import type { IndexableDoc } from '@/lib/retrieval/types'

const docA: IndexableDoc = {
  id: 1,
  name: 'physics.pdf',
  pages: [
    { pageNumber: 1, text: 'Newton described inertia and the laws of motion.' },
    { pageNumber: 2, text: 'Einstein extended this with general relativity.' },
  ],
}

const docB: IndexableDoc = {
  id: 2,
  name: 'cooking.pdf',
  pages: [
    { pageNumber: 1, text: 'Tomatoes pair well with basil and garlic.' },
    { pageNumber: 2, text: 'Newton was not a chef but probably enjoyed soup.' },
  ],
}

describe('Bm25Retriever', () => {
  let r: Bm25Retriever
  beforeEach(() => {
    r = new Bm25Retriever()
  })

  it('returns matching chunks scored by BM25', async () => {
    await r.indexDocument(docA)
    const hits = await r.search('Newton inertia', { docIds: [docA.id], topK: 5 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].pageNumber).toBe(1)
    expect(hits[0].docName).toBe('physics.pdf')
    expect(hits[0].text).toContain('Newton')
  })

  it('filters by docIds (no cross-doc leakage)', async () => {
    await r.indexAll([docA, docB])
    const hits = await r.search('Newton', { docIds: [docA.id], topK: 5 })
    expect(hits.every((h) => h.docId === docA.id)).toBe(true)
  })

  it('searches across multiple docIds when included', async () => {
    await r.indexAll([docA, docB])
    const hits = await r.search('Newton', { docIds: [docA.id, docB.id], topK: 5 })
    const ids = new Set(hits.map((h) => h.docId))
    expect(ids.has(docA.id)).toBe(true)
    expect(ids.has(docB.id)).toBe(true)
  })

  it('respects topK', async () => {
    await r.indexAll([docA, docB])
    const hits = await r.search('the', { docIds: [docA.id, docB.id], topK: 2 })
    expect(hits.length).toBeLessThanOrEqual(2)
  })

  it('removeDocument removes that doc from search results', async () => {
    await r.indexAll([docA, docB])
    await r.removeDocument(docA.id)
    const hits = await r.search('Newton', { docIds: [docA.id, docB.id], topK: 5 })
    expect(hits.every((h) => h.docId !== docA.id)).toBe(true)
  })

  it('indexDocument replaces existing chunks for the same docId', async () => {
    await r.indexDocument(docA)
    await r.indexDocument({
      id: docA.id,
      name: 'physics-v2.pdf',
      pages: [{ pageNumber: 1, text: 'Brand new content about quarks.' }],
    })
    const oldHits = await r.search('Newton', { docIds: [docA.id], topK: 5 })
    expect(oldHits).toHaveLength(0)
    const newHits = await r.search('quarks', { docIds: [docA.id], topK: 5 })
    expect(newHits).toHaveLength(1)
    expect(newHits[0].docName).toBe('physics-v2.pdf')
  })

  it('__reset wipes everything', async () => {
    await r.indexDocument(docA)
    r.__reset()
    const hits = await r.search('Newton', { docIds: [docA.id], topK: 5 })
    expect(hits).toHaveLength(0)
  })
})
