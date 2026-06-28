<script setup lang="ts">
import { ref } from 'vue'
import { useDarkMode } from '@/composables/useDarkMode'
import { useDocuments } from '@/composables/useDocuments'

const { isDark, toggle } = useDarkMode()
const { documents, activeId, importFiles, select } = useDocuments()

const fileInputRef = ref<HTMLInputElement | null>(null)

async function onPick(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) await importFiles(target.files)
  target.value = ''
}
</script>

<template>
  <aside
    class="w-72 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col p-4 space-y-4"
  >
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-bold text-indigo-600 dark:text-indigo-400">Notebook</h1>
      <button
        class="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
        @click="toggle"
      >
        <i :class="['fa-solid', isDark ? 'fa-sun' : 'fa-moon']"></i>
      </button>
    </div>

    <button
      class="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
      @click="fileInputRef?.click()"
    >
      Import PDF
    </button>
    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept=".pdf"
      class="hidden"
      @change="onPick"
    />

    <div class="flex-1 overflow-y-auto space-y-2">
      <div
        v-for="doc in documents"
        :key="doc.id"
        :class="[
          'p-3 rounded-lg cursor-pointer text-sm truncate transition',
          activeId === doc.id
            ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800'
            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
        ]"
        @click="select(doc.id)"
      >
        <i class="fa-solid fa-file-pdf mr-2"></i> {{ doc.name }}
      </div>
    </div>
  </aside>
</template>
