/** All scoring lives here, so every number in the app can be explained and tested. */

export const MAX_LEVEL = 5

export type ProofStatus = 'none' | 'unproven' | 'partly' | 'proven'

export interface SkillSummary {
  id: number
  name: string
  category: string
  status: string
  claimed: number
  demonstrated: number
  proof: ProofStatus
  evidenceCount: number
  /** Claimed levels over time, oldest first. */
  history: number[]
}

export interface GoalSummary {
  id: number
  title: string
  status: string
  priority: number
  targetDate: string
  progress: number
  milestonesDone: number
  milestonesTotal: number
  skillsMet: number
  skillsTotal: number
  missingSkills: string[]
}

export interface ProjectSummary {
  id: number
  name: string
  status: string
  skills: string[]
  milestonesDone: number
  milestonesTotal: number
}

export interface Deadline {
  title: string
  date: string
  overdue: boolean
}

export interface Achievement {
  title: string
  date: string
}

export interface Dashboard {
  overall: number | null
  skills: SkillSummary[]
  goals: GoalSummary[]
  projects: ProjectSummary[]
  deadlines: Deadline[]
  achievements: Achievement[]
}

/** Plain rows from the database, before any scoring. */
export interface CareerRows {
  skills: { id: number; name: string; category: string; status: string; claimed: number }[]
  evidence: { skillId: number; strength: number }[]
  history: { skillId: number; level: number }[]
  projects: { id: number; name: string; status: string; completedOn: string }[]
  projectSkills: { projectId: number; skillId: number }[]
  goals: {
    id: number
    title: string
    status: string
    priority: number
    targetDate: string
    completedOn: string
  }[]
  goalSkills: { goalId: number; skillId: number; level: number }[]
  milestones: {
    goalId: number | null
    projectId: number | null
    title: string
    dueDate: string
    status: string
    completedOn: string
  }[]
  /** Open tasks with a due date, which count as deadlines. */
  dueTasks: { title: string; dueDate: string }[]
}

export const PROJECT_POINTS: Record<string, number> = { planned: 0, active: 1, complete: 3 }

const LEVEL_THRESHOLDS = [1, 2, 4, 6, 9]

export const scoringRules = [
  'Demonstrated level comes only from evidence. Minor evidence earns 1 point, solid earns 2, and strong earns 3. A linked project earns 1 point while active and 3 once complete.',
  'Points become levels at 1, 2, 4, 6, and 9 points, for levels 1 to 5.',
  'Goal progress averages milestones done and required skills reached. A skill counts fully for its demonstrated level, and half for any claimed level beyond that.',
  'Overall progress averages your active goals. High priority goals count three times as much as low, and medium twice as much.'
]

export function demonstratedLevel(points: number): number {
  return LEVEL_THRESHOLDS.filter((threshold) => points >= threshold).length
}

export function proofStatus(claimed: number, demonstrated: number): ProofStatus {
  if (claimed === 0 && demonstrated === 0) return 'none'
  if (demonstrated === 0) return 'unproven'
  return demonstrated >= claimed ? 'proven' : 'partly'
}

/** How much of a required level is reached, from 0 to 1. */
export function skillCredit(demonstrated: number, claimed: number, required: number): number {
  if (required <= 0) return 1
  const proven = Math.min(demonstrated, required)
  const claimedOnly = Math.max(0, Math.min(claimed, required) - proven)
  return (proven + claimedOnly / 2) / required
}

export function goalProgress(
  status: string,
  milestonesDone: number,
  milestonesTotal: number,
  skillCredits: number[]
): number {
  if (status === 'done') return 100
  const parts: number[] = []
  if (milestonesTotal > 0) parts.push(milestonesDone / milestonesTotal)
  if (skillCredits.length > 0) {
    parts.push(skillCredits.reduce((sum, credit) => sum + credit, 0) / skillCredits.length)
  }
  if (parts.length === 0) return 0
  return Math.round((parts.reduce((sum, part) => sum + part, 0) / parts.length) * 100)
}

