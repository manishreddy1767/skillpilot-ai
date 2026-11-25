import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CareerStore } from '../db/career-store'
import { migrate } from '../db/migrations'
import { createResumeHandlers, type ResumeDeps } from './resume-handlers'
import { ResumeStore } from './resume-store'

let folder: string
const open: DatabaseSync[] = []

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'skillpilot-resume-'))
})

afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
  rmSync(folder, { recursive: true, force: true })
})

function setup(overrides: Partial<ResumeDeps> = {}) {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, () => undefined)
  const store = new CareerStore(db)
  const resumes = new ResumeStore(db)
  store.saveProfile({ fullName: 'Asha Rao', headline: 'Developer', email: 'asha@example.com' })
  store.saveRecord('skill', null, { name: 'React', claimedLevel: '3', status: 'using' })
  store.saveRecord('skill', null, { name: 'SQL', claimedLevel: '2', status: 'using' })
  const deps: ResumeDeps = {
    getStores: () => ({ store, resumes }),
    today: () => '2026-11-25',
    logError: vi.fn(),
    chooseSavePath: vi.fn((name: string) => Promise.resolve(join(folder, name))),
    printToPdf: vi.fn(() => Promise.resolve(Buffer.from('%PDF-1.7 fake'))),
    polish: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
    ...overrides
  }
  return { store, resumes, deps, h: createResumeHandlers(deps) }
}

describe('building and saving', () => {
  it('builds a general resume, and one tailored to a job', () => {
    const { store, h } = setup()
    const general = h.buildResume(null)
    expect(general.ok && general.value.name).toBe('Asha Rao')
    expect(general.ok && general.value.keywords).toBeNull()
    const job = store.saveRecord('job', null, { title: 'Data Analyst', description: 'Must have SQL and Power BI' })!
    const tailored = h.buildResume(job.id)
    expect(tailored.ok && tailored.value.skills[0]!.items[0]).toBe('SQL')
    expect(tailored.ok && tailored.value.keywords).toMatchObject({ matched: ['SQL'], missing: expect.arrayContaining(['Power BI']) })
  })

  it('saves a version, reads it back, and deletes it', () => {
    const { h } = setup()
    const built = h.buildResume(null)
    if (!built.ok) throw new Error('not built')
    const saved = h.saveResume(null, '  My resume  ', built.value)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(h.listResumes()).toMatchObject({ ok: true, value: [{ id: saved.value, title: 'My resume', jobId: null }] })
    expect(h.getResume(saved.value)).toEqual({ ok: true, value: built.value })
    expect(h.deleteResume(saved.value)).toEqual({ ok: true, value: true })
    expect(h.getResume(saved.value).ok).toBe(false)
  })

  it.each([
    ['an unknown job', 'x', {}],
    ['a job that is gone', 999, {}],
    ['a malformed resume', null, { name: 5 }]
  ])('refuses %s', (_label, jobId, data) => {
    const { h } = setup()
    expect(h.saveResume(jobId, 'x', data).ok).toBe(false)
  })
})

describe('exporting', () => {
  it('prints a PDF from the escaped page, and saves it where chosen', async () => {
    const { h, deps } = setup()
    const built = h.buildResume(null)
    if (!built.ok) throw new Error('not built')
    const result = await h.exportResume({ ...built.value, name: 'Asha <Rao>' }, 'compact', 'pdf')
    expect(result).toEqual({ ok: true, value: join(folder, 'Asha Rao resume.pdf') })
    expect(readFileSync(join(folder, 'Asha Rao resume.pdf'), 'utf8')).toBe('%PDF-1.7 fake')
    const html = vi.mocked(deps.printToPdf).mock.calls[0]![0]
    expect(html).toContain('Asha &lt;Rao&gt;')
    expect(html).toContain('font: 9.5pt')
  })

  it('saves plain text', async () => {
    const { h } = setup()
    const built = h.buildResume(null)
    if (!built.ok) throw new Error('not built')
    await h.exportResume(built.value, 'classic', 'txt')
    expect(readFileSync(join(folder, 'Asha Rao resume.txt'), 'utf8')).toContain('SKILLS')
  })

  it('changes nothing when cancelled, and refuses bad input', async () => {
    const { h } = setup({ chooseSavePath: () => Promise.resolve(null) })
    const built = h.buildResume(null)
    if (!built.ok) throw new Error('not built')
    expect(await h.exportResume(built.value, 'classic', 'pdf')).toEqual({ ok: true, value: null })
    expect(existsSync(join(folder, 'Asha Rao resume.pdf'))).toBe(false)
    expect((await h.exportResume(built.value, 'classic', 'exe')).ok).toBe(false)
    expect((await h.exportResume({ name: 5 }, 'classic', 'pdf')).ok).toBe(false)
  })

  it('explains a folder it cannot write to', async () => {
    const { h } = setup({ chooseSavePath: () => Promise.resolve(join(folder, 'missing', 'deep', 'x.pdf')) })
    const built = h.buildResume(null)
    if (!built.ok) throw new Error('not built')
    expect(await h.exportResume(built.value, 'classic', 'pdf')).toMatchObject({ ok: false, message: expect.stringContaining('could not be saved') })
  })
})

describe('wording from the local AI', () => {
  it('passes the job and your skill names along', async () => {
    const { store, h, deps } = setup()
    const job = store.saveRecord('job', null, { title: 'Data Analyst', description: 'SQL' })!
    const built = h.buildResume(job.id)
    if (!built.ok) throw new Error('not built')
    await h.polishResume(job.id, built.value)
    expect(deps.polish).toHaveBeenCalledWith(built.value, { title: 'Data Analyst', description: 'SQL', company: '' }, ['React', 'SQL'])
  })

  it('needs a resume first', async () => {
    const { h, deps } = setup()
    expect(await h.polishResume(null, null)).toEqual({ ok: false, message: 'Build the resume first.' })
    expect(deps.polish).not.toHaveBeenCalled()
  })
})
