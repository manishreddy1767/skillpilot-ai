import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CareerStore } from './db/career-store'
import { migrate } from './db/migrations'
import { createDataHandlers } from './data-handlers'

const open: DatabaseSync[] = []

function setup() {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  migrate(db, () => undefined)
  const store = new CareerStore(db)
  const notifyOverview = vi.fn()
  const logError = vi.fn()
  return { db, store, notifyOverview, logError, h: createDataHandlers({ getStore: () => store, notifyOverview, logError }) }
}

afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
})

const education = { institution: 'Uni', qualification: 'BSc' }

describe('profile handlers', () => {
  it('saves valid input and tells the overview', () => {
    const { h, notifyOverview } = setup()
    const result = h.saveProfile({ fullName: ' Sam Doe ', currentGoal: 'Ship' })
    expect(result).toMatchObject({ ok: true, value: { fullName: 'Sam Doe', currentGoal: 'Ship' } })
    expect(notifyOverview).toHaveBeenCalledOnce()
  })

  it('rejects invalid input, field by field, and saves nothing', () => {
    const { h, notifyOverview } = setup()
    const result = h.saveProfile({ fullName: '', email: 'nope' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors ?? {}).sort()).toEqual(['email', 'fullName'])
    expect(notifyOverview).not.toHaveBeenCalled()
    expect(h.getProfile()).toMatchObject({ ok: true, value: { email: '' } })
  })

  it('reads the overview', () => {
    const { h } = setup()
    h.saveProfile({ fullName: 'Sam', currentGoal: 'Ship', targetRoles: 'Dev' })
    expect(h.getOverview()).toEqual({
      ok: true,
      value: { name: 'Sam', currentGoal: 'Ship', targetRoles: 'Dev' }
    })
  })
})

describe('record handlers', () => {
  it('adds, updates, lists and deletes', () => {
    const { h } = setup()
    const added = h.saveRecord('education', null, education)
    if (!added.ok) throw new Error('not saved')
    h.saveRecord('education', added.value.id, { ...education, institution: 'New' })
    expect(h.listRecords('education')).toMatchObject({
      ok: true,
      value: [{ id: added.value.id, values: { institution: 'New' } }]
    })
    expect(h.deleteRecord('education', added.value.id)).toEqual({ ok: true, value: true })
    expect(h.listRecords('education')).toEqual({ ok: true, value: [] })
  })

  it('rejects invalid fields', () => {
    const result = setup().h.saveRecord('education', null, { institution: 'Uni' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toHaveProperty('qualification')
  })

  it('says when an updated record no longer exists', () => {
    expect(setup().h.saveRecord('education', 99, education)).toMatchObject({
      ok: false,
      message: 'That record no longer exists.'
    })
  })

  it.each(['profile', 'sqlite_master', '', null, 1])('rejects the kind %s', (kind) => {
    const { h } = setup()
    expect(h.listRecords(kind).ok).toBe(false)
    expect(h.saveRecord(kind, null, education).ok).toBe(false)
    expect(h.deleteRecord(kind, 1).ok).toBe(false)
  })

  it.each(['1', 0, -1, 1.5, Number.NaN, {}, undefined])('rejects the id %s', (id) => {
    const { h } = setup()
    expect(h.saveRecord('education', id, education).ok).toBe(false)
    expect(h.deleteRecord('education', id).ok).toBe(false)
  })
})

describe('failures', () => {
  it('explains when the database is unavailable', () => {
    const h = createDataHandlers({
      getStore: () => null,
      notifyOverview: vi.fn(),
      logError: vi.fn()
    })
    for (const result of [h.getProfile(), h.getOverview(), h.listRecords('work')]) {
      expect(result).toMatchObject({ ok: false, message: expect.stringContaining('could not be opened') })
    }
  })

  it('logs a database error and returns a plain message', () => {
    const { db, h, logError } = setup()
    db.close()
    const result = h.saveProfile({ fullName: 'Sam' })
    expect(result).toEqual({ ok: false, message: 'That could not be saved. Your earlier data is unchanged.' })
    expect(logError).toHaveBeenCalledOnce()
  })
})
