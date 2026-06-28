import type { Citation, Document } from '@/types/domain'

// Matches [A:p3], [A:page 3], [A:page 12–13] — captures alias and first page number.
const TOKEN_RE = /\[([A-Z]{1,2}):p(?:age\s+)?(\d+)[^\]]*\]/g

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

export function parseCitations(
	text: string,
	aliasToDocId: Map<string, number>,
): { text: string; citations: Citation[] } {
	const citations: Citation[] = []
	for (const m of text.matchAll(TOKEN_RE)) {
		const alias = m[1]
		const pageNumber = Number.parseInt(m[2], 10)
		const docId = aliasToDocId.get(alias)
		if (docId == null || Number.isNaN(pageNumber)) continue
		citations.push({ docId, pageNumber })
	}
	return { text, citations }
}

/**
 * Replace each [A:pN] token in text with a citation-chip <button>, using the
 * already-resolved citations array (matched by sequential token order).
 * Output is HTML-safe: doc names are escaped before insertion.
 */
export function renderCitationsHtml(
	text: string,
	citations: Citation[] | undefined,
	docs: readonly Document[],
): string {
	if (!citations || citations.length === 0) return text
	let idx = 0
	return text.replace(TOKEN_RE, (match) => {
		const cite = citations[idx]
		idx++
		if (!cite) return match // ran out of stored citations; leave token as-is
		const doc = docs.find((d) => d.id === cite.docId)
		const stale = !doc
		const docName = doc?.name ?? '(removed)'
		const escaped = escapeHtml(docName)
		const classAttr = stale ? 'citation-chip stale' : 'citation-chip'
		const titleAttr = stale ? ' disabled title="document removed"' : ` title="${escaped} · p.${cite.pageNumber}"`
		return (
			`<button class="${classAttr}" data-doc-id="${cite.docId}" ` +
			`data-page="${cite.pageNumber}"${titleAttr}>` +
			`<span class="citation-chip__name">${escaped}</span> · p.${cite.pageNumber}</button>`
		)
	})
}

/**
 * Like renderCitationsHtml but plain text. Used by the markdown exporter.
 * No escaping (caller is responsible for any wrapping format).
 */
export function renderCitationsText(
	text: string,
	citations: Citation[] | undefined,
	docs: readonly Document[],
): string {
	if (!citations || citations.length === 0) return text
	let idx = 0
	return text.replace(TOKEN_RE, (match) => {
		const cite = citations[idx]
		idx++
		if (!cite) return match
		const doc = docs.find((d) => d.id === cite.docId)
		const name = doc?.name ?? '(removed)'
		return `[${name} · p.${cite.pageNumber}]`
	})
}
