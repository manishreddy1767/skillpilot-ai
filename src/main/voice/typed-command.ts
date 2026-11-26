import type { Result } from '../../shared/career'
import type { VoiceOutcome } from '../../shared/ipc'
import { understand } from './understand'
import { respond, type AgentDeps } from './voice-agent'

const MAX_LENGTH = 4000

/**
 * A message typed into the Assistant. If it is a command, such as "open youtube" or "add task read the
 * guide tomorrow", it is carried out at once, exactly as if spoken: typing it is a clear request. Anything
 * else comes back marked to ask the AI.
 */
export async function runTypedCommand(input: unknown, deps: AgentDeps): Promise<Result<VoiceOutcome>> {
  const text = typeof input === 'string' ? input.trim() : ''
  if (!text) return { ok: false, message: 'Type a message first.' }
  if (text.length > MAX_LENGTH) return { ok: false, message: 'That message is too long.' }
  if (understand(text, await deps.apps(), deps.today()).intent.kind === 'ask') return { ok: true, value: { heard: text, reply: '', ask: text } }
  const outcome = await respond({ text, confidence: 1, source: 'command' }, { ...deps, actNow: () => true })
  return { ok: true, value: outcome }
}
