<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDarkMode } from '@/composables/useDarkMode'
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'
import { useDrawers } from '@/composables/useDrawers'
import { useInstallPrompt } from '@/composables/useInstallPrompt'
import { closeDrawersIfMobile } from '@/lib/responsiveDrawers'
import DocList from './sidebar/DocList.vue'
import ThreadList from './sidebar/ThreadList.vue'

const { isDark, toggle } = useDarkMode()
const { importFiles } = useDocuments()
const threads = useThreads()
const drawers = useDrawers()
const { canInstall, install } = useInstallPrompt()

const fileInputRef = ref<HTMLInputElement | null>(null)

const asideClasses = computed(() => [
  // Mobile (< md): fixed left drawer
  'fixed inset-y-0 left-0 z-40 w-[85vw] max-w-[20rem] transform transition-transform duration-200 will-change-transform',
  drawers.left.value ? 'translate-x-0' : '-translate-x-full',
  // Desktop (md+): static in flow, no transform
  'md:static md:translate-x-0 md:w-72 md:z-auto md:transition-none',
  // Shared chrome
  'bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col',
])

async function onPick(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return
  const created = await importFiles(target.files)
  target.value = ''
  // Auto-open a default thread for the first newly imported doc so the chat
  // panel becomes immediately usable.
  const first = created[0]
  if (first?.id != null) {
    const t = await threads.ensureDefaultThreadForDoc(first.id)
    await threads.select(t.id!)
  }
  closeDrawersIfMobile()
}
</script>

<template>
  <aside :class="asideClasses">
    <div
      class="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
    >
      <h1 class="text-lg font-bold text-indigo-600 dark:text-indigo-400">Notebook</h1>
      <div class="flex items-center gap-1">
        <button
          v-if="canInstall"
          class="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
          title="Install Notebook as an app"
          aria-label="Install Notebook as an app"
          @click="install"
        >
          <i class="fa-solid fa-cloud-arrow-down"></i>
        </button>
        <button
          class="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
          @click="toggle"
        >
          <i :class="['fa-solid', isDark ? 'fa-sun' : 'fa-moon']"></i>
        </button>
        <button
          class="md:hidden p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-500"
          aria-label="Close menu"
          @click="drawers.closeAll"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>

    <div class="p-4">
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
    </div>

    <div class="flex-1 overflow-y-auto px-4 pb-4 space-y-6">
      <DocList />
      <ThreadList />
    </div>
  </aside>
</template>
