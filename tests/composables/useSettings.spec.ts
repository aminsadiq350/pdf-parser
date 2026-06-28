import { describe, it, expect, beforeEach } from 'vitest'
import { useSettings } from '@/composables/useSettings'

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear()
    // Reset module-level refs to their persisted default for each test.
    const s = useSettings()
    s.provider.value = 'openrouter'
    s.apiKey.value = ''
    s.model.value = ''
  })

  it('reads existing localStorage values on first load (verified via writeback)', async () => {
    const s = useSettings()
    s.provider.value = 'gemini'
    s.apiKey.value = 'sk-test'
    s.model.value = 'gemini-2.5-flash'
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('provider')).toBe('gemini')
    expect(localStorage.getItem('api_key')).toBe('sk-test')
    expect(localStorage.getItem('model')).toBe('gemini-2.5-flash')
  })

  it('persists writes back to localStorage', async () => {
    const s = useSettings()
    s.apiKey.value = 'sk-new'
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('api_key')).toBe('sk-new')
  })

  it('modelPlaceholder reflects provider', () => {
    const s = useSettings()
    s.provider.value = 'gemini'
    expect(s.modelPlaceholder.value).toMatch(/gemini-2\.5-flash/)
    s.provider.value = 'openrouter'
    expect(s.modelPlaceholder.value).toMatch(/google\/gemini/)
  })

  it('modelHint reflects provider', () => {
    const s = useSettings()
    s.provider.value = 'gemini'
    expect(s.modelHint.value).toMatch(/Gemini API directly/i)
    s.provider.value = 'openrouter'
    expect(s.modelHint.value).toMatch(/openrouter\.ai/i)
  })
})
