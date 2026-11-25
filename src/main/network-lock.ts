/**
 * SkillPilot never talks to the internet. These checks let through only the app's own files and
 * addresses on this laptop, such as Ollama. Everything else is refused before it is sent.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const OWN_SCHEMES = new Set(['file:', 'data:', 'blob:', 'devtools:', 'about:'])
const WEB_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:'])

/** Whether a request stays on this laptop. */
export function isAllowedRequest(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (OWN_SCHEMES.has(parsed.protocol)) return true
  return WEB_SCHEMES.has(parsed.protocol) && LOCAL_HOSTS.has(parsed.hostname)
}

/** The host only, never the full address, so nothing private ends up in a log. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || url.slice(0, 40)
  } catch {
    return 'an invalid address'
  }
}

/** Chromium features that would otherwise reach out on their own, turned off before the app starts. */
export const OFFLINE_SWITCHES = [
  'disable-background-networking',
  'disable-component-update',
  'disable-domain-reliability',
  'disable-client-side-phishing-detection',
  'disable-sync',
  'no-pings',
  'dns-prefetch-disable'
]

type Fetch = typeof fetch

/** Wraps fetch for the main process so it can only reach this laptop. */
export function lockedFetch(original: Fetch, onBlocked: (url: string) => void): Fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!isAllowedRequest(url)) {
      onBlocked(url)
      return Promise.reject(new TypeError(`SkillPilot blocked a connection to ${hostOf(url)}. It only works offline.`))
    }
    return original(input, init)
  }
}

/** Reports each blocked host once, so a repeated attempt cannot flood the log. */
export function blockedReporter(report: (message: string) => void): (url: string) => void {
  const seen = new Set<string>()
  return (url) => {
    const host = hostOf(url)
    if (seen.has(host)) return
    seen.add(host)
    report(`Blocked a connection to ${host}. SkillPilot only works offline.`)
  }
}
