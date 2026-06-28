import Dexie, { type Table } from 'dexie'
import type { Document, DocumentBlob, Thread, Message } from '@/types/domain'

class NotebookDB extends Dexie {
  documents!: Table<Document, number>
  documentBlobs!: Table<DocumentBlob, number>
  threads!: Table<Thread, number>
  messages!: Table<Message, number>

  constructor() {
    super('notebook')
    this.version(1).stores({
      documents: '++id, addedAt',
      documentBlobs: 'docId',
      threads: '++id, updatedAt, *docIds',
      messages: '++id, threadId, [threadId+createdAt]',
    })
  }
}

export const db = new NotebookDB()

/**
 * Optional pre-warm: opens the database explicitly so the first composable
 * call does not race with schema setup. Safe to call multiple times.
 */
export async function initStore(): Promise<void> {
  if (!db.isOpen()) await db.open()
}
