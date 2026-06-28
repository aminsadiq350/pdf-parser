/** Group E: derive a short, plain-text preview from a (possibly markdown) message body. */
const MAX_SNIPPET = 80

export function summariseMessageText(text: string): string {
  if (!text) return ''
  // Strip the most distracting markdown markers without trying to be a full
  // parser: backticks, asterisks, leading hashes, list dashes, links.
  const stripped = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
  const collapsed = stripped.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= MAX_SNIPPET) return collapsed
  return `${collapsed.slice(0, MAX_SNIPPET).trimEnd()}…`
}
