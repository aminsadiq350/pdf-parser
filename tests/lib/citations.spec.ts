import { describe, it, expect } from 'vitest'
import { parseCitations, renderCitationsHtml, renderCitationsText } from '@/lib/citations'
import type { Citation, Document } from '@/types/domain'

describe('parseCitations', () => {
  it('returns Citation[] in match order using alias map', () => {
    const aliasToDocId = new Map([
      ['A', 7],
      ['B', 12],
    ])
    const text = 'See [A:p3] and also [B:p1] and [A:p5].'
    const { citations } = parseCitations(text, aliasToDocId)
    expect(citations).toEqual([
      { docId: 7, pageNumber: 3 },
      { docId: 12, pageNumber: 1 },
      { docId: 7, pageNumber: 5 },
    ])
  })

  it('skips tokens with unknown aliases', () => {
    const { citations } = parseCitations('hi [Z:p1] there', new Map([['A', 1]]))
    expect(citations).toEqual([])
  })

  it('returns the unchanged text', () => {
    const text = 'See [A:p3].'
    const out = parseCitations(text, new Map([['A', 1]]))
    expect(out.text).toBe(text)
  })
})

describe('renderCitationsHtml', () => {
  const docs: Document[] = [
    { id: 7, name: 'physics.pdf', size: 1, numPages: 5, pages: [], addedAt: 0 },
    { id: 12, name: 'cooking.pdf', size: 1, numPages: 2, pages: [], addedAt: 0 },
  ]
  const citations: Citation[] = [
    { docId: 7, pageNumber: 3 },
    { docId: 12, pageNumber: 1 },
  ]

  it('replaces tokens with citation-chip buttons in match order', () => {
    const html = renderCitationsHtml('See [A:p3] and also [B:p1].', citations, docs)
    expect(html).toContain('<button class="citation-chip"')
    expect(html).toContain('data-doc-id="7"')
    expect(html).toContain('data-page="3"')
    expect(html).toContain('physics.pdf · p.3')
    expect(html).toContain('data-doc-id="12"')
    expect(html).toContain('cooking.pdf · p.1')
  })

  it('renders stale chip (greyed, disabled) when the doc was deleted', () => {
    const html = renderCitationsHtml('See [A:p3].', citations, [docs[1]])
    expect(html).toContain('class="citation-chip stale"')
    expect(html).toContain('disabled')
    expect(html).toContain('(removed)')
  })

  it('leaves tokens alone when citations array is shorter than tokens', () => {
    const html = renderCitationsHtml('A [A:p3] B [B:p1].', [citations[0]], docs)
    expect(html).toContain('citation-chip')
    expect(html).toContain('[B:p1]')
  })

  it('escapes the alias/doc-name to avoid HTML injection', () => {
    const evil: Document[] = [
      { id: 1, name: '<script>x</script>', size: 1, numPages: 1, pages: [], addedAt: 0 },
    ]
    const html = renderCitationsHtml('[A:p1]', [{ docId: 1, pageNumber: 1 }], evil)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('renderCitationsText', () => {
  const docs: Document[] = [
    { id: 7, name: 'physics.pdf', size: 1, numPages: 5, pages: [], addedAt: 0 },
  ]
  it('replaces tokens with readable text refs', () => {
    const t = renderCitationsText('see [A:p3]', [{ docId: 7, pageNumber: 3 }], docs)
    expect(t).toBe('see [physics.pdf · p.3]')
  })
  it('shows (removed) for stale citations', () => {
    const t = renderCitationsText('[A:p3]', [{ docId: 999, pageNumber: 3 }], docs)
    expect(t).toBe('[(removed) · p.3]')
  })
  it('leaves token untouched when citations run out', () => {
    const t = renderCitationsText('[A:p1] [B:p2]', [{ docId: 7, pageNumber: 1 }], docs)
    expect(t).toContain('[physics.pdf · p.1]')
    expect(t).toContain('[B:p2]')
  })
})
