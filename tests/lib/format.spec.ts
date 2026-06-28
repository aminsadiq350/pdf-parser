import { describe, it, expect } from 'vitest'
import { formatMessage } from '@/lib/format'

describe('formatMessage', () => {
	it('renders markdown to sanitized HTML', () => {
		const html = formatMessage('**bold** *em*')
		expect(html).toContain('<strong>bold</strong>')
		expect(html).toContain('<em>em</em>')
	})

	it('strips script tags via DOMPurify', () => {
		const html = formatMessage('hi <script>alert(1)</script>')
		expect(html).not.toContain('<script>')
		expect(html).toContain('hi')
	})

	it('handles empty / nullish input', () => {
		expect(formatMessage('')).toBe('')
		expect(formatMessage(null)).toBe('')
		expect(formatMessage(undefined)).toBe('')
	})
})
