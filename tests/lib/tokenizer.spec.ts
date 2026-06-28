import { describe, it, expect } from 'vitest'
import { estimateTokens } from '@/lib/tokenizer'

describe('estimateTokens', () => {
  it('returns 0 for empty input', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('counts a short ASCII sentence', () => {
    const n = estimateTokens('Hello world')
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThan(10)
  })

  it('scales with text length', () => {
    const short = estimateTokens('the quick brown fox')
    const longer = estimateTokens('the quick brown fox '.repeat(100))
    expect(longer).toBeGreaterThan(short * 50)
  })
})
