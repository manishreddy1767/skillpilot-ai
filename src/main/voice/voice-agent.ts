import { resolveOpen, searchUrl, type StartApp } from '../../shared/desktop-commands'
import { JOB_SITES, jobSearchUrl } from '../../shared/job-match'
import { carryOut, isDataIntent, type VoiceApi } from '../../shared/voice-actions'
import type { VoiceIntent } from '../../shared/voice-commands'
import type { Result } from '../../shared/career'
import type { Understood } from '../../shared/ai'
import { intentFor } from './interpret'
import { understand } from './understand'
import type { VoiceOutcome } from '../../shared/ipc'
import type { DesktopActions } from './desktop-actions'
import type { Heard } from './speech-host'

export type { VoiceOutcome }

export interface AgentDeps {
  data: VoiceApi
  desktop: DesktopActions
  apps(): Promise<StartApp[]>
  today(): string
  now(): Date
  /** Whether spoken requests act at once. When not, they are only typed out. */
  actNow(): boolean
  /** Why the AI assistant cannot answer, or empty when it can. */
  aiBlocked(): string | Promise<string>
  /** Asks the local AI what a request in your own words means. Left out where only commands should run. */
  interpret?(text: string): Promise<Result<Understood>>
  logError(error: unknown): void
}

/** Below this, free speech is more often noise than words. Command phrases are trusted more. */
export const DICTATION_CONFIDENCE = 0.45

/** The loudest a microphone gets, out of 100, when it hears only a quiet room. */
export const QUIET_PEAK = 2

const EXAMPLES = 'Try "open Chrome", "search for React hooks", "play lofi on YouTube", or "add task read the guide tomorrow".'

const FOLDER_NAMES = {
  downloads: 'Downloads',
  documents: 'Documents',
  desktop: 'Desktop',
  pictures: 'Pictures',
  music: 'Music',
  videos: 'Videos'
}

const label = (site: string): string => site.charAt(0).toUpperCase() + site.slice(1)

/** Turns what was heard into an action, does it, and says what happened. */
export async function respond(heard: Heard, deps: AgentDeps): Promise<VoiceOutcome> {
  const text = heard.text.trim()
  const unclear = !text || heard.source === 'none' || heard.source === 'rejected' || heard.confidence < DICTATION_CONFIDENCE
  // A microphone that never got louder than this was not picking up a voice at all.
  if (unclear && heard.peak !== undefined && heard.peak <= QUIET_PEAK) {
    return {
      heard: '',
      reply:
        "I couldn't hear you. Your microphone is picking up almost no sound. Check it isn't muted or turned down in Settings > System > Sound > Input, and speak a little closer."
    }
  }
  if (!text || heard.source === 'none') {
    return { heard: '', reply: "I didn't hear anything. Press the microphone and speak again." }
  }
  if (heard.source === 'rejected' || (heard.source === 'dictation' && heard.confidence < DICTATION_CONFIDENCE)) {
    return { heard: text, draft: text, reply: `I'm not sure I heard that right. It sounded like "${text}". Please try again.` }
  }
  if (!deps.actNow()) return { heard: text, draft: text, reply: `Heard "${text}". Check it, then press Send.` }

  const { intent, readAs } = understand(text, await deps.apps(), deps.today())
  const outcome = await act(intent, text, deps)
  return readAs ? { ...outcome, reply: `I read that as "${readAs}". ${outcome.reply}` } : outcome
}

/** Carries out one understood request, and says what happened. */
async function act(intent: VoiceIntent, text: string, deps: AgentDeps): Promise<VoiceOutcome> {
  try {
    if (isDataIntent(intent)) return { heard: text, reply: await carryOut(intent, deps.data, deps.today()) }

    switch (intent.kind) {
      case 'navigate':
        return { heard: text, navigate: intent.section, reply: `Opening ${intent.label}.` }

      case 'minimize':
        return { heard: text, minimize: true, reply: 'Minimising to the widget.' }

      case 'open': {
        const target = resolveOpen(intent.target, await deps.apps(), intent.browser)
        if (!target) {
          // A name it does not know is searched for, so "open" always does something useful.
          if (!/^[a-z0-9 .'-]{2,60}$/i.test(intent.target)) {
            return { heard: text, reply: `I couldn't find an app, website, or folder called "${intent.target}".` }
          }
          const note = await deps.desktop.openUrl(searchUrl(intent.target, 'google'), intent.browser)
          return { heard: text, reply: `I don't know an app or site called "${intent.target}", so I searched Google for it.${note}` }
        }
        switch (target.type) {
          case 'app':
            deps.desktop.launchApp(target.app)
            return { heard: text, reply: `Opening ${target.app.name}.` }
          case 'site': {
            const note = await deps.desktop.openUrl(target.url, intent.browser)
            const where = intent.browser && !note ? ` in ${label(intent.browser)}` : ''
            return { heard: text, reply: `Opening ${label(target.name)}${where}.${note}` }
          }
          case 'folder':
            await deps.desktop.openFolder(target.folder)
            return { heard: text, reply: `Opening your ${FOLDER_NAMES[target.folder]} folder.` }
          case 'windowsSettings':
            await deps.desktop.openWindowsSettings()
            return { heard: text, reply: 'Opening Windows settings.' }
        }
        break
      }

      case 'jobSearch': {
        const note = await deps.desktop.openUrl(jobSearchUrl(intent.site, intent.keywords, intent.location), 'chrome')
        const where = intent.location ? ` in ${intent.location}` : ''
        const site = JOB_SITES.find((item) => item.id === intent.site)?.label ?? intent.site
        return { heard: text, reply: `Searching ${site} for ${intent.keywords} jobs${where}.${note}` }
      }

      case 'search': {
        const note = await deps.desktop.openUrl(searchUrl(intent.query, intent.site), intent.browser)
        return { heard: text, reply: `Searching ${label(intent.site)} for "${intent.query}".${note}` }
      }

      case 'volume':
        deps.desktop.volume(intent.change)
        return { heard: text, reply: intent.change === 'mute' ? 'Toggling mute.' : `Turning the volume ${intent.change}.` }

      case 'lock':
        deps.desktop.lock()
        return { heard: text, reply: 'Locking your computer.' }

      case 'time':
        return {
          heard: text,
          reply: `It's ${deps.now().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}.`
        }

      case 'date':
        return {
          heard: text,
          reply: `Today is ${deps.now().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`
        }

      case 'ask': {
        const blocked = await deps.aiBlocked()
        if (blocked) {
          return { heard: text, draft: text, reply: `I can't answer that yet, because the local AI is not ready. ${EXAMPLES}` }
        }
        if (!deps.interpret) return { heard: text, ask: text, reply: 'Let me ask the assistant.' }
        // Anything that is not a command is understood by the local AI, then carried out.
        const result = await deps.interpret(text)
        if (!result.ok) return { heard: text, reply: result.message }
        const understood = result.value
        if (understood.action === 'answer') return { heard: text, reply: understood.answer, answered: true }
        if (understood.action.startsWith('add_')) {
          return {
            heard: text,
            reply: `I suggested adding "${understood.target}". Accept it in the Assistant to save it.`,
            suggested: true
          }
        }
        const next = intentFor(understood, text, deps.today())
        if (!next) return { heard: text, reply: `I'm not sure what to do with that. ${EXAMPLES}` }
        return act(next, text, deps)
      }
    }
  } catch (error) {
    deps.logError(error)
    return { heard: text, reply: "Sorry, that didn't work. The details are in the error log." }
  }
  return { heard: text, reply: EXAMPLES }
}
