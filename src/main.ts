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

// Register the PWA service worker (production only). autoUpdate activates the
// new SW immediately and reloads the page — no manual cache clearing needed.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
	void (async () => {
		try {
			const { registerSW } = await import('virtual:pwa-register')
			registerSW({
				onOfflineReady() {
					useToasts().show('Ready to work offline', 'success', 4000)
				},
			})
		} catch {
			// virtual:pwa-register is only generated in builds; absence in dev is fine.
		}
	})()
}

createApp(App).mount('#app')
