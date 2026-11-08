import type { StoredRecord } from '../../shared/career'
import type { SkillPilotApi } from '../../shared/ipc'
import { matchTitle, type SectionId, type VoiceIntent } from '../../shared/voice-commands'

export interface VoiceContext {
  api: SkillPilotApi
  navigate(section: SectionId): void
  today: string
}

/** Today on this laptop's clock, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const dayName = (date: string, today: string): string => {
  if (date === today) return 'today'
  const [year, month, day] = date.split('-').map(Number)
  const when = new Date(year!, month! - 1, day!)
  const [ty, tm, td] = today.split('-').map(Number)
  const ahead = Math.round((when.getTime() - new Date(ty!, tm! - 1, td!).getTime()) / 86_400_000)
  if (ahead === 1) return 'tomorrow'
  return when.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

const openTasks = async (api: SkillPilotApi): Promise<StoredRecord[] | string> => {
  const result = await api.listRecords('task')
  if (!result.ok) return result.message
  return result.value.filter((task) => task.values['status'] !== 'done')
}

const exists = async (api: SkillPilotApi, kind: 'skill' | 'goal', key: string, value: string): Promise<boolean> => {
  const result = await api.listRecords(kind)
  return result.ok && result.value.some((record) => (record.values[key] ?? '').toLowerCase() === value.toLowerCase())
}

/**
 * Carries out one spoken command straight away and says what happened, in a sentence.
 * Questions for the assistant are not handled here.
 */
export async function carryOut(intent: Exclude<VoiceIntent, { kind: 'ask' }>, { api, navigate, today }: VoiceContext): Promise<string> {
  switch (intent.kind) {
    case 'navigate':
      navigate(intent.section)
      return `Opened ${intent.label}.`

    case 'minimize':
      api.minimizeToWidget()
      return 'Minimised to the widget.'

    case 'addTask': {
      const result = await api.saveRecord('task', null, { title: intent.title, dueDate: intent.dueDate })
      return result.ok ? `Added the task "${intent.title}" for ${dayName(intent.dueDate, today)}.` : result.message
    }

    case 'addSkill': {
      if (await exists(api, 'skill', 'name', intent.name)) return `${intent.name} is already in your skills.`
      const result = await api.saveRecord('skill', null, { name: intent.name })
      return result.ok ? `Added ${intent.name} to your skills.` : result.message
    }

    case 'addGoal': {
      if (await exists(api, 'goal', 'title', intent.title)) return `"${intent.title}" is already one of your goals.`
      const result = await api.saveRecord('goal', null, { title: intent.title })
      return result.ok ? `Added the goal "${intent.title}".` : result.message
    }

    case 'completeTask': {
      const tasks = await openTasks(api)
      if (typeof tasks === 'string') return tasks
      const index = matchTitle(intent.query, tasks.map((task) => task.values['title'] ?? ''))
      if (index === null) return `No single open task matches "${intent.query}", so nothing was ticked off.`
      const task = tasks[index]!
      const result = await api.completeTask(task.id)
      return result.ok ? `Marked "${task.values['title']}" as done.` : result.message
    }

    case 'whatsDue': {
      const tasks = await openTasks(api)
      if (typeof tasks === 'string') return tasks
      const due = tasks.filter((task) => (task.values['dueDate'] ?? '') !== '' && task.values['dueDate']! <= today)
      if (due.length === 0) return 'Nothing is due today.'
      return `Due today: ${due.map((task) => task.values['title']).join(', ')}.`
    }
  }
}
