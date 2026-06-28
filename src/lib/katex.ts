import renderMathInElement from 'katex/contrib/auto-render'

/** Render any KaTeX-style math expressions inside the given element. */
export function renderMath(el: HTMLElement): void {
  try {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    })
  } catch {
    // KaTeX failures are non-fatal; markdown still renders.
  }
}
