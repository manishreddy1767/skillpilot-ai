import Anthropic from '@anthropic-ai/sdk'
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

const MAX_OUTPUT_TOKENS = 32000
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
/** Haiku has no server-side fallback. */
const hasFallback = (model: string): boolean => !model.startsWith('claude-haiku')

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new AiError('The AI gave a reply that could not be read. Please try again.')
  }
}

function explainClaudeError(error: unknown): AiError {
  if (error instanceof AiError) return error
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiError('Anthropic rejected the API key. Check it in Settings.')
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiError('This API key does not have access to that model. Try another in Settings.')
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new AiError('That model is not available. Choose another in Settings.')
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError('Too many requests right now. Please wait a moment and try again.')
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AiError(`Anthropic could not process that request: ${error.message}`)
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError('Could not reach Anthropic. Check your internet connection.')
  }
  if (error instanceof Anthropic.APIError) {
    return new AiError(`Anthropic reported a problem (${error.status ?? 'unknown'}). Please try again.`)
  }
  return new AiError('The AI request failed. Please try again.')
}

export function createClaudeProvider(apiKey: string, model: string): AiProvider {
  // An explicit key, so a key or token in the environment is never used by accident.
  const client = new Anthropic({ apiKey, authToken: null })

  return {
    name: 'claude',
    model,
    complete: async ({ system, messages, schema, effort }) => {
      try {
        const stream = client.beta.messages.stream({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system,
          messages,
          output_config: { effort, format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
          ...(hasFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {})
        })
        const message = await stream.finalMessage()

        if (message.stop_reason === 'refusal') {
          throw new AiError('The AI declined this request. Try rephrasing it.')
        }
        if (message.stop_reason === 'max_tokens') {
          throw new AiError('The reply was too long and was cut off. Try asking for less.')
        }
        const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
        return {
          json: parseJson(text),
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens
        }
      } catch (error) {
        throw explainClaudeError(error)
      }
    }
  }
}

export function createOllamaProvider(address: string, model: string): AiProvider {
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
          body: JSON.stringify({
            model,
            stream: false,
            format: schema,
            messages: [{ role: 'system', content: system }, ...messages]
          })
        })
      } catch {
        throw new AiError('Could not reach Ollama. Check that it is running on this laptop.')
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
