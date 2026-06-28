import { describe, it, expect } from 'vitest'
import { buildPayload, NOTEBOOK_IDENTITY } from '@/lib/llm/promptBuilder'
import type { Message } from '@/types/domain'

const history: Message[] = [
  { id: 1, threadId: 1, role: 'user', text: 'Hi', createdAt: 1 },
  { id: 2, threadId: 1, role: 'assistant', text: 'Hello', createdAt: 2 },
]

describe('buildPayload (openrouter)', () => {
  it('includes identity in system prompt', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, contextSection: '' })
    expect('messages' in p).toBe(true)
    if ('messages' in p) {
      expect(p.messages[0].role).toBe('system')
      expect(p.messages[0].content).toContain(NOTEBOOK_IDENTITY)
    }
  })

  it('uses no-doc branch when contextSection is empty', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, contextSection: '' })
    if ('messages' in p) expect(p.messages[0].content).toMatch(/No PDF is currently loaded/i)
  })

  it('embeds contextSection verbatim when provided', () => {
    const ctx = 'Attached documents:\n  [A] foo.pdf\n\n[A] [Page 1]\nlorem'
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, contextSection: ctx })
    if ('messages' in p) expect(p.messages[0].content).toContain(ctx)
  })

  it('appends history with role mapping', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, contextSection: '' })
    if ('messages' in p) {
      expect(p.messages[1]).toEqual({ role: 'user', content: 'Hi' })
      expect(p.messages[2]).toEqual({ role: 'assistant', content: 'Hello' })
      expect(p.stream).toBe(true)
    }
  })
})

describe('buildPayload (gemini)', () => {
  it('emits contents[] with user/model roles and contextSection embedded', () => {
    const ctx = 'Attached documents:\n  [A] foo.pdf'
    const p = buildPayload({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      history,
      contextSection: ctx,
    })
    if ('contents' in p) {
      expect(p.contents[0].role).toBe('user')
      expect(p.contents[0].parts[0].text).toContain(ctx)
      expect(p.contents[1].role).toBe('model')
      expect(p.contents[2]).toEqual({ role: 'user', parts: [{ text: 'Hi' }] })
    }
  })
})
