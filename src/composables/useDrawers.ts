import { computed, ref, watch } from 'vue'

const left = ref(false)
const right = ref(false)

const anyOpen = computed(() => left.value || right.value)

function openLeft() {
  right.value = false
  left.value = true
}

function openRight() {
  left.value = false
  right.value = true
}

function toggleLeft() {
  if (left.value) {
    left.value = false
  } else {
    openLeft()
  }
}

function toggleRight() {
  if (right.value) {
    right.value = false
  } else {
    openRight()
  }
}

function closeAll() {
  left.value = false
  right.value = false
}

// Body scroll lock — toggle overflow:hidden on <body> whenever a drawer is open.
// Stores the prior inline value so we restore (not blanket-clear) on close.
let priorBodyOverflow: string | null = null
if (typeof document !== 'undefined') {
  watch(anyOpen, (open) => {
    const body = document.body
    if (open) {
      priorBodyOverflow = body.style.overflow
      body.style.overflow = 'hidden'
    } else {
      body.style.overflow = priorBodyOverflow ?? ''
      priorBodyOverflow = null
    }
  })
}

export function useDrawers() {
  return {
    left,
    right,
    anyOpen,
    openLeft,
    openRight,
    toggleLeft,
    toggleRight,
    closeAll,
  }
}

/** Test-only — reset to closed state and restore body overflow. */
export function __resetDrawersForTests() {
  left.value = false
  right.value = false
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
    priorBodyOverflow = null
  }
}
