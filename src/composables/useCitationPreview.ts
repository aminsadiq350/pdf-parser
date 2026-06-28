import { ref } from 'vue'

export interface PreviewState {
	visible: boolean
	x: number
	y: number
	docId: number | null
	pageNumber: number | null
}

const state = ref<PreviewState>({
	visible: false,
	x: 0,
	y: 0,
	docId: null,
	pageNumber: null,
})
let hideTimer: ReturnType<typeof setTimeout> | null = null

function show(x: number, y: number, docId: number, pageNumber: number) {
	if (hideTimer) {
		clearTimeout(hideTimer)
		hideTimer = null
	}
	state.value = { visible: true, x, y, docId, pageNumber }
}
function scheduleHide(delay = 200) {
	if (hideTimer) clearTimeout(hideTimer)
	hideTimer = setTimeout(() => {
		state.value = { ...state.value, visible: false }
		hideTimer = null
	}, delay)
}
function cancelHide() {
	if (hideTimer) {
		clearTimeout(hideTimer)
		hideTimer = null
	}
}

export function useCitationPreview() {
	return { state, show, scheduleHide, cancelHide }
}
