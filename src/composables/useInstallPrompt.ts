import { computed, ref } from 'vue'

/** Subset of the chromium `beforeinstallprompt` event surface we use. */
export interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferredEvent = ref<BeforeInstallPromptEvent | null>(null)

function detectInstalled(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false
	return window.matchMedia('(display-mode: standalone)').matches
}

const installed = ref<boolean>(detectInstalled())
const canInstall = computed(() => !installed.value && deferredEvent.value != null)

let attached = false
function attachOnce() {
	if (attached) return
	if (typeof window === 'undefined') return
	attached = true
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault()
		deferredEvent.value = e as BeforeInstallPromptEvent
	})
	window.addEventListener('appinstalled', () => {
		deferredEvent.value = null
		installed.value = true
	})
}
attachOnce()

async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
	const e = deferredEvent.value
	if (!e) return 'unavailable'
	await e.prompt()
	const { outcome } = await e.userChoice
	deferredEvent.value = null
	if (outcome === 'accepted') installed.value = true
	return outcome
}

export function useInstallPrompt() {
	return { canInstall, installed, install }
}

/** Test-only — synthesise a beforeinstallprompt for unit specs. */
export function __setDeferredInstallEventForTests(
	e: BeforeInstallPromptEvent | null,
): void {
	deferredEvent.value = e
	if (e) installed.value = false
}

/** Test-only — reset module state between specs. */
export function __resetInstallPromptForTests(): void {
	deferredEvent.value = null
	installed.value = false
}
