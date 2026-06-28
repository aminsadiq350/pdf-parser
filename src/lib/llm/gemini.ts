export function geminiUrl(model: string, apiKey: string): string {
	return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
		model,
	)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`
}

export function geminiHeaders(): HeadersInit {
	return { 'Content-Type': 'application/json' }
}
