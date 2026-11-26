import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { CareerStore } from '../db/career-store'
import { migrate } from '../db/migrations'
import { AGENT_TOOLS, runAgentTool, type AgentContext } from './agent-tools'
import { AiStore } from './ai-store'

const open: DatabaseSync[] = []
afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
})

function setup(): AgentContext {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, () => undefined)
  return { store: new CareerStore(db), aiStore: new AiStore(db), today: '2026-11-26' }
}

describe('reading tools', () => {
  it('describe your skills, tasks, and jobs, or say there are none', () => {
    const ctx = setup()
    expect(runAgentTool('list_skills', '', ctx)).toBe('No skills yet.')
    expect(runAgentTool('list_tasks', '', ctx)).toBe('No open tasks.')
    expect(runAgentTool('list_jobs', '', ctx)).toBe('No saved jobs.')
    ctx.store.saveRecord('skill', null, { name: 'SQL', claimedLevel: '3', status: 'using' })
    ctx.store.saveRecord('task', null, { title: 'Read docs', minutes: '30', dueDate: '2026-11-27' })
    ctx.store.saveRecord('job', null, { title: 'Data Analyst', company: 'Globex', description: 'Must have SQL and Power BI' })
    expect(runAgentTool('list_skills', '', ctx)).toBe('SQL: claimed 3, proven 0')
    expect(runAgentTool('list_tasks', '', ctx)).toBe('Read docs (30 min, due 2026-11-27)')
    expect(runAgentTool('list_jobs', '', ctx)).toMatch(/^Data Analyst at Globex: \d+% match, missing Power BI$/)
  })

  it('matches a job by its title', () => {
    const ctx = setup()
    ctx.store.saveRecord('job', null, { title: 'Data Analyst', description: 'Must have SQL. 0-2 years.' })
    expect(runAgentTool('job_match', 'data analyst', ctx)).toContain('SQL: missing, essential')
    expect(runAgentTool('job_match', 'analyst', ctx)).toContain('Asks for 0-2 years')
    expect(runAgentTool('job_match', 'Chef', ctx)).toBe('No saved job called "Chef".')
  })

  it('reads a role gap from the skills library', () => {
    const ctx = setup()
    expect(runAgentTool('role_gap', 'Junior Data Analyst', ctx)).toMatch(/^Data Analyst: 0% ready. /)
    expect(runAgentTool('role_gap', 'Astronaut', ctx)).toContain('no role like')
  })
})

describe('suggesting tools', () => {
  it('only ever create suggestions to approve, never changes', () => {
    const ctx = setup()
    expect(runAgentTool('suggest_task', 'Practise SQL joins | 45 | 2026-11-28', ctx)).toContain('waits for approval')
    expect(runAgentTool('suggest_skill', 'Power BI', ctx)).toContain('waits for approval')
    expect(runAgentTool('suggest_goal', 'Land a data analyst job', ctx)).toContain('waits for approval')
    expect(ctx.aiStore.listProposals().map((p) => p.summary)).toEqual([
      'Add task: Practise SQL joins',
      'Add skill: Power BI',
      'Add goal: Land a data analyst job'
    ])
    expect(ctx.store.listRecords('task')).toEqual([])
    expect(ctx.store.listRecords('skill')).toEqual([])
  })

  it('keeps task suggestions sensible', () => {
    const ctx = setup()
    runAgentTool('suggest_task', 'Huge | 99999 | 2001-01-01', ctx)
    expect(ctx.aiStore.listProposals()[0]!.details).toEqual(
      expect.arrayContaining([{ label: 'Time', value: '480 minutes' }, { label: 'Due', value: '2026-11-26' }])
    )
    expect(runAgentTool('suggest_task', ' | 30', ctx)).toBe('A task needs a title.')
  })

  it('does not suggest a skill you already have', () => {
    const ctx = setup()
    ctx.store.saveRecord('skill', null, { name: 'SQL', claimedLevel: '2', status: 'using' })
    expect(runAgentTool('suggest_skill', 'sql', ctx)).toBe('sql is already in your skills.')
    expect(ctx.aiStore.listProposals()).toEqual([])
  })
})

it('describes every tool for the model', () => {
  expect(Object.keys(AGENT_TOOLS)).toContain('finish')
  for (const description of Object.values(AGENT_TOOLS)) expect(description.length).toBeGreaterThan(10)
})
