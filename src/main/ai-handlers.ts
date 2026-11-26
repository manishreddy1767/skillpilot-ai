import type { AgentRun, AiLogEntry, AiStatus, ChatMessage, GapReport, Proposal, Understood } from '../shared/ai'
import { validateFields, type Result } from '../shared/career'
import { analyseGap, type GapAnalysis } from '../shared/gap'
import { requirementsFor, roadmapFromGaps } from '../shared/library-plans'
import type { ResumeData, ResumeSuggestion } from '../shared/resume'
import { libraryRole } from '../shared/skills-library'
import { buildDashboard } from '../shared/progress'
import { isLocalAddress, settingFields, type Settings } from '../shared/settings'
import { AiService, applyProposal } from './ai/ai-service'
import type { AiStore } from './ai/ai-store'
import { AiError, createOllamaProvider, listLocalModels, type AiProvider } from './ai/providers'
import type { CareerStore } from './db/career-store'

export interface AiHandlerDeps {
  getStores(): { store: CareerStore; aiStore: AiStore } | null
  notifyOverview(): void
  logError(error: unknown): void
  today(): string
  /** Puts changed settings into effect. */
  applySettings(settings: Settings): void
  /** Replaceable so tests can stand in for the local model. */
  makeProvider?: typeof createOllamaProvider
}

const UNAVAILABLE = 'Your data could not be opened. Restart the app, and see the error log if it continues.'
const MAX_MESSAGE_LENGTH = 4000

const failure = (message: string): { ok: false; message: string } => ({ ok: false, message })
const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0

