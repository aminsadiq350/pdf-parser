import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatMessage from '@/components/chat/ChatMessage.vue'
import type { Message } from '@/types/domain'

const jumpToPage = vi.fn()

vi.mock('@/composables/useDocuments', () => ({
  useDocuments: () => ({
    documents: { value: [{ id: 1, name: 'a.pdf', size: 0, numPages: 5, pages: [], addedAt: 0 }] },
  }),
}))

vi.mock('@/composables/usePdfViewer', () => ({
  usePdfViewer: () => ({ jumpToPage }),
}))

function userMsg(text = 'hi'): Message {
  return { id: 1, threadId: 1, role: 'user', text, createdAt: 1 }
}

function botMsg(
  text: string,
  citations?: Message['citations'],
  error = false,
): Message {
  return { id: 2, threadId: 1, role: 'assistant', text, citations, createdAt: 2, error }
}

describe('ChatMessage', () => {
  beforeEach(() => jumpToPage.mockReset())

  it('renders user message in the right-aligned bubble', () => {
    const wrap = mount(ChatMessage, { props: { msg: userMsg('hello world') } })
    expect(wrap.html()).toContain('hello world')
    expect(wrap.find('.bg-indigo-600').exists()).toBe(true)
  })

  it('renders assistant message in the left bubble', () => {
    const wrap = mount(ChatMessage, { props: { msg: botMsg('I am bot') } })
    expect(wrap.html()).toContain('I am bot')
    expect(wrap.find('.fa-robot').exists()).toBe(true)
  })

  it('shows the error footer when msg.error is true', () => {
    const wrap = mount(ChatMessage, {
      props: { msg: botMsg('**Error:** boom', undefined, true) },
    })
    expect(wrap.text()).toContain('Failed to get response')
  })

  it('renders a citation chip and calls jumpToPage on click', async () => {
    const wrap = mount(ChatMessage, {
      props: {
        msg: botMsg('See [A:p3].', [{ docId: 1, pageNumber: 3 }]),
      },
    })
    const chip = wrap.find('button.citation-chip')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('a.pdf · p.3')
    await chip.trigger('click')
    expect(jumpToPage).toHaveBeenCalledWith(1, 3)
  })

  it('does not call jumpToPage when chip is stale', async () => {
    const wrap = mount(ChatMessage, {
      props: {
        msg: botMsg('See [A:p3].', [{ docId: 999, pageNumber: 3 }]),
      },
    })
    const chip = wrap.find('button.citation-chip.stale')
    expect(chip.exists()).toBe(true)
    await chip.trigger('click')
    expect(jumpToPage).not.toHaveBeenCalled()
  })
})
