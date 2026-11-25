import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import type { AiStore } from '../ai/ai-store'
import { recordFields, validateFields, type Result } from '../../shared/career'
import { jobSearchUrl, matchJob, type JobMatch, type JobSite } from '../../shared/job-match'
import { buildDashboard } from '../../shared/progress'
import type { CareerStore } from '../db/career-store'
import { parseJobPage } from './job-page'

export interface RankedJob {
  id: number
  title: string
  company: string
  status: string
  score: number
  missing: string[]
  entryLevel: boolean
}

export interface JobDeps {
  getStores(): { store: CareerStore; aiStore: AiStore } | null
  /** Asks which saved job page to read. Null when cancelled. */
  chooseJobFile(): Promise<string | null>
  /** Opens a web page in Chrome, or the default browser. Returns a note if Chrome was missing. */
  openInBrowser(url: string): Promise<string>
  today(): string
  logError(error: unknown): void
}

const UNAVAILABLE = 'Your data could not be opened. Restart the app, and see the error log if it continues.'
const MAX_PAGE_BYTES = 8 * 1024 * 1024
const SITES: JobSite[] = ['linkedin', 'naukri', 'indeed', 'foundit']
const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
const failure = (message: string): { ok: false; message: string } => ({ ok: false, message })

export function createJobHandlers({ getStores, chooseJobFile, openInBrowser, today, logError }: JobDeps) {
  const sync = <T>(work: (stores: { store: CareerStore; aiStore: AiStore }) => Result<T>): Result<T> => {
    const stores = getStores()
    if (!stores) return failure(UNAVAILABLE)
    try {
      return work(stores)
    } catch (error) {
      logError(error)
      return failure('That could not be completed. Your data is unchanged.')
    }
  }

  const skillsOf = (store: CareerStore) => buildDashboard(store.readCareerRows(), today()).skills

  return {
    /** How well your skills fit one saved job. */
    matchJob: (jobId: unknown): Result<JobMatch> =>
      sync(({ store }) => {
        const job = isId(jobId) ? store.listRecords('job').find((item) => item.id === jobId) : undefined
        if (!job) return failure('That job no longer exists.')
        return { ok: true, value: matchJob(job.values['title'] ?? '', job.values['description'] ?? '', skillsOf(store)) }
      }),

    /** Open jobs, best match first. */
    rankJobs: (): Result<RankedJob[]> =>
      sync(({ store }) => {
        const skills = skillsOf(store)
        const ranked = store
          .listRecords('job')
          .filter((job) => !['rejected', 'closed'].includes(job.values['status'] ?? ''))
          .map((job): RankedJob => {
            const match = matchJob(job.values['title'] ?? '', job.values['description'] ?? '', skills)
            return {
              id: job.id,
              title: job.values['title'] ?? '',
              company: job.values['company'] ?? '',
              status: job.values['status'] ?? 'saved',
              score: match.score,
              missing: match.missing,
              entryLevel: match.entryLevel
            }
          })
        return { ok: true, value: ranked.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)) }
      }),

    /** Reads a job page saved from a browser, on this laptop, and saves it as a job. Returns its id. */
    importJobPage: async (): Promise<Result<number | null>> => {
      const stores = getStores()
      if (!stores) return failure(UNAVAILABLE)
      const path = await chooseJobFile()
      if (!path) return { ok: true, value: null }
      try {
        if (statSync(path).size > MAX_PAGE_BYTES) return failure('That file is too large to be a saved job page.')
        const content = readFileSync(path, 'utf8')
        if (!content.trim()) return failure('That file is empty.')
        const page = parseJobPage(content, basename(path))
        const { values, errors } = validateFields(recordFields.job, { ...page, status: 'saved' })
        if (errors['title']) return failure('No job title could be found in that file. Add the job by hand instead.')
        const saved = stores.store.saveRecord('job', null, { ...values, url: errors['url'] ? '' : values['url']! })
        if (!saved) return failure('That job could not be saved.')
        return { ok: true, value: saved.id }
      } catch (error) {
        logError(error)
        return failure('That file could not be read as a job page.')
      }
    },

    /** Opens a job search in Chrome. Your browser talks to the site; SkillPilot sends nothing itself. */
    searchJobs: async (site: unknown, keywords: unknown, location: unknown): Promise<Result<string>> => {
      if (!SITES.includes(site as JobSite)) return failure('Choose LinkedIn, Naukri, Indeed, or Foundit.')
      const what = typeof keywords === 'string' ? keywords.trim().slice(0, 100) : ''
      if (!what) return failure('Type a job title or skills to search for.')
      const where = typeof location === 'string' ? location.trim().slice(0, 100) : ''
      try {
        return { ok: true, value: await openInBrowser(jobSearchUrl(site as JobSite, what, where)) }
      } catch (error) {
        logError(error)
        return failure('The browser could not be opened.')
      }
    },

    /** Opens a saved job's own link in Chrome. */
    openJobLink: async (jobId: unknown): Promise<Result<string>> => {
      const stores = getStores()
      if (!stores) return failure(UNAVAILABLE)
      const job = isId(jobId) ? stores.store.listRecords('job').find((item) => item.id === jobId) : undefined
      const url = job?.values['url'] ?? ''
      if (!/^https?:\/\/\S+$/i.test(url)) return failure('This job has no link saved.')
      try {
        return { ok: true, value: await openInBrowser(url) }
      } catch (error) {
        logError(error)
        return failure('The browser could not be opened.')
      }
    },

    /** Suggests learning the skills a job asks for that you do not have. Nothing is saved until accepted. */
    suggestJobSkills: (jobId: unknown): Result<number> =>
      sync(({ store, aiStore }) => {
        const job = isId(jobId) ? store.listRecords('job').find((item) => item.id === jobId) : undefined
        if (!job) return failure('That job no longer exists.')
        const match = matchJob(job.values['title'] ?? '', job.values['description'] ?? '', skillsOf(store))
        const missing = match.skills.filter((skill) => skill.fit === 'missing')
        const where = [job.values['title'], job.values['company']].filter(Boolean).join(' at ')
        for (const skill of missing) {
          aiStore.addProposal('addSkill', `Add skill: ${skill.name}`, { name: skill.name, status: 'learning' }, [
            { label: 'Skill', value: skill.name },
            { label: 'Why', value: `${skill.essential ? 'Essential' : 'Nice to have'} for ${where}` }
          ])
        }
        return { ok: true, value: missing.length }
      })
  }
}

export type JobHandlers = ReturnType<typeof createJobHandlers>
