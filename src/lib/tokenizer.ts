import { encode } from 'gpt-tokenizer'

/** Returns the cl100k_base token count of the given text. */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return encode(text).length
}
