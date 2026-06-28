import { ref, type Ref } from 'vue'

// Tailwind defaults: sm = 640, md = 768
const MOBILE_MAX = 767
const PHONE_MAX = 639

const mobileQuery =
	typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${MOBILE_MAX}px)`) : null
const phoneQuery =
	typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${PHONE_MAX}px)`) : null

const isMobile: Ref<boolean> = ref(mobileQuery?.matches ?? false)
const isPhone: Ref<boolean> = ref(phoneQuery?.matches ?? false)

let attached = false
function ensureAttached() {
	if (attached) return
	attached = true
	mobileQuery?.addEventListener('change', (e) => {
		isMobile.value = e.matches
	})
	phoneQuery?.addEventListener('change', (e) => {
		isPhone.value = e.matches
	})
}

ensureAttached()

export function useResponsive() {
	return { isMobile, isPhone }
}

/** Test-only — re-read matchMedia state. Used by vitest to reset between specs. */
export function __resyncResponsiveForTests() {
	isMobile.value = mobileQuery?.matches ?? false
	isPhone.value = phoneQuery?.matches ?? false
}
