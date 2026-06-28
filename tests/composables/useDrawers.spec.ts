import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useDrawers, __resetDrawersForTests } from '@/composables/useDrawers'

describe('useDrawers', () => {
	beforeEach(() => {
		__resetDrawersForTests()
	})

	it('opens drawers and tracks anyOpen', () => {
		const d = useDrawers()
		expect(d.anyOpen.value).toBe(false)
		d.openLeft()
		expect(d.left.value).toBe(true)
		expect(d.anyOpen.value).toBe(true)
	})

	it('mutually excludes left and right', () => {
		const d = useDrawers()
		d.openLeft()
		expect(d.left.value).toBe(true)
		d.openRight()
		expect(d.left.value).toBe(false)
		expect(d.right.value).toBe(true)
		d.openLeft()
		expect(d.left.value).toBe(true)
		expect(d.right.value).toBe(false)
	})

	it('closeAll clears both', () => {
		const d = useDrawers()
		d.openLeft()
		d.closeAll()
		expect(d.left.value).toBe(false)
		expect(d.right.value).toBe(false)
		expect(d.anyOpen.value).toBe(false)
	})

	it('toggleLeft flips the left drawer and closes right', () => {
		const d = useDrawers()
		d.openRight()
		d.toggleLeft()
		expect(d.left.value).toBe(true)
		expect(d.right.value).toBe(false)
		d.toggleLeft()
		expect(d.left.value).toBe(false)
	})

	it('locks body scroll while any drawer is open and restores on close', async () => {
		const d = useDrawers()
		document.body.style.overflow = 'auto'
		d.openLeft()
		await nextTick()
		expect(document.body.style.overflow).toBe('hidden')
		d.closeAll()
		await nextTick()
		expect(document.body.style.overflow).toBe('auto')
	})
})
