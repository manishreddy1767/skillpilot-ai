import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordFields, emptyValues, profileFields, type FieldValues } from '../../shared/career'
import { BACKUPS_KEPT, dailyBackup, preMigrationBackup } from './backup'
import { CareerStore } from './career-store'
import { NewerDatabaseError, databaseVersion, migrate, migrations } from './migrations'
import { openCareerData } from './open-career-data'

let folder: string
const open: DatabaseSync[] = []

function memoryDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  return db
}

function store(): CareerStore {
  const db = memoryDb()
  migrate(db, () => undefined)
  return new CareerStore(db)
}

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'skillpilot-db-'))
})

afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
  rmSync(folder, { recursive: true, force: true })
})

describe('migrate', () => {
  it('creates every table on a new database, without a backup', () => {
    const db = memoryDb()
    const backup = vi.fn()
    migrate(db, backup)
    expect(databaseVersion(db)).toBe(migrations.length)
    expect(backup).not.toHaveBeenCalled()
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['profile', 'education', 'work_experience', 'certification']))
  })

  it('every field has a matching column', () => {
    const db = memoryDb()
    migrate(db, () => undefined)
    const columns = (table: string) =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
    for (const f of profileFields) expect(columns('profile')).toContain(f.column)
    for (const f of recordFields.education) expect(columns('education')).toContain(f.column)
    for (const f of recordFields.work) expect(columns('work_experience')).toContain(f.column)
    for (const f of recordFields.certification) expect(columns('certification')).toContain(f.column)
  })

  it('does nothing when already up to date', () => {
    const db = memoryDb()
    migrate(db, () => undefined)
    const backup = vi.fn()
    migrate(db, backup)
    expect(backup).not.toHaveBeenCalled()
  })

  it('backs up an existing database, then applies only newer steps', () => {
    const db = memoryDb()
    const steps = ['CREATE TABLE a (x)', 'CREATE TABLE b (x)']
    migrate(db, () => undefined, steps.slice(0, 1))
    const backup = vi.fn()
    migrate(db, backup, steps)
    expect(backup).toHaveBeenCalledExactlyOnceWith(1)
    expect(databaseVersion(db)).toBe(2)
  })

  it('rolls a failed step back completely and keeps earlier steps', () => {
    const db = memoryDb()
    const steps = ['CREATE TABLE a (x)', 'CREATE TABLE b (x); INSERT INTO missing VALUES (1)']
    expect(() => migrate(db, () => undefined, steps)).toThrow()
    expect(databaseVersion(db)).toBe(1)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined()
  })

  it('refuses a database from a newer version of the app', () => {
    const db = memoryDb()
    db.exec(`PRAGMA user_version = ${migrations.length + 1}`)
    expect(() => migrate(db, () => undefined)).toThrow(NewerDatabaseError)
  })
})

describe('CareerStore profile', () => {
  it('starts empty', () => {
    expect(store().getProfile()).toEqual(emptyValues(profileFields))
  })

  it('saves and reads back every field', () => {
    const s = store()
    const values: FieldValues = Object.fromEntries(profileFields.map((f) => [f.key, `value of ${f.key}`]))
    expect(s.saveProfile(values)).toEqual(values)
  })

  it('keeps a single profile row', () => {
    const db = memoryDb()
    migrate(db, () => undefined)
    new CareerStore(db).saveProfile(emptyValues(profileFields))
    expect(db.prepare('SELECT count(*) AS n FROM profile').get()).toEqual({ n: 1 })
    expect(() => db.exec('INSERT INTO profile (id) VALUES (2)')).toThrow()
  })

  it('stores SQL and quotes as plain text', () => {
    const s = store()
    const fullName = `Robert'); DROP TABLE profile;--`
    expect(s.saveProfile({ ...emptyValues(profileFields), fullName })['fullName']).toBe(fullName)
    expect(s.getProfile()['fullName']).toBe(fullName)
  })

  it('builds the overview from the profile', () => {
    const s = store()
    s.saveProfile({ ...emptyValues(profileFields), fullName: 'A B', currentGoal: 'Ship', targetRoles: 'Dev' })
    expect(s.getOverview()).toEqual({ name: 'A B', currentGoal: 'Ship', targetRoles: 'Dev' })
  })
})

describe('CareerStore records', () => {
  const edu = (over: FieldValues = {}): FieldValues => ({
    ...emptyValues(recordFields.education),
    institution: 'Uni',
    qualification: 'BSc',
    ...over
  })

  it('adds and lists a record', () => {
    const s = store()
    const added = s.saveRecord('education', null, edu())!
    expect(added.id).toBeGreaterThan(0)
    expect(s.listRecords('education')).toEqual([added])
  })

  it('updates a record in place', () => {
    const s = store()
    const { id } = s.saveRecord('education', null, edu())!
    s.saveRecord('education', id, edu({ institution: 'New Uni' }))
    expect(s.listRecords('education')).toHaveLength(1)
    expect(s.listRecords('education')[0]?.values['institution']).toBe('New Uni')
  })

  it('reports an update to a record that no longer exists', () => {
    expect(store().saveRecord('education', 999, edu())).toBeNull()
  })

  it('deletes a record and reports whether it existed', () => {
    const s = store()
    const { id } = s.saveRecord('education', null, edu())!
    expect(s.deleteRecord('education', id)).toBe(true)
    expect(s.deleteRecord('education', id)).toBe(false)
    expect(s.listRecords('education')).toEqual([])
  })

  it('lists the most recent first', () => {
    const s = store()
    s.saveRecord('education', null, edu({ institution: 'Old', startDate: '2018-09' }))
    s.saveRecord('education', null, edu({ institution: 'New', startDate: '2023-09' }))
    expect(s.listRecords('education').map((r) => r.values['institution'])).toEqual(['New', 'Old'])
  })

  it('keeps each kind separate, with its own fields', () => {
    const s = store()
    const work = { ...emptyValues(recordFields.work), company: 'Co', role: 'Dev' }
    const cert = { ...emptyValues(recordFields.certification), name: 'Cert' }
    s.saveRecord('work', null, work)
    s.saveRecord('certification', null, cert)
    expect(s.listRecords('work')[0]?.values).toEqual(work)
    expect(s.listRecords('certification')[0]?.values).toEqual(cert)
    expect(s.listRecords('education')).toEqual([])
  })
})

