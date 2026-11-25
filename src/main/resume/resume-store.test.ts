import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { buildResume } from '../../shared/resume'
import { CareerStore } from '../db/career-store'
import { migrate } from '../db/migrations'
import { ResumeStore, VERSIONS_KEPT } from './resume-store'

const open: DatabaseSync[] = []

function setup() {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, () => undefined)
  return { db, store: new CareerStore(db), resumes: new ResumeStore(db) }
}

afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
})

const data = buildResume({
  profile: { fullName: 'Asha Rao' },
  skills: [{ name: 'SQL', category: 'technical', claimed: 3, demonstrated: 0 }],
  work: [],
  education: [],
  certifications: [],
  projects: []
})

describe('ResumeStore', () => {
  it('saves, lists newest first, reads back, and removes', () => {
    const { store, resumes } = setup()
    const job = store.saveRecord('job', null, { title: 'Data Analyst' })!
    const general = resumes.save(null, 'General resume', data)
    const tailored = resumes.save(job.id, 'For Data Analyst', { ...data, summary: 'Tailored' })
    expect(resumes.list().map((item) => [item.id, item.jobId, item.title])).toEqual([
      [tailored, job.id, 'For Data Analyst'],
      [general, null, 'General resume']
    ])
    expect(resumes.get(tailored)?.summary).toBe('Tailored')
    expect(resumes.remove(general)).toBe(true)
    expect(resumes.remove(general)).toBe(false)
    expect(resumes.get(general)).toBeNull()
  })

  it('keeps only the newest versions for each job', () => {
    const { store, resumes } = setup()
    const job = store.saveRecord('job', null, { title: 'Data Analyst' })!
    for (let i = 0; i < VERSIONS_KEPT + 3; i++) resumes.save(job.id, `v${i}`, data)
    resumes.save(null, 'General', data)
    const forJob = resumes.list().filter((item) => item.jobId === job.id)
    expect(forJob).toHaveLength(VERSIONS_KEPT)
    expect(forJob[0]!.title).toBe(`v${VERSIONS_KEPT + 2}`)
    expect(resumes.list().filter((item) => item.jobId === null)).toHaveLength(1)
  })

  it("removes a job's resumes along with the job", () => {
    const { store, resumes } = setup()
    const job = store.saveRecord('job', null, { title: 'Data Analyst' })!
    resumes.save(job.id, 'v1', data)
    store.deleteRecord('job', job.id)
    expect(resumes.list()).toEqual([])
  })

  it('treats a damaged saved version as gone', () => {
    const { db, resumes } = setup()
    db.prepare("INSERT INTO resume (job_id, title, content) VALUES (NULL, 'Broken', '{not json')").run()
    db.prepare(`INSERT INTO resume (job_id, title, content) VALUES (NULL, 'Wrong', '{"name":5}')`).run()
    for (const item of resumes.list()) expect(resumes.get(item.id)).toBeNull()
  })
})
