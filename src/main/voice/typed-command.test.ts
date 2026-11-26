import { describe, expect, it, vi } from 'vitest'
import type { DesktopActions } from './desktop-actions'
import { runTypedCommand } from './typed-command'
import type { AgentDeps } from './voice-agent'

function setup(overrides: Partial<AgentDeps> = {}) {
  const desktop = {
    launchApp: vi.fn(),
    openUrl: vi.fn(() => Promise.resolve('')),
    openFolder: vi.fn(() => Promise.resolve()),
    openWindowsSettings: vi.fn(() => Promise.resolve()),
    volume: vi.fn(),
    lock: vi.fn()
  } satisfies DesktopActions
  const deps: AgentDeps = {
    data: {
      listRecords: vi.fn(() => ({ ok: true as const, value: [] })),
      saveRecord: vi.fn((_kind, _id, values) => ({ ok: true as const, value: { id: 1, values } })),
      completeTask: vi.fn(() => ({ ok: true as const, value: true }))
    },
    desktop,
    apps: () => Promise.resolve([{ name: 'Google Chrome', id: 'Chrome' }]),
    today: () => '2026-11-26',
    now: () => new Date(2026, 10, 26, 12, 0),
    // Spoken requests set to wait for review must not stop a typed command.
    actNow: () => false,
    aiBlocked: () => '',
    logError: vi.fn(),
    ...overrides
  }
  return { deps, desktop }
}

describe('typed commands', () => {
  it('"open youtube" opens YouTube, at once', async () => {
    const { deps, desktop } = setup()
    expect(await runTypedCommand('open youtube', deps)).toEqual({ ok: true, value: { heard: 'open youtube', reply: 'Opening Youtube.' } })
    expect(desktop.openUrl).toHaveBeenCalledWith('https://www.youtube.com', undefined)
  })

  it.each([
    ['Open Chrome', 'launchApp'],
    ['search for react hooks', 'openUrl'],
    ['search naukri for react jobs in pune', 'openUrl'],
    ['open downloads', 'openFolder'],
    ['volume up', 'volume']
  ] as const)('"%s" is carried out', async (text, action) => {
    const { deps, desktop } = setup()
    expect((await runTypedCommand(text, deps)).ok).toBe(true)
    expect(desktop[action]).toHaveBeenCalled()
  })

  it('changes SkillPilot data and opens its screens', async () => {
    const { deps } = setup()
    expect(await runTypedCommand('add task read the guide tomorrow', deps)).toMatchObject({
      ok: true,
      value: { reply: 'Added the task "Read the guide" for tomorrow.' }
    })
    expect(await runTypedCommand('open my skills', deps)).toMatchObject({ ok: true, value: { navigate: 'skills' } })
  })

  it('understands misspelled commands, and says how it read them', async () => {
    const { deps, desktop } = setup()
    expect(await runTypedCommand('opne naukari', deps)).toEqual({
      ok: true,
      value: { heard: 'opne naukari', reply: 'I read that as "open naukri". Opening Naukri.' }
    })
    expect(desktop.openUrl).toHaveBeenCalledWith('https://www.naukri.com', undefined)
  })

  it('passes anything else to the AI, untouched', async () => {
    const { deps, desktop } = setup()
    expect(await runTypedCommand('  Am I ready for a junior role?  ', deps)).toEqual({
      ok: true,
      value: { heard: 'Am I ready for a junior role?', reply: '', ask: 'Am I ready for a junior role?' }
    })
    expect(desktop.openUrl).not.toHaveBeenCalled()
  })

  it.each(['', '   ', null, 'x'.repeat(4001)])('refuses %s', async (text) => {
    const { deps } = setup()
    expect((await runTypedCommand(text, deps)).ok).toBe(false)
  })
})

describe('requests in your own words, understood by the local AI', () => {
  const understood = (over: object) => ({ ok: true as const, value: { action: 'open', target: '', site: 'none', location: '', answer: '', ...over } })

  it('"can you pull up naukri for me" opens Naukri', async () => {
    const interpret = vi.fn(() => Promise.resolve(understood({ action: 'open', target: 'naukri' })))
    const { deps, desktop } = setup({ interpret: interpret as never })
    expect(await runTypedCommand('can you pull up naukri for me', deps)).toMatchObject({ ok: true, value: { reply: 'Opening Naukri.' } })
    expect(interpret).toHaveBeenCalledWith('can you pull up naukri for me')
    expect(desktop.openUrl).toHaveBeenCalledWith('https://www.naukri.com', undefined)
  })

  it('questions about the world become a Google search', async () => {
    const { deps, desktop } = setup({ interpret: () => Promise.resolve(understood({ action: 'web_search', target: 'latest version of react 2026' })) as never })
    await runTypedCommand('what is the latest version of react', deps)
    expect(desktop.openUrl).toHaveBeenCalledWith('https://www.google.com/search?q=latest%20version%20of%20react', undefined)
  })

  it('an answer is shown, and a change is only suggested', async () => {
    const answer = setup({ interpret: () => Promise.resolve(understood({ action: 'answer' })) as never })
    expect(await runTypedCommand('am i ready?', answer.deps)).toEqual({ ok: true, value: { heard: 'am i ready?', reply: 'Let me ask the assistant.', ask: 'am i ready?' } })
    const add = setup({ interpret: () => Promise.resolve(understood({ action: 'add_skill', target: 'Docker' })) as never })
    expect(await runTypedCommand('i want to learn docker', add.deps)).toMatchObject({ ok: true, value: { suggested: true } })
    expect(add.deps.data.saveRecord).not.toHaveBeenCalled()
  })

  it('commands never wait for the AI', async () => {
    const interpret = vi.fn()
    const { deps } = setup({ interpret: interpret as never })
    await runTypedCommand('open youtube', deps)
    expect(interpret).not.toHaveBeenCalled()
  })

  it('with the AI off, a request goes back to the Assistant to explain', async () => {
    const interpret = vi.fn()
    const { deps } = setup({ interpret: interpret as never, aiBlocked: () => 'The local AI is off.' })
    expect(await runTypedCommand('can you pull up naukri', deps)).toMatchObject({ ok: true, value: { ask: 'can you pull up naukri' } })
    expect(interpret).not.toHaveBeenCalled()
  })

  it('reports a problem understanding', async () => {
    const { deps } = setup({ interpret: () => Promise.resolve({ ok: false, message: 'The local AI took too long to answer.' }) as never })
    expect(await runTypedCommand('do the thing', deps)).toMatchObject({ ok: true, value: { reply: 'The local AI took too long to answer.' } })
  })
})
