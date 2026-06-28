// Domain types for M1. Thread/Message/Citation land in M2/M3.

export type Provider = 'openrouter' | 'gemini'

export interface PdfDocument {
  /** In-memory id (monotonic counter; replaced by Dexie autoIncrement in M2). */
  id: number
  name: string
  /** Raw PDF bytes. In M2 this moves to a separate Dexie store. */
  data: ArrayBuffer
  numPages: number
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  error?: boolean
}

export interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
  leaving?: boolean
}
