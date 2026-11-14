import { describe, expect, it, vi } from 'vitest'
import type { VoiceStatus } from '../../shared/ipc'
import type { Heard, ListenEvents } from './speech-host'
import { VoiceController, type VoiceControllerDeps } from './voice-controller'

function setup(overrides: Partial<VoiceControllerDeps> = {}) {
  const statuses: VoiceStatus[] = []
  let events: ListenEvents = { onReady: () => undefined, onLevel: () => undefined }
  let finish: (heard: Heard) => void = () => undefined
  let fail: (error: Error) => void = () => undefined
  const host = {
    listen: vi.fn((_language: string, given: ListenEvents) => {
      events = given
      return new Promise<Heard>((resolve, reject) => {
        finish = resolve
        fail = reject
      })
    }),
    cancel: vi.fn(),
    say: vi.fn()
  }
  const deps: VoiceControllerDeps = {
    host,
    respond: vi.fn((heard: Heard) => Promise.resolve({ heard: heard.text, reply: 'Opening Google Chrome.' })),
    language: () => 'en-GB',
    speakReplies: () => true,
    audioFile: () => undefined,
    broadcast: (status) => statuses.push(status),
    logError: vi.fn(),
    ...overrides
  }
  return {
    deps,
    host,
    statuses,
    voice: new VoiceController(deps),
    events: () => events,
    finish: (heard: Heard) => finish(heard),
    fail: (error: Error) => fail(error)
  }
}

const flush = () => new Promise((done) => setImmediate(done))

describe('VoiceController', () => {
  it('reports each step, acts, and speaks the reply', async () => {
    const t = setup()
    const result = t.voice.listen()
    expect(t.voice.listening).toBe(true)
    expect(t.host.listen).toHaveBeenCalledWith('en-GB', expect.anything(), undefined)
    t.events().onReady()
    t.events().onLevel(30)
    t.finish({ text: 'open chrome', confidence: 0.9, source: 'command' })
    await expect(result).resolves.toEqual({ ok: true, value: { heard: 'open chrome', reply: 'Opening Google Chrome.' } })
    expect(t.statuses).toEqual([
      { phase: 'starting' },
      { phase: 'listening', level: 0 },
      { phase: 'listening', level: 30 },
      { phase: 'working', heard: 'open chrome' },
      { phase: 'done', heard: 'open chrome', reply: 'Opening Google Chrome.' }
    ])
    expect(t.host.say).toHaveBeenCalledWith('Opening Google Chrome.')
    expect(t.voice.listening).toBe(false)
  })

  it('stays quiet when spoken replies are off', async () => {
    const t = setup({ speakReplies: () => false })
    const result = t.voice.listen()
    t.finish({ text: 'open chrome', confidence: 0.9, source: 'command' })
    await result
    expect(t.host.say).not.toHaveBeenCalled()
  })

  it('never passes an unknown language to the engine', async () => {
    const t = setup({ language: () => "en-US'); Remove-Item C:\\" })
    void t.voice.listen()
    expect(t.host.listen).toHaveBeenCalledWith('en-US', expect.anything(), undefined)
  })

  it('stopping cancels, says idle, and ignores what arrives late', async () => {
    const t = setup()
    const result = t.voice.listen()
    t.voice.stop()
    expect(t.host.cancel).toHaveBeenCalled()
    expect(t.statuses.at(-1)).toEqual({ phase: 'idle' })
    t.finish({ text: 'open chrome', confidence: 0.9, source: 'command' })
    await expect(result).resolves.toEqual({ ok: true, value: { heard: '', reply: '' } })
    expect(t.deps.respond).not.toHaveBeenCalled()
    expect(t.host.say).not.toHaveBeenCalled()
  })

  it('levels from an old listen are not shown', async () => {
    const t = setup()
    void t.voice.listen()
    const old = t.events()
    t.voice.stop()
    old.onLevel(50)
    await flush()
    expect(t.statuses.some((status) => status.level === 50)).toBe(false)
  })

  it.each([
    ['No audio input device found', 'No microphone could be used'],
    ['Something else', 'English speech language is installed']
  ])('explains "%s" plainly, logs it, and shows it', async (detail, plain) => {
    const t = setup()
    const result = t.voice.listen()
    t.fail(new Error(detail))
    const value = await result
    expect(value.ok).toBe(false)
    expect(value.ok ? '' : value.message).toContain(plain)
    expect(t.deps.logError).toHaveBeenCalled()
    expect(t.statuses.at(-1)).toMatchObject({ phase: 'done', failed: true })
    expect(t.voice.listening).toBe(false)
  })
})
