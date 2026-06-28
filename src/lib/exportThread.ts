import type { Thread, Message, Document } from '@/types/domain'
import { renderCitationsText } from './citations'

export function slugify(s: string): string {
	return (
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40) || 'thread'
	)
}

export function buildThreadMarkdown(
	thread: Thread,
	messages: readonly Message[],
	docs: readonly Document[],
): string {
	const primary = docs.find((d) => d.id === thread.docIds[0])
	const title = thread.name || primary?.name || 'Untitled chat'
	const docNames = thread.docIds.length
		? thread.docIds.map((id) => docs.find((d) => d.id === id)?.name ?? '(removed)').join(', ')
		: '(none)'
	const lines: string[] = [
		`# ${title}`,
		'',
		`**Documents:** ${docNames}`,
		`**Exported:** ${new Date().toISOString()}`,
		'',
		'---',
		'',
	]
	for (const m of messages) {
		lines.push(m.role === 'user' ? '## You' : '## Notebook')
		lines.push('')
		const body =
			m.role === 'assistant' ? renderCitationsText(m.text, m.citations, docs) : m.text
		lines.push(body)
		lines.push('')
	}
	return lines.join('\n')
}

export function downloadMarkdown(filename: string, content: string): void {
	const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	a.remove()
	setTimeout(() => URL.revokeObjectURL(url), 0)
}
