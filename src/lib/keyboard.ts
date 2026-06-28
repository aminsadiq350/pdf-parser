export type ShortcutAction =
  | 'prev'
  | 'next'
  | 'focusChat'
  | 'closeOrBlur'
  | 'zoomIn'
  | 'zoomOut'
  | 'resetZoom'
  | 'openSearch'

export function matchShortcut(
  e: KeyboardEvent,
  target: Element | null,
): ShortcutAction | null {
  if (e.key === 'Escape') return 'closeOrBlur'
  const meta = e.metaKey || e.ctrlKey
  if (meta && !e.shiftKey && !e.altKey) {
    const key = e.key.toLowerCase()
    if (key === 'k') return 'focusChat'
    if (key === 'f') return 'openSearch'
    if (e.key === '=' || e.key === '+') return 'zoomIn'
    if (e.key === '-') return 'zoomOut'
    if (e.key === '0') return 'resetZoom'
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
