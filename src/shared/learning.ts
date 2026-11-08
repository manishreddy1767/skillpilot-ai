/** Task and roadmap measures. All dates are YYYY-MM-DD strings in local time. */

export interface TaskRow {
  id: number
  title: string
  kind: string
  dueDate: string
  minutes: number
  status: string
  completedOn: string
  remindAt?: string
}

export interface RoadmapRow {
  id: number
  title: string
  startDate: string
}

export interface RoadmapItemRow {
  roadmapId: number
  title: string
  week: number
  effortHours: number
  status: string
}

export interface LearningRows {
  tasks: TaskRow[]
  roadmaps: RoadmapRow[]
  items: RoadmapItemRow[]
}

export type Pace = 'none' | 'up' | 'steady' | 'down'

export interface RoadmapSummary {
  id: number
  title: string
  done: number
  total: number
  percent: number
  next: string | null
  /** The week the roadmap has reached, or null before it starts. */
  currentWeek: number | null
  weeksBehind: number
  /** The week number of the next topic, used when catching up. */
  nextWeek: number | null
  hoursLeft: number
}

export interface TodayTask {
  id: number
  title: string
  minutes: number
  overdue: boolean
}

export interface Learning {
  streak: number
  minutesThisWeek: number
  weeklyTarget: number
  minutesThisMonth: number
  monthlyTarget: number
  pace: Pace
  todayTasks: TodayTask[]
  plannedMinutesToday: number
  roadmaps: RoadmapSummary[]
}

const DAY = 86_400_000

const toTime = (date: string): number => Date.parse(`${date}T00:00:00Z`)
const fromTime = (time: number): string => new Date(time).toISOString().slice(0, 10)

export function addDays(date: string, days: number): string {
  return fromTime(toTime(date) + days * DAY)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toTime(to) - toTime(from)) / DAY)
}

function startOfWeek(date: string): string {
  // Monday is the first day. getUTCDay gives Sunday as 0.
  const weekday = (new Date(toTime(date)).getUTCDay() + 6) % 7
  return addDays(date, -weekday)
}

const countsAsLearning = (task: TaskRow): boolean => task.status === 'done' && task.kind !== 'other' && Boolean(task.completedOn)

/** Consecutive days with finished learning. Today not being done yet does not break it. */
export function learningStreak(tasks: TaskRow[], today: string): number {
  const days = new Set(tasks.filter(countsAsLearning).map((task) => task.completedOn))
  let day = days.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (days.has(day)) {
    streak++
    day = addDays(day, -1)
  }
  return streak
}

function minutesBetween(tasks: TaskRow[], from: string, to: string): number {
  return tasks
    .filter((task) => countsAsLearning(task) && task.completedOn >= from && task.completedOn <= to)
    .reduce((sum, task) => sum + task.minutes, 0)
}

/** Compares the last 14 days with the 14 before. */
export function learningPace(tasks: TaskRow[], today: string): Pace {
  const recent = minutesBetween(tasks, addDays(today, -13), today)
  const earlier = minutesBetween(tasks, addDays(today, -27), addDays(today, -14))
  if (recent === 0 && earlier === 0) return 'none'
  if (recent > earlier * 1.2) return 'up'
  if (recent < earlier * 0.7) return 'down'
  return 'steady'
}

export function summariseRoadmap(roadmap: RoadmapRow, allItems: RoadmapItemRow[], today: string): RoadmapSummary {
  const items = allItems.filter((item) => item.roadmapId === roadmap.id).sort((a, b) => a.week - b.week)
  const open = items.filter((item) => item.status !== 'done')
  const done = items.length - open.length
  const next = open[0] ?? null
  const started = roadmap.startDate && daysBetween(roadmap.startDate, today) >= 0
  const currentWeek = started ? Math.floor(daysBetween(roadmap.startDate, today) / 7) + 1 : null

  return {
    id: roadmap.id,
    title: roadmap.title,
    done,
    total: items.length,
    percent: items.length ? Math.round((done / items.length) * 100) : 0,
    next: next?.title ?? null,
    currentWeek,
    weeksBehind: next && currentWeek ? Math.max(0, currentWeek - next.week) : 0,
    nextWeek: next?.week ?? null,
    hoursLeft: open.reduce((sum, item) => sum + item.effortHours, 0)
  }
}

/** A start date that places the next topic in the current week, so the plan shifts to match reality. */
export function catchUpStart(nextWeek: number, today: string): string {
  return addDays(today, -(nextWeek - 1) * 7)
}

/** Open tasks due today with a reminder time that has been reached. */
export function dueReminders(tasks: TaskRow[], today: string, time: string): { id: number; title: string }[] {
  return tasks
    .filter((task) => task.status !== 'done' && task.dueDate === today && task.remindAt && task.remindAt <= time)
    .map((task) => ({ id: task.id, title: task.title }))
}

export function buildLearning(rows: LearningRows, today: string, weeklyTarget: number, monthlyTarget = 0): Learning {
  const open = rows.tasks.filter((task) => task.status !== 'done')
  const todayTasks = open
    .filter((task) => task.dueDate && task.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id)
    .map((task) => ({ id: task.id, title: task.title, minutes: task.minutes, overdue: task.dueDate < today }))

  return {
    streak: learningStreak(rows.tasks, today),
    minutesThisWeek: minutesBetween(rows.tasks, startOfWeek(today), today),
    weeklyTarget,
    minutesThisMonth: minutesBetween(rows.tasks, `${today.slice(0, 7)}-01`, today),
    monthlyTarget,
    pace: learningPace(rows.tasks, today),
    todayTasks,
    plannedMinutesToday: todayTasks.reduce((sum, task) => sum + task.minutes, 0),
    roadmaps: rows.roadmaps.map((roadmap) => summariseRoadmap(roadmap, rows.items, today))
  }
}
