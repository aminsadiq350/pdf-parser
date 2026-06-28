import { ref } from 'vue'
import type { Toast } from '@/types/domain'

const toasts = ref<Toast[]>([])

export function useToasts() {
  function show(message: string, type: Toast['type'] = 'error') {
    const id = Date.now() + Math.random()
    toasts.value.push({ id, message, type, leaving: false })
    setTimeout(() => {
      const t = toasts.value.find((x) => x.id === id)
      if (t) t.leaving = true
      setTimeout(() => {
        toasts.value = toasts.value.filter((x) => x.id !== id)
      }, 300)
    }, 3500)
  }
  return { toasts, show }
}
