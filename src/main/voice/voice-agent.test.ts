import { describe, expect, it, vi } from 'vitest'
import type { StartApp } from '../../shared/desktop-commands'
import type { DesktopActions } from './desktop-actions'
import type { Heard } from './speech-host'
import { respond, type AgentDeps } from './voice-agent'

const apps: StartApp[] = [
  { name: 'Google Chrome', id: 'Chrome' },
  { name: 'Visual Studio Code', id: 'Microsoft.VisualStudioCode' }
]

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
    apps: () => Promise.resolve(apps),
    today: () => '2026-11-14',
    now: () => new Date(2026, 10, 14, 16, 5),
    actNow: () => true,
    aiBlocked: () => '',
    logError: vi.fn(),
    ...overrides
  }
  return { deps, desktop }
}

const command = (text: string, confidence = 0.9): Heard => ({ text, confidence, source: 'command' })

describe('respond', () => {
  it('says so when nothing was heard', async () => {
    const { deps } = setup()
    await expect(respond({ text: '', confidence: 0, source: 'none' }, deps)).resolves.toEqual({
      heard: '',
      reply: "I didn't hear anything. Press the microphone and speak again."
    })
  })

  it('does nothing with noise or unsure speech, and says what it thought it heard', async () => {
    const { deps, desktop } = setup()
    const rejected = await respond({ text: 'in the senate', confidence: 0.2, source: 'rejected' }, deps)
    expect(rejected.reply).toContain("I'm not sure I heard that right")
    expect(rejected.draft).toBe('in the senate')
    const unsure = await respond({ text: 'open chrome', confidence: 0.3, source: 'dictation' }, deps)
    expect(unsure.reply).toContain('not sure')
    expect(desktop.launchApp).not.toHaveBeenCalled()
  })

  it('trusts a confident dictation, and a command phrase even at lower confidence', async () => {
    const { deps, desktop } = setup()
    await respond({ text: 'open chrome', confidence: 0.7, source: 'dictation' }, deps)
    await respond(command('open vs code', 0.35), deps)
    expect(desktop.launchApp).toHaveBeenCalledTimes(2)
  })

  it('says the microphone is too quiet when it picked up almost nothing', async () => {
    const { deps, desktop } = setup()
    for (const heard of [
      { text: '', confidence: 0, source: 'none' as const, peak: 1 },
      { text: 'in the senate', confidence: 0.03, source: 'dictation' as const, peak: 2 },
      { text: 'that whispers', confidence: 0.2, source: 'rejected' as const, peak: 0 }
    ]) {
      const outcome = await respond(heard, deps)
      expect(outcome.reply).toContain("I couldn't hear you. Your microphone is picking up almost no sound.")
      expect(outcome.draft).toBeUndefined()
    }
    expect(desktop.launchApp).not.toHaveBeenCalled()
  })

  it('a clear command still works with a soft voice, and silence from a recording is just silence', async () => {
    const { deps, desktop } = setup()
    await respond({ text: 'open chrome', confidence: 0.8, source: 'command', peak: 2 }, deps)
    expect(desktop.launchApp).toHaveBeenCalled()
    await expect(respond({ text: '', confidence: 0, source: 'none' }, deps)).resolves.toMatchObject({
      reply: "I didn't hear anything. Press the microphone and speak again."
    })
    await expect(respond({ text: '', confidence: 0, source: 'none', peak: 30 }, deps)).resolves.toMatchObject({
      reply: "I didn't hear anything. Press the microphone and speak again."
    })
  })

  it('only types it out when spoken requests should wait', async () => {
    const { deps, desktop } = setup({ actNow: () => false })
    await expect(respond(command('open chrome'), deps)).resolves.toMatchObject({ draft: 'open chrome' })
    expect(desktop.launchApp).not.toHaveBeenCalled()
  })

  it('opens an installed app', async () => {
    const { deps, desktop } = setup()
    await expect(respond(command('open chrome'), deps)).resolves.toEqual({ heard: 'open chrome', reply: 'Opening Google Chrome.' })
    expect(desktop.launchApp).toHaveBeenCalledWith(apps[0])
  })

  it('opens a website, in Chrome when asked', async () => {
    const { deps, desktop } = setup()
    await expect(respond(command('open youtube in chrome'), deps)).resolves.toMatchObject({ reply: 'Opening Youtube in Chrome.' })
    expect(desktop.openUrl).toHaveBeenCalledWith('https://www.youtube.com', 'chrome')
    await respond(command('go to github'), deps)
    expect(desktop.openUrl).toHaveBeenLastCalledWith('https://github.com', undefined)
  })

  it('passes on a note when the browser is missing', async () => {
    const { deps, desktop } = setup()
    desktop.openUrl.mockResolvedValueOnce(' Firefox is not installed, so it opened in your default browser.')
    const outcome = await respond(command('open youtube in firefox'), deps)
    expect(outcome.reply).toBe('Opening Youtube. Firefox is not installed, so it opened in your default browser.')
  })

  it('searches Google and YouTube', async () => {
    const { deps, desktop } = setup()
    await expect(respond(command('search for react hooks'), deps)).resolves.toMatchObject({
      reply: 'Searching Google for "react hooks".'
    })
    expect(desktop.openUrl).toHaveBeenCalledWith('https://www.google.com/search?q=react%20hooks', undefined)
    await respond(command('play lofi on youtube in chrome'), deps)
    expect(desktop.openUrl).toHaveBeenLastCalledWith('https://www.youtube.com/results?search_query=lofi', 'chrome')
  })

  it('opens folders and Windows settings', async () => {
    const { deps, desktop } = setup()
    await expect(respond(command('open downloads'), deps)).resolves.toMatchObject({ reply: 'Opening your Downloads folder.' })
    expect(desktop.openFolder).toHaveBeenCalledWith('downloads')
    await respond(command('open windows settings'), deps)
    expect(desktop.openWindowsSettings).toHaveBeenCalled()
  })

  it('says when it cannot find what to open', async () => {
    const { deps } = setup()
    await expect(respond(command('open the pod bay doors'), deps)).resolves.toMatchObject({
      reply: 'I couldn\'t find an app, website, or folder called "pod bay doors".'
    })
  })

  it('changes the volume and locks the computer', async () => {
    const { deps, desktop } = setup()
    await expect(respond(command('volume up'), deps)).resolves.toMatchObject({ reply: 'Turning the volume up.' })
    expect(desktop.volume).toHaveBeenCalledWith('up')
    await respond(command('lock my computer'), deps)
    expect(desktop.lock).toHaveBeenCalled()
  })

  it('tells the time and date', async () => {
    const { deps } = setup()
    expect((await respond(command('what time is it'), deps)).reply).toMatch(/^It's 4:05 pm\.$/i)
    expect((await respond(command("what's the date today"), deps)).reply).toBe('Today is Saturday, 14 November 2026.')
  })

  it('opens SkillPilot sections and minimises through the app window', async () => {
    const { deps } = setup()
    await expect(respond(command('open my skills'), deps)).resolves.toMatchObject({ navigate: 'skills', reply: 'Opening Skills.' })
    await expect(respond(command('minimise'), deps)).resolves.toMatchObject({ minimize: true })
  })

  it('changes career data straight away', async () => {
    const { deps } = setup()
    await expect(respond(command('add task read the guide tomorrow'), deps)).resolves.toMatchObject({
      reply: 'Added the task "Read the guide" for tomorrow.'
    })
    expect(deps.data.saveRecord).toHaveBeenCalledWith('task', null, { title: 'Read the guide', dueDate: '2026-11-15' })
  })

  it('passes other questions to the assistant, or explains it is off', async () => {
    const { deps } = setup()
    await expect(respond({ text: 'Am I ready for a junior role?', confidence: 0.8, source: 'dictation' }, deps)).resolves.toMatchObject({
      ask: 'Am I ready for a junior role?'
    })
    const off = setup({ aiBlocked: () => 'AI is off.' })
    const outcome = await respond({ text: 'tell me a joke', confidence: 0.8, source: 'dictation' }, off.deps)
    expect(outcome.ask).toBeUndefined()
    expect(outcome.reply).toContain('the AI assistant is off')
    expect(outcome.reply).toContain('open Chrome')
  })

  it('reports a failed action plainly and logs it', async () => {
    const { deps, desktop } = setup()
    desktop.openFolder.mockRejectedValueOnce(new Error('Access denied'))
    await expect(respond(command('open documents'), deps)).resolves.toMatchObject({ reply: "Sorry, that didn't work. The details are in the error log." })
    expect(deps.logError).toHaveBeenCalled()
  })
})
