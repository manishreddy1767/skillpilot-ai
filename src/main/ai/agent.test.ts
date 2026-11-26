import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CareerStore } from '../db/career-store'
import { migrate } from '../db/migrations'
import { AGENT_MAX_STEPS, AiService } from './ai-service'
import { AiStore } from './ai-store'
import type { AiProvider } from './providers'

const open: DatabaseSync[] = []
afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
})

/** A stand-in model that gives these replies in turn, then keeps repeating the last. */
function scripted(replies: object[]) {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, () => undefined)
  const store = new CareerStore(db)
  const aiStore = new AiStore(db)
  let call = 0
  const complete = vi.fn(async () => ({ json: replies[Math.min(call++, replies.length - 1)], inputTokens: 1, outputTokens: 1 }))
  const provider: AiProvider = { name: 'ollama', model: 'qwen3:4b', complete }
  const agent = new AiService({ store, aiStore, provider: async () => provider, today: () => '2026-11-26' })
  return { store, aiStore, agent, complete }
}

const step = (action: string, input = '', answer = '') => ({ thought: 'thinking', action, input, answer })

describe('the agent', () => {
  it('reads, suggests, and finishes with an answer, changing nothing itself', async () => {
    const { store, aiStore, agent, complete } = scripted([
      step('list_jobs'),
      step('suggest_skill', 'Power BI'),
      step('suggest_task', 'Build a Power BI dashboard | 60 | 2026-11-27'),
      step('finish', '', 'Power BI is the gap for your Data Analyst job, so I suggested learning it and a first dashboard.')
    ])
    store.saveRecord('job', null, { title: 'Data Analyst', description: 'Must have SQL and Power BI' })

    const run = await agent.runAgent('Get me ready for the Data Analyst job')

    expect(run.answer).toContain('Power BI is the gap')
    expect(run.steps.map((s) => s.action)).toEqual(['list_jobs', 'suggest_skill', 'suggest_task'])
    expect(run.steps[0]!.result).toContain('missing Power BI, SQL')
    expect(run.suggested).toBe(2)
    expect(aiStore.listProposals().map((p) => p.summary)).toEqual(['Add skill: Power BI', 'Add task: Build a Power BI dashboard'])
    expect(store.listRecords('skill')).toEqual([])
    expect(run.chat.map((m) => m.content)).toEqual(['Get me ready for the Data Analyst job', run.answer])
    expect(complete).toHaveBeenCalledTimes(4)
  })

  it('shows the model each result before its next step', async () => {
    const { agent, complete } = scripted([step('list_skills'), step('finish', '', 'Done.')])
    await agent.runAgent('What can I do?')
    const second = (complete.mock.calls[1] as unknown as [{ messages: { role: string; content: string }[] }])[0].messages
    expect(second.at(-1)).toEqual({ role: 'user', content: 'Result of list_skills: No skills yet.' })
    expect(second[0]!.content).toContain('suggest_task')
  })

  it(`stops after ${AGENT_MAX_STEPS} steps, so a confused model cannot loop forever`, async () => {
    const { agent, complete } = scripted(
      ['Data Analyst', 'Frontend Developer', 'DevOps Engineer', 'QA Engineer', 'Cloud Engineer', 'SDET', 'iOS Developer'].map((role) =>
        step('role_gap', role)
      )
    )
    const run = await agent.runAgent('Loop please')
    expect(complete).toHaveBeenCalledTimes(AGENT_MAX_STEPS)
    expect(run.steps).toHaveLength(AGENT_MAX_STEPS)
    expect(run.answer).toBe('I looked into it but had nothing useful to suggest.')
  })

  it('does not run a repeated step again, and stops if the model keeps repeating', async () => {
    const { agent, complete } = scripted([step('list_jobs'), step('list_jobs'), step('list_jobs'), step('list_skills')])
    const run = await agent.runAgent('Help')
    expect(run.steps.map((s) => s.action)).toEqual(['list_jobs'])
    expect(complete).toHaveBeenCalledTimes(3)
    const nudge = (complete.mock.calls[2] as unknown as [{ messages: { content: string }[] }])[0].messages.at(-1)!.content
    expect(nudge).toBe('You already did list_jobs with that input, and its result is above. Use a different tool, or finish.')
  })

  it('moves on when nudged after one repeat', async () => {
    const { agent } = scripted([step('list_jobs'), step('list_jobs'), step('list_skills'), step('finish', '', 'Done.')])
    const run = await agent.runAgent('Help')
    expect(run.steps.map((s) => s.action)).toEqual(['list_jobs', 'list_skills'])
    expect(run.answer).toBe('Done.')
  })

  it('writes an answer when the model gives none', async () => {
    const { agent } = scripted([step('suggest_goal', 'Get a job'), step('finish')])
    expect((await agent.runAgent('Help')).answer).toBe('I looked into it and made 1 suggestion for you to review.')
  })
})
