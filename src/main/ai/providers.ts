import { isLocalAddress } from '../../shared/settings'
import type { JsonSchema } from './json-schema'

export interface AiRequest {
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  schema: JsonSchema
  effort: 'low' | 'medium' | 'high'
}

export interface AiResponse {
  json: unknown
  inputTokens: number
  outputTokens: number
}

export interface AiProvider {
  name: string
  model: string
  complete(request: AiRequest): Promise<AiResponse>
}

/** A failure with a message written for the user. */
export class AiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiError'
  }
}

/** Small local models can take a while on a laptop, especially the first request after loading. */
export const LOCAL_TIMEOUT_MS = 5 * 60_000

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new AiError('The local AI gave a reply that could not be read. Please try again.')
  }
}

/**
 * The only AI SkillPilot uses: a model running in Ollama on this laptop. The address must be local,
 * so nothing about you ever leaves the computer.
 */
export function createOllamaProvider(address: string, model: string, timeoutMs = LOCAL_TIMEOUT_MS): AiProvider {
  return {
    name: 'ollama',
    model,
    complete: async ({ system, messages, schema }) => {
      if (!isLocalAddress(address)) {
        throw new AiError('The Ollama address must be on this laptop, such as http://localhost:11434.')
      }
      let response: Response
      try {
        response = await fetch(new URL('/api/chat', address), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            model,
            stream: false,
            // Structured replies, and no separate "thinking" pass, which small models take minutes over.
            format: schema,
            think: false,
            options: { temperature: 0.3, num_ctx: 8192 },
            messages: [{ role: 'system', content: system }, ...messages]
          })
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
          throw new AiError('The local AI took too long to answer. Try a smaller model in Settings, or try again.')
        }
        throw new AiError('Could not reach Ollama. Check that it is running on this laptop.')
      }
      if (response.status === 404) {
        throw new AiError(`The model "${model}" is not installed in Ollama. Choose an installed one in Settings.`)
      }
      if (!response.ok) {
        throw new AiError(`Ollama reported a problem (${response.status}). Check the model name in Settings.`)
      }
      const body = (await response.json()) as {
        message?: { content?: string }
        prompt_eval_count?: number
        eval_count?: number
      }
      return {
        json: parseJson(body.message?.content ?? ''),
        inputTokens: body.prompt_eval_count ?? 0,
        outputTokens: body.eval_count ?? 0
      }
    }
  }
}

/** The models installed in Ollama, or null when Ollama is not running. */
export async function listLocalModels(address: string): Promise<string[] | null> {
  if (!isLocalAddress(address)) return null
  try {
    const response = await fetch(new URL('/api/tags', address), { signal: AbortSignal.timeout(3_000) })
    if (!response.ok) return null
    const body = (await response.json()) as { models?: { name?: unknown }[] }
    return (body.models ?? []).flatMap((model) => (typeof model.name === 'string' ? [model.name] : [])).sort()
  } catch {
    return null
  }
}
