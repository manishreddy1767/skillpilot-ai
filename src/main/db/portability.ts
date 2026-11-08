import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { namedBackup } from './backup'
import { databaseVersion } from './migrations'

/** Every table of user data, parents before children. */
export const EXPORT_TABLES = [
  'profile',
  'education',
  'work_experience',
  'certification',
  'skill',
  'skill_level_history',
  'evidence',
  'project',
  'project_skill',
  'goal',
  'goal_skill',
  'goal_project',
  'milestone',
  'setting',
  'target_role',
  'role_requirement',
  'gap_report',
  'roadmap',
  'roadmap_item',
  'chat_message',
  'proposed_change',
  'ai_request',
  'task',
  'notification_log',
  'progress_snapshot'
] as const

/** Tables whose triggers stamp today's date on insert, so the original date is put back afterwards. */
const STAMPED_TABLES = new Set(['goal', 'milestone', 'task'])
const MAX_ROWS = 200_000

type Value = string | number | null
type Row = Record<string, Value>

export interface ExportFile {
  app: 'SkillPilot AI'
  schemaVersion: number
  exportedAt: string
  tables: Partial<Record<(typeof EXPORT_TABLES)[number], Row[]>>
}

export interface BackupInfo {
  name: string
  kind: 'daily' | 'before upgrade' | 'before change'
  savedAt: string
  sizeKb: number
}

type Check = { ok: true; file: ExportFile } | { ok: false; message: string }

function readTables(db: DatabaseSync): ExportFile['tables'] {
  const tables: ExportFile['tables'] = {}
  for (const table of EXPORT_TABLES) tables[table] = db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() as Row[]
  return tables
}

const isValue = (value: unknown): value is Value =>
  value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))

/** Files come from outside the app, so everything is checked before anything is replaced. */
export function parseExport(value: unknown, schemaVersion: number): Check {
  const file = value as Partial<ExportFile> | null
  if (typeof file !== 'object' || file === null || file.app !== 'SkillPilot AI') {
    return { ok: false, message: 'That is not a SkillPilot AI export file.' }
  }
  if (file.schemaVersion !== schemaVersion) {
    return {
      ok: false,
      message: `That file is from a different version of the app (data version ${String(file.schemaVersion)}, this app uses ${schemaVersion}).`
    }
  }
  if (typeof file.tables !== 'object' || file.tables === null) return { ok: false, message: 'That file has no data in it.' }

  let rows = 0
  for (const [table, list] of Object.entries(file.tables)) {
    if (!(EXPORT_TABLES as readonly string[]).includes(table)) return { ok: false, message: `That file has an unknown table: ${table}.` }
    if (!Array.isArray(list)) return { ok: false, message: 'That file is damaged.' }
    rows += list.length
    for (const row of list as unknown[]) {
      if (typeof row !== 'object' || row === null || Array.isArray(row) || !Object.values(row).every(isValue)) {
        return { ok: false, message: 'That file is damaged.' }
      }
    }
  }
  if (rows > MAX_ROWS) return { ok: false, message: 'That file is too large to import.' }
  return { ok: true, file: file as ExportFile }
}

function columnsOf(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name)
}

/** Replaces all data in one transaction, so it either fully succeeds or changes nothing. */
function replaceAll(db: DatabaseSync, tables: ExportFile['tables']): void {
  db.exec('BEGIN')
  try {
    for (const table of [...EXPORT_TABLES].reverse()) db.exec(`DELETE FROM ${table}`)

    for (const table of EXPORT_TABLES) {
      // Adding skills writes history rows, which the file's own history replaces.
      if (table === 'skill_level_history') db.exec('DELETE FROM skill_level_history')
      const known = columnsOf(db, table)
      for (const row of tables[table] ?? []) {
        // Table and column names come only from the database itself.
        const columns = known.filter((column) => column in row)
        if (columns.length === 0) continue
        const values = columns.map((column) => row[column] ?? null)
        db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...values)
        if (STAMPED_TABLES.has(table) && 'completed_on' in row && 'id' in row) {
          db.prepare(`UPDATE ${table} SET completed_on = ? WHERE id = ?`).run(row['completed_on'] ?? '', row['id'] ?? null)
        }
      }
    }

    db.exec('INSERT OR IGNORE INTO profile (id) VALUES (1)')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function backupKind(name: string): BackupInfo['kind'] | null {
  if (/^skillpilot-\d{4}-\d{2}-\d{2}\.db$/.test(name)) return 'daily'
  if (/^pre-migration-v\d+-\d+\.db$/.test(name)) return 'before upgrade'
  if (/^before-change-\d+\.db$/.test(name)) return 'before change'
  return null
}

/** Export, import, restore, and erase, each with a backup taken first where data is replaced. */
export class DataTransfer {
  constructor(
    private readonly db: DatabaseSync,
    private readonly backupFolder: string
  ) {}

  get schemaVersion(): number {
    return databaseVersion(this.db)
  }

  exportData(exportedAt: string): ExportFile {
    return { app: 'SkillPilot AI', schemaVersion: this.schemaVersion, exportedAt, tables: readTables(this.db) }
  }

  importData(file: ExportFile, now = new Date()): void {
    namedBackup(this.db, this.backupFolder, 'before-change', now)
    replaceAll(this.db, file.tables)
  }

  eraseAll(now = new Date()): void {
    namedBackup(this.db, this.backupFolder, 'before-change', now)
    replaceAll(this.db, {})
  }

  listBackups(): BackupInfo[] {
    if (!existsSync(this.backupFolder)) return []
    return readdirSync(this.backupFolder)
      .flatMap((name) => {
        const kind = backupKind(name)
        if (!kind) return []
        const stats = statSync(join(this.backupFolder, name))
        return [{ name, kind, savedAt: stats.mtime.toISOString(), sizeKb: Math.ceil(stats.size / 1024) }]
      })
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }

  /** Restores a backup by importing its contents. Only backups listed here can be named. */
  restoreBackup(name: string, now = new Date()): Check {
    if (!this.listBackups().some((backup) => backup.name === name)) return { ok: false, message: 'That backup no longer exists.' }
    const copy = new DatabaseSync(join(this.backupFolder, name), { readOnly: true })
    let file: ExportFile
    try {
      // Checked first: an older backup lacks newer tables, so reading it would fail less clearly.
      if (databaseVersion(copy) !== this.schemaVersion) {
        return { ok: false, message: 'That backup is from an older version of the app, so it cannot be restored here.' }
      }
      file = { app: 'SkillPilot AI', schemaVersion: databaseVersion(copy), exportedAt: '', tables: readTables(copy) }
    } catch {
      return { ok: false, message: 'That backup could not be read.' }
    } finally {
      copy.close()
    }
    const checked = parseExport(file, this.schemaVersion)
    if (!checked.ok) return checked
    this.importData(checked.file, now)
    return checked
  }
}
