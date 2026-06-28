import { describe, it, expect } from 'vitest'
import { buildPayload, NOTEBOOK_IDENTITY } from '@/lib/llm/promptBuilder'
import type { Message } from '@/types/domain'

const history: Message[] = [
  { id: 1, threadId: 1, role: 'user', text: 'Hi', createdAt: 1 },
  { id: 2, threadId: 1, role: 'assistant', text: 'Hello', createdAt: 2 },
]

describe('buildPayload (openrouter)', () => {
  it('includes identity in system prompt', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, pdfText: '' })
    expect('messages' in p && p.messages[0].role === 'system').toBe(true)
    if ('messages' in p) expect(p.messages[0].content).toContain(NOTEBOOK_IDENTITY)
  })

  it('uses no-doc branch when pdfText is empty', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, pdfText: '' })
    if ('messages' in p) expect(p.messages[0].content).toMatch(/No PDF is currently loaded/i)
  })

  it('embeds doc text when provided', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, pdfText: '[Page 1]\nfoo' })
    if ('messages' in p) expect(p.messages[0].content).toContain('[Page 1]\nfoo')
  })

  it('truncates pdfText longer than 80,000 chars', () => {
    const big = 'x'.repeat(90_000)
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, pdfText: big })
    if ('messages' in p) {
      expect(p.messages[0].content.length).toBeLessThan(90_000 + 1_000)
      expect(p.messages[0].content).toMatch(/document truncated/i)
    }
  })

  it('appends history with role mapping', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, pdfText: '' })
    if ('messages' in p) {
      expect(p.messages[1]).toEqual({ role: 'user', content: 'Hi' })
      expect(p.messages[2]).toEqual({ role: 'assistant', content: 'Hello' })
      expect(p.stream).toBe(true)
    }
  })
})

describe('buildPayload (gemini)', () => {
  it('emits contents[] with user/model roles', () => {
    const p = buildPayload({ provider: 'gemini', model: 'gemini-2.5-flash', history, pdfText: 'doc' })
    if ('contents' in p) {
      expect(p.contents[0].role).toBe('user')
      expect(p.contents[0].parts[0].text).toContain('doc')
      expect(p.contents[1].role).toBe('model')
      expect(p.contents[2]).toEqual({ role: 'user', parts: [{ text: 'Hi' }] })
      expect(p.contents[3]).toEqual({ role: 'model', parts: [{ text: 'Hello' }] })
    }
  })
})
