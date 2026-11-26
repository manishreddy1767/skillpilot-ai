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