describe('backups', () => {
  function fileDb(): DatabaseSync {
    const db = new DatabaseSync(join(folder, 'live.db'))
    open.push(db)
    migrate(db, () => undefined)
    new CareerStore(db).saveProfile({ ...emptyValues(profileFields), fullName: 'Backed Up' })
    return db
  }
  const backups = () => join(folder, 'backups')
  const day = (n: number) => new Date(2026, 10, n, 12)

  it('makes a working copy of the data', () => {
    const db = fileDb()
    expect(dailyBackup(db, backups(), day(6))).toBe(true)
    const copy = new DatabaseSync(join(backups(), 'skillpilot-2026-11-06.db'))
    open.push(copy)
    expect(new CareerStore(copy).getProfile()['fullName']).toBe('Backed Up')
  })

  it('makes one backup a day', () => {
    const db = fileDb()
    dailyBackup(db, backups(), day(6))
    expect(dailyBackup(db, backups(), day(6))).toBe(false)
    expect(readdirSync(backups())).toHaveLength(1)
  })

  it('keeps only the newest seven and leaves no temporary files', () => {
    const db = fileDb()
    for (let n = 1; n <= 10; n++) dailyBackup(db, backups(), day(n))
    const names = readdirSync(backups()).sort()
    expect(names).toHaveLength(BACKUPS_KEPT)
    expect(names[0]).toBe('skillpilot-2026-11-04.db')
    expect(names.at(-1)).toBe('skillpilot-2026-11-10.db')
  })

  it('never removes pre-migration backups or other files', () => {
    const db = fileDb()
    const kept = preMigrationBackup(db, backups(), 1, day(1))
    writeFileSync(join(backups(), 'notes.txt'), 'mine')
    for (let n = 1; n <= 10; n++) dailyBackup(db, backups(), day(n))
    expect(existsSync(kept)).toBe(true)
    expect(existsSync(join(backups(), 'notes.txt'))).toBe(true)
  })

  it('handles a path containing a quote', () => {
    const db = fileDb()
    expect(dailyBackup(db, join(folder, "it's backups"), day(6))).toBe(true)
  })
})

describe('openCareerData', () => {
  const options = () => ({ folder, logError: vi.fn(), alertError: vi.fn() })

  it('creates the database, today’s backup, and a working store', () => {
    const o = options()
    const data = openCareerData(o)
    expect(data.store?.getProfile()).toEqual(emptyValues(profileFields))
    expect(existsSync(join(folder, 'skillpilot.db'))).toBe(true)
    expect(readdirSync(join(folder, 'backups'))).toHaveLength(1)
    expect(o.alertError).not.toHaveBeenCalled()
    data.close()
  })

  it('keeps data between openings', () => {
    const first = openCareerData(options())
    first.store?.saveProfile({ ...emptyValues(profileFields), fullName: 'Kept' })
    first.close()
    const second = openCareerData(options())
    expect(second.store?.getProfile()['fullName']).toBe('Kept')
    second.close()
  })

  it('reports a damaged file, gives no store, and leaves the file untouched', () => {
    const path = join(folder, 'skillpilot.db')
    writeFileSync(path, 'this is not a database, and it is long enough to be read as one')
    const before = readFileSync(path)
    const o = options()
    const data = openCareerData(o)
    expect(data.store).toBeNull()
    expect(o.alertError).toHaveBeenCalledOnce()
    expect(o.logError).toHaveBeenCalledOnce()
    data.close()
    expect(readFileSync(path).equals(before)).toBe(true)
  })

  it('refuses a newer database without changing it', () => {
    const db = new DatabaseSync(join(folder, 'skillpilot.db'))
    db.exec(`PRAGMA user_version = ${migrations.length + 5}`)
    db.close()
    const o = options()
    expect(openCareerData(o).store).toBeNull()
    expect(o.alertError.mock.calls[0]?.[0]).toBeInstanceOf(NewerDatabaseError)
  })

  it('logs a failed backup but still opens', () => {
    writeFileSync(join(folder, 'backups'), 'a file where the folder should be')
    const o = options()
    const data = openCareerData(o)
    expect(data.store).not.toBeNull()
    expect(o.logError).toHaveBeenCalledOnce()
    expect(o.alertError).not.toHaveBeenCalled()
    data.close()
  })
})
