import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import EditableLabel from '@/components/ui/EditableLabel.vue'

describe('EditableLabel', () => {
	it('renders the value as a span by default', () => {
		const wrap = mount(EditableLabel, { props: { modelValue: 'Hello' } })
		expect(wrap.text()).toBe('Hello')
		expect(wrap.find('input').exists()).toBe(false)
	})

	it('double-click switches to an input pre-filled with the value', async () => {
		const wrap = mount(EditableLabel, { props: { modelValue: 'Hello' } })
		await wrap.find('span').trigger('dblclick')
		await nextTick()
		const input = wrap.find('input')
		expect(input.exists()).toBe(true)
		expect((input.element as HTMLInputElement).value).toBe('Hello')
	})

	it('Enter emits commit + update:modelValue with the new value', async () => {
		const wrap = mount(EditableLabel, { props: { modelValue: 'Hello' } })
		await wrap.find('span').trigger('dblclick')
		await nextTick()
		const input = wrap.find('input')
		await input.setValue('Renamed')
		await input.trigger('keydown.enter')
		expect(wrap.emitted('commit')?.[0]).toEqual(['Renamed'])
		expect(wrap.emitted('update:modelValue')?.[0]).toEqual(['Renamed'])
	})

	it('Esc cancels and reverts (no emit)', async () => {
		const wrap = mount(EditableLabel, { props: { modelValue: 'Hello' } })
		await wrap.find('span').trigger('dblclick')
		await nextTick()
		await wrap.find('input').setValue('Renamed')
		await wrap.find('input').trigger('keydown.esc')
		expect(wrap.emitted('commit')).toBeUndefined()
		expect(wrap.emitted('cancel')).toBeTruthy()
	})

	it('blur commits like Enter', async () => {
		const wrap = mount(EditableLabel, { props: { modelValue: 'Hello' } })
		await wrap.find('span').trigger('dblclick')
		await nextTick()
		await wrap.find('input').setValue('Blurred')
		await wrap.find('input').trigger('blur')
		expect(wrap.emitted('commit')?.[0]).toEqual(['Blurred'])
	})

	it('does not emit when value is unchanged', async () => {
		const wrap = mount(EditableLabel, { props: { modelValue: 'Hello' } })
		await wrap.find('span').trigger('dblclick')
		await nextTick()
		await wrap.find('input').trigger('keydown.enter')
		expect(wrap.emitted('commit')).toBeUndefined()
	})
})
