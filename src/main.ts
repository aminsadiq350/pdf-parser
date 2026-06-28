import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'
import { initStore } from '@/lib/db'
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'
import { useToasts } from '@/composables/useToasts'
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

// Group H: register the PWA service worker (production only) and surface an
// actionable toast when a new version is waiting. The dynamic import keeps
// virtual:pwa-register out of the test bundle and out of dev where SW is off.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  void (async () => {
    try {
      const mod = await import('virtual:pwa-register')
      const { showAction } = useToasts()
      const updateSW = mod.registerSW({
        onNeedRefresh() {
          showAction('Update available', {
            label: 'Reload',
            handler: () => void updateSW(true),
          })
        },
        onOfflineReady() {
          useToasts().show('Ready to work offline', 'success', 4000)
        },
      })
    } catch {
      // virtual:pwa-register is only generated in builds; absence in dev is
      // fine.
    }
  })()
}

createApp(App).mount('#app')
