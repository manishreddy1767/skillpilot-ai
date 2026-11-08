import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

export const BACKUPS_KEPT = 7
const DAILY_BACKUP = /^skillpilot-\d{4}-\d{2}-\d{2}\.db$/

export function localDate(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, '0')
  const day = String(when.getDate()).padStart(2, '0')
  return `${when.getFullYear()}-${month}-${day}`
}

/** Writes a consistent copy of the live database, appearing only once complete. */
function snapshot(db: DatabaseSync, target: string): void {
  const temporary = `${target}.tmp`
  rmSync(temporary, { force: true })
  db.prepare('VACUUM INTO ?').run(temporary)
  renameSync(temporary, target)
}

function pruneDailyBackups(folder: string): void {
  const backups = readdirSync(folder)
    .filter((name) => DAILY_BACKUP.test(name))
    .sort()
    .reverse()
  for (const name of backups.slice(BACKUPS_KEPT)) rmSync(join(folder, name))
}

/** Makes today's backup if there is not one yet. Returns whether it made one. */
export function dailyBackup(db: DatabaseSync, folder: string, now = new Date()): boolean {
  mkdirSync(folder, { recursive: true })
  const target = join(folder, `skillpilot-${localDate(now)}.db`)
  if (existsSync(target)) return false
  snapshot(db, target)
  pruneDailyBackups(folder)
  return true
}

/** A named copy taken before a change that replaces data. */
export function namedBackup(db: DatabaseSync, folder: string, prefix: string, now = new Date()): string {
  mkdirSync(folder, { recursive: true })
  const target = join(folder, `${prefix}-${now.getTime()}.db`)
  snapshot(db, target)
  return target
}

export function preMigrationBackup(
  db: DatabaseSync,
  folder: string,
  fromVersion: number,
  now = new Date()
): string {
  mkdirSync(folder, { recursive: true })
  const target = join(folder, `pre-migration-v${fromVersion}-${now.getTime()}.db`)
  snapshot(db, target)
  return target
}
