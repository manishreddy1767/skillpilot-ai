import { openVocabulary, resolveOpen, type StartApp } from '../../shared/desktop-commands'
import { LIBRARY_SKILLS } from '../../shared/skills-library'
import { correctSpelling, wordsOf } from '../../shared/spelling'
import { FIXED_PHRASES, SPOKEN_SECTION_NAMES, parseVoiceCommand, type VoiceIntent } from '../../shared/voice-commands'

const COMMAND_VERBS = [
  'open', 'launch', 'start', 'search', 'google', 'play', 'watch', 'find', 'look', 'add', 'create', 'mark', 'complete',
  'finish', 'remind', 'switch', 'minimise', 'minimize', 'volume', 'increase', 'decrease', 'lower', 'raise', 'mute',
  'unmute', 'lock', 'skill', 'goal', 'linkedin', 'naukri', 'indeed', 'foundit', 'youtube', 'chrome', 'edge', 'firefox'
]

/** Every word a command may contain: verbs, apps, sites, folders, sections, and skills. */
export function commandWords(apps: StartApp[]): Set<string> {
  return wordsOf([
    ...COMMAND_VERBS,
    ...openVocabulary(apps),
    ...SPOKEN_SECTION_NAMES,
    ...FIXED_PHRASES,
    ...LIBRARY_SKILLS.flatMap((skill) => [skill.name, ...skill.aliases])
  ])
}

/** Whether an intent is something SkillPilot can carry out as it stands. */
const understood = (intent: VoiceIntent, apps: StartApp[]): boolean =>
  intent.kind !== 'ask' && !(intent.kind === 'open' && !resolveOpen(intent.target, apps, intent.browser))

/**
 * What a message asks for. A message that already makes sense is taken exactly as written, so task
 * titles and names are never changed. Only when it does not is spelling corrected, and then only if
 * the corrected message makes sense; `readAs` says how it was read.
 */
export function understand(text: string, apps: StartApp[], today: string): { intent: VoiceIntent; readAs?: string } {
  const intent = parseVoiceCommand(text, today)
  if (understood(intent, apps)) return { intent }
  const fixed = correctSpelling(text, commandWords(apps))
  if (!fixed.changed) return { intent }
  const corrected = parseVoiceCommand(fixed.text, today)
  return understood(corrected, apps) ? { intent: corrected, readAs: fixed.text } : { intent }
}
