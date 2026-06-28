import type { ApiPayload, BuildPayloadInput } from './types'

export const NOTEBOOK_IDENTITY =
  'You are "Notebook", an AI assistant built into a PDF reader app. ' +
  'Never claim to be made by OpenAI, GPT, or any other model. You are Notebook.'

const TRUNCATE_LIMIT = 80_000

function buildSystemPrompt(pdfText: string): string {
  if (!pdfText) {
    return `${NOTEBOOK_IDENTITY}\n\nNo PDF is currently loaded. Let the user know they can import a PDF to ask questions about it. You can still answer general questions. Use markdown formatting.`
  }
  const safeText =
    pdfText.length > TRUNCATE_LIMIT
      ? pdfText.slice(0, TRUNCATE_LIMIT) + '\n\n[...document truncated due to length...]'
      : pdfText
  return `${NOTEBOOK_IDENTITY}\n\nYou help users understand the PDF document they are reading. Here is the full document text:\n\n${safeText}\n\nAnswer questions based on this content. Use markdown formatting. If the answer is not in the document, say so clearly.`
}

export function buildPayload(input: BuildPayloadInput): ApiPayload {
  const systemPrompt = buildSystemPrompt(input.pdfText)

  if (input.provider === 'gemini') {
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      {
        role: 'model',
        parts: [{ text: 'Understood. I will answer questions based on the provided document.' }],
      },
    ]
    for (const m of input.history) {
      contents.push({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      })
    }
    return { contents }
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]
  for (const m of input.history) {
    messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })
  }
  return { model: input.model, messages, stream: true }
}
