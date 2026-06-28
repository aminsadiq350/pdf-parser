<script setup lang="ts">
import { useDrawers } from '@/composables/useDrawers'

const drawers = useDrawers()
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-200"
    leave-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div
      v-if="drawers.anyOpen.value"
      class="md:hidden fixed inset-0 bg-black/40 z-30"
      aria-hidden="true"
      @click="drawers.closeAll"
    />
  </Transition>
</template>
