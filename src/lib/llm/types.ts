import type { ChatMessage, Provider } from '@/types/domain'

export interface BuildPayloadInput {
  provider: Provider
  model: string
  history: ChatMessage[]
  pdfText: string // empty string = no doc
}

export interface OpenRouterPayload {
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  stream: true
}

export interface GeminiPayload {
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
}

export type ApiPayload = OpenRouterPayload | GeminiPayload
