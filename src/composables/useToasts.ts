import { ref } from 'vue'
import type { Toast, ToastAction } from '@/types/domain'

const toasts = ref<Toast[]>([])

function dismiss(id: number): void {
  const t = toasts.value.find((x) => x.id === id)
  if (t) t.leaving = true
  setTimeout(() => {
    toasts.value = toasts.value.filter((x) => x.id !== id)
  }, 300)
}

export function useToasts() {
  function show(
    message: string,
    type: Toast['type'] = 'error',
    durationMs = 3500,
  ): number {
    const id = Date.now() + Math.random()
    toasts.value.push({ id, message, type, leaving: false })
    setTimeout(() => dismiss(id), durationMs)
    return id
  }

  /** Group H: long-lived toast with an action button. Lives until acted on. */
  function showAction(
    message: string,
    action: ToastAction,
    type: Toast['type'] = 'info',
  ): number {
    const id = Date.now() + Math.random()
    toasts.value.push({
      id,
      message,
      type,
      leaving: false,
      sticky: true,
      action: {
        label: action.label,
        handler: () => {
          try {
            action.handler()
          } finally {
            dismiss(id)
          }
        },
      },
    })
    return id
  }

  return { toasts, show, showAction, dismiss }
}
