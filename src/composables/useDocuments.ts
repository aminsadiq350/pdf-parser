import { ref, computed, type ComputedRef, type Ref } from 'vue'
import { db } from '@/lib/db'
import type { Document } from '@/types/domain'
import { readPdf } from '@/lib/pdf'

const documents = ref<Document[]>([])
const activeId = ref<number | null>(null)
const activeDoc = computed(() => documents.value.find((d) => d.id === activeId.value) ?? null)

async function loadAll(): Promise<void> {
  const all = await db.documents.orderBy('addedAt').reverse().toArray()
  documents.value = all
}

async function importFiles(files: FileList | File[]): Promise<Document[]> {
  const created: Document[] = []
  for (const file of Array.from(files)) {
    const buffer = await file.arrayBuffer()
    const blob = new Blob([buffer], { type: 'application/pdf' })
    const { numPages, pages } = await readPdf(buffer)
    const doc: Document = {
      name: file.name,
      size: file.size,
      numPages,
      pages,
      addedAt: Date.now(),
    }
    const id = await db.documents.add(doc)
    await db.documentBlobs.put({ docId: id, blob })
    const persisted: Document = { ...doc, id }
    documents.value = [persisted, ...documents.value]
    created.push(persisted)
    if (activeId.value == null) activeId.value = id
    // Index for BM25 retrieval (M3). Dynamic import keeps callers that never
    // chat (e.g. plain delete flows) off the retrieval module.
    const { getRetriever } = await import('@/lib/retrieval/index')
    await getRetriever().indexDocument({ id, name: doc.name, pages: doc.pages })
  }
  return created
}

function select(id: number): void {
  activeId.value = id
}

async function deleteDoc(id: number): Promise<void> {
  await db.transaction('rw', db.documents, db.documentBlobs, async () => {
    await db.documents.delete(id)
    await db.documentBlobs.delete(id)
  })
  documents.value = documents.value.filter((d) => d.id !== id)
  if (activeId.value === id) activeId.value = null
  // Drop from retrieval index. Thread-side cascade is owned by useThreads
  // (see Task 7 of the M2 plan).
  const { getRetriever } = await import('@/lib/retrieval/index')
  await getRetriever().removeDocument(id)
  // Drop from citation-preview cache (Group C).
  const { invalidatePreviewCache } = await import('@/lib/pdfPreview')
  invalidatePreviewCache(id)
}

async function getBlob(id: number): Promise<Blob | null> {
  const row = await db.documentBlobs.get(id)
  return row?.blob ?? null
}

async function rename(id: number, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await db.documents.update(id, { name: trimmed })
  documents.value = documents.value.map((d) => (d.id === id ? { ...d, name: trimmed } : d))
  // Re-index so BM25 retriever's stored docName stays in sync.
  const doc = documents.value.find((d) => d.id === id)
  if (doc) {
    const { getRetriever } = await import('@/lib/retrieval/index')
    await getRetriever().indexDocument({ id, name: trimmed, pages: doc.pages })
  }
}

export interface UseDocumentsReturn {
  documents: Ref<Document[]>
  activeId: Ref<number | null>
  activeDoc: ComputedRef<Document | null>
  importFiles: typeof importFiles
  select: typeof select
  delete: typeof deleteDoc
  rename: typeof rename
  getBlob: typeof getBlob
  loadAll: typeof loadAll
}

export function useDocuments(): UseDocumentsReturn {
  return {
    documents,
    activeId,
    activeDoc,
    importFiles,
    select,
    delete: deleteDoc,
    rename,
    getBlob,
    loadAll,
  }
}
