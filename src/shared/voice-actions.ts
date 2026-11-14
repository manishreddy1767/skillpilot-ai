import type { FieldValues, Result, StoredRecord } from './career'
import { matchTitle, type VoiceIntent } from './voice-commands'

/** The career data a spoken command may read or change. Results may be returned directly or awaited. */
export interface VoiceApi {
  listRecords(kind: 'task' | 'skill' | 'goal'): Result<StoredRecord[]> | Promise<Result<StoredRecord[]>>
  saveRecord(kind: 'task' | 'skill' | 'goal', id: null, values: FieldValues): Result<StoredRecord> | Promise<Result<StoredRecord>>
  completeTask(id: number): Result<boolean> | Promise<Result<boolean>>
}

export type DataIntent = Extract<VoiceIntent, { kind: 'addTask' | 'addSkill' | 'addGoal' | 'completeTask' | 'whatsDue' }>

export const isDataIntent = (intent: VoiceIntent): intent is DataIntent =>
  ['addTask', 'addSkill', 'addGoal', 'completeTask', 'whatsDue'].includes(intent.kind)

/** Today on this laptop's clock, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** "today", "tomorrow", or the weekday and date. */
export function dayName(date: string, today: string): string {
  if (date === today) return 'today'
  const [year, month, day] = date.split('-').map(Number)
  const when = new Date(year!, month! - 1, day!)
  const [ty, tm, td] = today.split('-').map(Number)
  const ahead = Math.round((when.getTime() - new Date(ty!, tm! - 1, td!).getTime()) / 86_400_000)
  if (ahead === 1) return 'tomorrow'
  return when.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

const openTasks = async (api: VoiceApi): Promise<StoredRecord[] | string> => {
  const result = await api.listRecords('task')
  if (!result.ok) return result.message
  return result.value.filter((task) => task.values['status'] !== 'done')
}

const exists = async (api: VoiceApi, kind: 'skill' | 'goal', key: string, value: string): Promise<boolean> => {
  const result = await api.listRecords(kind)
  return result.ok && result.value.some((record) => (record.values[key] ?? '').toLowerCase() === value.toLowerCase())
}

/** Carries out one spoken change to career data straight away, and says what happened in a sentence. */
export async function carryOut(intent: DataIntent, api: VoiceApi, today: string): Promise<string> {
  switch (intent.kind) {
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
