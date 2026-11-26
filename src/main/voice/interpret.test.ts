import { describe, expect, it } from 'vitest'
import type { Understood } from '../../shared/ai'
import { cleanQuery, intentFor } from './interpret'

const today = '2026-11-26'
const u = (over: Partial<Understood>): Understood => ({ action: 'open', target: '', site: 'none', location: '', answer: '', ...over })

describe('cleanQuery', () => {
  it('drops a year or date the model added, but keeps one you typed', () => {
    expect(cleanQuery('lofi songs for focus 2026', 'show me some lofi songs')).toBe('lofi songs for focus')
    expect(cleanQuery('weather in hyderabad today 2026-11-26', 'weather in hyderabad')).toBe('weather in hyderabad today')
    expect(cleanQuery('best laptops 2026', 'best laptops 2026')).toBe('best laptops 2026')
  })
})

describe('intentFor', () => {
  it.each([
    [u({ action: 'open', target: 'naukri' }), { kind: 'open', target: 'naukri' }],
    [u({ action: 'web_search', target: 'latest version of react 2026' }), { kind: 'search', query: 'latest version of react', site: 'google' }],
    [u({ action: 'youtube_search', target: 'lofi songs' }), { kind: 'search', query: 'lofi songs', site: 'youtube' }],
    [u({ action: 'job_search', target: 'react developer', site: 'naukri', location: 'Pune, India' }), { kind: 'jobSearch', site: 'naukri', keywords: 'react developer', location: 'Pune' }],
    [u({ action: 'job_search', target: 'python internships', location: 'Bangalore' }), { kind: 'jobSearch', site: 'linkedin', keywords: 'python internships', location: 'Bangalore' }],
    [u({ action: 'go_to', target: 'resume' }), { kind: 'navigate', section: 'resume', label: 'Resume' }]
  ])('%j becomes a command', (understood, intent) => {
    expect(intentFor(understood, 'message', today)).toEqual(intent)
  })

  it('has no command for answers, suggestions, unknown screens, or an empty target', () => {
    expect(intentFor(u({ action: 'answer', answer: 'Yes' }), 'x', today)).toBeNull()
    expect(intentFor(u({ action: 'add_skill', target: 'Docker' }), 'x', today)).toBeNull()
    expect(intentFor(u({ action: 'go_to', target: 'the moon' }), 'x', today)).toBeNull()
    expect(intentFor(u({ action: 'open', target: '  ' }), 'x', today)).toBeNull()
  })
})
