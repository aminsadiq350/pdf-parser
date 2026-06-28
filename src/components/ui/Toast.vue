<script setup lang="ts">
import { useToasts } from '@/composables/useToasts'
const { toasts, dismiss } = useToasts()
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
        t.type === 'error'
          ? 'bg-red-600 text-white'
          : t.type === 'info'
            ? 'bg-indigo-600 text-white'
            : 'bg-emerald-600 text-white',
        t.leaving ? 'toast-exit' : 'toast-enter',
      ]"
    >
      <i
        :class="[
          'fa-solid',
          t.type === 'error'
            ? 'fa-circle-xmark'
            : t.type === 'info'
              ? 'fa-circle-info'
              : 'fa-circle-check',
        ]"
      ></i>
      <span>{{ t.message }}</span>
      <button
        v-if="t.action"
        class="ml-1 px-2 py-1 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded transition"
        @click="t.action.handler"
      >
        {{ t.action.label }}
      </button>
      <button
        v-if="t.sticky"
        class="ml-1 -mr-1 p-1 text-white/70 hover:text-white"
        aria-label="Dismiss"
        @click="dismiss(t.id)"
      >
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>
    </div>
  </div>
</template>
