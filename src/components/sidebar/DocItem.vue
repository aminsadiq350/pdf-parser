<script setup lang="ts">
import type { Document } from '@/types/domain'
defineProps<{ doc: Document; active: boolean }>()
defineEmits<{ select: []; delete: [] }>()
</script>

<template>
  <div
    :class="[
      'group p-3 rounded-lg cursor-pointer text-sm transition flex items-center gap-2 relative',
      active
        ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800'
        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
    ]"
    @click="$emit('select')"
  >
    <i class="fa-solid fa-file-pdf text-zinc-400"></i>
    <div class="flex-1 min-w-0">
      <div class="truncate">{{ doc.name }}</div>
      <div class="text-[10px] text-zinc-400">{{ doc.numPages }} pages</div>
    </div>
    <button
      class="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 transition"
      title="Delete document"
      @click.stop="$emit('delete')"
    >
      <i class="fa-solid fa-trash text-xs"></i>
    </button>
  </div>
</template>
