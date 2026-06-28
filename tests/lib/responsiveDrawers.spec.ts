import { describe, it, expect, beforeEach } from 'vitest'
import { closeDrawersIfMobile } from '@/lib/responsiveDrawers'
import { useDrawers, __resetDrawersForTests } from '@/composables/useDrawers'
import { __resyncResponsiveForTests } from '@/composables/useResponsive'

declare global {
  var __setMatchMedia: (query: string, matches: boolean) => void
}

const MOBILE_Q = '(max-width: 767px)'
const PHONE_Q = '(max-width: 639px)'

describe('closeDrawersIfMobile', () => {
  beforeEach(() => {
    __resetDrawersForTests()
    globalThis.__setMatchMedia(MOBILE_Q, false)
    globalThis.__setMatchMedia(PHONE_Q, false)
    __resyncResponsiveForTests()
  })

  it('closes any open drawer when mobile', () => {
    const d = useDrawers()
    d.openLeft()
    globalThis.__setMatchMedia(MOBILE_Q, true)
    __resyncResponsiveForTests()
    closeDrawersIfMobile()
    expect(d.left.value).toBe(false)
    expect(d.right.value).toBe(false)
  })

  it('is a no-op on desktop widths', () => {
    const d = useDrawers()
    d.openRight()
    closeDrawersIfMobile()
    expect(d.right.value).toBe(true)
  })
})
