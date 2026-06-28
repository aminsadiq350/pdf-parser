import { describe, it, expect } from 'vitest'

describe('smoke', () => {
	it('arithmetic still works', () => {
		expect(2 + 2).toBe(4)
	})

	it('jsdom DOM is available', () => {
		document.body.innerHTML = '<p>hi</p>'
		expect(document.querySelector('p')?.textContent).toBe('hi')
	})

	it('localStorage shim works', () => {
		localStorage.setItem('k', 'v')
		expect(localStorage.getItem('k')).toBe('v')
	})
})
