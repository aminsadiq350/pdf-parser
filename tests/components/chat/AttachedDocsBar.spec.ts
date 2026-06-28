import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import AttachedDocsBar from '@/components/chat/AttachedDocsBar.vue'

const attachDoc = vi.fn()
const detachDoc = vi.fn()
const docsRef = ref([
	{ id: 1, name: 'a.pdf', size: 1, numPages: 1, pages: [], addedAt: 0 },
	{ id: 2, name: 'b.pdf', size: 1, numPages: 1, pages: [], addedAt: 0 },
])
const activeThreadRef = computed(() => ({
	id: 99,
	name: '',
	docIds: [1],
	createdAt: 0,
	updatedAt: 0,
}))

vi.mock('@/composables/useDocuments', () => ({
	useDocuments: () => ({ documents: docsRef }),
}))

vi.mock('@/composables/useThreads', () => ({
	useThreads: () => ({ activeThread: activeThreadRef, attachDoc, detachDoc }),
}))

describe('AttachedDocsBar', () => {
	beforeEach(() => {
		attachDoc.mockReset()
		detachDoc.mockReset()
	})

	it('renders a chip for each attached doc only', () => {
		const wrap = mount(AttachedDocsBar)
		const chipText = wrap.text()
		expect(chipText).toContain('a.pdf')
		// b.pdf is unattached, so it should NOT be in the chip row (but it
		// could appear inside the picker once opened).
		const chips = wrap.findAll('.bg-indigo-100')
		const chipLabels = chips.map((c) => c.text())
		expect(chipLabels.some((l) => l.includes('a.pdf'))).toBe(true)
		expect(chipLabels.some((l) => l.includes('b.pdf'))).toBe(false)
	})

	it('emits detach via composable on chip × click', async () => {
		const wrap = mount(AttachedDocsBar)
		const xBtn = wrap.find('button[title="Detach"]')
		expect(xBtn.exists()).toBe(true)
		await xBtn.trigger('click')
		expect(detachDoc).toHaveBeenCalledWith(99, 1)
	})

	it('toggles the picker open on + click', async () => {
		const wrap = mount(AttachedDocsBar)
		// Picker closed: b.pdf should NOT be in any button
		expect(wrap.findAll('button').filter((b) => b.text() === 'b.pdf')).toHaveLength(0)
		const plus = wrap
			.findAll('button')
			.find((b) => b.text().includes('Attach') && !b.attributes('title'))
		expect(plus).toBeTruthy()
		await plus!.trigger('mousedown')
		// After opening, b.pdf appears as a picker item
		const pickerItems = wrap.findAll('button').filter((b) => b.text() === 'b.pdf')
		expect(pickerItems.length).toBe(1)
	})
})
