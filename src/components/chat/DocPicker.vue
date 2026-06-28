<script setup lang="ts">
import { computed } from 'vue'
import type { Document } from '@/types/domain'

const props = defineProps<{
  docs: readonly Document[]
  attachedIds: readonly number[]
  open: boolean
}>()
defineEmits<{ pick: [docId: number]; close: [] }>()

const candidates = computed(() =>
  props.docs.filter((d) => !props.attachedIds.includes(d.id!)),
)
</script>

<template>
  <div
    v-if="open"
    class="absolute z-20 mt-1 w-64 max-h-64 overflow-y-auto rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-lg"
    @mousedown.stop
  >
    <div
      v-if="candidates.length === 0"
      class="px-3 py-4 text-xs text-zinc-400 text-center"
    >
      No more documents to attach
    </div>
    <button
      v-for="d in candidates"
      :key="d.id"
      class="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
      @click="$emit('pick', d.id!); $emit('close')"
    >
      <i class="fa-solid fa-file-pdf text-zinc-400 text-xs"></i>
      <span class="truncate">{{ d.name }}</span>
    </button>
  </div>
</template>
