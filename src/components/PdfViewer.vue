<script setup lang="ts">
import { useDocuments } from '@/composables/useDocuments'
import { usePdfViewer } from '@/composables/usePdfViewer'

const { activeDoc } = useDocuments()
const { currentPage, numPages, bindCanvas, prev, next } = usePdfViewer()
</script>

<template>
  <main class="flex-1 flex flex-col bg-zinc-100 dark:bg-zinc-950 overflow-hidden">
    <div v-if="activeDoc" class="h-full flex flex-col p-6 overflow-hidden">
      <div
        class="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex-1 flex flex-col overflow-hidden"
      >
        <div
          class="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800"
        >
          <span class="font-medium truncate text-sm">{{ activeDoc.name }}</span>
          <div class="flex items-center gap-3">
            <button
              class="px-2 py-1 bg-white dark:bg-zinc-900 border rounded hover:bg-zinc-100"
              @click="prev"
            >
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <span class="text-xs">{{ currentPage }} / {{ numPages }}</span>
            <button
              class="px-2 py-1 bg-white dark:bg-zinc-900 border rounded hover:bg-zinc-100"
              @click="next"
            >
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
        <div
          class="flex-1 overflow-y-auto p-4 flex justify-center bg-zinc-100 dark:bg-zinc-950"
        >
          <canvas :ref="(el) => bindCanvas(el as HTMLCanvasElement | null)" class="shadow-lg max-w-full h-auto"></canvas>
        </div>
      </div>
    </div>
    <div v-else class="flex-1 flex items-center justify-center text-zinc-400">
      Select a document to view
    </div>
  </main>
</template>
