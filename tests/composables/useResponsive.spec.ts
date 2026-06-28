import { describe, it, expect, beforeEach } from 'vitest'
import { useResponsive, __resyncResponsiveForTests } from '@/composables/useResponsive'

declare global {
	var __setMatchMedia: (query: string, matches: boolean) => void
}

const MOBILE_Q = '(max-width: 767px)'
const PHONE_Q = '(max-width: 639px)'

describe('useResponsive', () => {
	beforeEach(() => {
		globalThis.__setMatchMedia(MOBILE_Q, false)
		globalThis.__setMatchMedia(PHONE_Q, false)
		__resyncResponsiveForTests()
	})

	it('returns the same refs across calls (singleton)', () => {
		const a = useResponsive()
		const b = useResponsive()
		expect(a.isMobile).toBe(b.isMobile)
		expect(a.isPhone).toBe(b.isPhone)
	})

	it('reflects mobile breakpoint when matchMedia matches', () => {
		const { isMobile } = useResponsive()
		expect(isMobile.value).toBe(false)
		globalThis.__setMatchMedia(MOBILE_Q, true)
		expect(isMobile.value).toBe(true)
	})

	it('reflects phone breakpoint independently', () => {
		const { isMobile, isPhone } = useResponsive()
		globalThis.__setMatchMedia(MOBILE_Q, true)
		globalThis.__setMatchMedia(PHONE_Q, true)
		expect(isMobile.value).toBe(true)
		expect(isPhone.value).toBe(true)
		globalThis.__setMatchMedia(PHONE_Q, false)
		expect(isPhone.value).toBe(false)
		expect(isMobile.value).toBe(true)
	})
})
