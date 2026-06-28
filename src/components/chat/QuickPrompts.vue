<script setup lang="ts">
import { QUICK_PROMPTS } from '@/lib/quickPrompts'
import { useChat } from '@/composables/useChat'

const { send } = useChat()
function onPick(prompt: string) {
  void send(prompt)
}
</script>

<template>
  <div class="px-4 pb-3 flex flex-wrap gap-1.5 justify-center">
    <button
      v-for="p in QUICK_PROMPTS"
      :key="p"
      class="px-3 py-1 text-[11px] rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-300 transition"
      @click="onPick(p)"
    >
      {{ p }}
    </button>
  </div>
</template>
