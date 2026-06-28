import { ref, computed, watch } from 'vue'
import type { PdfDocument } from '@/types/domain'
import { loadPdf } from '@/lib/pdf'
import { usePdfViewer } from './usePdfViewer'

const documents = ref<PdfDocument[]>([])
const activeId = ref<number | null>(null)
let nextId = 1

const activeDoc = computed(() => documents.value.find((d) => d.id === activeId.value) ?? null)

const { setActive } = usePdfViewer()

watch(activeId, async (id) => {
  if (id == null) {
    await setActive(null)
    return
  }
  const doc = documents.value.find((d) => d.id === id)
  if (doc) await setActive(doc.data)
})

async function importFiles(files: FileList | File[]): Promise<void> {
  for (const file of Array.from(files)) {
    const buffer = await file.arrayBuffer()
    const pdf = await loadPdf(buffer)
    const id = nextId++
    documents.value.push({ id, name: file.name, data: buffer, numPages: pdf.numPages })
    if (activeId.value == null) activeId.value = id
  }
}

function select(id: number) {
  activeId.value = id
}

export function useDocuments() {
  return { documents, activeId, activeDoc, importFiles, select }
}
