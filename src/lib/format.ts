import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ breaks: true, gfm: true })

export function formatMessage(text: string | null | undefined): string {
	if (!text) return ''
	const html = marked.parse(text, { async: false }) as string
	return DOMPurify.sanitize(html)
}
