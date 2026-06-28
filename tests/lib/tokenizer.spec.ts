import { describe, it, expect } from 'vitest'
import { estimateTokens } from '@/lib/tokenizer'

describe('estimateTokens', () => {
  it('returns 0 for empty input', async () => {
    expect(await estimateTokens('')).toBe(0)
  })

  it('counts a short ASCII sentence', async () => {
    const n = await estimateTokens('Hello world')
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThan(10)
  })

  it('scales with text length', async () => {
    const short = await estimateTokens('the quick brown fox')
    const longer = await estimateTokens('the quick brown fox '.repeat(100))
    expect(longer).toBeGreaterThan(short * 50)
  })
})
