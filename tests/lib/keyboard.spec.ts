import { describe, it, expect } from 'vitest'
import { matchShortcut } from '@/lib/keyboard'

function k(opts: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', opts)
}

describe('matchShortcut', () => {
  it('Escape always returns closeOrBlur', () => {
    expect(matchShortcut(k({ key: 'Escape' }), null)).toBe('closeOrBlur')
    const input = document.createElement('input')
    expect(matchShortcut(k({ key: 'Escape' }), input)).toBe('closeOrBlur')
  })

  it('Meta+K returns focusChat from any element', () => {
    expect(matchShortcut(k({ key: 'k', metaKey: true }), null)).toBe('focusChat')
    expect(matchShortcut(k({ key: 'K', ctrlKey: true }), null)).toBe('focusChat')
  })

  it('Meta+Shift+K is not focusChat', () => {
    expect(matchShortcut(k({ key: 'k', metaKey: true, shiftKey: true }), null)).toBeNull()
  })

  it('ArrowLeft/Right outside inputs returns prev/next', () => {
    expect(matchShortcut(k({ key: 'ArrowLeft' }), null)).toBe('prev')
    expect(matchShortcut(k({ key: 'ArrowRight' }), null)).toBe('next')
  })

  it('ArrowLeft/Right inside inputs returns null', () => {
    const input = document.createElement('input')
    expect(matchShortcut(k({ key: 'ArrowLeft' }), input)).toBeNull()
    expect(matchShortcut(k({ key: 'ArrowRight' }), input)).toBeNull()
  })

  it('ArrowLeft/Right inside a textarea is also null', () => {
    const ta = document.createElement('textarea')
    expect(matchShortcut(k({ key: 'ArrowLeft' }), ta)).toBeNull()
  })

  it('ArrowLeft/Right inside a contenteditable is also null', () => {
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    expect(matchShortcut(k({ key: 'ArrowLeft' }), div)).toBeNull()
  })

  it('Other keys return null', () => {
    expect(matchShortcut(k({ key: 'a' }), null)).toBeNull()
    expect(matchShortcut(k({ key: 'Enter' }), null)).toBeNull()
  })
})
