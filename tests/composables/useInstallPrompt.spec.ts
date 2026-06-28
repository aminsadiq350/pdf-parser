import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
	useInstallPrompt,
	__setDeferredInstallEventForTests,
	__resetInstallPromptForTests,
	type BeforeInstallPromptEvent,
} from '@/composables/useInstallPrompt'

function fakeEvent(outcome: 'accepted' | 'dismissed' = 'accepted'): BeforeInstallPromptEvent {
	const ev = {
		prompt: vi.fn(async () => undefined),
		userChoice: Promise.resolve({ outcome }),
		preventDefault: () => undefined,
	} as unknown as BeforeInstallPromptEvent
	return ev
}

describe('useInstallPrompt', () => {
	beforeEach(() => {
		__resetInstallPromptForTests()
	})

	it('canInstall is false when no deferred event has been seen', () => {
		const { canInstall, installed } = useInstallPrompt()
		expect(canInstall.value).toBe(false)
		expect(installed.value).toBe(false)
	})

	it('canInstall flips to true when a beforeinstallprompt arrives', () => {
		const { canInstall } = useInstallPrompt()
		expect(canInstall.value).toBe(false)
		__setDeferredInstallEventForTests(fakeEvent())
		expect(canInstall.value).toBe(true)
	})

	it('install() calls prompt(), reads userChoice, and clears the deferred event', async () => {
		const e = fakeEvent('accepted')
		__setDeferredInstallEventForTests(e)
		const { install, canInstall, installed } = useInstallPrompt()
		expect(canInstall.value).toBe(true)

		const outcome = await install()

		expect(outcome).toBe('accepted')
		expect(e.prompt).toHaveBeenCalledOnce()
		expect(canInstall.value).toBe(false)
		expect(installed.value).toBe(true)
	})

	it('install() returns unavailable when no deferred event is set', async () => {
		const { install } = useInstallPrompt()
		expect(await install()).toBe('unavailable')
	})

	it('install() on dismissed leaves installed=false but still clears the prompt', async () => {
		__setDeferredInstallEventForTests(fakeEvent('dismissed'))
		const { install, canInstall, installed } = useInstallPrompt()
		const outcome = await install()
		expect(outcome).toBe('dismissed')
		expect(canInstall.value).toBe(false)
		expect(installed.value).toBe(false)
	})
})
