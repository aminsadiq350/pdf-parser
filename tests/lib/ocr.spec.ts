import { describe, it, expect } from 'vitest'
import { needsOcr } from '@/lib/ocr'

describe('needsOcr', () => {
  it('flags empty input', () => {
    expect(needsOcr('')).toBe(true)
  })

  it('flags whitespace-only input', () => {
    expect(needsOcr('   \n\t  ')).toBe(true)
  })

  it('flags pages with fewer than 20 non-whitespace chars', () => {
    expect(needsOcr('1')).toBe(true)
    expect(needsOcr('Page 1')).toBe(true) // 5 non-ws
    expect(needsOcr('A B C D E F G H I')).toBe(true) // 9 non-ws
  })

  it('passes pages with 20+ non-whitespace chars', () => {
    // 20 chars exactly is the boundary — the threshold is strictly less than.
    expect(needsOcr('x'.repeat(20))).toBe(false)
    expect(needsOcr('Hello world '.repeat(5))).toBe(false)
  })

  it('counts only non-whitespace characters', () => {
    // 19 letters + lots of whitespace → still flagged.
    expect(needsOcr('a '.repeat(19))).toBe(true)
    expect(needsOcr('a '.repeat(20))).toBe(false)
  })
})
