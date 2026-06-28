<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{
  'update:modelValue': [v: string]
  commit: [v: string]
  cancel: []
}>()

const editing = ref(false)
const draft = ref(props.modelValue)
const input = ref<HTMLInputElement | null>(null)

watch(
  () => props.modelValue,
  (v) => {
    if (!editing.value) draft.value = v
  },
)

async function startEdit() {
  draft.value = props.modelValue
  editing.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select()
}

function commit() {
  const v = draft.value.trim()
  editing.value = false
  if (v && v !== props.modelValue) {
    emit('update:modelValue', v)
    emit('commit', v)
  }
}

function cancel() {
  editing.value = false
  draft.value = props.modelValue
  emit('cancel')
}
</script>

<template>
  <span v-if="!editing" class="truncate cursor-text" @dblclick.stop="startEdit">
    {{ modelValue }}
  </span>
  <input
    v-else
    ref="input"
    v-model="draft"
    class="bg-white dark:bg-zinc-800 border border-indigo-400 rounded px-1 py-0 text-sm w-full outline-none"
    @click.stop
    @keydown.enter.prevent="commit"
    @keydown.esc.prevent="cancel"
    @blur="commit"
  />
</template>
