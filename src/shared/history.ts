import { addDays, type TaskRow } from './learning'
import type { CareerRows } from './progress'

export interface Snapshot {
  day: string
  overall: number | null
  /** Skill name to [claimed, demonstrated]. */
  skills: Record<string, [number, number]>
}

export interface TrendPoint {
  day: string
  overall: number
}

export interface SkillChange {
  name: string
  from: number
  to: number
}

export interface MonthReview {
  month: string
  minutes: number
  previousMinutes: number
  tasksDone: number
  achievements: number
  improved: SkillChange[]
  /** Change in overall progress since the month began, or null without enough history. */
  overallChange: number | null
}

export interface History {
  trend: TrendPoint[]
  month: MonthReview
}

export interface WeekSummary {
  minutes: number
  tasks: number
}

const TREND_DAYS = 90

/** Overall progress for the last 90 days, skipping days with nothing to measure. */
export function progressTrend(snapshots: Snapshot[], today: string, days = TREND_DAYS): TrendPoint[] {
  const from = addDays(today, -(days - 1))
  return snapshots
    .filter((snapshot) => snapshot.day >= from && snapshot.day <= today && snapshot.overall !== null)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((snapshot) => ({ day: snapshot.day, overall: snapshot.overall! }))
}

/** The newest snapshot from before a day, falling back to the oldest one after it. */
function baseline(snapshots: Snapshot[], before: string): Snapshot | null {
  const sorted = [...snapshots].sort((a, b) => a.day.localeCompare(b.day))
  const earlier = sorted.filter((snapshot) => snapshot.day < before)
  return earlier.at(-1) ?? sorted[0] ?? null
}

/** Skills whose demonstrated level rose since a day, biggest rise first. */
export function improvedSkills(
  snapshots: Snapshot[],
  current: { name: string; demonstrated: number }[],
  since: string
): SkillChange[] {
  const start = baseline(snapshots, since)
  if (!start) return []
  return current
    .map((skill) => ({ name: skill.name, from: start.skills[skill.name]?.[1] ?? 0, to: skill.demonstrated }))
    .filter((change) => change.to > change.from)
    .sort((a, b) => b.to - b.from - (a.to - a.from) || a.name.localeCompare(b.name))
}

function minutesBetween(tasks: TaskRow[], from: string, to: string): number {
  return tasks
    .filter((task) => task.status === 'done' && task.kind !== 'other' && task.completedOn >= from && task.completedOn <= to)
    .reduce((sum, task) => sum + task.minutes, 0)
}

export function monthReview(
  snapshots: Snapshot[],
  rows: Pick<CareerRows, 'milestones' | 'goals' | 'projects'>,
  tasks: TaskRow[],
  current: { name: string; demonstrated: number }[],
  overall: number | null,
  today: string
): MonthReview {
  const month = today.slice(0, 7)
  const monthStart = `${month}-01`
  const previousStart = `${addDays(monthStart, -1).slice(0, 7)}-01`
  const inMonth = (date: string): boolean => date.slice(0, 7) === month

  const achievements =
    rows.milestones.filter((m) => m.status === 'done' && inMonth(m.completedOn)).length +
    rows.goals.filter((g) => g.status === 'done' && inMonth(g.completedOn)).length +
    rows.projects.filter((p) => p.status === 'complete' && inMonth(p.completedOn)).length

  const start = baseline(snapshots, monthStart)
  return {
    month,
    minutes: minutesBetween(tasks, monthStart, today),
    previousMinutes: minutesBetween(tasks, previousStart, addDays(monthStart, -1)),
    tasksDone: tasks.filter((task) => task.status === 'done' && inMonth(task.completedOn)).length,
    achievements,
    improved: improvedSkills(snapshots, current, monthStart),
    overallChange: start?.overall != null && overall !== null && start.day !== today ? overall - start.overall : null
  }
}

/** Monday to Sunday of the week before this one. */
export function lastWeekSummary(tasks: TaskRow[], today: string): WeekSummary {
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7
  const thisMonday = addDays(today, -weekday)
  const from = addDays(thisMonday, -7)
  const to = addDays(thisMonday, -1)
  return {
    minutes: minutesBetween(tasks, from, to),
    tasks: tasks.filter((task) => task.status === 'done' && task.completedOn >= from && task.completedOn <= to).length
  }
}
