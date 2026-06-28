export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export function openRouterHeaders(apiKey: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}
