import { analyseGap } from '../../shared/gap'
import { matchJob } from '../../shared/job-match'
import { buildDashboard } from '../../shared/progress'
import { findRole } from '../../shared/skills-library'
import type { CareerStore } from '../db/career-store'
import type { AiStore } from './ai-store'

/** What the local AI agent may do. Reading is free; every change is only a suggestion to accept. */
export const AGENT_TOOLS = {
  list_skills: 'Your skills, with claimed and proven levels. Input: nothing.',
  list_tasks: 'Your open tasks and when they are due. Input: nothing.',
  list_jobs: 'Your saved jobs, best match first, with missing skills. Input: nothing.',
  job_match: 'How well you fit one saved job, skill by skill. Input: the job title.',
  role_gap: 'What a role needs and what you are missing, from the skills library. Input: the role title.',
  suggest_task: 'Suggest a task. Input: "title | minutes | YYYY-MM-DD due date".',
  suggest_skill: 'Suggest adding a skill to learn. Input: the skill name.',
  suggest_goal: 'Suggest a goal. Input: the goal title.',
  finish: 'Stop and give your final answer. Input: nothing; put the answer in "answer".'
} as const

export type AgentTool = keyof typeof AGENT_TOOLS

const MAX_RESULT = 1_500

export interface AgentContext {
  store: CareerStore
  aiStore: AiStore
  today: string
}

const clip = (text: string): string => (text.length > MAX_RESULT ? `${text.slice(0, MAX_RESULT)}…` : text)

/** Runs one tool and describes what happened in plain text for the model to read. */
export function runAgentTool(tool: AgentTool, input: string, { store, aiStore, today }: AgentContext): string {
  const skills = () => buildDashboard(store.readCareerRows(), today).skills
  const wanted = input.trim()

  switch (tool) {
    case 'list_skills': {
      const list = skills()
      return list.length ? clip(list.map((s) => `${s.name}: claimed ${s.claimed}, proven ${s.demonstrated}`).join('\n')) : 'No skills yet.'
    }

    case 'list_tasks': {
      const open = store.listRecords('task').filter((task) => task.values['status'] !== 'done')
      return open.length
        ? clip(open.map((task) => `${task.values['title']} (${task.values['minutes']} min, due ${task.values['dueDate'] || 'any time'})`).join('\n'))
        : 'No open tasks.'
    }

    case 'list_jobs': {
      const yours = skills()
      const jobs = store.listRecords('job').filter((job) => !['rejected', 'closed'].includes(job.values['status'] ?? ''))
      if (jobs.length === 0) return 'No saved jobs.'
      return clip(
        jobs
          .map((job) => ({ job, match: matchJob(job.values['title'] ?? '', job.values['description'] ?? '', yours) }))
          .sort((a, b) => b.match.score - a.match.score)
          .map(({ job, match }) => `${job.values['title']} at ${job.values['company'] || 'unknown'}: ${match.score}% match, missing ${match.missing.join(', ') || 'nothing'}`)
          .join('\n')
      )
    }

    case 'job_match': {
      const job = store.listRecords('job').find((item) => (item.values['title'] ?? '').toLowerCase() === wanted.toLowerCase())
        ?? store.listRecords('job').find((item) => (item.values['title'] ?? '').toLowerCase().includes(wanted.toLowerCase()) && wanted)
      if (!job) return `No saved job called "${wanted}".`
      const match = matchJob(job.values['title'] ?? '', job.values['description'] ?? '', skills())
      return clip(
        `${match.score}% match. ` +
          match.skills.map((s) => `${s.name}: ${s.fit}${s.essential ? ', essential' : ''}`).join('; ') +
          (match.experience ? `. Asks for ${match.experience} years.` : '')
      )
    }

    case 'role_gap': {
      const role = findRole(wanted)
      if (!role) return `The skills library has no role like "${wanted}".`
      const requirements = role.needs.map(([skillName, requiredLevel, importance]) => ({ skillName, requiredLevel, importance }))
      const { readiness, items } = analyseGap(requirements, skills())
      return clip(
        `${role.title}: ${readiness}% ready. ` +
          items.map((item) => `${item.skillName} needs ${item.requiredLevel}, ${item.status}`).join('; ')
      )
    }

    case 'suggest_task': {
      const [title = '', minutes = '30', due = today] = wanted.split('|').map((part) => part.trim())
      if (!title) return 'A task needs a title.'
      const safeMinutes = String(Math.min(480, Math.max(5, Number.parseInt(minutes, 10) || 30)))
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(due) && due >= today ? due : today
      aiStore.addProposal('addTask', `Add task: ${title}`, { title, kind: 'learning', minutes: safeMinutes, dueDate, status: 'open' }, [
        { label: 'Task', value: title },
        { label: 'Time', value: `${safeMinutes} minutes` },
        { label: 'Due', value: dueDate },
        { label: 'From', value: 'Agent' }
      ])
      return `Suggested the task "${title}". It waits for approval.`
    }

    case 'suggest_skill': {
      if (!wanted) return 'A skill needs a name.'
      if (store.listRecords('skill').some((s) => (s.values['name'] ?? '').toLowerCase() === wanted.toLowerCase())) {
        return `${wanted} is already in your skills.`
      }
      aiStore.addProposal('addSkill', `Add skill: ${wanted}`, { name: wanted, status: 'learning' }, [
        { label: 'Skill', value: wanted },
        { label: 'From', value: 'Agent' }
      ])
      return `Suggested learning ${wanted}. It waits for approval.`
    }

    case 'suggest_goal': {
      if (!wanted) return 'A goal needs a title.'
      aiStore.addProposal('addGoal', `Add goal: ${wanted}`, { title: wanted }, [
        { label: 'Goal', value: wanted },
        { label: 'From', value: 'Agent' }
      ])
      return `Suggested the goal "${wanted}". It waits for approval.`
    }

    case 'finish':
      return 'Finished.'
  }
}
