<script setup lang="ts">
import { useToasts } from '@/composables/useToasts'
const { toasts } = useToasts()
</script>

<template>
  <div
    class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none"
  >
    <div
      v-for="t in toasts"
      :key="t.id"
      :class="[
        'pointer-events-auto px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2',
        t.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white',
        t.leaving ? 'toast-exit' : 'toast-enter',
      ]"
    >
      <i :class="['fa-solid', t.type === 'error' ? 'fa-circle-xmark' : 'fa-circle-check']"></i>
      {{ t.message }}
    </div>
  </div>
</template>
