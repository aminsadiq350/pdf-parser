<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'
import DocPicker from './DocPicker.vue'

const { documents } = useDocuments()
const { activeThread, attachDoc, detachDoc } = useThreads()

const pickerOpen = ref(false)

const attached = computed(() => {
  const t = activeThread.value
  if (!t) return []
  return t.docIds
    .map((id) => documents.value.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d)
})

function onPick(docId: number) {
  if (!activeThread.value) return
  void attachDoc(activeThread.value.id!, docId)
}
function onDetach(docId: number) {
  if (!activeThread.value) return
  void detachDoc(activeThread.value.id!, docId)
}

function closeOnOutsideClick(_e: MouseEvent) {
  pickerOpen.value = false
}
onMounted(() => window.addEventListener('mousedown', closeOnOutsideClick))
onBeforeUnmount(() => window.removeEventListener('mousedown', closeOnOutsideClick))
</script>

<template>
  <div
    v-if="activeThread"
    class="relative px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40"
  >
    <div class="flex items-center gap-1.5 flex-wrap">
      <span
        v-for="d in attached"
        :key="d.id"
        class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-medium"
      >
        <i class="fa-solid fa-file-pdf text-[10px]"></i>
        <span class="max-w-[140px] truncate">{{ d.name }}</span>
        <button
          class="ml-1 text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-200"
          title="Detach"
          @click="onDetach(d.id!)"
        >
          <i class="fa-solid fa-xmark text-[10px]"></i>
        </button>
      </span>
      <button
        class="px-2 py-1 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700 text-[11px] text-zinc-500 hover:border-indigo-300 hover:text-indigo-600"
        @mousedown.stop="pickerOpen = !pickerOpen"
      >
        <i class="fa-solid fa-plus text-[10px]"></i> Attach
      </button>
    </div>
    <DocPicker
      :docs="documents"
      :attached-ids="attached.map((d) => d.id!)"
      :open="pickerOpen"
      @pick="onPick"
      @close="pickerOpen = false"
    />
  </div>
</template>
