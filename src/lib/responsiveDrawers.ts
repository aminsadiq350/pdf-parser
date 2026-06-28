import { useDrawers } from '@/composables/useDrawers'
import { useResponsive } from '@/composables/useResponsive'

/**
 * Close any open drawer when on mobile widths. Components call this after
 * a select-style action so the user lands back on the viewer (which the
 * desktop layout shows alongside the sidebar/chat — on mobile the user
 * just dismissed an overlay).
 */
export function closeDrawersIfMobile(): void {
	const { isMobile } = useResponsive()
	if (!isMobile.value) return
	const drawers = useDrawers()
	drawers.closeAll()
}
