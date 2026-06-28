<script setup lang="ts">
import { computed } from 'vue'
import type { Thread, Document } from '@/types/domain'

const props = defineProps<{
  thread: Thread
  docs: readonly Document[]
  active: boolean
}>()
defineEmits<{ select: [] }>()

const attached = computed(() =>
  props.thread.docIds
    .map((id) => props.docs.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d),
)
const visibleChips = computed(() => attached.value.slice(0, 3))
const overflow = computed(() =>
  Math.max(0, attached.value.length - visibleChips.value.length),
)

const label = computed(() => {
  if (props.thread.name) return props.thread.name
  if (attached.value[0]) return attached.value[0].name
  return 'Untitled chat'
})
</script>

<template>
  <div
    :class="[
      'p-2.5 rounded-lg cursor-pointer text-sm transition space-y-1',
      active
        ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800'
        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
    ]"
    @click="$emit('select')"
  >
    <div class="flex items-center gap-2">
      <i class="fa-solid fa-comments text-zinc-400 text-xs"></i>
      <span class="truncate">{{ label }}</span>
    </div>
    <div v-if="attached.length > 0" class="flex items-center gap-1 flex-wrap">
      <span
        v-for="d in visibleChips"
        :key="d.id"
        class="px-1.5 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-700/60 text-[10px] text-zinc-600 dark:text-zinc-300 truncate max-w-[90px]"
      >
        {{ d.name }}
      </span>
      <span v-if="overflow > 0" class="text-[10px] text-zinc-400">+{{ overflow }}</span>
    </div>
  </div>
</template>
