export async function requestDurableStorage(): Promise<{
	supported: boolean
	persisted: boolean
}> {
	if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
		return { supported: false, persisted: false }
	}
	try {
		if (await navigator.storage.persisted()) {
			return { supported: true, persisted: true }
		}
		return { supported: true, persisted: await navigator.storage.persist() }
	} catch {
		return { supported: true, persisted: false }
	}
}
