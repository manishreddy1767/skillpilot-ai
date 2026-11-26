import { describe, expect, it } from 'vitest'
import type { StartApp } from '../../shared/desktop-commands'
import { commandWords, understand } from './understand'

const apps: StartApp[] = [
  { name: 'Google Chrome', id: 'Chrome' },
  { name: 'Visual Studio Code', id: 'Microsoft.VisualStudioCode' },
  { name: 'Notepad', id: 'Notepad!App' }
]
const today = '2026-11-26'

describe('understand', () => {
  it.each([
    ['opne naukari', 'open naukri', { kind: 'open', target: 'naukri' }],
    ['open naukari', 'open naukri', { kind: 'open', target: 'naukri' }],
    ['open youtbe', 'open youtube', { kind: 'open', target: 'youtube' }],
    ['opne chorme', 'open chrome', { kind: 'open', target: 'chrome' }],
    ['launch notpad', 'launch notepad', { kind: 'open', target: 'notepad' }],
    ['serch naukari for reakt jobs in pune', 'search naukri for react jobs in pune', { kind: 'jobSearch', site: 'naukri', keywords: 'react', location: 'pune' }],
    ['open my skils', 'open my skill', { kind: 'navigate', section: 'skills' }],
    ['volum up', 'volume up', { kind: 'volume', change: 'up' }]
  ])('"%s" is read as "%s"', (text, readAs, intent) => {
    const result = understand(text, apps, today)
    expect(result.readAs).toBe(readAs)
    expect(result.intent).toMatchObject(intent)
  })

  it('takes a message that already makes sense exactly as written', () => {
    expect(understand('add task read the tsting guide', apps, today)).toEqual({
      intent: { kind: 'addTask', title: 'Read the tsting guide', dueDate: today }
    })
    expect(understand('open naukri', apps, today)).toEqual({ intent: { kind: 'open', target: 'naukri' } })
  })

  it('leaves a question for the AI when no correction makes it a command', () => {
    expect(understand('Am I redy for a junior role?', apps, today)).toEqual({
      intent: { kind: 'ask', text: 'Am I redy for a junior role?' }
    })
  })

  it('keeps an unknown "open" as it is, for the Google search fallback', () => {
    expect(understand('open pod bay doors', apps, today)).toEqual({ intent: { kind: 'open', target: 'pod bay doors' } })
  })
})

describe('commandWords', () => {
  it('knows verbs, apps, sites, sections, and skills', () => {
    const words = commandWords(apps)
    for (const word of ['open', 'search', 'notepad', 'naukri', 'youtube', 'skills', 'react', 'kubernetes']) expect(words).toContain(word)
  })
})

describe('a correction that still makes no sense', () => {
  it('is thrown away, so a question reaches the AI exactly as written', () => {
    // "pyhton" corrects to "python", but the message is still a question, not a command.
    expect(understand('how do i get better at pyhton', apps, today)).toEqual({
      intent: { kind: 'ask', text: 'how do i get better at pyhton' }
    })
  })
})
