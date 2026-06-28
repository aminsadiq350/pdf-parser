import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatInput from '@/components/chat/ChatInput.vue'

describe('ChatInput', () => {
  it('emits send with the typed text on submit', async () => {
    const wrap = mount(ChatInput, { props: { disabled: false } })
    const input = wrap.find('input[type="text"]')
    await input.setValue('what is going on')
    await wrap.find('form').trigger('submit')
    expect(wrap.emitted('send')?.[0]).toEqual(['what is going on'])
  })

  it('does not emit when input is whitespace-only', async () => {
    const wrap = mount(ChatInput, { props: { disabled: false } })
    await wrap.find('input[type="text"]').setValue('   ')
    await wrap.find('form').trigger('submit')
    expect(wrap.emitted('send')).toBeUndefined()
  })

  it('shows the Stop button while streaming and emits stop on submit', async () => {
    const wrap = mount(ChatInput, { props: { disabled: false, streaming: true } })
    expect(wrap.find('button[title="Stop"]').exists()).toBe(true)
    expect(wrap.find('button[type="submit"] .fa-paper-plane').exists()).toBe(false)
    await wrap.find('form').trigger('submit')
    expect(wrap.emitted('stop')).toBeTruthy()
    expect(wrap.emitted('send')).toBeUndefined()
  })
})
