import type { SkillLevel } from './gap'
import { canonicalSkillName, findRole, skillsInText, type LibraryRole } from './skills-library'

export type SkillFit = 'proven' | 'claimed' | 'missing'

export interface JobSkill {
  name: string
  mentions: number
  /** Listed under "must have" or "required", or mentioned often. */
  essential: boolean
  fit: SkillFit
  /** Your best level for it: demonstrated if any, else claimed. */
  level: number
}

export interface JobMatch {
  /** 0 to 100: how much of what the job asks for you have, essential skills counting most. */
  score: number
  skills: JobSkill[]
  missing: string[]
  /** Years of experience the job asks for, as written, such as "2-4". Null when it does not say. */
  experience: string | null
  /** A job open to freshers or those with up to a year of experience. */
  entryLevel: boolean
  role: LibraryRole | null
}

const NICE_HEADING = /\b(?:nice|good|great) to have\b|\bpreferred\b|\bbonus\b|\bplus\b|\badded advantage\b|\bdesirable\b/i
const MUST_HEADING = /\bmust[- ]have\b|\brequired\b|\brequirements?\b|\bmandatory\b|\bqualifications?\b|\bwhat you(?:'ll)? need\b|\bkey skills\b|\bskills required\b/i

/**
 * Splits a description into what it requires and what it would like. A line that names a section,
 * such as "Must have:" or "Nice to have:", sets which part the following lines belong to.
 */
export function splitRequirements(description: string): { required: string; preferred: string } {
  let section: 'required' | 'preferred' = 'required'
  const required: string[] = []
  const preferred: string[] = []
  for (const line of description.split(/\r?\n/)) {
    const heading = line.slice(0, 80)
    if (NICE_HEADING.test(heading)) section = 'preferred'
    else if (MUST_HEADING.test(heading)) section = 'required'
    ;(section === 'required' ? required : preferred).push(line)
  }
  return { required: required.join('\n'), preferred: preferred.join('\n') }
}

/** The experience a job asks for, such as "0-2", "3+", or "5". */
export function experienceAsked(description: string): string | null {
  const range = description.match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i)
  if (range) return `${range[1]}-${range[2]}`
  const plus = description.match(/(\d{1,2})\s*\+\s*(?:years?|yrs?)/i)
  if (plus) return `${plus[1]}+`
  const plain = description.match(/(?:minimum|min\.?|at least)?\s*(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)/i)
  return plain ? plain[1]! : null
}

const isEntryLevel = (description: string, experience: string | null): boolean =>
  /\bfreshers?\b|\bentry[- ]level\b|\bgraduate trainee\b|\b(?:20\d\d)\s+(?:batch|pass[- ]?outs?)\b|\binternship\b/i.test(description) ||
  (experience !== null && Number.parseInt(experience, 10) <= 1)

/** How well your skills fit a job, worked out on this laptop from the description alone. */
export function matchJob(title: string, description: string, skills: SkillLevel[]): JobMatch {
  const { required, preferred } = splitRequirements(description)
  const requiredNames = new Set(skillsInText(required).map(({ skill }) => skill.name))
  const yours = new Map(skills.map((skill) => [canonicalSkillName(skill.name).toLowerCase(), skill]))

  const asked = skillsInText(`${title}\n${description}`)
  const found: JobSkill[] = asked.map(({ skill, mentions }) => {
    const have = yours.get(skill.name.toLowerCase())
    const fit: SkillFit = have && have.demonstrated > 0 ? 'proven' : have && have.claimed > 0 ? 'claimed' : 'missing'
    const essential = requiredNames.has(skill.name) && (mentions > 1 || !skillsInText(preferred).some((p) => p.skill.name === skill.name))
    return { name: skill.name, mentions, essential, fit, level: have ? Math.max(have.demonstrated, have.claimed) : 0 }
  })

  // Essential skills count three times as much. A claimed skill counts for a little over half.
  const credit: Record<SkillFit, number> = { proven: 1, claimed: 0.6, missing: 0 }
  const weight = found.reduce((sum, skill) => sum + (skill.essential ? 3 : 1), 0)
  const earned = found.reduce((sum, skill) => sum + (skill.essential ? 3 : 1) * credit[skill.fit], 0)
  const experience = experienceAsked(description)

  return {
    score: weight ? Math.round((earned / weight) * 100) : 0,
    skills: found.sort(
      (a, b) => Number(b.essential) - Number(a.essential) || b.mentions - a.mentions || a.name.localeCompare(b.name)
    ),
    missing: found.filter((skill) => skill.fit === 'missing').map((skill) => skill.name),
    experience,
    entryLevel: isEntryLevel(description, experience),
    role: findRole(title)
  }
}

/** Job searches on the big job sites, opened in your own browser. SkillPilot itself sends nothing. */
export type JobSite = 'linkedin' | 'naukri' | 'indeed' | 'foundit'

export const JOB_SITES: { id: JobSite; label: string }[] = [
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'naukri', label: 'Naukri' },
  { id: 'indeed', label: 'Indeed' },
  { id: 'foundit', label: 'Foundit' }
]

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** The search page for a job site, with the keywords and location filled in. */
export function jobSearchUrl(site: JobSite, keywords: string, location = ''): string {
  const what = keywords.trim()
  const where = location.trim()
  const q = encodeURIComponent(what)
  const l = encodeURIComponent(where)
  switch (site) {
    case 'linkedin':
      return `https://www.linkedin.com/jobs/search/?keywords=${q}${where ? `&location=${l}` : ''}`
    case 'naukri': {
      const path = `${slug(what) || 'jobs'}-jobs${where ? `-in-${slug(where)}` : ''}`
      return `https://www.naukri.com/${path}?k=${q}${where ? `&l=${l}` : ''}`
    }
    case 'indeed':
      return `https://in.indeed.com/jobs?q=${q}${where ? `&l=${l}` : ''}`
    case 'foundit':
      return `https://www.foundit.in/srp/results?query=${q}${where ? `&locations=${l}` : ''}`
  }
}
