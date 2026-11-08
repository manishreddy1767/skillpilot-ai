import type { DatabaseSync } from 'node:sqlite'
import {
  childKinds,
  profileFields,
  recordFields,
  type FieldDef,
  type FieldValues,
  type Link,
  type LinkKind,
  type RecordKind,
  type StoredRecord
} from '../../shared/career'
import type { Snapshot } from '../../shared/history'
import type { LearningRows } from '../../shared/learning'
import type { CareerRows } from '../../shared/progress'

// Table and column names come only from these constants. User values are always bound.
const tables: Record<RecordKind, { table: string; orderBy: string; parent?: string }> = {
  education: { table: 'education', orderBy: 'start_date DESC, id DESC' },
  work: { table: 'work_experience', orderBy: 'start_date DESC, id DESC' },
  certification: { table: 'certification', orderBy: 'issue_date DESC, id DESC' },
  skill: { table: 'skill', orderBy: 'name' },
  goal: { table: 'goal', orderBy: "status = 'done', status = 'paused', priority DESC, id" },
  project: { table: 'project', orderBy: "status = 'complete', id DESC" },
  evidence: { table: 'evidence', orderBy: 'observed_on DESC, id DESC', parent: 'skill_id' },
  goalMilestone: { table: 'milestone', orderBy: "due_date = '', due_date, id", parent: 'goal_id' },
  projectMilestone: { table: 'milestone', orderBy: "due_date = '', due_date, id", parent: 'project_id' },
  targetRole: { table: 'target_role', orderBy: 'id' },
  roleRequirement: { table: 'role_requirement', orderBy: 'importance DESC, id', parent: 'role_id' },
  roadmap: { table: 'roadmap', orderBy: 'id DESC' },
  roadmapItem: { table: 'roadmap_item', orderBy: 'week, id', parent: 'roadmap_id' },
  task: { table: 'task', orderBy: "status = 'done', due_date = '', due_date, id" }
}

const links: Record<LinkKind, { table: string; parent: string; child: string; level?: string }> = {
  goalSkill: { table: 'goal_skill', parent: 'goal_id', child: 'skill_id', level: 'required_level' },
  goalProject: { table: 'goal_project', parent: 'goal_id', child: 'project_id' },
  projectSkill: { table: 'project_skill', parent: 'project_id', child: 'skill_id' },
  certificationSkill: { table: 'certification_skill', parent: 'certification_id', child: 'skill_id' },
  workSkill: { table: 'work_skill', parent: 'work_id', child: 'skill_id' }
}

type Row = Record<string, unknown>

function toValues(fields: FieldDef[], row: Row): FieldValues {
  return Object.fromEntries(fields.map((field) => [field.key, String(row[field.column] ?? '')]))
}

