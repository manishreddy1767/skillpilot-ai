import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyValues, profileFields, recordFields } from '../../shared/career'
import { createPortabilityHandlers } from '../portability-handlers'
import { AiStore } from '../ai/ai-store'
import { dailyBackup } from './backup'
import { CareerStore } from './career-store'
import { migrate, migrations } from './migrations'
import { DataTransfer, EXPORT_TABLES, parseExport } from './portability'

let folder: string
const open: DatabaseSync[] = []
const version = migrations.length

function setup() {
  const db = new DatabaseSync(join(folder, `db-${open.length}.db`))
  open.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, () => undefined)
  const backups = join(folder, 'backups')
  return { db, store: new CareerStore(db), aiStore: new AiStore(db), transfer: new DataTransfer(db, backups), backups }
}

function fill(store: CareerStore, aiStore: AiStore): void {
  store.saveProfile({ ...emptyValues(profileFields), fullName: 'Sam', currentGoal: 'Ship' })
  const skill = store.saveRecord('skill', null, { ...emptyValues(recordFields.skill), name: 'React', claimedLevel: '2' })!
  store.saveRecord('skill', skill.id, { ...emptyValues(recordFields.skill), name: 'React', claimedLevel: '4' })
  store.saveRecord('evidence', null, { ...emptyValues(recordFields.evidence), description: 'App', strength: '3' }, skill.id)
  const goal = store.saveRecord('goal', null, { ...emptyValues(recordFields.goal), title: 'Get a job', status: 'done' })!
  store.saveRecord('goalMilestone', null, { ...emptyValues(recordFields.goalMilestone), title: 'CV', status: 'done' }, goal.id)
  store.setLink('goalSkill', goal.id, skill.id, true, 3)
  store.saveRecord('task', null, { ...emptyValues(recordFields.task), title: 'Read', status: 'done' })
  aiStore.saveSettings({ widgetSize: '96' })
  aiStore.addChatMessage('user', 'Hello')
}

/** Sets completion dates to the past, as they would be in real data. */
function backdate(db: DatabaseSync): void {
  for (const table of ['goal', 'milestone', 'task']) db.exec(`UPDATE ${table} SET completed_on = '2025-01-15' WHERE status = 'done'`)
}

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'skillpilot-port-'))
})

afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
  rmSync(folder, { recursive: true, force: true })
})

describe('export and import', () => {
  it('exports every table', () => {
    const { transfer } = setup()
    const file = transfer.exportData('2026-11-08T10:00:00Z')
    expect(file).toMatchObject({ app: 'SkillPilot AI', schemaVersion: version })
    expect(Object.keys(file.tables)).toEqual([...EXPORT_TABLES])
  })

  it('round-trips everything exactly, including dates and level history', () => {
    const source = setup()
    fill(source.store, source.aiStore)
    backdate(source.db)
    const file = JSON.parse(JSON.stringify(source.transfer.exportData('now')))

    const target = setup()
    target.store.saveRecord('skill', null, { ...emptyValues(recordFields.skill), name: 'Replaced' })
    target.transfer.importData(file)

    expect(target.transfer.exportData('now').tables).toEqual(file.tables)
    expect(target.store.listRecords('skill').map((s) => s.values['name'])).toEqual(['React'])
  })

  it('takes a backup before replacing data', () => {
    const { transfer, backups } = setup()
    transfer.importData(transfer.exportData('now'))
    expect(readdirSync(backups).some((name) => name.startsWith('before-change-'))).toBe(true)
  })

  it('changes nothing if the import fails part way', () => {
    const { transfer, store, aiStore } = setup()
    fill(store, aiStore)
    const before = transfer.exportData('now').tables
    const bad = { app: 'SkillPilot AI', schemaVersion: version, exportedAt: '', tables: { skill: [{ id: 1, name: null }] } } as never
    expect(() => transfer.importData(bad)).toThrow()
    expect(transfer.exportData('now').tables).toEqual(before)
  })

  it('erases everything, keeping a blank profile', () => {
    const { transfer, store, aiStore } = setup()
    fill(store, aiStore)
    transfer.eraseAll()
    const { tables } = transfer.exportData('now')
    expect(tables.profile).toHaveLength(1)
    expect(tables.profile?.[0]?.['full_name']).toBe('')
    for (const table of EXPORT_TABLES.filter((t) => t !== 'profile')) expect(tables[table]).toEqual([])
  })
})