export function overallProgress(goals: { status: string; priority: number; progress: number }[]): number | null {
  const active = goals.filter((goal) => goal.status === 'active')
  if (active.length === 0) return null
  const weight = active.reduce((sum, goal) => sum + goal.priority, 0)
  return Math.round(active.reduce((sum, goal) => sum + goal.progress * goal.priority, 0) / weight)
}

function countMilestones(rows: CareerRows['milestones']): { done: number; total: number } {
  return { done: rows.filter((row) => row.status === 'done').length, total: rows.length }
}

export function buildDashboard(rows: CareerRows, today: string): Dashboard {
  const skills: SkillSummary[] = rows.skills.map((skill) => {
    const evidence = rows.evidence.filter((item) => item.skillId === skill.id)
    const projects = rows.projectSkills
      .filter((link) => link.skillId === skill.id)
      .flatMap((link) => rows.projects.filter((project) => project.id === link.projectId))
    const points =
      evidence.reduce((sum, item) => sum + item.strength, 0) +
      projects.reduce((sum, project) => sum + (PROJECT_POINTS[project.status] ?? 0), 0)
    const demonstrated = demonstratedLevel(points)
    return {
      ...skill,
      demonstrated,
      proof: proofStatus(skill.claimed, demonstrated),
      evidenceCount: evidence.length + projects.filter((p) => (PROJECT_POINTS[p.status] ?? 0) > 0).length,
      history: rows.history.filter((item) => item.skillId === skill.id).map((item) => item.level)
    }
  })

  const goals: GoalSummary[] = rows.goals.map((goal) => {
    const { done, total } = countMilestones(rows.milestones.filter((m) => m.goalId === goal.id))
    const required = rows.goalSkills.flatMap((link) => {
      const skill = skills.find((item) => item.id === link.skillId)
      return link.goalId === goal.id && skill ? [{ skill, level: link.level }] : []
    })
    const unmet = required.filter(({ skill, level }) => skill.demonstrated < level)
    return {
      id: goal.id,
      title: goal.title,
      status: goal.status,
      priority: goal.priority,
      targetDate: goal.targetDate,
      progress: goalProgress(
        goal.status,
        done,
        total,
        required.map(({ skill, level }) => skillCredit(skill.demonstrated, skill.claimed, level))
      ),
      milestonesDone: done,
      milestonesTotal: total,
      skillsMet: required.length - unmet.length,
      skillsTotal: required.length,
      missingSkills: unmet.map(({ skill }) => skill.name)
    }
  })

  const projects: ProjectSummary[] = rows.projects.map((project) => {
    const { done, total } = countMilestones(rows.milestones.filter((m) => m.projectId === project.id))
    const names = rows.projectSkills
      .filter((link) => link.projectId === project.id)
      .flatMap((link) => rows.skills.filter((skill) => skill.id === link.skillId).map((skill) => skill.name))
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      skills: names,
      milestonesDone: done,
      milestonesTotal: total
    }
  })

  const deadlines = [
    ...rows.goals
      .filter((goal) => goal.status === 'active' && goal.targetDate)
      .map((goal) => ({ title: goal.title, date: goal.targetDate })),
    ...rows.milestones
      .filter((milestone) => milestone.status !== 'done' && milestone.dueDate)
      .map((milestone) => ({ title: milestone.title, date: milestone.dueDate })),
    ...rows.dueTasks.map((task) => ({ title: task.title, date: task.dueDate }))
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)
    .map((item) => ({ ...item, overdue: item.date < today }))

  const achievements = [
    ...rows.milestones
      .filter((milestone) => milestone.status === 'done' && milestone.completedOn)
      .map((milestone) => ({ title: `Reached ${milestone.title}`, date: milestone.completedOn })),
    ...rows.projects
      .filter((project) => project.status === 'complete')
      .map((project) => ({ title: `Finished ${project.name}`, date: project.completedOn })),
    ...rows.goals
      .filter((goal) => goal.status === 'done' && goal.completedOn)
      .map((goal) => ({ title: `Achieved ${goal.title}`, date: goal.completedOn }))
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)

  return { overall: overallProgress(goals), skills, goals, projects, deadlines, achievements }
}
