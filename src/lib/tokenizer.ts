// Dynamic-import the BPE table (it's ~1MB raw) so it doesn't ship in the
// initial chunk. First call adds ~50ms to the next chat send; subsequent
// calls are instant.
type EncodeFn = (text: string) => number[]
let cached: EncodeFn | null = null

async function getEncode(): Promise<EncodeFn> {
	if (!cached) {
		const mod = await import('gpt-tokenizer/encoding/cl100k_base')
		cached = mod.encode
	}
	return cached
}

/** Returns the cl100k_base token count of the given text. */
export async function estimateTokens(text: string): Promise<number> {
	if (!text) return 0
	const encode = await getEncode()
	return encode(text).length
}
