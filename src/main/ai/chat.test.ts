import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CareerStore } from '../db/career-store'
import { migrate } from '../db/migrations'
import { AiService, MAX_CHAT_PROPOSALS, isEcho } from './ai-service'
import { AiStore } from './ai-store'
import type { AiProvider } from './providers'

const open: DatabaseSync[] = []
afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
})

/** A stand-in model that gives these replies in turn. */
function scripted(replies: object[]) {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, () => undefined)
  const aiStore = new AiStore(db)
  let call = 0
  const complete = vi.fn(async () => ({ json: replies[Math.min(call++, replies.length - 1)], inputTokens: 1, outputTokens: 1 }))
  const provider: AiProvider = { name: 'ollama', model: 'qwen3:4b', complete }
  return { aiStore, complete, ai: new AiService({ store: new CareerStore(db), aiStore, provider: async () => provider, today: () => '2026-11-26' }) }
}

describe('isEcho', () => {
  it.each([
    ['What next?', 'What next?', true],
    ['  what NEXT ', 'What next?', true],
    ['', 'Hi', true],
    ['Learn CSS next.', 'What next?', false]
  ])('"%s" for "%s" is %s', (reply, message, echo) => {
    expect(isEcho(reply, message)).toBe(echo)
  })
})

describe('chat with a small local model', () => {
  it('labels your message so the model answers it rather than copying it', async () => {
    const { ai, complete } = scripted([{ reply: 'Learn CSS next.', proposals: [] }])
    await ai.chat('What next?')
    const sent = (complete.mock.calls[0] as unknown as [{ messages: { content: string }[] }])[0].messages.at(-1)!.content
    expect(sent).toMatch(/^My message:\n"What next\?"\n\nWrite your answer to my message in "reply"\. Do not repeat my message\./)
  })

  it('asks again once when the model only repeats the message', async () => {
    const { ai, complete } = scripted([
      { reply: 'What next?', proposals: [] },
      { reply: 'Learn CSS next.', proposals: [] }
    ])
    const chat = await ai.chat('What next?')
    expect(complete).toHaveBeenCalledTimes(2)
    expect(chat.at(-1)?.content).toBe('Learn CSS next.')
    const retry = (complete.mock.calls[1] as unknown as [{ messages: { content: string }[] }])[0].messages.at(-1)!.content
    expect(retry).toContain('Your last reply only repeated my message')
  })

  it('says so plainly when it still only repeats, and saves nothing', async () => {
    const { ai, aiStore } = scripted([{ reply: 'hi', proposals: [] }])
    await expect(ai.chat('hi')).rejects.toThrow('repeated your message instead of answering')
    expect(aiStore.listChat()).toEqual([])
  })

  it(`keeps at most ${MAX_CHAT_PROPOSALS} suggestions from one reply`, async () => {
    const proposals = ['Go', 'Rust', 'Docker', 'Kafka', 'Redis'].map((title) => ({ kind: 'addSkill', title, note: '', minutes: 0, level: 0 }))
    const { ai, aiStore } = scripted([{ reply: 'Learn these.', proposals }])
    await ai.chat('What should I learn?')
    expect(aiStore.listProposals()).toHaveLength(MAX_CHAT_PROPOSALS)
  })
})
