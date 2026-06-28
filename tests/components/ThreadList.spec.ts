import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { db, initStore } from '@/lib/db'
import ThreadList from '@/components/sidebar/ThreadList.vue'
import { useDocuments } from '@/composables/useDocuments'
import { useThreads } from '@/composables/useThreads'

async function resetAll() {
	await db.close()
	await db.delete()
	await initStore()
	const t = useThreads()
	t.threads.value = []
	t.activeThreadId.value = null
	t.activeMessages.value = []
	await t.loadAll()
	const d = useDocuments()
	d.documents.value = []
	d.activeId.value = null
	await d.loadAll()
}

describe('ThreadList', () => {
	beforeEach(async () => {
		await resetAll()
	})

	it('renders an "All threads" group when no doc is active', async () => {
		const t = useThreads()
		await t.create({ docIds: [], name: 'Standalone' })
		const wrapper = mount(ThreadList)
		expect(wrapper.text()).toContain('All threads')
		expect(wrapper.text()).toContain('Standalone')
		expect(wrapper.text()).not.toContain('For ')
	})

	it('splits into "For <doc>" and "Other threads" when a doc is active', async () => {
		const t = useThreads()
		const d = useDocuments()
		const docId = await db.documents.add({
			name: 'paper.pdf',
			size: 1,
			numPages: 1,
			addedAt: 1,
			pages: [],
		})
		await d.loadAll()
		d.activeId.value = docId
		await t.create({ docIds: [docId], name: 'In paper' })
		await t.create({ docIds: [], name: 'Unrelated' })

		const wrapper = mount(ThreadList)
		expect(wrapper.text()).toContain('For paper.pdf')
		expect(wrapper.text()).toContain('In paper')
		expect(wrapper.text()).toContain('Other threads')
		expect(wrapper.text()).toContain('Unrelated')
	})

	it('filters threads by query (name + doc name)', async () => {
		const t = useThreads()
		const d = useDocuments()
		const docId = await db.documents.add({
			name: 'pasta.pdf',
			size: 1,
			numPages: 1,
			addedAt: 1,
			pages: [],
		})
		await d.loadAll()
		await t.create({ docIds: [docId], name: '' })
		await t.create({ docIds: [], name: 'Robot story' })
		await t.create({ docIds: [], name: 'Newton inertia' })

		const wrapper = mount(ThreadList)
		const input = wrapper.find('input[aria-label="Search threads"]')
		await input.setValue('robot')
		expect(wrapper.text()).toContain('Robot story')
		expect(wrapper.text()).not.toContain('Newton inertia')
		// doc-name match
		await input.setValue('pasta')
		expect(wrapper.text()).toContain('pasta.pdf')
		expect(wrapper.text()).not.toContain('Robot story')
		// empty filter — show all
		await input.setValue('')
		expect(wrapper.text()).toContain('Robot story')
		expect(wrapper.text()).toContain('Newton inertia')
	})

	it('shows a no-matches hint and hides "all" headers when filter is empty result', async () => {
		const t = useThreads()
		await t.create({ docIds: [], name: 'Only one' })
		const wrapper = mount(ThreadList)
		await wrapper.find('input[aria-label="Search threads"]').setValue('zzz')
		expect(wrapper.text()).toMatch(/No matches/i)
		expect(wrapper.text()).not.toContain('Only one')
	})

	it('"+ New" button when active doc has zero threads creates one and selects it', async () => {
		const t = useThreads()
		const d = useDocuments()
		const docId = await db.documents.add({
			name: 'fresh.pdf',
			size: 1,
			numPages: 1,
			addedAt: 1,
			pages: [],
		})
		await d.loadAll()
		d.activeId.value = docId
		const wrapper = mount(ThreadList)
		expect(wrapper.text()).toContain('No threads yet for fresh.pdf')
		const newBtn = wrapper.findAll('button').find((b) => b.text() === '+ New')
		expect(newBtn).toBeDefined()
		await newBtn!.trigger('click')
		await flushPromises()
		await flushPromises()
		expect(t.threads.value.length).toBe(1)
		expect(t.threads.value[0].docIds).toEqual([docId])
		expect(t.activeThreadId.value).toBe(t.threads.value[0].id)
	})
})
