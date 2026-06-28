<script setup lang="ts">
import { ref } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import PdfViewer from './components/PdfViewer.vue'
import ChatPanel from './components/ChatPanel.vue'
import Toast from './components/ui/Toast.vue'
import CitationPreview from './components/chat/CitationPreview.vue'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { usePdfViewer } from './composables/usePdfViewer'

const chatPanelRef = ref<InstanceType<typeof ChatPanel> | null>(null)
const viewerRef = ref<InstanceType<typeof PdfViewer> | null>(null)
const { prev, next, zoomIn, zoomOut, resetZoom } = usePdfViewer()

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
  zoomIn,
  zoomOut,
  resetZoom,
  openSearch() {
    viewerRef.value?.openSearch()
  },
})
</script>

<template>
  <div class="h-full flex overflow-hidden relative">
    <AppSidebar />
    <PdfViewer ref="viewerRef" />
    <ChatPanel ref="chatPanelRef" />
    <Toast />
    <CitationPreview />
  </div>
</template>
