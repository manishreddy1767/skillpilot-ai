import { addDays, daysBetween, type Learning } from './learning'
import type { Dashboard } from './progress'
import type { Settings } from './settings'

export interface Notice {
  /** Each key is shown once, so nothing repeats. */
  key: string
  title: string
  body: string
}

export interface NoticeInput {
  settings: Settings
  today: string
  /** The time now, as HH:MM. */
  time: string
  dashboard: Dashboard
  learning: Learning
  roles: { id: number; title: string; gaps: string[] }[]
  recommendation: string | null
  alreadySent: Set<string>
  sentToday: number
}

const EVENING = '18:00'
const DEADLINE_DAYS = 3

/** Handles a quiet period that runs past midnight. Equal times mean no quiet hours. */
export function isQuietTime(time: string, start: string, end: string): boolean {
  if (start === end) return false
  return start < end ? time >= start && time < end : time >= start || time < end
}

function mondayOf(date: string): string {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
  return addDays(date, -weekday)
}

/** The notifications to show now, most important first. */
export function dueNotices(input: NoticeInput): Notice[] {
  const { settings, today, time, dashboard, learning, roles, recommendation, alreadySent, sentToday } = input
  const quiet = isQuietTime(time, settings['quietStart'] ?? '', settings['quietEnd'] ?? '')
  const room = Number(settings['notifyDailyLimit'] ?? 0) - sentToday
  if (quiet || room <= 0) return []

  const on = (key: string): boolean => settings[key] === 'on'
  const notices: Notice[] = []

  if (on('notifyDeadlines')) {
    for (const { title, date, overdue } of dashboard.deadlines) {
      if (overdue || daysBetween(today, date) > DEADLINE_DAYS) continue
      const days = daysBetween(today, date)
      const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
      notices.push({ key: `deadline:${title}:${date}`, title: 'Upcoming deadline', body: `${title} is due ${when}.` })
    }
  }

  if (on('notifyTasks') && time >= EVENING && learning.todayTasks.length > 0) {
    const count = learning.todayTasks.length
    notices.push({
      key: `tasks:${today}`,
      title: "Today's learning isn't finished",
      body: `You have ${count} ${count === 1 ? 'task' : 'tasks'} left today.`
    })
  }

  if (on('notifyMilestones')) {
    for (const { title, date } of dashboard.achievements) {
      if (date !== today) continue
      notices.push({ key: `achievement:${title}:${date}`, title: 'Well done', body: `${title}.` })
    }
  }

  if (on('notifySlowdown') && learning.pace === 'down') {
    notices.push({
      key: `slowdown:${mondayOf(today)}`,
      title: 'Your learning has slowed down',
      body: 'You have done less than in the previous two weeks.'
    })
  }

  if (on('notifyGaps')) {
    for (const role of roles) {
      if (role.gaps.length === 0) continue
      notices.push({
        key: `gap:${role.id}:${mondayOf(today)}`,
        title: `A gap for ${role.title}`,
        body: `This role needs ${role.gaps[0]}, which you have not demonstrated yet.`
      })
    }
  }

  if (on('notifyNextStep') && recommendation) {
    notices.push({ key: `next:${recommendation}`, title: 'A next step is ready', body: recommendation })
  }

  return notices.filter((notice) => !alreadySent.has(notice.key)).slice(0, room)
}
