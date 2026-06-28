import { onBeforeUnmount, onMounted } from 'vue'
import { matchShortcut } from '@/lib/keyboard'

export interface ShortcutHandlers {
  prev(): void
  next(): void
  focusChat(): void
  closeOrBlur(): void
  zoomIn(): void
  zoomOut(): void
  resetZoom(): void
  openSearch(): void
}

export function useKeyboardShortcuts(h: ShortcutHandlers): void {
  function onKey(e: KeyboardEvent) {
    const action = matchShortcut(e, document.activeElement)
    if (!action) return
    e.preventDefault()
    h[action]()
  }
  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
