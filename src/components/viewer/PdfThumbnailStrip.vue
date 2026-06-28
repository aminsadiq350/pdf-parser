<script setup lang="ts">
import { usePdfViewer } from '@/composables/usePdfViewer'
import ThumbCell from './ThumbCell.vue'

const { currentPdf, numPages, currentPage, goTo } = usePdfViewer()
</script>

<template>
  <aside
    v-if="currentPdf"
    class="w-24 flex-shrink-0 overflow-y-auto bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 p-2 flex flex-col gap-2"
  >
    <button
      v-for="n in numPages"
      :key="n"
      :class="[
        'block w-full p-1 rounded border text-[10px] text-zinc-500 dark:text-zinc-400 transition',
        currentPage === n
          ? 'border-indigo-500 ring-1 ring-indigo-500'
          : 'border-zinc-200 dark:border-zinc-700 hover:border-indigo-300',
      ]"
      @click="goTo(n)"
    >
      <ThumbCell :page-number="n" />
      <span class="block mt-1">{{ n }}</span>
    </button>
  </aside>
</template>
