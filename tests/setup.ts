// Vitest global setup. Extend as tests grow.
import { vi } from 'vitest'
import { createRequire } from 'node:module'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import 'fake-indexeddb/auto'

// jsdom's Blob isn't recognised by Node's structuredClone, which fake-indexeddb
// uses to persist values. Replace the global Blob/File with the Node-native
// versions so binary data round-trips through Dexie under jsdom.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
globalThis.Blob = NodeBlob as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
globalThis.File = NodeFile as any

// Mock localStorage with an in-memory shim so useSettings tests run cleanly.
class MemoryStorage {
  private store = new Map<string, string>()
  get length(): number { return this.store.size }
  clear(): void { this.store.clear() }
  getItem(k: string): string | null { return this.store.get(k) ?? null }
  setItem(k: string, v: string): void { this.store.set(k, v) }
  removeItem(k: string): void { this.store.delete(k) }
  key(i: number): string | null { return [...this.store.keys()][i] ?? null }
}

vi.stubGlobal('localStorage', new MemoryStorage())

// PDF.js worker resolution under jsdom: Vite's ?url import resolves to a
// browser path, but PDF.js's "fake worker" fallback in Node tries to require
// that exact string. Rewrite the import to the absolute filesystem path so
// the fallback can load it.
const req = createRequire(import.meta.url)
const workerAbsPath = req.resolve('pdfjs-dist/build/pdf.worker.min.js')
vi.mock('pdfjs-dist/build/pdf.worker.min.js?url', () => ({ default: workerAbsPath }))
