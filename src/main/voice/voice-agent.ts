import { resolveOpen, searchUrl, type StartApp } from '../../shared/desktop-commands'
import { carryOut, isDataIntent, type VoiceApi } from '../../shared/voice-actions'
import { parseVoiceCommand } from '../../shared/voice-commands'
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
  aiBlocked(): string
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

  const intent = parseVoiceCommand(text, deps.today())
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
          return { heard: text, reply: `I couldn't find an app, website, or folder called "${intent.target}".` }
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
        const blocked = deps.aiBlocked()
        if (blocked) {
          return { heard: text, draft: text, reply: `I can't answer that yet, because the AI assistant is off. ${EXAMPLES}` }
        }
        return { heard: text, ask: text, reply: 'Let me ask the assistant.' }
      }
    }
  } catch (error) {
    deps.logError(error)
    return { heard: text, reply: "Sorry, that didn't work. The details are in the error log." }
  }
  return { heard: text, reply: EXAMPLES }
}
