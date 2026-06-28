export type ShortcutAction = 'prev' | 'next' | 'focusChat' | 'closeOrBlur'

export function matchShortcut(
  e: KeyboardEvent,
  target: Element | null,
): ShortcutAction | null {
  if (e.key === 'Escape') return 'closeOrBlur'
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.shiftKey && !e.altKey) {
    return 'focusChat'
  }
  const inEditable = !!(
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.getAttribute('contenteditable') === 'true' ||
      (target as HTMLElement).isContentEditable)
  )
  if (!inEditable) {
    if (e.key === 'ArrowLeft') return 'prev'
    if (e.key === 'ArrowRight') return 'next'
  }
  return null
}
