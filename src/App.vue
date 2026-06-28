<script setup lang="ts">
import { ref } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import PdfViewer from './components/PdfViewer.vue'
import ChatPanel from './components/ChatPanel.vue'
import Toast from './components/ui/Toast.vue'
import MobileChromeBar from './components/mobile/MobileChromeBar.vue'
import DrawerBackdrop from './components/mobile/DrawerBackdrop.vue'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { usePdfViewer } from './composables/usePdfViewer'
import { useDrawers } from './composables/useDrawers'

const chatPanelRef = ref<InstanceType<typeof ChatPanel> | null>(null)
const viewerRef = ref<InstanceType<typeof PdfViewer> | null>(null)
const { prev, next, zoomIn, zoomOut, resetZoom } = usePdfViewer()
const drawers = useDrawers()

useKeyboardShortcuts({
  prev,
  next,
  focusChat() {
    chatPanelRef.value?.focusInput()
  },
  closeOrBlur() {
    // On mobile, prefer closing an open drawer first.
    if (drawers.anyOpen.value) {
      drawers.closeAll()
      return
    }
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
  <div class="h-full flex flex-col md:flex-row overflow-hidden relative">
    <MobileChromeBar />
    <div class="flex-1 flex overflow-hidden relative">
      <AppSidebar />
      <PdfViewer ref="viewerRef" />
      <ChatPanel ref="chatPanelRef" />
    </div>
    <DrawerBackdrop />
    <Toast />
  </div>
</template>
