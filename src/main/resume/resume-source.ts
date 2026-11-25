import type { ResumeSource } from '../../shared/resume'
import { buildDashboard } from '../../shared/progress'
import type { CareerStore } from '../db/career-store'

/** Everything you have entered that a resume may use, with each role's and project's linked skills. */
export function readResumeSource(store: CareerStore, today: string): ResumeSource {
  const skills = buildDashboard(store.readCareerRows(), today).skills
  const names = new Map(skills.map((skill) => [skill.id, skill.name]))
  const linked = (kind: 'workSkill' | 'projectSkill', parentId: number): string[] =>
    store.listLinks(kind, parentId).flatMap((link) => (names.has(link.id) ? [names.get(link.id)!] : []))

  return {
    profile: store.getProfile(),
    skills: skills.map(({ name, category, claimed, demonstrated }) => ({ name, category, claimed, demonstrated })),
    work: store.listRecords('work').map((record) => ({ ...record.values, skills: linked('workSkill', record.id) })),
    education: store.listRecords('education').map((record) => record.values),
    certifications: store.listRecords('certification').map((record) => record.values),
    projects: store.listRecords('project').map((record) => ({ ...record.values, skills: linked('projectSkill', record.id) }))
  }
}
