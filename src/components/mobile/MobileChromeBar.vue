<script setup lang="ts">
import { computed } from 'vue'
import { useDocuments } from '@/composables/useDocuments'
import { useDrawers } from '@/composables/useDrawers'

const { activeDoc } = useDocuments()
const drawers = useDrawers()

const label = computed(() => activeDoc.value?.name ?? 'Notebook')
</script>

<template>
  <header
    class="md:hidden flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 z-20 sticky top-0"
    style="padding-top: max(0.5rem, env(safe-area-inset-top));"
  >
    <button
      type="button"
      aria-label="Open documents and threads"
      class="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
      @click="drawers.toggleLeft"
    >
      <i class="fa-solid fa-bars text-zinc-700 dark:text-zinc-300"></i>
    </button>
    <span class="flex-1 text-sm font-medium truncate text-zinc-800 dark:text-zinc-200">
      {{ label }}
    </span>
    <button
      type="button"
      aria-label="Open chat"
      class="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
      @click="drawers.toggleRight"
    >
      <i class="fa-solid fa-comments text-indigo-500"></i>
    </button>
  </header>
</template>