describe('parseExport', () => {
  const good = { app: 'SkillPilot AI', schemaVersion: version, exportedAt: '', tables: { skill: [{ id: 1, name: 'x' }] } }

  it('accepts a valid file', () => {
    expect(parseExport(good, version).ok).toBe(true)
  })

  it.each([
    ['not an object', 'text', 'not a SkillPilot AI export'],
    ['another app', { ...good, app: 'Other' }, 'not a SkillPilot AI export'],
    ['another version', { ...good, schemaVersion: version + 1 }, 'different version'],
    ['no tables', { ...good, tables: null }, 'no data'],
    ['an unknown table', { ...good, tables: { sqlite_master: [] } }, 'unknown table'],
    ['rows that are not a list', { ...good, tables: { skill: {} } }, 'damaged'],
    ['a row that is a list', { ...good, tables: { skill: [[1]] } }, 'damaged'],
    ['nested values', { ...good, tables: { skill: [{ id: 1, name: { a: 1 } }] } }, 'damaged'],
    ['infinite numbers', { ...good, tables: { skill: [{ id: Infinity }] } }, 'damaged']
  ])('refuses %s', (_name, value, message) => {
    expect(parseExport(value, version)).toMatchObject({ ok: false, message: expect.stringContaining(message) })
  })

  it('ignores columns the database does not have', () => {
    const { transfer, store } = setup()
    transfer.importData({ ...good, tables: { skill: [{ id: 5, name: 'Go', injected: 'x' }] } } as never)
    expect(store.listRecords('skill')[0]?.values['name']).toBe('Go')
  })
})

describe('backups', () => {
  it('lists daily and safety backups, newest first, and nothing else', () => {
    const { db, transfer, backups } = setup()
    dailyBackup(db, backups, new Date(2026, 10, 7))
    transfer.eraseAll()
    writeFileSync(join(backups, 'notes.txt'), 'x')
    const list = transfer.listBackups()
    expect(list.map((b) => b.kind).sort()).toEqual(['before change', 'daily'])
    expect(list[0]?.sizeKb).toBeGreaterThan(0)
  })

  it('restores a backup', () => {
    const { db, transfer, store, aiStore, backups } = setup()
    fill(store, aiStore)
    dailyBackup(db, backups, new Date(2026, 10, 7))
    transfer.eraseAll()
    expect(store.listRecords('skill')).toEqual([])
    expect(transfer.restoreBackup('skillpilot-2026-11-07.db').ok).toBe(true)
    expect(store.listRecords('skill').map((s) => s.values['name'])).toEqual(['React'])
  })

  it.each(['../db-0.db', 'missing.db', 'C:/Windows/win.ini'])('refuses the name %s', (name) => {
    expect(setup().transfer.restoreBackup(name)).toMatchObject({ ok: false, message: expect.stringContaining('no longer exists') })
  })

  it('refuses a backup from an older version', () => {
    const { transfer, backups } = setup()
    mkdirSync(backups, { recursive: true })
    const old = new DatabaseSync(join(backups, 'pre-migration-v1-1.db'))
    migrate(old, () => undefined, migrations.slice(0, 1))
    old.close()
    expect(transfer.restoreBackup('pre-migration-v1-1.db')).toMatchObject({ ok: false, message: expect.stringContaining('older version') })
  })
})

