import type { DatabaseSync } from 'node:sqlite'
import {
  profileFields,
  recordFields,
  type FieldDef,
  type FieldValues,
  type OverviewData,
  type RecordKind,
  type StoredRecord
} from '../../shared/career'

// Table and column names come only from these constants. User values are always bound.
const tables: Record<RecordKind, { table: string; orderBy: string }> = {
  education: { table: 'education', orderBy: 'start_date DESC, id DESC' },
  work: { table: 'work_experience', orderBy: 'start_date DESC, id DESC' },
  certification: { table: 'certification', orderBy: 'issue_date DESC, id DESC' }
}

type Row = Record<string, unknown>

function toValues(fields: FieldDef[], row: Row): FieldValues {
  return Object.fromEntries(fields.map((field) => [field.key, String(row[field.column] ?? '')]))
}

function inOrder(fields: FieldDef[], values: FieldValues): string[] {
  return fields.map((field) => values[field.key] ?? '')
}

/** All reading and writing of career data. Input is validated before it gets here. */
export class CareerStore {
  constructor(private readonly db: DatabaseSync) {}

  getProfile(): FieldValues {
    const row = this.db.prepare('SELECT * FROM profile WHERE id = 1').get() as Row
    return toValues(profileFields, row)
  }

  saveProfile(values: FieldValues): FieldValues {
    const assignments = profileFields.map((field) => `${field.column} = ?`).join(', ')
    this.db
      .prepare(`UPDATE profile SET ${assignments}, updated_at = datetime('now') WHERE id = 1`)
      .run(...inOrder(profileFields, values))
    return this.getProfile()
  }

  listRecords(kind: RecordKind): StoredRecord[] {
    const { table, orderBy } = tables[kind]
    const rows = this.db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all() as Row[]
    return rows.map((row) => ({ id: Number(row['id']), values: toValues(recordFields[kind], row) }))
  }

  /** Adds a record, or updates one when given its id. Returns null if that id is gone. */
  saveRecord(kind: RecordKind, id: number | null, values: FieldValues): StoredRecord | null {
    const { table } = tables[kind]
    const fields = recordFields[kind]
    const params = inOrder(fields, values)

    if (id === null) {
      const columns = fields.map((field) => field.column).join(', ')
      const slots = fields.map(() => '?').join(', ')
      const result = this.db.prepare(`INSERT INTO ${table} (${columns}) VALUES (${slots})`).run(...params)
      return { id: Number(result.lastInsertRowid), values }
    }

    const assignments = fields.map((field) => `${field.column} = ?`).join(', ')
    const result = this.db.prepare(`UPDATE ${table} SET ${assignments} WHERE id = ?`).run(...params, id)
    return Number(result.changes) > 0 ? { id, values } : null
  }

  deleteRecord(kind: RecordKind, id: number): boolean {
    const result = this.db.prepare(`DELETE FROM ${tables[kind].table} WHERE id = ?`).run(id)
    return Number(result.changes) > 0
  }

  getOverview(): OverviewData {
    const { fullName, currentGoal, targetRoles } = this.getProfile()
    return { name: fullName ?? '', currentGoal: currentGoal ?? '', targetRoles: targetRoles ?? '' }
  }
}
