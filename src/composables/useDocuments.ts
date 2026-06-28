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
  // Thread-side cascade is owned by useThreads (see Task 7). The sidebar
  // call site chains useThreads.handleDocDeleted(id) after delete().
}

async function getBlob(id: number): Promise<Blob | null> {
  const row = await db.documentBlobs.get(id)
  return row?.blob ?? null
}

export interface UseDocumentsReturn {
  documents: Ref<Document[]>
  activeId: Ref<number | null>
  activeDoc: ComputedRef<Document | null>
  importFiles: typeof importFiles
  select: typeof select
  delete: typeof deleteDoc
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
    getBlob,
    loadAll,
  }
}
