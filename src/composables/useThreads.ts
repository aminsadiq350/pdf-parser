import { ref, computed, type ComputedRef, type Ref } from 'vue'
import { db } from '@/lib/db'
import type { Message, Thread } from '@/types/domain'

const threads = ref<Thread[]>([])
const activeThreadId = ref<number | null>(null)
const activeMessages = ref<Message[]>([])
const activeThread = computed(
  () => threads.value.find((t) => t.id === activeThreadId.value) ?? null,
)

function sortThreads(list: Thread[]): Thread[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
}

async function loadAll(): Promise<void> {
  const all = await db.threads.orderBy('updatedAt').reverse().toArray()
  threads.value = all
}

async function create(opts: { docIds?: number[]; name?: string }): Promise<Thread> {
  const now = Date.now()
  const draft: Thread = {
    name: opts.name ?? '',
    docIds: opts.docIds ?? [],
    createdAt: now,
    updatedAt: now,
  }
  const id = await db.threads.add(draft)
  const persisted: Thread = { ...draft, id }
  threads.value = sortThreads([persisted, ...threads.value])
  return persisted
}

async function ensureDefaultThreadForDoc(docId: number): Promise<Thread> {
  const existing = threads.value.find(
    (t) => t.docIds.length === 1 && t.docIds[0] === docId,
  )
  if (existing) return existing
  return create({ docIds: [docId] })
}

async function select(threadId: number): Promise<void> {
  // Group E: before swapping, sweep the previous thread if it was a
  // never-used default. This keeps the sidebar from accruing empty
  // nameless threads after rapid doc-tap exploration.
  const prev = activeThreadId.value
  if (prev != null && prev !== threadId) {
    await cleanupIfEmpty(prev)
  }
  activeThreadId.value = threadId
  activeMessages.value = await db.messages
    .where('[threadId+createdAt]')
    .between([threadId, 0], [threadId, Infinity])
    .toArray()
}

/**
 * Group E: delete a thread iff it has no name AND no messages. Safe to
 * call on a thread that no longer exists.
 */
async function cleanupIfEmpty(threadId: number): Promise<void> {
  const t = threads.value.find((x) => x.id === threadId)
  if (!t) return
  if (t.name && t.name.trim() !== '') return
  const count = await db.messages.where('threadId').equals(threadId).count()
  if (count > 0) return
  await deleteThread(threadId)
}

async function deleteThread(threadId: number): Promise<void> {
  await db.transaction('rw', db.threads, db.messages, async () => {
    await db.messages.where('threadId').equals(threadId).delete()
    await db.threads.delete(threadId)
  })
  threads.value = threads.value.filter((t) => t.id !== threadId)
  if (activeThreadId.value === threadId) {
    activeThreadId.value = null
    activeMessages.value = []
  }
}

function bumpThreadInState(threadId: number, patch: Partial<Thread>): void {
  threads.value = sortThreads(
    threads.value.map((t) =>
      t.id === threadId ? { ...t, ...patch, updatedAt: Date.now() } : t,
    ),
  )
}

async function attachDoc(threadId: number, docId: number): Promise<void> {
  const t = threads.value.find((x) => x.id === threadId)
  if (!t) return
  if (t.docIds.includes(docId)) return
  const next = [...t.docIds, docId]
  await db.threads.update(threadId, { docIds: next, updatedAt: Date.now() })
  bumpThreadInState(threadId, { docIds: next })
}

async function detachDoc(threadId: number, docId: number): Promise<void> {
  const t = threads.value.find((x) => x.id === threadId)
  if (!t) return
  const next = t.docIds.filter((id) => id !== docId)
  await db.threads.update(threadId, { docIds: next, updatedAt: Date.now() })
  bumpThreadInState(threadId, { docIds: next })
}

async function appendMessage(
  msg: Omit<Message, 'id' | 'createdAt'>,
): Promise<Message> {
  const row: Message = { ...msg, createdAt: Date.now() }
  const id = await db.messages.add(row)
  const persisted: Message = { ...row, id }
  if (activeThreadId.value === msg.threadId) {
    activeMessages.value = [...activeMessages.value, persisted]
  }
  await db.threads.update(msg.threadId, { updatedAt: Date.now() })
  bumpThreadInState(msg.threadId, {})
  return persisted
}

async function updateMessage(
  id: number,
  patch: Partial<Pick<Message, 'text' | 'error' | 'citations'>>,
): Promise<void> {
  await db.messages.update(id, patch)
  activeMessages.value = activeMessages.value.map((m) =>
    m.id === id ? { ...m, ...patch } : m,
  )
}

async function clearMessages(threadId: number): Promise<void> {
  await db.messages.where('threadId').equals(threadId).delete()
  if (activeThreadId.value === threadId) activeMessages.value = []
}

async function handleDocDeleted(docId: number): Promise<void> {
  const affected = await db.threads.where('docIds').equals(docId).toArray()
  await db.transaction('rw', db.threads, async () => {
    for (const t of affected) {
      const next = t.docIds.filter((x) => x !== docId)
      await db.threads.update(t.id!, { docIds: next, updatedAt: Date.now() })
    }
  })
  threads.value = sortThreads(
    threads.value.map((t) =>
      t.docIds.includes(docId)
        ? { ...t, docIds: t.docIds.filter((x) => x !== docId), updatedAt: Date.now() }
        : t,
    ),
  )
}

async function rename(threadId: number, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await db.threads.update(threadId, { name: trimmed, updatedAt: Date.now() })
  bumpThreadInState(threadId, { name: trimmed })
}

export interface UseThreadsReturn {
  threads: Ref<Thread[]>
  activeThreadId: Ref<number | null>
  activeThread: ComputedRef<Thread | null>
  activeMessages: Ref<Message[]>
  loadAll: typeof loadAll
  create: typeof create
  ensureDefaultThreadForDoc: typeof ensureDefaultThreadForDoc
  select: typeof select
  attachDoc: typeof attachDoc
  detachDoc: typeof detachDoc
  appendMessage: typeof appendMessage
  updateMessage: typeof updateMessage
  clearMessages: typeof clearMessages
  handleDocDeleted: typeof handleDocDeleted
  rename: typeof rename
  cleanupIfEmpty: typeof cleanupIfEmpty
  deleteThread: typeof deleteThread
}

export function useThreads(): UseThreadsReturn {
  return {
    threads,
    activeThreadId,
    activeThread,
    activeMessages,
    loadAll,
    create,
    ensureDefaultThreadForDoc,
    select,
    attachDoc,
    detachDoc,
    appendMessage,
    updateMessage,
    clearMessages,
    handleDocDeleted,
    rename,
    cleanupIfEmpty,
    deleteThread,
  }
}
