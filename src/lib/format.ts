import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ breaks: true, gfm: true })

/** Wrap every <table> in a horizontally-scrollable container so wide tables
 *  scroll inside the chat bubble instead of overflowing the panel. */
function wrapTables(html: string): string {
	return html.replace(
		/<table(\s[^>]*)?>([\s\S]*?)<\/table>/g,
		(_m, attrs = '', inner) => `<div class="md-table-scroll"><table${attrs}>${inner}</table></div>`,
	)
}

export function formatMessage(text: string | null | undefined): string {
	if (!text) return ''
	const html = marked.parse(text, { async: false }) as string
	const wrapped = wrapTables(html)
	return DOMPurify.sanitize(wrapped)
}
