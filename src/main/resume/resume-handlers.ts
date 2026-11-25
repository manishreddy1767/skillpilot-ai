import { writeFileSync } from 'node:fs'
import type { Result } from '../../shared/career'
import { buildResume, parseResumeData, type ResumeData, type ResumeSuggestion } from '../../shared/resume'
import { RESUME_TEMPLATES, resumeDocument, resumePlainText, type ResumeTemplate } from '../../shared/resume-html'
import type { CareerStore } from '../db/career-store'
import { readResumeSource } from './resume-source'
import type { ResumeStore, SavedResume } from './resume-store'

export interface ResumeDeps {
  getStores(): { store: CareerStore; resumes: ResumeStore } | null
  today(): string
  logError(error: unknown): void
  /** Asks where to save. Null when cancelled. */
  chooseSavePath(suggestedName: string, kind: 'pdf' | 'txt'): Promise<string | null>
  /** Prints a page to PDF on this laptop. */
  printToPdf(html: string): Promise<Buffer>
  /** Asks the local AI for clearer wording. */
  polish(resume: ResumeData, job: { title: string; description: string } | null, skills: string[]): Promise<Result<ResumeSuggestion[]>>
}

const UNAVAILABLE = 'Your data could not be opened. Restart the app, and see the error log if it continues.'
const failure = (message: string): { ok: false; message: string } => ({ ok: false, message })
const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
const jobIdOf = (value: unknown): number | null | undefined => (value === null ? null : isId(value) ? value : undefined)
const fileName = (text: string): string => text.replace(/[^\w .-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Resume'

export function createResumeHandlers(deps: ResumeDeps) {
  const { getStores, today, logError } = deps

  const sync = <T>(work: (stores: { store: CareerStore; resumes: ResumeStore }) => Result<T>): Result<T> => {
    const stores = getStores()
    if (!stores) return failure(UNAVAILABLE)
    try {
      return work(stores)
    } catch (error) {
      logError(error)
      return failure('That could not be completed. Your data is unchanged.')
    }
  }

  const jobFor = (store: CareerStore, jobId: number | null) => {
    if (jobId === null) return null
    const job = store.listRecords('job').find((item) => item.id === jobId)
    return job ? { title: job.values['title'] ?? '', description: job.values['description'] ?? '', company: job.values['company'] ?? '' } : undefined
  }

  return {
    /** A fresh resume from your data, tailored to a job when one is given. */
    buildResume: (jobId: unknown): Result<ResumeData> =>
      sync(({ store }) => {
        const id = jobIdOf(jobId)
        if (id === undefined) return failure('Unknown job.')
        const job = jobFor(store, id)
        if (job === undefined) return failure('That job no longer exists.')
        return { ok: true, value: buildResume(readResumeSource(store, today()), job ?? undefined) }
      }),

    saveResume: (jobId: unknown, title: unknown, data: unknown): Result<number> =>
      sync(({ store, resumes }) => {
        const id = jobIdOf(jobId)
        if (id === undefined) return failure('Unknown job.')
        if (id !== null && !jobFor(store, id)) return failure('That job no longer exists.')
        const resume = parseResumeData(data)
        if (!resume) return failure('That resume could not be saved. Build it again and retry.')
        const name = typeof title === 'string' && title.trim() ? title.trim().slice(0, 120) : 'Resume'
        return { ok: true, value: resumes.save(id, name, resume) }
      }),

    listResumes: (): Result<SavedResume[]> => sync(({ resumes }) => ({ ok: true, value: resumes.list() })),

    getResume: (id: unknown): Result<ResumeData> =>
      sync(({ resumes }) => {
        const resume = isId(id) ? resumes.get(id) : null
        return resume ? { ok: true, value: resume } : failure('That resume no longer exists.')
      }),

    deleteResume: (id: unknown): Result<boolean> =>
      sync(({ resumes }) => (isId(id) && resumes.remove(id) ? { ok: true, value: true } : failure('That resume no longer exists.'))),

    /** Saves a resume as a PDF or plain text, wherever you choose. Null when cancelled. */
    exportResume: async (data: unknown, template: unknown, format: unknown): Promise<Result<string | null>> => {
      const resume = parseResumeData(data)
      if (!resume) return failure('That resume could not be exported. Build it again and retry.')
      if (format !== 'pdf' && format !== 'txt') return failure('Choose PDF or text.')
      const look: ResumeTemplate = RESUME_TEMPLATES.some((item) => item.id === template) ? (template as ResumeTemplate) : 'classic'
      try {
        const path = await deps.chooseSavePath(`${fileName(resume.name || 'Resume')} resume.${format}`, format)
        if (!path) return { ok: true, value: null }
        if (format === 'pdf') writeFileSync(path, await deps.printToPdf(resumeDocument(resume, look)))
        else writeFileSync(path, resumePlainText(resume), 'utf8')
        return { ok: true, value: path }
      } catch (error) {
        logError(error)
        return failure('The resume could not be saved there. Try another folder.')
      }
    },

    /** Clearer wording from the local AI, as suggestions to accept or reject. */
    polishResume: async (jobId: unknown, data: unknown): Promise<Result<ResumeSuggestion[]>> => {
      const stores = getStores()
      if (!stores) return failure(UNAVAILABLE)
      const resume = parseResumeData(data)
      if (!resume) return failure('Build the resume first.')
      const id = jobIdOf(jobId)
      if (id === undefined) return failure('Unknown job.')
      const job = jobFor(stores.store, id)
      if (job === undefined) return failure('That job no longer exists.')
      const skills = stores.store.listRecords('skill').map((skill) => skill.values['name'] ?? '')
      return deps.polish(resume, job, skills)
    }
  }
}

export type ResumeHandlers = ReturnType<typeof createResumeHandlers>
