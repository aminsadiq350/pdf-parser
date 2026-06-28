<script setup lang="ts">
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'
import DocItem from './DocItem.vue'

const { documents, activeId, select, delete: deleteDoc } = useDocuments()
const threads = useThreads()

async function onSelect(id: number) {
  select(id)
  const t = await threads.ensureDefaultThreadForDoc(id)
  await threads.select(t.id!)
}

async function onDelete(id: number) {
  await deleteDoc(id)
  await threads.handleDocDeleted(id)
}
</script>

<template>
  <section class="space-y-2">
    <h2
      class="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider"
    >
      Documents
    </h2>
    <p v-if="documents.length === 0" class="text-xs text-zinc-400 px-1 py-2">
      Import your first PDF to get started.
    </p>
    <DocItem
      v-for="doc in documents"
      :key="doc.id"
      :doc="doc"
      :active="activeId === doc.id"
      @select="onSelect(doc.id!)"
      @delete="onDelete(doc.id!)"
    />
  </section>
</template>
