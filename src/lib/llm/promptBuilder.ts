import type { ApiPayload, BuildPayloadInput } from './types'

export const NOTEBOOK_IDENTITY =
  'You are "Notebook", an AI assistant built into a PDF reader app. ' +
  'Never claim to be made by OpenAI, GPT, or any other model. You are Notebook.'

function buildSystemPrompt(contextSection: string): string {
  if (!contextSection) {
    return (
      `${NOTEBOOK_IDENTITY}\n\n` +
      'No PDF is currently loaded. Let the user know they can import a PDF to ask questions about it. ' +
      'You can still answer general questions. Use markdown formatting.'
    )
  }
  return (
    `${NOTEBOOK_IDENTITY}\n\n` +
    `${contextSection}\n\n` +
    'Use markdown formatting. If the answer is not in the attached documents, say so clearly.'
  )
}

export function buildPayload(input: BuildPayloadInput): ApiPayload {
  const systemPrompt = buildSystemPrompt(input.contextSection)

  if (input.provider === 'gemini') {
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      {
        role: 'model',
        parts: [{ text: 'Understood. I will answer questions based on the provided documents.' }],
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
