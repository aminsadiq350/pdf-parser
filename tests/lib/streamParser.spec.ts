import { describe, it, expect } from 'vitest'
import { extractDelta } from '@/lib/llm/streamParser'

describe('extractDelta (openrouter)', () => {
	it('returns choices[0].delta.content', () => {
		const json = { choices: [{ delta: { content: 'hi' } }] }
		expect(extractDelta(json, 'openrouter')).toBe('hi')
	})

	it('returns empty string when delta missing', () => {
		expect(extractDelta({ choices: [{}] }, 'openrouter')).toBe('')
		expect(extractDelta({}, 'openrouter')).toBe('')
	})
})

describe('extractDelta (gemini)', () => {
	it('returns candidates[0].content.parts[0].text', () => {
		const json = { candidates: [{ content: { parts: [{ text: 'yo' }] } }] }
		expect(extractDelta(json, 'gemini')).toBe('yo')
	})

	it('returns empty string when shape is missing', () => {
		expect(extractDelta({ candidates: [{}] }, 'gemini')).toBe('')
		expect(extractDelta({}, 'gemini')).toBe('')
	})
})
