import { describe, it, expect } from 'vitest'
import { summariseMessageText } from '@/lib/messageSummary'

describe('summariseMessageText', () => {
	it('returns empty for empty input', () => {
		expect(summariseMessageText('')).toBe('')
	})

	it('returns short plain text unchanged', () => {
		expect(summariseMessageText('Hello')).toBe('Hello')
	})

	it('strips backtick code spans', () => {
		expect(summariseMessageText('See `useFoo()` for details')).toBe(
			'See useFoo() for details',
		)
	})

	it('drops fenced code blocks', () => {
		expect(summariseMessageText('Before\n```js\nconsole.log(1)\n```\nAfter')).toBe(
			'Before After',
		)
	})

	it('strips bold + italic + heading + list markers', () => {
		expect(summariseMessageText('# Title\n- one\n- **two**\n- _three_')).toBe(
			'Title one two three',
		)
	})

	it('keeps link text but drops the URL', () => {
		expect(summariseMessageText('Read [the docs](https://example.com) please')).toBe(
			'Read the docs please',
		)
	})

	it('truncates at 80 chars with ellipsis', () => {
		const text = 'a '.repeat(80) // 160 chars
		const out = summariseMessageText(text)
		expect(out.endsWith('…')).toBe(true)
		expect(out.length).toBeLessThanOrEqual(81)
	})
})
