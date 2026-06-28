import { describe, it, expect, beforeEach } from 'vitest'
import { db, initStore } from '@/lib/db'
import { useDocuments } from '@/composables/useDocuments'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

async function resetDb() {
  await db.close()
  await db.delete()
  await initStore()
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtureBytes = new Uint8Array(
  readFileSync(resolve(__dirname, '../fixtures/sample.pdf')),
)

function makeFile(name: string): File {
  return new File([fixtureBytes], name, { type: 'application/pdf' })
}

describe('useDocuments', () => {
  beforeEach(async () => {
    await resetDb()
    const docs = useDocuments()
    docs.documents.value = []
    docs.activeId.value = null
    await docs.loadAll()
  })

  it('importFiles persists Document + DocumentBlob + extracted pages', async () => {
    const docs = useDocuments()
    const created = await docs.importFiles([makeFile('a.pdf')])
    expect(created).toHaveLength(1)
    expect(created[0].name).toBe('a.pdf')
    expect(created[0].numPages).toBe(2)
    expect(created[0].pages.length).toBeGreaterThan(0)

    expect(await db.documents.count()).toBe(1)
    expect(await db.documentBlobs.count()).toBe(1)

    const blob = await docs.getBlob(created[0].id!)
    expect(blob).toBeInstanceOf(Blob)
  })

  it('importFiles auto-activates the first doc when none active', async () => {
    const docs = useDocuments()
    await docs.importFiles([makeFile('a.pdf')])
    expect(docs.activeId.value).not.toBeNull()
    expect(docs.activeDoc.value?.name).toBe('a.pdf')
  })

  it('loadAll reads existing docs into reactive state', async () => {
    await db.documents.add({
      name: 'pre.pdf',
      size: 1,
      numPages: 1,
      pages: [],
      addedAt: Date.now(),
    })
    const docs = useDocuments()
    await docs.loadAll()
    expect(docs.documents.value).toHaveLength(1)
    expect(docs.documents.value[0].name).toBe('pre.pdf')
  })

  it('delete removes document + blob from Dexie and reactive state', async () => {
    const docs = useDocuments()
    const [d] = await docs.importFiles([makeFile('a.pdf')])
    await docs.delete(d.id!)
    expect(await db.documents.count()).toBe(0)
    expect(await db.documentBlobs.count()).toBe(0)
    expect(docs.documents.value).toHaveLength(0)
  })

  it('delete also clears activeId if the deleted doc was active', async () => {
    const docs = useDocuments()
    const [d] = await docs.importFiles([makeFile('a.pdf')])
    docs.select(d.id!)
    await docs.delete(d.id!)
    expect(docs.activeId.value).toBeNull()
  })
})
