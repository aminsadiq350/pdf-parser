import type { Provider } from '@/types/domain'

export function extractDelta(json: unknown, provider: Provider): string {
	if (provider === 'gemini') {
		const j = json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
		return j.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
	}
	const j = json as { choices?: Array<{ delta?: { content?: string } }> }
	return j.choices?.[0]?.delta?.content ?? ''
}

export interface SseLine {
	raw: string
	data?: unknown
	done: boolean
}

/**
 * Stateful SSE line splitter. Pass in raw decoded text chunks; receive
 * fully-parsed data events. Holds the partial trailing line internally.
 */
export class SseReader {
	private buffer = ''

	feed(chunk: string): SseLine[] {
		this.buffer += chunk
		const lines = this.buffer.split('\n')
		this.buffer = lines.pop() ?? ''

		const out: SseLine[] = []
		for (const raw of lines) {
			const trimmed = raw.trim()
			if (!trimmed) continue
			if (trimmed === 'data: [DONE]') {
				out.push({ raw, done: true })
				continue
			}
			if (!trimmed.startsWith('data: ')) continue
			try {
				out.push({ raw, data: JSON.parse(trimmed.slice(6)), done: false })
			} catch {
				// malformed JSON chunk — ignore
			}
		}
		return out
	}
}
