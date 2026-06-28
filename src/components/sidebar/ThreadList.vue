<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'
import { closeDrawersIfMobile } from '@/lib/responsiveDrawers'
import { filterThreads } from '@/lib/threadFilter'
import ThreadItem from './ThreadItem.vue'

const { documents, activeId, activeDoc, select: selectDoc } = useDocuments()
const threads = useThreads()
const query = ref('')

const filtered = computed(() => filterThreads(threads.threads.value, query.value, documents.value))

const forActiveDoc = computed(() => {
  const id = activeId.value
  if (id == null) return []
  return filtered.value.filter((t) => t.docIds.includes(id))
})

const others = computed(() => {
  const id = activeId.value
  if (id == null) return filtered.value
  return filtered.value.filter((t) => !t.docIds.includes(id))
})

async function onSelect(threadId: number) {
  await threads.select(threadId)
  const t = threads.threads.value.find((x) => x.id === threadId)
  if (t && t.docIds[0] != null) selectDoc(t.docIds[0])
  closeDrawersIfMobile()
}

async function onRename(threadId: number, name: string) {
  await threads.rename(threadId, name)
}

async function onNewForActiveDoc() {
  const docId = activeId.value
  if (docId == null) return
  const created = await threads.create({ docIds: [docId] })
  await threads.select(created.id!)
}

async function onNewEmpty() {
  const created = await threads.create({ docIds: [] })
  await threads.select(created.id!)
}
</script>

<template>
  <section class="space-y-2">
    <div class="flex items-center justify-between">
      <h2
        class="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider"
      >
        Threads
      </h2>
    </div>

    <!-- Search -->
    <div class="relative">
      <input
        v-model="query"
        type="text"
        placeholder="Search threads…"
        class="w-full pl-7 pr-2 py-1.5 text-xs rounded-md bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none placeholder-zinc-400"
        aria-label="Search threads"
      />
      <i
        class="fa-solid fa-magnifying-glass text-[10px] text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
      ></i>
    </div>

    <!-- Per-doc group -->
    <div v-if="activeDoc && forActiveDoc.length > 0" class="space-y-1">
      <div class="flex items-center justify-between pt-1">
        <h3
          class="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider truncate"
        >
          For {{ activeDoc.name }}
        </h3>
        <button
          class="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-600"
          title="New thread for this document"
          @click="onNewForActiveDoc"
        >
          <i class="fa-solid fa-plus text-[10px]"></i>
        </button>
      </div>
      <ThreadItem
        v-for="t in forActiveDoc"
        :key="t.id"
        :thread="t"
        :docs="documents"
        :active="threads.activeThreadId.value === t.id"
        @select="onSelect(t.id!)"
        @rename="(name) => onRename(t.id!, name)"
      />
    </div>

    <!-- Active-doc "no threads yet" hint -->
    <div
      v-else-if="activeDoc && forActiveDoc.length === 0 && !query"
      class="flex items-center justify-between gap-2 px-1 py-2 text-xs text-zinc-400"
    >
      <span class="truncate">No threads yet for {{ activeDoc.name }}.</span>
      <button
        class="px-2 py-1 text-[11px] rounded bg-indigo-600 text-white hover:bg-indigo-700 transition flex-shrink-0"
        @click="onNewForActiveDoc"
      >
        + New
      </button>
    </div>

    <!-- Other threads -->
    <div v-if="others.length > 0" class="space-y-1">
      <div v-if="activeDoc" class="flex items-center justify-between pt-2">
        <h3
          class="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider"
        >
          Other threads
        </h3>
      </div>
      <div v-else class="flex items-center justify-between pt-1">
        <h3
          class="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider"
        >
          All threads
        </h3>
        <button
          class="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-600"
          title="New empty thread"
          @click="onNewEmpty"
        >
          <i class="fa-solid fa-plus text-[10px]"></i>
        </button>
      </div>
      <ThreadItem
        v-for="t in others"
        :key="t.id"
        :thread="t"
        :docs="documents"
        :active="threads.activeThreadId.value === t.id"
        @select="onSelect(t.id!)"
        @rename="(name) => onRename(t.id!, name)"
      />
    </div>

    <!-- Truly empty (or empty after filter) -->
    <p
      v-if="threads.threads.value.length === 0"
      class="text-xs text-zinc-400 px-1 py-2"
    >
      No conversations yet.
    </p>
    <p
      v-else-if="filtered.length === 0 && query"
      class="text-xs text-zinc-400 px-1 py-2"
    >
      No matches for &ldquo;{{ query }}&rdquo;.
    </p>
  </section>
</template>
