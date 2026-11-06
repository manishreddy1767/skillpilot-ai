import type { AiLogEntry, AiStatus, ChatMessage, GapReport, Proposal } from '../shared/ai'
import { validateFields, type Result } from '../shared/career'
import { analyseGap, type GapAnalysis } from '../shared/gap'
import { buildDashboard } from '../shared/progress'
import { isLocalAddress, settingFields, type Settings } from '../shared/settings'
import { AiService, applyProposal } from './ai/ai-service'
import type { AiStore } from './ai/ai-store'
import type { KeyStore } from './ai/key-store'
import { AiError, createClaudeProvider, createOllamaProvider, type AiProvider } from './ai/providers'
import type { CareerStore } from './db/career-store'

export interface AiHandlerDeps {
  getStores(): { store: CareerStore; aiStore: AiStore } | null
  keys: KeyStore
  notifyOverview(): void
  logError(error: unknown): void
  today(): string
  /** Puts changed settings into effect. */
  applySettings(settings: Settings): void
  /** Replaceable so tests can stand in for a real provider. */
  makeClaude?: typeof createClaudeProvider
}

const UNAVAILABLE = 'Your data could not be opened. Restart the app, and see the error log if it continues.'
const MAX_MESSAGE_LENGTH = 4000
const MAX_KEY_LENGTH = 500

const failure = (message: string): { ok: false; message: string } => ({ ok: false, message })
const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0

export function createAiHandlers(deps: AiHandlerDeps) {
  const { getStores, keys, notifyOverview, logError, today, applySettings } = deps
  const makeClaude = deps.makeClaude ?? createClaudeProvider

  const whyBlocked = (settings: Settings): string => {
    if (settings['aiProvider'] === 'off') return 'AI is off. Choose a provider in Settings.'
    if (settings['aiProvider'] === 'claude' && !keys.hasKey()) return 'Add your Anthropic API key in Settings.'
    return ''
  }

  const provider = async (aiStore: AiStore): Promise<AiProvider> => {
    const settings = aiStore.getSettings()
    const blocked = whyBlocked(settings)
    if (blocked) throw new AiError(blocked)
    if (settings['aiProvider'] === 'ollama') {
      return createOllamaProvider(settings['ollamaUrl'] ?? '', settings['ollamaModel'] ?? '')
    }
    const key = await keys.read()
    if (!key) throw new AiError('The saved API key could not be read. Please add it again in Settings.')
    return makeClaude(key, settings['claudeModel'] ?? '')
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

    getAiStatus: (): Result<AiStatus> =>
      sync(({ aiStore }) => {
        const settings = aiStore.getSettings()
        const provider = settings['aiProvider'] ?? 'off'
        const model = provider === 'ollama' ? settings['ollamaModel'] : settings['claudeModel']
        return {
          ok: true,
          value: { provider, model: model ?? '', hasKey: keys.hasKey(), blocked: whyBlocked(settings) }
        }
      }),

    saveApiKey: async (input: unknown): Promise<Result<boolean>> => {
      const key = typeof input === 'string' ? input.trim() : ''
      if (!key || key.length > MAX_KEY_LENGTH || /\s/.test(key)) return failure('That does not look like an API key.')
      try {
        await keys.save(key)
        return { ok: true, value: true }
      } catch (error) {
        // Logged without the key: the error comes from the encryptor, never from the value.
        logError(error)
        return failure('The key could not be saved securely, so it was not stored.')
      }
    },

    removeApiKey: (): Result<boolean> => {
      keys.remove()
      return { ok: true, value: true }
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