export function createAiHandlers(deps: AiHandlerDeps) {
  const { getStores, notifyOverview, logError, today, applySettings } = deps
  const makeProvider = deps.makeProvider ?? createOllamaProvider

  const whyBlocked = (settings: Settings): string =>
    settings['aiProvider'] === 'ollama' ? '' : 'The local AI is off. Turn it on in Settings.'

  /** Only ever the local model, at a local address. */
  const provider = async (aiStore: AiStore): Promise<AiProvider> => {
    const settings = aiStore.getSettings()
    const blocked = whyBlocked(settings)
    if (blocked) throw new AiError(blocked)
    return makeProvider(settings['ollamaUrl'] ?? '', settings['ollamaModel'] ?? '')
  }

  const sync = <T>(work: (stores: { store: CareerStore; aiStore: AiStore }) => Result<T>): Result<T> => {
    const stores = getStores()
    if (!stores) return failure(UNAVAILABLE)
    try {
      return work(stores)
    } catch (error) {
      logError(error)
      return failure('That could not be completed. Your data is unchanged.')
    }
  }

  const ai = async <T>(work: (service: AiService) => Promise<T>): Promise<Result<T>> => {
    const stores = getStores()
    if (!stores) return failure(UNAVAILABLE)
    try {
      const service = new AiService({ ...stores, today, provider: () => provider(stores.aiStore) })
      return { ok: true, value: await work(service) }
    } catch (error) {
      if (error instanceof AiError) return failure(error.message)
      logError(error)
      return failure('The AI request failed. Please try again.')
    }
  }

  return {
    getSettings: (): Result<Settings> => sync(({ aiStore }) => ({ ok: true, value: aiStore.getSettings() })),

    saveSettings: (input: unknown): Result<Settings> =>
      sync(({ aiStore }) => {
        const { values, errors } = validateFields(settingFields, input)
        if (values['ollamaUrl'] && !isLocalAddress(values['ollamaUrl'])) {
          errors['ollamaUrl'] = 'The address must be on this laptop, such as http://localhost:11434'
        }
        if (Object.keys(errors).length) return { ok: false, message: 'Please fix the highlighted fields.', errors }
        const value = aiStore.saveSettings(values)
        applySettings(value)
        return { ok: true, value }
      }),

    getAiStatus: async (): Promise<Result<AiStatus>> => {
      const stores = getStores()
      if (!stores) return failure(UNAVAILABLE)
      const settings = stores.aiStore.getSettings()
      const localModels = await listLocalModels(settings['ollamaUrl'] ?? '')
      const model = settings['ollamaModel'] ?? ''
      let blocked = whyBlocked(settings)
      if (!blocked && localModels === null) blocked = 'Ollama is not running. Start Ollama on this laptop to use the local AI.'
      if (!blocked && localModels && !localModels.includes(model) && !localModels.includes(`${model}:latest`)) {
        blocked = `The model "${model}" is not installed in Ollama. Choose one of: ${localModels.join(', ') || 'none installed'}.`
      }
      return { ok: true, value: { provider: settings['aiProvider'] ?? 'off', model, blocked, localModels } }
    },

    getChat: (): Result<ChatMessage[]> => sync(({ aiStore }) => ({ ok: true, value: aiStore.listChat() })),

    clearChat: (): Result<boolean> =>
      sync(({ aiStore }) => {
        aiStore.clearChat()
        return { ok: true, value: true }
      }),

    sendChat: (input: unknown): Promise<Result<ChatMessage[]>> => {
      const message = typeof input === 'string' ? input.trim() : ''
      if (!message) return Promise.resolve(failure('Type a message first.'))
      if (message.length > MAX_MESSAGE_LENGTH) return Promise.resolve(failure('That message is too long.'))
      return ai((service) => service.chat(message))
    },

    /**
     * Suggestions from SkillPilot's own skills library, made offline with no AI: a role's requirements,
     * or a roadmap for its gaps. Like AI suggestions, nothing is saved until accepted.
     */
    suggestFromLibrary: (roleId: unknown, libraryRoleId: unknown, what: unknown): Result<number> =>
      sync(({ store, aiStore }) => {
        if (!isId(roleId)) return failure('Unknown role.')
        const role = store.listRecords('targetRole').find((item) => item.id === roleId)
        if (!role) return failure('That target role no longer exists.')
        const title = role.values['title'] ?? ''
        const requirements = store.listRecords('roleRequirement', roleId).map(({ values }) => ({
          skillName: values['skillName'] ?? '',
          requiredLevel: Number(values['requiredLevel']),
          importance: Number(values['importance'])
        }))

        if (what === 'requirements') {
          const library = typeof libraryRoleId === 'string' ? libraryRole(libraryRoleId) : null
          if (!library) return failure('Choose a role from the skills library.')
          const needs = requirementsFor(library, requirements.map((item) => item.skillName))
          for (const need of needs) {
            const payload = { roleId, skillName: need.skillName, requiredLevel: String(need.requiredLevel), importance: String(need.importance) }
            aiStore.addProposal('addRoleRequirement', `Add requirement: ${need.skillName}`, payload, [
              { label: 'Role', value: title },
              { label: 'Skill', value: need.skillName },
              { label: 'Level needed', value: String(need.requiredLevel) },
              { label: 'Importance', value: `${need.importance} of 3` },
              { label: 'From', value: `Skills library: ${library.title}` }
            ])
          }
          return { ok: true, value: needs.length }
        }

        if (what === 'roadmap') {
          if (requirements.length === 0) return failure('Add requirements first, so there are gaps to plan for.')
          const { skills } = buildDashboard(store.readCareerRows(), today())
          const weeklyHours = (Number(aiStore.getSettings()['dailyMinutes'] ?? 60) * 6) / 60
          const plan = roadmapFromGaps(title, analyseGap(requirements, skills).items, weeklyHours)
          if (plan.items.length === 0) return failure('Every requirement is already met, so there is nothing to plan.')
          const hours = plan.items.reduce((sum, item) => sum + item.effortHours, 0)
          aiStore.addProposal('addRoadmap', `Add roadmap: ${plan.title}`, plan, [
            { label: 'Roadmap', value: plan.title },
            { label: 'Topics', value: plan.items.map((item) => `Week ${item.week}: ${item.title}`).join('; ') },
            { label: 'Estimated effort', value: `${hours} hours` },
            { label: 'From', value: 'Skills library' }
          ])
          return { ok: true, value: 1 }
        }
        return failure('Unknown suggestion type.')
      }),

    /** What a request in your own words means, for the app to carry out. */
    understandRequest: (input: unknown): Promise<Result<Understood>> => {
      const message = typeof input === 'string' ? input.trim() : ''
      if (!message) return Promise.resolve(failure('Type a message first.'))
      if (message.length > MAX_MESSAGE_LENGTH) return Promise.resolve(failure('That message is too long.'))
      return ai(async (service) => {
        const understood = await service.understandRequest(message)
        if (understood.action.startsWith('add_')) notifyOverview()
        return understood
      })
    },

    /** The local AI works towards a goal with SkillPilot's tools, suggesting changes for approval. */
    runAgent: (input: unknown): Promise<Result<AgentRun>> => {
      const goal = typeof input === 'string' ? input.trim() : ''
      if (!goal) return Promise.resolve(failure('Say what you want help with first.'))
      if (goal.length > MAX_MESSAGE_LENGTH) return Promise.resolve(failure('That goal is too long.'))
      return ai(async (service) => {
        const run = await service.runAgent(goal)
        notifyOverview()
        return run
      })
    },

    getGapAnalysis: (roleId: unknown): Result<{ analysis: GapAnalysis; report: GapReport | null }> =>
      sync(({ store, aiStore }) => {
        if (!isId(roleId)) return failure('Unknown role.')
        const requirements = store.listRecords('roleRequirement', roleId).map(({ values }) => ({
          skillName: values['skillName'] ?? '',
          requiredLevel: Number(values['requiredLevel']),
          importance: Number(values['importance'])
        }))
        const { skills } = buildDashboard(store.readCareerRows(), today())
        return { ok: true, value: { analysis: analyseGap(requirements, skills), report: aiStore.gapReport(roleId) } }
      }),

    draftRequirements: (roleId: unknown): Promise<Result<number>> =>
      isId(roleId) ? ai((service) => service.draftRequirements(roleId)) : Promise.resolve(failure('Unknown role.')),

    createGapReport: (roleId: unknown): Promise<Result<GapReport>> =>
      isId(roleId)
        ? ai(async (service) => {
            const report = await service.gapReport(roleId)
            notifyOverview()
            return report
          })
        : Promise.resolve(failure('Unknown role.')),

    generateRoadmap: (roleId: unknown): Promise<Result<boolean>> =>
      isId(roleId)
        ? ai(async (service) => {
            await service.generateRoadmap(roleId)
            return true
          })
        : Promise.resolve(failure('Unknown role.')),

    suggestProjects: (): Promise<Result<number>> => ai((service) => service.suggestProjects()),

    /** Clearer wording for a resume from the local AI, checked for honesty, as suggestions only. */
    polishResume: (
      resume: ResumeData,
      job: { title: string; description: string } | null,
      skills: string[]
    ): Promise<Result<ResumeSuggestion[]>> => ai((service) => service.polishResume(resume, job, skills)),

    suggestTasks: (): Promise<Result<number>> => {
      const stores = getStores()
      const minutes = Number(stores?.aiStore.getSettings()['dailyMinutes'] ?? 60)
      return ai((service) => service.suggestTasks(minutes))
    },

    listProposals: (): Result<Proposal[]> => sync(({ aiStore }) => ({ ok: true, value: aiStore.listProposals() })),

    acceptProposal: (id: unknown): Result<boolean> =>
      sync(({ store, aiStore }) => {
        if (!isId(id)) return failure('Unknown suggestion.')
        const pending = aiStore.pendingProposal(id)
        if (!pending) return failure('That suggestion has already been handled.')
        try {
          const result = applyProposal(store, pending.kind, pending.payload)
          if (!result.ok) return result
        } catch {
          // For example a skill that already exists, or a role since deleted.
          return failure('That suggestion could not be added. It may already exist.')
        }
        aiStore.resolveProposal(id, 'accepted')
        notifyOverview()
        return { ok: true, value: true }
      }),

    rejectProposal: (id: unknown): Result<boolean> =>
      sync(({ aiStore }) => {
        if (!isId(id)) return failure('Unknown suggestion.')
        return { ok: true, value: aiStore.resolveProposal(id, 'rejected') }
      }),

    getAiLog: (): Result<AiLogEntry[]> => sync(({ aiStore }) => ({ ok: true, value: aiStore.listLog() }))
  }
}

export type AiHandlers = ReturnType<typeof createAiHandlers>
