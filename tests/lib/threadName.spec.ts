import { describe, it, expect } from 'vitest'
import { suggestThreadName } from '@/lib/threadName'

describe('suggestThreadName', () => {
  it('returns empty for empty / whitespace input', () => {
    expect(suggestThreadName('')).toBe('')
    expect(suggestThreadName('   \n\t  ')).toBe('')
  })

  it('returns short single sentences unchanged (no trailing punctuation)', () => {
    expect(suggestThreadName('Hello world.')).toBe('Hello world')
    expect(suggestThreadName('What is this?')).toBe('What is this')
    expect(suggestThreadName('Wow!')).toBe('Wow')
  })

  it('returns short non-sentence text as-is', () => {
    expect(suggestThreadName('Quick summary')).toBe('Quick summary')
  })

  it('picks the first sentence from multi-sentence input', () => {
    expect(suggestThreadName('Summarise this. Then list keywords.')).toBe(
      'Summarise this',
    )
  })

  it('collapses internal whitespace', () => {
    expect(suggestThreadName('  Hello   world ')).toBe('Hello world')
  })

  it('truncates at a word boundary with ellipsis when > 50 chars', () => {
    const long =
      'Tell me everything you know about the history of paper aircraft and folding'
    // No '.', so hard cut at <=50 word boundary + ellipsis.
    const result = suggestThreadName(long)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(51) // 50 + the ellipsis
    expect(result.length).toBeGreaterThan(20)
    // Ends mid-word never; last char before the ellipsis should be a letter
    // that completes a word.
    const before = result.slice(0, -1)
    expect(before.endsWith(' ')).toBe(false)
  })

  it('keeps a sentence under 50 chars even if the text continues', () => {
    const text =
      'A short question. Then a very long follow-up that exceeds fifty characters easily.'
    expect(suggestThreadName(text)).toBe('A short question')
  })

  it('hard-cuts at 50 when no whitespace exists in the cap', () => {
    const noSpaces = 'x'.repeat(120)
    const out = suggestThreadName(noSpaces)
    expect(out.length).toBe(51) // 50 x's plus '…'
    expect(out.endsWith('…')).toBe(true)
  })
})
