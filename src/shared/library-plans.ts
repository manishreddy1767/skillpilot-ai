import type { GapItem } from './gap'
import { canonicalSkillName, findSkill, inLearningOrder, type LibraryRole } from './skills-library'

export interface PlannedRequirement {
  skillName: string
  requiredLevel: number
  importance: number
}

export interface PlannedTopic {
  title: string
  week: number
  effortHours: number
  details: string
  exercise: string
  resources: string
}

/** About how long it takes to move up one level in a skill, in hours. */
export const HOURS_PER_LEVEL = 8

/** A role's needs from the library, leaving out skills the role already lists under any name. */
export function requirementsFor(role: LibraryRole, existing: string[]): PlannedRequirement[] {
  const have = new Set(existing.map((name) => canonicalSkillName(name).toLowerCase()))
  return role.needs
    .filter(([name]) => !have.has(name.toLowerCase()))
    .map(([skillName, requiredLevel, importance]) => ({ skillName, requiredLevel, importance }))
}

/**
 * A learning roadmap that closes a role's gaps, made offline from the library. Essential skills come
 * first, prerequisites before what builds on them, and weeks fill up at the time available each week.
 */
export function roadmapFromGaps(roleTitle: string, gaps: GapItem[], weeklyHours: number): { title: string; items: PlannedTopic[] } {
  const open = gaps.filter((gap) => gap.status !== 'met')
  const byImportance = [...open].sort((a, b) => b.importance - a.importance)
  const order = inLearningOrder(byImportance.map((gap) => gap.skillName))
  const perWeek = Math.max(1, weeklyHours)

  let week = 1
  let usedThisWeek = 0
  const items: PlannedTopic[] = []
  for (const name of order) {
    const gap = open.find((item) => canonicalSkillName(item.skillName) === name)
    if (!gap) continue
    const current = Math.max(gap.demonstrated, gap.claimed)
    const levels = Math.max(1, gap.requiredLevel - current)
    const effortHours = Math.min(500, levels * HOURS_PER_LEVEL)
    if (usedThisWeek > 0 && usedThisWeek + effortHours > perWeek) {
      week += Math.ceil(usedThisWeek / perWeek)
      usedThisWeek = 0
    }
    const library = findSkill(name)
    items.push({
      title: current > 0 ? `${name}: from level ${current} to ${gap.requiredLevel}` : `${name}: reach level ${gap.requiredLevel}`,
      week: Math.min(104, week),
      effortHours,
      details: library?.after.length ? `Builds on ${library.after.join(', ')}.` : '',
      exercise: library?.practice ?? `Build something small that uses ${name}, and add it to your projects.`,
      resources: library?.learn ?? `Search for a well-reviewed beginner course on ${name}.`
    })
    usedThisWeek += effortHours
  }
  return { title: `${roleTitle} plan`, items }
}
