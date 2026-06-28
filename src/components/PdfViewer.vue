<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDocuments } from '@/composables/useDocuments'
import { usePdfViewer } from '@/composables/usePdfViewer'
import PdfThumbnailStrip from './viewer/PdfThumbnailStrip.vue'
import PdfSearchBar from './viewer/PdfSearchBar.vue'

const { activeDoc, activeId, getBlob } = useDocuments()
const {
  currentPage,
  numPages,
  bindCanvas,
  prev,
  next,
  setActive,
  scale,
  zoomIn,
  zoomOut,
  resetZoom,
} = usePdfViewer()

const thumbsOpen = ref(false)
const searchOpen = ref(false)
function openSearch() {
  searchOpen.value = true
}
function closeSearch() {
  searchOpen.value = false
}
defineExpose({ openSearch })

watch(
  activeId,
  async (id) => {
    if (id == null) {
      await setActive(null)
      return
    }
    const blob = await getBlob(id)
    await setActive(blob)
  },
  { immediate: true },
)
</script>

<template>
  <main class="flex-1 flex flex-col bg-zinc-100 dark:bg-zinc-950 overflow-hidden">
    <div v-if="activeDoc" class="h-full flex flex-col p-6 overflow-hidden">
      <div
        class="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex-1 flex flex-col overflow-hidden"
      >
        <div
          class="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800 gap-2"
        >
          <span class="font-medium truncate text-sm">{{ activeDoc.name }}</span>
          <div class="flex items-center gap-2">
            <button
              class="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition text-zinc-500"
              title="Zoom out (⌘−)"
              @click="zoomOut"
            >
              <i class="fa-solid fa-magnifying-glass-minus text-xs"></i>
            </button>
            <button
              class="px-2 py-1 text-[11px] font-medium rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition text-zinc-500"
              title="Reset zoom (⌘0)"
              @click="resetZoom"
            >
              {{ Math.round(scale * 100) }}%
            </button>
            <button
              class="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition text-zinc-500"
              title="Zoom in (⌘+)"
              @click="zoomIn"
            >
              <i class="fa-solid fa-magnifying-glass-plus text-xs"></i>
            </button>
            <div class="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1"></div>
            <button
              :class="[
                'p-1.5 rounded transition',
                thumbsOpen
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300'
                  : 'hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500',
              ]"
              title="Toggle page thumbnails"
              @click="thumbsOpen = !thumbsOpen"
            >
              <i class="fa-solid fa-table-cells text-xs"></i>
            </button>
            <button
              :class="[
                'p-1.5 rounded transition',
                searchOpen
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300'
                  : 'hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500',
              ]"
              title="Search in document (⌘F)"
              @click="searchOpen = !searchOpen"
            >
              <i class="fa-solid fa-magnifying-glass text-xs"></i>
            </button>
            <div class="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1"></div>
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
        <PdfSearchBar :open="searchOpen" @close="closeSearch" />
        <div class="flex-1 overflow-hidden flex">
          <PdfThumbnailStrip v-if="thumbsOpen" />
          <div
            class="flex-1 overflow-y-auto p-4 flex justify-center bg-zinc-100 dark:bg-zinc-950"
          >
            <canvas
              :ref="(el) => bindCanvas(el as HTMLCanvasElement | null)"
              class="shadow-lg max-w-full h-auto"
            ></canvas>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="flex-1 flex items-center justify-center text-zinc-400">
      Select a document to view
    </div>
  </main>
</template>
