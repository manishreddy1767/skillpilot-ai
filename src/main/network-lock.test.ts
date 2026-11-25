import { describe, expect, it, vi } from 'vitest'
import { OFFLINE_SWITCHES, blockedReporter, hostOf, isAllowedRequest, lockedFetch } from './network-lock'

describe('isAllowedRequest', () => {
  it.each([
    'file:///C:/app/out/renderer/app/index.html',
    'http://localhost:11434/api/chat',
    'http://127.0.0.1:5173/app/index.html',
    'ws://localhost:5173/',
    'http://[::1]:11434/api/tags',
    'data:image/png;base64,AAAA',
    'blob:file:///abc',
    'devtools://devtools/bundled/inspector.html',
    'about:blank'
  ])('lets through %s, which stays on this laptop', (url) => {
    expect(isAllowedRequest(url)).toBe(true)
  })

  it.each([
    'https://www.linkedin.com/jobs',
    'https://api.anthropic.com/v1/messages',
    'http://192.168.1.5:11434/api/chat',
    'http://10.0.0.1/',
    'https://localhost.example.com/',
    'http://127.0.0.1.example.com/',
    'https://redirector.gvt1.com/edgedl/chrome/dict/en-us-10-1.bdic',
    'ftp://localhost/file',
    'not a url'
  ])('blocks %s', (url) => {
    expect(isAllowedRequest(url)).toBe(false)
  })
})

describe('hostOf', () => {
  it('keeps only the host, never the path or query', () => {
    expect(hostOf('https://www.linkedin.com/in/someone?token=secret')).toBe('www.linkedin.com')
    expect(hostOf('nonsense')).toBe('an invalid address')
  })
})

describe('lockedFetch', () => {
  it('passes local requests through untouched', async () => {
    const original = vi.fn(() => Promise.resolve(new Response('ok')))
    const fetchLocal = lockedFetch(original as unknown as typeof fetch, vi.fn())
    await fetchLocal('http://localhost:11434/api/tags', { method: 'GET' })
    await fetchLocal(new URL('http://127.0.0.1:11434/api/chat'))
    expect(original).toHaveBeenCalledTimes(2)
  })

  it('refuses anything else before it is sent, and reports it', async () => {
    const original = vi.fn()
    const onBlocked = vi.fn()
    const fetchLocal = lockedFetch(original as unknown as typeof fetch, onBlocked)
    await expect(fetchLocal('https://api.anthropic.com/v1/messages')).rejects.toThrow('blocked a connection to api.anthropic.com')
    await expect(fetchLocal(new Request('https://example.com/x'))).rejects.toThrow('example.com')
    expect(original).not.toHaveBeenCalled()
    expect(onBlocked).toHaveBeenCalledTimes(2)
  })
})

describe('blockedReporter', () => {
  it('reports each host once', () => {
    const report = vi.fn()
    const blocked = blockedReporter(report)
    blocked('https://example.com/a')
    blocked('https://example.com/b')
    blocked('https://other.example/c')
    expect(report.mock.calls).toEqual([
      ['Blocked a connection to example.com. SkillPilot only works offline.'],
      ['Blocked a connection to other.example. SkillPilot only works offline.']
    ])
  })
})

it('turns off Chromium features that would reach out on their own', () => {
  expect(OFFLINE_SWITCHES).toEqual(expect.arrayContaining(['disable-background-networking', 'disable-component-update']))
})
