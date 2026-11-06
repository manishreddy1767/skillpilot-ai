import { skillCredit } from './progress'

export type GapStatus = 'met' | 'improve' | 'missing'

export interface Requirement {
  skillName: string
  requiredLevel: number
  /** 1 nice to have, 2 important, 3 essential. */
  importance: number
}

export interface SkillLevel {
  name: string
  claimed: number
  demonstrated: number
}

export interface GapItem extends Requirement {
  status: GapStatus
  claimed: number
  demonstrated: number
}

export interface GapAnalysis {
  /** 0 to 100, or null with no requirements. */
  readiness: number | null
  items: GapItem[]
}

const statusOrder: Record<GapStatus, number> = { missing: 0, improve: 1, met: 2 }

/** Compares a role's requirements with real skills. No AI is involved. */
export function analyseGap(requirements: Requirement[], skills: SkillLevel[]): GapAnalysis {
  if (requirements.length === 0) return { readiness: null, items: [] }

  const items = requirements.map((requirement): GapItem => {
    const wanted = requirement.skillName.trim().toLowerCase()
    const skill = skills.find((item) => item.name.trim().toLowerCase() === wanted)
    const claimed = skill?.claimed ?? 0
    const demonstrated = skill?.demonstrated ?? 0
    const status: GapStatus =
      demonstrated >= requirement.requiredLevel ? 'met' : claimed > 0 || demonstrated > 0 ? 'improve' : 'missing'
    return { ...requirement, status, claimed, demonstrated }
  })

  const weight = items.reduce((sum, item) => sum + item.importance, 0)
  const earned = items.reduce(
    (sum, item) => sum + item.importance * skillCredit(item.demonstrated, item.claimed, item.requiredLevel),
    0
  )

  return {
    readiness: Math.round((earned / weight) * 100),
    items: items.sort(
      (a, b) =>
        statusOrder[a.status] - statusOrder[b.status] ||
        b.importance - a.importance ||
        a.skillName.localeCompare(b.skillName)
    )
  }
}
