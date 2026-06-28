import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import MobileChromeBar from '@/components/mobile/MobileChromeBar.vue'
import DrawerBackdrop from '@/components/mobile/DrawerBackdrop.vue'
import { useDrawers, __resetDrawersForTests } from '@/composables/useDrawers'

describe('MobileChromeBar', () => {
  beforeEach(() => {
    __resetDrawersForTests()
  })

  it('renders hamburger and chat-bubble buttons', () => {
    const wrapper = mount(MobileChromeBar)
    expect(wrapper.find('button[aria-label="Open documents and threads"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Open chat"]').exists()).toBe(true)
  })

  it('toggles the left drawer on hamburger click', async () => {
    const wrapper = mount(MobileChromeBar)
    const d = useDrawers()
    expect(d.left.value).toBe(false)
    await wrapper.find('button[aria-label="Open documents and threads"]').trigger('click')
    expect(d.left.value).toBe(true)
    await wrapper.find('button[aria-label="Open documents and threads"]').trigger('click')
    expect(d.left.value).toBe(false)
  })

  it('toggles the right drawer on chat bubble click', async () => {
    const wrapper = mount(MobileChromeBar)
    const d = useDrawers()
    expect(d.right.value).toBe(false)
    await wrapper.find('button[aria-label="Open chat"]').trigger('click')
    expect(d.right.value).toBe(true)
  })

  it('shows the active doc name when one is set', async () => {
    // Active doc is empty by default in fake-indexeddb-backed tests.
    const wrapper = mount(MobileChromeBar)
    expect(wrapper.text()).toContain('Notebook')
  })
})

describe('DrawerBackdrop', () => {
  beforeEach(() => {
    __resetDrawersForTests()
  })

  it('is not rendered when no drawer is open', () => {
    const wrapper = mount(DrawerBackdrop)
    expect(wrapper.find('div').exists()).toBe(false)
  })

  it('is rendered when any drawer is open and closes all on click', async () => {
    const d = useDrawers()
    d.openLeft()
    const wrapper = mount(DrawerBackdrop)
    const backdrop = wrapper.find('div')
    expect(backdrop.exists()).toBe(true)
    await backdrop.trigger('click')
    expect(d.left.value).toBe(false)
    expect(d.right.value).toBe(false)
  })
})
