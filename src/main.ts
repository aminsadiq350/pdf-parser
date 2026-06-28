import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'
import { initStore } from '@/lib/db'
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'

await initStore()
await Promise.all([useDocuments().loadAll(), useThreads().loadAll()])

createApp(App).mount('#app')