it('a damaged backup is reported, not thrown', () => {
  const { transfer, backups } = setup()
  mkdirSync(backups, { recursive: true })
  writeFileSync(join(backups, 'skillpilot-2026-01-01.db'), 'not a database '.repeat(100))
  expect(transfer.restoreBackup('skillpilot-2026-01-01.db')).toMatchObject({ ok: false, message: expect.stringContaining('could not be read') })
})

describe('portability handlers', () => {
  function handlers(over: Partial<Parameters<typeof createPortabilityHandlers>[0]> = {}) {
    const s = setup()
    const deps = {
      getTransfer: () => s.transfer,
      chooseSavePath: vi.fn(async () => join(folder, 'export.json') as string | null),
      chooseOpenPath: vi.fn(async () => join(folder, 'export.json') as string | null),
      afterReplace: vi.fn(),
      removeKey: vi.fn(),
      logError: vi.fn(),
      today: () => '2026-11-08',
      ...over
    }
    return { ...s, deps, h: createPortabilityHandlers(deps) }
  }

  it('exports to the chosen file, and imports it back', async () => {
    const { h, deps, store, aiStore } = handlers()
    fill(store, aiStore)
    expect(await h.exportData()).toEqual({ ok: true, value: join(folder, 'export.json') })
    expect(deps.chooseSavePath).toHaveBeenCalledWith('SkillPilot AI export 2026-11-08.json')
    store.saveRecord('skill', null, { ...emptyValues(recordFields.skill), name: 'Extra' })
    expect((await h.importData()).ok).toBe(true)
    expect(store.listRecords('skill').map((s) => s.values['name'])).toEqual(['React'])
    expect(deps.afterReplace).toHaveBeenCalledOnce()
  })

  it('does nothing when the dialog is cancelled', async () => {
    const { h, deps } = handlers({ chooseSavePath: vi.fn(async () => null), chooseOpenPath: vi.fn(async () => null) })
    expect(await h.exportData()).toEqual({ ok: true, value: null })
    expect(await h.importData()).toEqual({ ok: true, value: null })
    expect(deps.afterReplace).not.toHaveBeenCalled()
  })

  it('refuses a damaged file and keeps the data', async () => {
    const { h, store, aiStore } = handlers()
    fill(store, aiStore)
    writeFileSync(join(folder, 'export.json'), '{ not json')
    expect(await h.importData()).toMatchObject({ ok: false, message: expect.stringContaining('could not be read') })
    expect(store.listRecords('skill')).toHaveLength(1)
  })

  it('refuses a file with rows the database rejects, and keeps the data', async () => {
    const { h, store, aiStore, deps } = handlers()
    fill(store, aiStore)
    writeFileSync(
      join(folder, 'export.json'),
      JSON.stringify({ app: 'SkillPilot AI', schemaVersion: version, exportedAt: '', tables: { skill: [{ id: 1 }] } })
    )
    expect(await h.importData()).toMatchObject({ ok: false, message: expect.stringContaining('nothing was changed') })
    expect(store.listRecords('skill')).toHaveLength(1)
    expect(deps.afterReplace).not.toHaveBeenCalled()
  })

  it('erases only with the exact confirmation, and removes the key', async () => {
    const { h, deps, store, aiStore } = handlers()
    fill(store, aiStore)
    expect((await h.eraseAll('erase')).ok).toBe(false)
    expect(store.listRecords('skill')).toHaveLength(1)
    expect(await h.eraseAll('ERASE')).toEqual({ ok: true, value: true })
    expect(store.listRecords('skill')).toEqual([])
    expect(deps.removeKey).toHaveBeenCalledOnce()
  })

  it('refuses a restore name that is not a string', async () => {
    expect((await handlers().h.restoreBackup(5)).ok).toBe(false)
  })

  it('explains when data is unavailable', async () => {
    const { h } = handlers({ getTransfer: () => null })
    expect(await h.exportData()).toMatchObject({ ok: false, message: expect.stringContaining('could not be opened') })
  })
})
