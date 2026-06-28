<script setup lang="ts">
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'
import ThreadItem from './ThreadItem.vue'

const { documents, activeId, select: selectDoc } = useDocuments()
const threads = useThreads()

async function onSelect(threadId: number) {
  await threads.select(threadId)
  const t = threads.threads.value.find((x) => x.id === threadId)
  if (t && t.docIds[0] != null) selectDoc(t.docIds[0])
}

async function onNew() {
  const docId = activeId.value
  const docIds = docId ? [docId] : []
  const created = await threads.create({ docIds })
  await threads.select(created.id!)
}
</script>

<template>
  <section class="space-y-2">
    <div class="flex items-center justify-between">
      <h2
        class="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider"
      >
        Recent threads
      </h2>
      <button
        class="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-600"
        title="New thread"
        @click="onNew"
      >
        <i class="fa-solid fa-plus text-xs"></i>
      </button>
    </div>
    <p v-if="threads.threads.value.length === 0" class="text-xs text-zinc-400 px-1 py-2">
      No conversations yet.
    </p>
    <ThreadItem
      v-for="t in threads.threads.value"
      :key="t.id"
      :thread="t"
      :docs="documents"
      :active="threads.activeThreadId.value === t.id"
      @select="onSelect(t.id!)"
    />
  </section>
</template>
