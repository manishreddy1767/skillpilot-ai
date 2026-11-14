import { describe, expect, it } from 'vitest'
import { appAliases, openVocabulary, resolveOpen, searchUrl, spokenDomain, type StartApp } from './desktop-commands'

// The real names and IDs Windows lists on this laptop.
const apps: StartApp[] = [
  { name: 'Google Chrome', id: 'Chrome' },
  { name: 'Microsoft Edge', id: 'MSEdge' },
  { name: 'Visual Studio Code', id: 'Microsoft.VisualStudioCode' },
  { name: 'Notepad', id: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App' },
  { name: 'Calculator', id: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' },
  { name: 'File Explorer', id: 'Microsoft.Windows.Explorer' },
  { name: 'WSL Settings', id: '{6D809377}\\WSL\\wslsettings.exe' },
  { name: 'Word', id: 'Microsoft.Office.WINWORD.EXE.15' },
  { name: 'WhatsApp', id: '5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App' }
]
const app = (name: string) => ({ type: 'app', app: apps.find((a) => a.name === name) })

describe('appAliases', () => {
  it('drops the vendor and adds common nicknames', () => {
    expect(appAliases('Google Chrome')).toEqual(['google chrome', 'chrome', 'browser'])
    expect(appAliases('Visual Studio Code')).toContain('vs code')
    expect(appAliases('Notepad')).toEqual(['notepad'])
  })
})

describe('spokenDomain', () => {
  it.each([
    ['example dot com', 'https://example.com'],
    ['example com', 'https://example.com'],
    ['example.com', 'https://example.com'],
    ['geeks for geeks dot org', 'https://geeksforgeeks.org'],
    ['my site dot co', 'https://mysite.co']
  ])('"%s" is %s', (spoken, url) => {
    expect(spokenDomain(spoken)).toBe(url)
  })

  it.each(['chrome', 'dot com', 'two words com', 'notepad'])('"%s" is not a web address', (spoken) => {
    expect(spokenDomain(spoken)).toBeNull()
  })
})

describe('resolveOpen', () => {
  it.each([
    ['chrome', 'Google Chrome'],
    ['google chrome', 'Google Chrome'],
    ['vs code', 'Visual Studio Code'],
    ['visual studio code', 'Visual Studio Code'],
    ['the notepad app', 'Notepad'],
    ['calculator', 'Calculator'],
    ['explorer', 'File Explorer'],
    ['edge', 'Microsoft Edge'],
    ['whatsapp', 'WhatsApp']
  ])('"%s" opens the %s app', (spoken, name) => {
    expect(resolveOpen(spoken, apps)).toEqual(app(name))
  })

  it('prefers the installed app, but a named browser means the website', () => {
    expect(resolveOpen('whatsapp', apps)).toEqual(app('WhatsApp'))
    expect(resolveOpen('whatsapp', apps, 'chrome')).toEqual({
      type: 'site',
      name: 'whatsapp',
      url: 'https://web.whatsapp.com'
    })
  })

  it('opens websites by name or address', () => {
    expect(resolveOpen('youtube', apps)).toEqual({ type: 'site', name: 'youtube', url: 'https://www.youtube.com' })
    expect(resolveOpen('stack overflow website', apps)).toMatchObject({ url: 'https://stackoverflow.com' })
    expect(resolveOpen('example dot com', apps, 'edge')).toEqual({
      type: 'site',
      name: 'example.com',
      url: 'https://example.com'
    })
  })

  it('opens folders and Windows settings', () => {
    expect(resolveOpen('downloads', apps)).toEqual({ type: 'folder', folder: 'downloads' })
    expect(resolveOpen('my documents', apps)).toEqual({ type: 'folder', folder: 'documents' })
    expect(resolveOpen('windows settings', apps)).toEqual({ type: 'windowsSettings' })
  })

  it('finds an app by part of its name', () => {
    expect(resolveOpen('wsl', apps)).toEqual(app('WSL Settings'))
  })

  it('returns nothing it cannot find, and never guesses from tiny fragments', () => {
    expect(resolveOpen('the pod bay doors', apps)).toBeNull()
    expect(resolveOpen('no', apps)).toBeNull()
    expect(resolveOpen('chrome', apps, 'edge')).toBeNull()
  })
})

describe('searchUrl', () => {
  it('builds safe Google and YouTube searches', () => {
    expect(searchUrl('react hooks', 'google')).toBe('https://www.google.com/search?q=react%20hooks')
    expect(searchUrl('lofi & chill?', 'youtube')).toBe(
      'https://www.youtube.com/results?search_query=lofi%20%26%20chill%3F'
    )
  })
})

describe('openVocabulary', () => {
  it('lists sites, folders, and every app name without duplicates', () => {
    const words = openVocabulary(apps)
    expect(words).toEqual(
      expect.arrayContaining(['youtube', 'downloads', 'chrome', 'vs code', 'notepad', 'windows settings'])
    )
    expect(new Set(words).size).toBe(words.length)
  })
})
