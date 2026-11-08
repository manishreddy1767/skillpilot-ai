import { analyseGap } from '../shared/gap'
import { lastWeekSummary } from '../shared/history'
import { buildLearning, dueReminders } from '../shared/learning'
import { dueNotices, type Notice } from '../shared/notifications'
import { buildDashboard } from '../shared/progress'
import type { AiStore } from './ai/ai-store'
import type { CareerStore } from './db/career-store'

export interface NotifierDeps {
  store: CareerStore
  aiStore: AiStore
  today: string
  time: string
  recommendation: string | null
  send(notice: Notice): void
}

/** Works out what is due, shows it, and records it so it is not repeated. */
export function checkNotifications({ store, aiStore, today, time, recommendation, send }: NotifierDeps): number {
  const dashboard = buildDashboard(store.readCareerRows(), today)
  const settings = aiStore.getSettings()
  const roles = store.listRecords('targetRole').map((role) => {
    const requirements = store.listRecords('roleRequirement', role.id).map(({ values }) => ({
      skillName: values['skillName'] ?? '',
      requiredLevel: Number(values['requiredLevel']),
      importance: Number(values['importance'])
    }))
    const { items } = analyseGap(requirements, dashboard.skills)
    return {
      id: role.id,
      title: role.values['title'] ?? '',
      gaps: items.filter((item) => item.status === 'missing').map((item) => item.skillName)
    }
  })

  const learningRows = store.readLearningRows()
  const notices = dueNotices({
    settings,
    today,
    time,
    dashboard,
    learning: buildLearning(learningRows, today, 0),
    roles,
    recommendation,
    alreadySent: aiStore.notifiedKeys(),
    sentToday: aiStore.notifiedCount(today),
    lastWeek: lastWeekSummary(learningRows.tasks, today),
    reminders: dueReminders(learningRows.tasks, today, time)
  })

  for (const notice of notices) {
    aiStore.markNotified(notice.key, today)
    send(notice)
  }
  return notices.length
}
