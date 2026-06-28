<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  disabled: boolean
  streaming?: boolean
  placeholder?: string
}>()
const emit = defineEmits<{ send: [text: string]; stop: [] }>()

const value = ref('')

function submit() {
  if (props.streaming) {
    emit('stop')
    return
  }
  const text = value.value.trim()
  if (!text || props.disabled) return
  emit('send', text)
  value.value = ''
}
</script>

<template>
  <form
    class="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
    @submit.prevent="submit"
  >
    <div
      class="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl px-3 py-1 focus-within:ring-2 focus-within:ring-indigo-400/50 transition"
    >
      <input
        v-model="value"
        type="text"
        :disabled="props.disabled && !props.streaming"
        :placeholder="props.placeholder ?? 'Ask anything about the doc…'"
        class="flex-1 py-2.5 bg-transparent border-0 outline-none text-sm placeholder-zinc-400"
      />
      <button
        v-if="props.streaming"
        type="submit"
        class="p-2 rounded-lg bg-red-600 text-white hover:bg-red-700 shadow-sm transition-all duration-200"
        title="Stop"
      >
        <i class="fa-solid fa-stop text-xs"></i>
      </button>
      <button
        v-else
        type="submit"
        :disabled="!value.trim() || props.disabled"
        :class="[
          'p-2 rounded-lg transition-all duration-200',
          value.trim() && !props.disabled
            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm scale-100'
            : 'text-zinc-300 dark:text-zinc-600 scale-95 cursor-not-allowed',
        ]"
      >
        <i class="fa-solid fa-paper-plane text-xs"></i>
      </button>
    </div>
    <slot name="hint" />
  </form>
</template>
