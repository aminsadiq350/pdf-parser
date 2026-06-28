// Domain types for M2. Citation type lands now but isn't populated until M3.

export type Provider = 'openrouter' | 'gemini'

export interface PageText {
  pageNumber: number
  text: string
}

export interface Citation {
  docId: number
  pageNumber: number
}

/** Document metadata + extracted page text. Binary lives in DocumentBlob. */
export interface Document {
  id?: number // auto-increment in Dexie
  name: string
  size: number // bytes
  numPages: number
  pages: PageText[] // populated on import (background)
  addedAt: number // epoch ms
}

/** PDF binary, separated so listing documents doesn't load every blob. */
export interface DocumentBlob {
  docId: number // primary key, FK to Document.id
  blob: Blob
}

/** Many-to-many: a thread references 0+ documents; a document can be in many threads. */
export interface Thread {
  id?: number
  name: string // default = primary doc name
  docIds: number[] // multiEntry indexed; docIds[0] = primary doc
  createdAt: number
  updatedAt: number
}

export interface Message {
  id?: number
  threadId: number
  role: 'user' | 'assistant'
  text: string
  citations?: Citation[] // M3 populates this
  createdAt: number
  error?: boolean
}

/** UI-only toast notification. */
export interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
  leaving?: boolean
}
