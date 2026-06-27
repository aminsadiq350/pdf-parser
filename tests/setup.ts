// Vitest global setup. Extend as tests grow.
import { vi } from 'vitest'

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
