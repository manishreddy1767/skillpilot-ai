import type { FieldValues } from './career'
import { canonicalSkillName, findSkill, skillsInText } from './skills-library'

/** Everything a resume may be built from: only what you have entered, nothing invented. */
export interface ResumeSource {
  profile: FieldValues
  skills: { name: string; category: string; claimed: number; demonstrated: number }[]
  work: (FieldValues & { skills?: string[] })[]
  education: FieldValues[]
  certifications: FieldValues[]
  projects: (FieldValues & { skills?: string[] })[]
}

export interface ResumeEntry {
  heading: string
  subheading: string
  dates: string
  bullets: string[]
  link?: string
}

export interface ResumeData {
  name: string
  headline: string
  contact: string[]
  summary: string
  skills: { group: string; items: string[] }[]
  experience: ResumeEntry[]
  projects: ResumeEntry[]
  education: ResumeEntry[]
  certifications: string[]
  /** For the job it is tailored to: the job's skills your resume shows, and those it does not. */
  keywords: { matched: string[]; missing: string[]; coverage: number } | null
}

export interface TailorTarget {
  title: string
  description: string
}

const MAX_SKILLS = 18
const MAX_PROJECTS = 4
const MAX_BULLETS = 5

const month = (value: string | undefined): string => {
  if (!value) return ''
  const [year, number] = value.split('-')
  const name = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(number) - 1]
  return name && year ? `${name} ${year}` : value
}

const dates = (start?: string, end?: string, ongoing = 'Present'): string => {
  if (!start && !end) return ''
  return `${month(start) || '?'} – ${month(end) || ongoing}`
}

/** Bullet points from free text: one per line, or one per sentence for a paragraph. */
export function bulletsFrom(text: string | undefined): string[] {
  if (!text?.trim()) return []
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
  const parts = lines.length > 1 ? lines : (lines[0] ?? '').split(/(?<=[.!?])\s+(?=[A-Z])/)
  return parts.map((part) => part.trim()).filter((part) => part.length > 2)
}

/** How many of the job's skills a piece of text mentions. */
const relevance = (text: string, wanted: Set<string>): number =>
  skillsInText(text).filter(({ skill }) => wanted.has(skill.name)).length

const groupOf = (name: string, category: string): string => {
  const kind = findSkill(name)?.category ?? category
  return kind === 'soft' ? 'Soft skills' : kind === 'tool' ? 'Tools' : kind === 'domain' ? 'Knowledge' : 'Technical'
}

/**
 * Builds a resume from your own data. When tailored to a job, the skills it asks for come first,
 * the most relevant projects are chosen, and each role's points are ordered by relevance. Nothing is
 * added that you did not enter: skills the job wants that you lack are listed as missing, not claimed.
 */
