import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'
import { initStore } from '@/lib/db'
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'
import { getRetriever } from '@/lib/retrieval/index'
import { requestDurableStorage } from '@/lib/durableStorage'

await initStore()
void requestDurableStorage()
const docs = useDocuments()
const threads = useThreads()
await Promise.all([docs.loadAll(), threads.loadAll()])
await getRetriever().indexAll(
  docs.documents.value.map((d) => ({ id: d.id!, name: d.name, pages: d.pages })),
)

createApp(App).mount('#app')
