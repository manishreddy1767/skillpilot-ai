import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiStore } from './ai/ai-store'
import { CareerStore } from './db/career-store'
import { migrate } from './db/migrations'
import { checkNotifications } from './notifier'

const open: DatabaseSync[] = []

function setup() {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, () => undefined)
  return { db, store: new CareerStore(db), aiStore: new AiStore(db), send: vi.fn() }
}

afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
})

const at = { today: '2026-11-06', time: '12:00', recommendation: null }

describe('checkNotifications', () => {
  it('sends what is due, once', () => {
    const s = setup()
    s.store.saveRecord('task', null, { title: 'Apply', kind: 'other', dueDate: '2026-11-07', minutes: '30', status: 'open' })
    expect(checkNotifications({ ...s, ...at })).toBe(1)
    expect(s.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ body: 'Apply is due tomorrow.' }))
    expect(checkNotifications({ ...s, ...at })).toBe(0)
    expect(s.send).toHaveBeenCalledOnce()
  })

  it('counts towards the daily limit, across checks', () => {
    const s = setup()
    s.aiStore.saveSettings({ notifyDailyLimit: '1' })
    expect(checkNotifications({ ...s, ...at, recommendation: 'First' })).toBe(1)
    expect(checkNotifications({ ...s, ...at, recommendation: 'Second' })).toBe(0)
    expect(checkNotifications({ ...s, ...at, today: '2026-11-07', recommendation: 'Second' })).toBe(1)
  })

  it('reports only skills with no sign of them as gaps', () => {
    const s = setup()
    const role = s.store.saveRecord('targetRole', null, { title: 'Dev', notes: '' })!
    s.store.saveRecord('roleRequirement', null, { skillName: 'CSS', requiredLevel: '3', importance: '3' }, role.id)
    s.store.saveRecord('roleRequirement', null, { skillName: 'HTML', requiredLevel: '3', importance: '3' }, role.id)
    s.store.saveRecord('skill', null, { name: 'CSS', category: 'technical', claimedLevel: '2', status: 'using', notes: '' })
    checkNotifications({ ...s, ...at })
    expect(s.send.mock.calls[0]?.[0].body).toContain('HTML')
  })

  it('sends the weekly summary on a Monday, from tasks finished the week before', () => {
    const { db, ...s } = setup()
    s.store.saveRecord('task', null, { title: 'Read', kind: 'learning', dueDate: '', minutes: '40', status: 'done' })
    // The trigger stamps the real date, so the task is moved into the week before 9 November.
    db.exec("UPDATE task SET completed_on = '2026-11-04'")
    checkNotifications({ ...s, today: '2026-11-09', time: '10:00', recommendation: null })
    expect(s.send).toHaveBeenCalledWith({
      key: 'summary:2026-11-09',
      title: 'Your week in review',
      body: 'Last week you finished 1 task and learned for 40 minutes.'
    })
  })

  it('respects saved settings', () => {
    const s = setup()
    s.aiStore.saveSettings({ notifyNextStep: 'off' })
    expect(checkNotifications({ ...s, ...at, recommendation: 'Next' })).toBe(0)
  })
})
