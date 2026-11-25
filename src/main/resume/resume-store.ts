import type { DatabaseSync } from 'node:sqlite'
import { parseResumeData, type ResumeData } from '../../shared/resume'

export interface SavedResume {
  id: number
  jobId: number | null
  title: string
  createdAt: string
}

/** Versions kept for each job, so old drafts do not pile up. */
export const VERSIONS_KEPT = 10

/** Saved resume versions, each tied to a job or kept as a general resume. */
export class ResumeStore {
  constructor(private readonly db: DatabaseSync) {}

  save(jobId: number | null, title: string, data: ResumeData): number {
    const result = this.db
      .prepare('INSERT INTO resume (job_id, title, content) VALUES (?, ?, ?)')
      .run(jobId, title, JSON.stringify(data))
    const id = Number(result.lastInsertRowid)
    // Only the newest versions are kept for each job, or for the general resume.
    this.db
      .prepare(
        `DELETE FROM resume WHERE job_id IS ? AND id NOT IN (
           SELECT id FROM resume WHERE job_id IS ? ORDER BY id DESC LIMIT ?)`
      )
      .run(jobId, jobId, VERSIONS_KEPT)
    return id
  }

  list(): SavedResume[] {
    return (
      this.db.prepare('SELECT id, job_id, title, created_at FROM resume ORDER BY id DESC').all() as {
        id: number
        job_id: number | null
        title: string
        created_at: string
      }[]
    ).map((row) => ({ id: row.id, jobId: row.job_id, title: row.title, createdAt: row.created_at }))
  }

  /** A saved version, or null if it is gone or no longer readable. */
  get(id: number): ResumeData | null {
    const row = this.db.prepare('SELECT content FROM resume WHERE id = ?').get(id) as { content: string } | undefined
    if (!row) return null
    try {
      return parseResumeData(JSON.parse(row.content))
    } catch {
      return null
    }
  }

  remove(id: number): boolean {
    return Number(this.db.prepare('DELETE FROM resume WHERE id = ?').run(id).changes) > 0
  }
}
