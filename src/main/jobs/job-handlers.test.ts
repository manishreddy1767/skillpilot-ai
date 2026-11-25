import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiStore } from '../ai/ai-store'
import { CareerStore } from '../db/career-store'
import { migrate } from '../db/migrations'
import { createJobHandlers, type JobDeps } from './job-handlers'

let folder: string
const open: DatabaseSync[] = []

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'skillpilot-jobs-'))
})

afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
  rmSync(folder, { recursive: true, force: true })
})

function setup(overrides: Partial<JobDeps> = {}) {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, () => undefined)
  const store = new CareerStore(db)
  const aiStore = new AiStore(db)
  const deps: JobDeps = {
    getStores: () => ({ store, aiStore }),
    chooseJobFile: vi.fn(() => Promise.resolve(null)),
    openInBrowser: vi.fn(() => Promise.resolve('')),
    today: () => '2026-11-25',
    logError: vi.fn(),
    ...overrides
  }
  return { store, aiStore, deps, jobs: createJobHandlers(deps) }
}

const frontend = {
  title: 'Frontend Developer',
  company: 'Acme',
  status: 'saved',
  description: 'Must have:\n- React and JavaScript\n- CSS\nNice to have:\n- TypeScript'
}

describe('matching and ranking', () => {
  it('matches a saved job against your skills', () => {
    const { store, jobs } = setup()
    store.saveRecord('skill', null, { name: 'ReactJS', claimedLevel: '3', status: 'using' })
    const job = store.saveRecord('job', null, frontend)!
    const result = jobs.matchJob(job.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.skills.find((skill) => skill.name === 'React')?.fit).toBe('claimed')
    expect(result.value.missing).toEqual(expect.arrayContaining(['JavaScript', 'CSS', 'TypeScript']))
  })

  it('ranks open jobs, best match first, leaving out closed ones', () => {
    const { store, jobs } = setup()
    store.saveRecord('skill', null, { name: 'SQL', claimedLevel: '3', status: 'using' })
    store.saveRecord('job', null, frontend)
    store.saveRecord('job', null, { title: 'Data Analyst', status: 'applied', description: 'Must have SQL' })
    store.saveRecord('job', null, { title: 'Old job', status: 'closed', description: 'SQL' })
    const result = jobs.rankJobs()
    expect(result.ok && result.value.map((job) => [job.title, job.score])).toEqual([
      ['Data Analyst', 60],
      ['Frontend Developer', 0]
    ])
  })

  it.each([0, 'x', 999])('refuses the job %s', (id) => {
    const { jobs } = setup()
    expect(jobs.matchJob(id).ok).toBe(false)
    expect(jobs.suggestJobSkills(id).ok).toBe(false)
  })
})

describe('importing a saved job page', () => {
  it('reads the file on this laptop and saves it as a job', async () => {
    const file = join(folder, 'job.html')
    writeFileSync(file, '<html><head><title>QA Engineer - Initech | Naukri.com</title></head><body><p>Selenium and Java</p></body></html>')
    const { store, jobs } = setup({ chooseJobFile: () => Promise.resolve(file) })
    const result = await jobs.importJobPage()
    expect(result.ok).toBe(true)
    const [job] = store.listRecords('job')
    expect(job!.values).toMatchObject({ title: 'QA Engineer', company: 'Initech', source: 'naukri', status: 'saved' })
    expect(result.ok && result.value).toBe(job!.id)
  })

  it('changes nothing when cancelled', async () => {
    const { store, jobs } = setup()
    expect(await jobs.importJobPage()).toEqual({ ok: true, value: null })
    expect(store.listRecords('job')).toEqual([])
  })

  it('refuses an empty file, and a file too large', async () => {
    const empty = join(folder, 'empty.txt')
    writeFileSync(empty, '   ')
    const blank = setup({ chooseJobFile: () => Promise.resolve(empty) })
    expect(await blank.jobs.importJobPage()).toEqual({ ok: false, message: 'That file is empty.' })
    expect(blank.store.listRecords('job')).toEqual([])

    const huge = join(folder, 'huge.html')
    writeFileSync(huge, 'x'.repeat(9 * 1024 * 1024))
    const large = setup({ chooseJobFile: () => Promise.resolve(huge) })
    expect(await large.jobs.importJobPage()).toMatchObject({ ok: false, message: expect.stringContaining('too large') })
  })
})

describe('job sites, in the browser', () => {
  it('opens a search in the browser, never fetching anything itself', async () => {
    const { deps, jobs } = setup()
    expect(await jobs.searchJobs('naukri', 'React developer', 'Pune')).toEqual({ ok: true, value: '' })
    expect(deps.openInBrowser).toHaveBeenCalledWith('https://www.naukri.com/react-developer-jobs-in-pune?k=React%20developer&l=Pune')
  })

  it.each([
    ['monster', 'React', 'Choose LinkedIn'],
    ['linkedin', '   ', 'Type a job title']
  ])('refuses site %s with keywords "%s"', async (site, keywords, message) => {
    const { deps, jobs } = setup()
    expect(await jobs.searchJobs(site, keywords, '')).toMatchObject({ ok: false, message: expect.stringContaining(message) })
    expect(deps.openInBrowser).not.toHaveBeenCalled()
  })

  it("opens a job's own link, and only a web link", async () => {
    const { store, deps, jobs } = setup()
    const withLink = store.saveRecord('job', null, { ...frontend, url: 'https://www.linkedin.com/jobs/view/1' })!
    const without = store.saveRecord('job', null, frontend)!
    await jobs.openJobLink(withLink.id)
    expect(deps.openInBrowser).toHaveBeenCalledWith('https://www.linkedin.com/jobs/view/1')
    expect(await jobs.openJobLink(without.id)).toMatchObject({ ok: false, message: 'This job has no link saved.' })
  })
})

describe('suggesting skills from a job', () => {
  it('suggests only the missing skills, saved once accepted', () => {
    const { store, aiStore, jobs } = setup()
    store.saveRecord('skill', null, { name: 'JavaScript', claimedLevel: '3', status: 'using' })
    const job = store.saveRecord('job', null, frontend)!
    expect(jobs.suggestJobSkills(job.id)).toEqual({ ok: true, value: 3 })
    const proposals = aiStore.listProposals()
    // Essential skills first, then alphabetical.
    expect(proposals.map((proposal) => proposal.summary)).toEqual(['Add skill: CSS', 'Add skill: React', 'Add skill: TypeScript'])
    expect(proposals[1]!.details).toContainEqual({ label: 'Why', value: 'Essential for Frontend Developer at Acme' })
    expect(proposals[2]!.details).toContainEqual({ label: 'Why', value: 'Nice to have for Frontend Developer at Acme' })
    expect(store.listRecords('skill')).toHaveLength(1)
  })
})

it('reports when data is unavailable', async () => {
  const jobs = createJobHandlers({
    getStores: () => null,
    chooseJobFile: () => Promise.resolve(null),
    openInBrowser: () => Promise.resolve(''),
    today: () => '2026-11-25',
    logError: vi.fn()
  })
  expect(jobs.rankJobs()).toMatchObject({ ok: false })
  expect(await jobs.importJobPage()).toMatchObject({ ok: false })
})
