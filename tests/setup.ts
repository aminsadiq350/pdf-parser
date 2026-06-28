// Vitest global setup. Extend as tests grow.
import { vi } from 'vitest'
import { createRequire } from 'node:module'
import 'fake-indexeddb/auto'

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
