/**
 * What spoken "open ..." and "search ..." mean outside SkillPilot: apps, websites, and folders.
 * Pure functions, so the main process only ever launches what these return.
 */

export type Browser = 'chrome' | 'edge' | 'firefox'
export const BROWSERS: Browser[] = ['chrome', 'edge', 'firefox']

/** An app from the Windows Start menu, with the ID Windows launches it by. */
export interface StartApp {
  name: string
  id: string
}

export type Folder = 'downloads' | 'documents' | 'desktop' | 'pictures' | 'music' | 'videos'

export type OpenTarget =
  | { type: 'app'; app: StartApp }
  | { type: 'site'; name: string; url: string }
  | { type: 'folder'; folder: Folder }
  | { type: 'windowsSettings' }

/** Websites by the name people say. */
export const SITES: Record<string, string> = {
  youtube: 'https://www.youtube.com',
  google: 'https://www.google.com',
  gmail: 'https://mail.google.com',
  'google drive': 'https://drive.google.com',
  'google docs': 'https://docs.google.com',
  'google maps': 'https://maps.google.com',
  maps: 'https://maps.google.com',
  github: 'https://github.com',
  linkedin: 'https://www.linkedin.com',
  'stack overflow': 'https://stackoverflow.com',
  stackoverflow: 'https://stackoverflow.com',
  'chat gpt': 'https://chatgpt.com',
  chatgpt: 'https://chatgpt.com',
  claude: 'https://claude.ai',
  'whatsapp web': 'https://web.whatsapp.com',
  whatsapp: 'https://web.whatsapp.com',
  facebook: 'https://www.facebook.com',
  instagram: 'https://www.instagram.com',
  twitter: 'https://x.com',
  netflix: 'https://www.netflix.com',
  amazon: 'https://www.amazon.in',
  flipkart: 'https://www.flipkart.com',
  wikipedia: 'https://www.wikipedia.org',
  leetcode: 'https://leetcode.com',
  'leet code': 'https://leetcode.com',
  hackerrank: 'https://www.hackerrank.com',
  'hacker rank': 'https://www.hackerrank.com',
  coursera: 'https://www.coursera.org',
  udemy: 'https://www.udemy.com',
  'free code camp': 'https://www.freecodecamp.org',
  w3schools: 'https://www.w3schools.com',
  'w3 schools': 'https://www.w3schools.com',
  'mdn': 'https://developer.mozilla.org',
  spotify: 'https://open.spotify.com'
}

const FOLDERS: Record<string, Folder> = {
  downloads: 'downloads',
  'download folder': 'downloads',
  'downloads folder': 'downloads',
  documents: 'documents',
  'documents folder': 'documents',
  'my documents': 'documents',
  desktop: 'desktop',
  'desktop folder': 'desktop',
  pictures: 'pictures',
  photos: 'pictures',
  'pictures folder': 'pictures',
  music: 'music',
  'music folder': 'music',
  videos: 'videos',
  'videos folder': 'videos'
}

const TLDS = ['com', 'org', 'net', 'in', 'io', 'ai', 'dev', 'edu', 'gov', 'co', 'app', 'me', 'tv']

/** Extra names people use for common apps. */
const APP_NICKNAMES: Record<string, string[]> = {
  'visual studio code': ['vs code', 'vscode', 'code editor'],
  'file explorer': ['explorer', 'files', 'this pc', 'my computer'],
  'command prompt': ['cmd'],
  'microsoft edge': ['edge'],
  'google chrome': ['chrome', 'browser'],
  'mozilla firefox': ['firefox'],
  calculator: ['calc'],
  'microsoft teams': ['teams'],
  'task manager': ['task manager']
}

const VENDORS = /^(?:google|microsoft|mozilla|adobe|apple) /

const plain = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Every name an app can be called by. */
export function appAliases(name: string): string[] {
  const full = plain(name)
  const names = new Set([full, full.replace(VENDORS, ''), ...(APP_NICKNAMES[full] ?? [])])
  return [...names].filter(Boolean)
}

/** "example dot com" or "example com" as a web address, when it clearly is one. */
export function spokenDomain(target: string): string | null {
  const words = plain(target.replace(/\./g, ' dot ')).split(' ')
  const tld = words.at(-1)!
  if (!TLDS.includes(tld)) return null
  const before = words.slice(0, -1)
  const hasDot = before.at(-1) === 'dot'
  const name = hasDot ? before.slice(0, -1) : before
  if (name.length === 0 || (!hasDot && name.length > 1)) return null
  const host = name.filter((word) => word !== 'dot').join('')
  if (!/^[a-z0-9-]+$/.test(host)) return null
  return `https://${host}.${tld}`
}

function findApp(target: string, apps: StartApp[], loose: boolean): StartApp | null {
  const exact = apps.filter((app) => appAliases(app.name).includes(target))
  if (exact.length > 0) return exact.sort((a, b) => a.name.length - b.name.length)[0]!
  if (!loose || target.length < 3) return null
  const pattern = new RegExp(`(?:^| )${target.replace(/[^a-z0-9 ]/g, '')}(?: |$)`)
  const partial = apps.filter((app) => appAliases(app.name).some((alias) => pattern.test(alias)))
  return partial.sort((a, b) => a.name.length - b.name.length)[0] ?? null
}

/**
 * What "open <target>" means. Installed apps win over websites of the same name, unless a browser
 * was named, as in "open youtube in chrome".
 */
export function resolveOpen(spoken: string, apps: StartApp[], browser?: Browser): OpenTarget | null {
  const target = plain(spoken).replace(/^(?:the|my) /, '').replace(/ (?:app|application|website|site|web site)$/, '')
  if (!target) return null
  if (FOLDERS[target]) return { type: 'folder', folder: FOLDERS[target] }
  if (target === 'windows settings' || target === 'system settings') return { type: 'windowsSettings' }

  const site = (): OpenTarget | null => {
    if (SITES[target]) return { type: 'site', name: target, url: SITES[target] }
    const domain = spokenDomain(target)
    return domain ? { type: 'site', name: domain.replace('https://', ''), url: domain } : null
  }

  if (browser) return site() ?? null
  const app = findApp(target, apps, false)
  if (app) return { type: 'app', app }
  const web = site()
  if (web) return web
  const near = findApp(target, apps, true)
  return near ? { type: 'app', app: near } : null
}

/** A search address for Google or YouTube. */
export function searchUrl(query: string, site: 'google' | 'youtube'): string {
  const q = encodeURIComponent(query.trim())
  return site === 'youtube' ? `https://www.youtube.com/results?search_query=${q}` : `https://www.google.com/search?q=${q}`
}

/** Names the speech engine should listen for after "open". */
export function openVocabulary(apps: StartApp[]): string[] {
  const names = new Set<string>([...Object.keys(SITES), ...Object.keys(FOLDERS), 'windows settings'])
  for (const app of apps) for (const alias of appAliases(app.name)) if (alias.split(' ').length <= 4) names.add(alias)
  return [...names].sort()
}