/** Missing values take the field's default, so a caller that leaves one out cannot break a constraint. */
function inOrder(fields: FieldDef[], values: FieldValues): string[] {
  return fields.map((field) => values[field.key] || (field.initial ?? ''))
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

  listRecords(kind: RecordKind, parentId: number | null = null): StoredRecord[] {
    const { table, orderBy, parent } = tables[kind]
    const where = parent ? `WHERE ${parent} = ?` : ''
    const params = parent ? [parentId] : []
    const rows = this.db.prepare(`SELECT * FROM ${table} ${where} ORDER BY ${orderBy}`).all(...params) as Row[]
    return rows.map((row) => ({ id: Number(row['id']), values: toValues(recordFields[kind], row) }))
  }

  /** Adds a record, or updates one when given its id. Returns null if that id is gone. */
  saveRecord(
    kind: RecordKind,
    id: number | null,
    values: FieldValues,
    parentId: number | null = null
  ): StoredRecord | null {
    const { table, parent } = tables[kind]
    const fields = recordFields[kind]
    const params = inOrder(fields, values)

    if (id === null) {
      const columns = [...fields.map((field) => field.column), ...(parent ? [parent] : [])]
      const slots = columns.map(() => '?').join(', ')
      const result = this.db
        .prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${slots})`)
        .run(...params, ...(parent ? [parentId] : []))
      return { id: Number(result.lastInsertRowid), values }
    }

    const assignments = fields.map((field) => `${field.column} = ?`).join(', ')
    const scope = parent ? `AND ${parent} = ?` : ''
    const result = this.db
      .prepare(`UPDATE ${table} SET ${assignments} WHERE id = ? ${scope}`)
      .run(...params, id, ...(parent ? [parentId] : []))
    return Number(result.changes) > 0 ? { id, values } : null
  }

  deleteRecord(kind: RecordKind, id: number, parentId: number | null = null): boolean {
    const { table, parent } = tables[kind]
    const scope = parent ? `AND ${parent} = ?` : ''
    const result = this.db
      .prepare(`DELETE FROM ${table} WHERE id = ? ${scope}`)
      .run(id, ...(parent ? [parentId] : []))
    return Number(result.changes) > 0
  }

  listLinks(kind: LinkKind, parentId: number): Link[] {
    const { table, parent, child, level } = links[kind]
    const rows = this.db
      .prepare(`SELECT ${child} AS id${level ? `, ${level} AS level` : ''} FROM ${table} WHERE ${parent} = ?`)
      .all(parentId) as Row[]
    return rows.map((row) => ({ id: Number(row['id']), level: level ? Number(row['level']) : null }))
  }

  /** Connects or disconnects two records. Linking again updates the required level. */
  setLink(kind: LinkKind, parentId: number, childId: number, linked: boolean, requiredLevel = 3): void {
    const { table, parent, child, level } = links[kind]
    if (!linked) {
      this.db.prepare(`DELETE FROM ${table} WHERE ${parent} = ? AND ${child} = ?`).run(parentId, childId)
    } else if (level) {
      this.db
        .prepare(
          `INSERT INTO ${table} (${parent}, ${child}, ${level}) VALUES (?, ?, ?)
           ON CONFLICT DO UPDATE SET ${level} = excluded.${level}`
        )
        .run(parentId, childId, requiredLevel)
    } else {
      this.db
        .prepare(`INSERT INTO ${table} (${parent}, ${child}) VALUES (?, ?) ON CONFLICT DO NOTHING`)
        .run(parentId, childId)
    }
  }

  /** Every row the scoring needs, read in one place. */
  readCareerRows(): CareerRows {
    const all = <T>(sql: string): T[] => this.db.prepare(sql).all() as T[]
    return {
      skills: all('SELECT id, name, category, status, claimed_level AS claimed FROM skill ORDER BY name'),
      evidence: all('SELECT skill_id AS skillId, strength FROM evidence'),
      history: all('SELECT skill_id AS skillId, level FROM skill_level_history ORDER BY id'),
      projects: all(
        `SELECT id, name, status, completed_on AS completedOn FROM project ORDER BY ${tables.project.orderBy}`
      ),
      projectSkills: all('SELECT project_id AS projectId, skill_id AS skillId FROM project_skill'),
      recordSkills: all(
        `SELECT skill_id AS skillId, 'certification' AS source FROM certification_skill
         UNION ALL SELECT skill_id AS skillId, 'work' AS source FROM work_skill`
      ),
      goals: all(
        `SELECT id, title, status, priority, target_date AS targetDate, completed_on AS completedOn
         FROM goal ORDER BY ${tables.goal.orderBy}`
      ),
      goalSkills: all('SELECT goal_id AS goalId, skill_id AS skillId, required_level AS level FROM goal_skill'),
      milestones: all(
        `SELECT goal_id AS goalId, project_id AS projectId, title, due_date AS dueDate, status,
         completed_on AS completedOn FROM milestone`
      ),
      dueTasks: all(
        "SELECT title, due_date AS dueDate FROM task WHERE status <> 'done' AND due_date <> ''"
      )
    }
  }

  readLearningRows(): LearningRows {
    const all = <T>(sql: string): T[] => this.db.prepare(sql).all() as T[]
    return {
      tasks: all(
        `SELECT id, title, kind, due_date AS dueDate, minutes, status, completed_on AS completedOn,
         remind_at AS remindAt FROM task`
      ),
      roadmaps: all('SELECT id, title, start_date AS startDate FROM roadmap ORDER BY id DESC'),
      items: all(
        `SELECT roadmap_id AS roadmapId, title, week, effort_hours AS effortHours, status FROM roadmap_item`
      )
    }
  }

  /** Keeps one snapshot a day, replaced as the day goes on. */
  recordSnapshot(snapshot: Snapshot): void {
    this.db
      .prepare(
        `INSERT INTO progress_snapshot (day, overall, skills) VALUES (?, ?, ?)
         ON CONFLICT (day) DO UPDATE SET overall = excluded.overall, skills = excluded.skills`
      )
      .run(snapshot.day, snapshot.overall, JSON.stringify(snapshot.skills))
  }

  readSnapshots(): Snapshot[] {
    const rows = this.db.prepare('SELECT day, overall, skills FROM progress_snapshot ORDER BY day').all() as {
      day: string
      overall: number | null
      skills: string
    }[]
    return rows.map((row) => {
      let skills: Snapshot['skills'] = {}
      try {
        skills = JSON.parse(row.skills) as Snapshot['skills']
      } catch {
        // A damaged value only loses that day's skill detail.
      }
      return { day: row.day, overall: row.overall, skills }
    })
  }

  completeTask(id: number): boolean {
    const result = this.db.prepare("UPDATE task SET status = 'done' WHERE id = ?").run(id)
    return Number(result.changes) > 0
  }

  setRoadmapStart(id: number, startDate: string): boolean {
    const result = this.db.prepare('UPDATE roadmap SET start_date = ? WHERE id = ?').run(startDate, id)
    return Number(result.changes) > 0
  }
}

export function needsParent(kind: RecordKind): boolean {
  return childKinds.includes(kind)
}