export function buildResume(source: ResumeSource, target?: TailorTarget): ResumeData {
  const { profile } = source
  const jobSkills = target ? skillsInText(`${target.title}\n${target.description}`).map(({ skill }) => skill.name) : []
  const wanted = new Set(jobSkills)
  const rank = (name: string): number => {
    const index = jobSkills.indexOf(canonicalSkillName(name))
    return index < 0 ? Number.POSITIVE_INFINITY : index
  }

  // Skills you have at some level, those the job wants first, then the strongest.
  const held = source.skills
    .filter((skill) => skill.claimed > 0 || skill.demonstrated > 0)
    .sort(
      (a, b) =>
        rank(a.name) - rank(b.name) ||
        b.demonstrated - a.demonstrated ||
        b.claimed - a.claimed ||
        a.name.localeCompare(b.name)
    )
    .slice(0, MAX_SKILLS)
  const groups = new Map<string, string[]>()
  for (const skill of held) {
    const group = groupOf(skill.name, skill.category)
    groups.set(group, [...(groups.get(group) ?? []), skill.name])
  }
  const order = ['Technical', 'Tools', 'Knowledge', 'Soft skills']
  const skills = order.filter((group) => groups.has(group)).map((group) => ({ group, items: groups.get(group)! }))

  const orderBullets = (bullets: string[]): string[] =>
    (target ? [...bullets].sort((a, b) => relevance(b, wanted) - relevance(a, wanted)) : bullets).slice(0, MAX_BULLETS)

  const experience = source.work.map((job) => ({
    heading: job['role'] ?? '',
    subheading: job['company'] ?? '',
    dates: dates(job['startDate'], job['endDate']),
    bullets: orderBullets(bulletsFrom(job['description']))
  }))

  const projectText = (project: ResumeSource['projects'][number]): string =>
    [project['name'], project['technologies'], project['description'], ...(project.skills ?? [])].join(' ')
  const projects = [...source.projects]
    .map((project, index) => ({ project, index, score: target ? relevance(projectText(project), wanted) : 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_PROJECTS)
    .map(({ project }) => {
      const technologies = project['technologies'] || (project.skills ?? []).join(', ')
      return {
        heading: project['name'] ?? '',
        subheading: technologies ?? '',
        dates: month(project['completedOn']?.slice(0, 7)),
        bullets: orderBullets(bulletsFrom(project['description'])),
        ...(project['repoUrl'] ? { link: project['repoUrl'] } : {})
      }
    })

  const education = source.education.map((item) => ({
    heading: [item['qualification'], item['fieldOfStudy']].filter(Boolean).join(', '),
    subheading: item['institution'] ?? '',
    dates: dates(item['startDate'], item['endDate'], 'Expected'),
    bullets: bulletsFrom(item['notes']).slice(0, 2)
  }))

  const certifications = source.certifications.map((item) =>
    [item['name'], item['issuer'], month(item['issueDate']?.slice(0, 7))].filter(Boolean).join(' · ')
  )

  const headline = profile['headline'] || target?.title || ''
  // The lead line names hard skills; soft skills still appear in their own group.
  const strongest = held.filter((skill) => groupOf(skill.name, skill.category) !== 'Soft skills').slice(0, 4).map((skill) => skill.name)
  const own = bulletsFrom(profile['summary'])[0] ?? ''
  const summary = [
    headline && strongest.length ? `${headline} skilled in ${listOf(strongest)}.` : headline ? `${headline}.` : '',
    own
  ]
    .filter(Boolean)
    .join(' ')

  const data: ResumeData = {
    name: profile['fullName'] ?? '',
    headline,
    contact: [profile['email'], profile['phone'], profile['location']].filter((part): part is string => Boolean(part)),
    summary,
    skills,
    experience,
    projects,
    education,
    certifications,
    keywords: null
  }
  return target ? { ...data, keywords: keywordCoverage(data, jobSkills) } : data
}

const listOf = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

/** Every word of a resume as one text, for checking what it mentions. */
export function resumeText(data: ResumeData): string {
  const entry = (item: ResumeEntry) => [item.heading, item.subheading, item.dates, ...item.bullets].join('\n')
  return [
    data.name,
    data.headline,
    data.contact.join(' '),
    data.summary,
    ...data.skills.map((group) => `${group.group}: ${group.items.join(', ')}`),
    ...data.experience.map(entry),
    ...data.projects.map(entry),
    ...data.education.map(entry),
    ...data.certifications
  ].join('\n')
}

/** Which of a job's skills the resume shows, as applicant tracking systems check for. */
export function keywordCoverage(data: ResumeData, jobSkills: string[]): { matched: string[]; missing: string[]; coverage: number } {
  const shown = new Set(skillsInText(resumeText(data)).map(({ skill }) => skill.name))
  const matched = jobSkills.filter((name) => shown.has(name))
  const missing = jobSkills.filter((name) => !shown.has(name))
  return { matched, missing, coverage: jobSkills.length ? Math.round((matched.length / jobSkills.length) * 100) : 0 }
}

/**
 * Whether a reworded line adds a skill that is neither in the original line nor among your skills.
 * Used to refuse AI rewording that would claim something untrue.
 */
export function addsUnclaimedSkill(original: string, reworded: string, yourSkills: string[]): string | null {
  const allowed = new Set([...yourSkills.map((name) => canonicalSkillName(name)), ...skillsInText(original).map(({ skill }) => skill.name)])
  return skillsInText(reworded).find(({ skill }) => !allowed.has(skill.name))?.skill.name ?? null
}
