import type { Understood } from '../../shared/ai'
import type { JobSite } from '../../shared/job-match'
import { parseVoiceCommand, type VoiceIntent } from '../../shared/voice-commands'

/** Removes a year or date the model added to a search on its own, keeping one you typed yourself. */
export function cleanQuery(query: string, message: string): string {
  return query
    .replace(/\b20\d\d(?:-\d\d-\d\d)?\b/g, (date) => (message.includes(date) ? date : ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The command a request understood by the local AI comes to, so it runs through exactly the same
 * checked actions as a typed or spoken command. Null for answers and suggestions, which are done already.
 */
export function intentFor(understood: Understood, message: string, today: string): VoiceIntent | null {
  const target = understood.target.trim()
  if (!target) return null
  switch (understood.action) {
    case 'open':
      return { kind: 'open', target }
    case 'web_search':
      return { kind: 'search', query: cleanQuery(target, message), site: 'google' }
    case 'youtube_search':
      return { kind: 'search', query: cleanQuery(target, message), site: 'youtube' }
    case 'job_search': {
      const site: JobSite = understood.site === 'none' ? 'linkedin' : understood.site
      const location = understood.location.replace(/,?\s*india$/i, '').trim()
      return { kind: 'jobSearch', site, keywords: target, location }
    }
    case 'go_to': {
      const intent = parseVoiceCommand(`open ${target}`, today)
      return intent.kind === 'navigate' ? intent : null
    }
    default:
      return null
  }
}
