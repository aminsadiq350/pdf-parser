/** Group G: minimum non-whitespace chars on a page before we trust the
 *  extracted text and skip OCR. */
const MIN_TEXT_CHARS = 20

/**
 * Returns true when an extracted-text page looks empty enough that we should
 * try OCR on its rendered bitmap instead. Scanned-image PDFs typically yield
 * `''` or a handful of stray glyphs from page numbers / watermarks.
 */
export function needsOcr(text: string): boolean {
  if (!text) return true
  const nonWs = text.replace(/\s+/g, '').length
  return nonWs < MIN_TEXT_CHARS
}
