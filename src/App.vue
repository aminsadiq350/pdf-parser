<script setup lang="ts">
import { ref } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import PdfViewer from './components/PdfViewer.vue'
import ChatPanel from './components/ChatPanel.vue'
import Toast from './components/ui/Toast.vue'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { usePdfViewer } from './composables/usePdfViewer'

const chatPanelRef = ref<InstanceType<typeof ChatPanel> | null>(null)
const { prev, next } = usePdfViewer()

useKeyboardShortcuts({
  prev,
  next,
  focusChat() {
    chatPanelRef.value?.focusInput()
  },
  closeOrBlur() {
    const a = document.activeElement as HTMLElement | null
    if (a && a !== document.body) a.blur()
  },
})
</script>

<template>
  <div class="h-full flex overflow-hidden relative">
    <AppSidebar />
    <PdfViewer />
    <ChatPanel ref="chatPanelRef" />
    <Toast />
  </div>
</template>
