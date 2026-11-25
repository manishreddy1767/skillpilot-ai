/**
 * Reads a job page saved from a browser (Ctrl+S on LinkedIn, Naukri, Indeed, and others) entirely on
 * this laptop. Job sites embed the posting as structured data, which is used first, with the page's
 * visible text as a fallback. Nothing in the file is run or fetched.
 */

export interface ImportedJob {
  title: string
  company: string
  location: string
  source: 'linkedin' | 'naukri' | 'indeed' | 'foundit' | 'company' | 'other'
  url: string
  description: string
}

const MAX_DESCRIPTION = 20_000

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', hellip: '…', bull: '•' }

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1]?.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

/** Readable text from HTML: lists keep their bullets, blocks keep their line breaks. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<(?:br|hr)\b[^>]*>/gi, '\n')
      .replace(/<\/(?:p|div|li|ul|ol|h[1-6]|section|article|tr|header|footer)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n+/g, '\n')
    .trim()
}

/** The HTML inside a page saved as a single file (MHTML), decoded from quoted-printable. */
export function htmlFromMhtml(text: string): string {
  const start = text.search(/Content-Type:\s*text\/html/i)
  if (start < 0) return text
  const body = text.slice(start).split(/\r?\n\r?\n/).slice(1).join('\n\n')
  const end = body.search(/\r?\n------/)
  const part = end >= 0 ? body.slice(0, end) : body
  const bytes = part
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
  // Quoted-printable hands back raw bytes. Read them as UTF-8, so names like "Bengaluru – Hybrid" survive.
  return Buffer.from(bytes, 'latin1').toString('utf8')
}

const sourceOf = (text: string): ImportedJob['source'] => {
  if (/linkedin\.com|\| ?LinkedIn\b/i.test(text)) return 'linkedin'
  if (/naukri\.com/i.test(text)) return 'naukri'
  if (/indeed\.(?:com|co\.in)|\| ?Indeed\b/i.test(text)) return 'indeed'
  if (/foundit\.in|monsterindia\.com/i.test(text)) return 'foundit'
  return 'other'
}

/** The site a job came from, by the strongest clue first: its address, then the saved file, then the title. */
const firstSource = (...clues: string[]): ImportedJob['source'] => {
  for (const clue of clues) {
    const source = sourceOf(clue)
    if (source !== 'other') return source
  }
  return 'other'
}

const meta = (html: string, name: string): string => {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i')
  const tag = html.match(pattern)?.[0] ?? ''
  return decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '').trim()
}

type Json = Record<string, unknown>

/** Every object in a page's JSON-LD blocks, including those nested in arrays and @graph. */
function structuredData(html: string): Json[] {
  const found: Json[] = []
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (value && typeof value === 'object') {
      found.push(value as Json)
      visit((value as Json)['@graph'])
    }
  }
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(block[1]!.trim()))
    } catch {
      // A broken block is skipped; the page text still works.
    }
  }
  return found
}

const text = (value: unknown): string => (typeof value === 'string' ? decodeEntities(value).trim() : '')

function locationOf(posting: Json): string {
  const places = Array.isArray(posting['jobLocation']) ? posting['jobLocation'] : [posting['jobLocation']]
  const names = places.flatMap((place) => {
    const address = (place as Json | undefined)?.['address'] as Json | undefined
    if (!address) return []
    return [[text(address['addressLocality']), text(address['addressRegion'])].filter(Boolean).join(', ')]
  })
  const remote = posting['jobLocationType'] === 'TELECOMMUTE' ? ['Remote'] : []
  return [...new Set([...names.filter(Boolean), ...remote])].join('; ')
}

/** Splits a page title such as "React Developer - Acme - Pune | Naukri.com" into its parts. */
function fromTitle(title: string): { title: string; company: string; location: string } {
  const parts = title
    .replace(/\s*[|–-]\s*(?:LinkedIn|Naukri\.com|Naukri|Indeed\.com|Indeed|foundit)\s*$/i, '')
    .split(/\s+(?:-|–|\||at)\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  return { title: parts[0] ?? '', company: parts[1] ?? '', location: parts[2] ?? '' }
}

/** Reads a saved job page, a single-file page, or plain text. */
export function parseJobPage(content: string, fileName = ''): ImportedJob {
  const isMhtml = /^(?:From:|MIME-Version:)/m.test(content.slice(0, 2000)) && /Content-Type:\s*multipart\/related/i.test(content)
  const html = isMhtml ? htmlFromMhtml(content) : content
  const isHtml = /<html|<body|<div|<meta/i.test(html.slice(0, 5000))

  if (!isHtml) {
    const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    return {
      title: (lines[0] ?? fileName.replace(/\.[^.]+$/, '')).slice(0, 200),
      company: '',
      location: '',
      source: sourceOf(content),
      url: '',
      description: content.trim().slice(0, MAX_DESCRIPTION)
    }
  }

  const pageUrl = meta(html, 'og:url') || (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? '')
  const posting = structuredData(html).find((item) => item['@type'] === 'JobPosting')
  const pageTitle = meta(html, 'og:title') || decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim()
  const guessed = fromTitle(pageTitle)

  const description = posting
    ? htmlToText(text(posting['description']))
    : htmlToText(html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html)
  const organisation = (posting?.['hiringOrganization'] as Json | undefined)?.['name']
  const url = text(posting?.['url']) || pageUrl

  return {
    title: (text(posting?.['title']) || guessed.title || fileName.replace(/\.[^.]+$/, '')).slice(0, 200),
    company: (text(organisation) || guessed.company).slice(0, 200),
    location: ((posting ? locationOf(posting) : '') || guessed.location).slice(0, 200),
    source: firstSource(url, isMhtml ? content.slice(0, 2000) : '', pageTitle, html.slice(0, 20_000)),
    url: /^https?:\/\/\S+$/i.test(url) ? url.slice(0, 200) : '',
    description: description.slice(0, MAX_DESCRIPTION)
  }
}
