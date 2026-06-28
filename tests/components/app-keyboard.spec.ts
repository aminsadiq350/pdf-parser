import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '@/App.vue'
import { useDrawers, __resetDrawersForTests } from '@/composables/useDrawers'

// The keyboard wiring lives inside App.vue's onMounted. We mount the App,
// open a drawer, dispatch Escape, and assert closeAll fired.
describe('App keyboard wiring', () => {
  beforeEach(() => {
    __resetDrawersForTests()
  })

  it('closes any open drawer on Escape', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    const d = useDrawers()
    d.openLeft()
    expect(d.left.value).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(d.left.value).toBe(false)
    expect(d.anyOpen.value).toBe(false)
    wrapper.unmount()
  })

  it('renders the mobile chrome bar', () => {
    const wrapper = mount(App, { attachTo: document.body })
    // Bar has md:hidden but is still in the DOM in jsdom.
    expect(wrapper.find('button[aria-label="Open documents and threads"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
