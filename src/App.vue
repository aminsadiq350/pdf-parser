<script setup lang="ts">
import AppSidebar from './components/AppSidebar.vue'
import PdfViewer from './components/PdfViewer.vue'
import ChatPanel from './components/ChatPanel.vue'
import Toast from './components/ui/Toast.vue'
</script>

<template>
  <div class="h-full flex overflow-hidden relative">
    <AppSidebar />
    <PdfViewer />
    <ChatPanel />
    <Toast />
  </div>
</template>
