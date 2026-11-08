import { describe, expect, it, vi } from 'vitest'
import { createVoiceHandlers, type VoiceDeps } from './voice-handlers'

function setup(overrides: Partial<VoiceDeps> = {}) {
  const deps: VoiceDeps = {
    recognizer: { listen: vi.fn(() => Promise.resolve({ text: 'open tasks', confidence: 0.9 })), cancel: vi.fn() },
    language: () => 'en-GB',
    onReady: vi.fn(),
    audioFile: () => undefined,
    logError: vi.fn(),
    ...overrides
  }
  return { deps, handlers: createVoiceHandlers(deps) }
}

describe('voice handlers', () => {
  it('listens in the saved language and returns what was heard', async () => {
    const { deps, handlers } = setup()
    await expect(handlers.listen()).resolves.toEqual({ ok: true, value: { text: 'open tasks', confidence: 0.9 } })
    expect(deps.recognizer.listen).toHaveBeenCalledWith('en-GB', deps.onReady, undefined)
  })

  it('never passes an unknown language to the engine', async () => {
    const { deps, handlers } = setup({ language: () => "en-US'); Remove-Item C:\\" })
    await handlers.listen()
    expect(deps.recognizer.listen).toHaveBeenCalledWith('en-US', deps.onReady, undefined)
  })

  it('uses the test sound file when one is set', async () => {
    const { deps, handlers } = setup({ audioFile: () => 'C:\\a.wav' })
    await handlers.listen()
    expect(deps.recognizer.listen).toHaveBeenCalledWith('en-GB', deps.onReady, 'C:\\a.wav')
  })

  it.each([
    ['No audio input device found', 'No microphone could be used'],
    ['No recognizer of the required ID found.', 'English speech language is installed']
  ])('explains "%s" plainly and logs it', async (detail, plain) => {
    const listen = vi.fn(() => Promise.reject(new Error(detail)))
    const { deps, handlers } = setup({ recognizer: { listen, cancel: vi.fn() } })
    const result = await handlers.listen()
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.message).toContain(plain)
    expect(deps.logError).toHaveBeenCalled()
  })

  it('stops listening', () => {
    const { deps, handlers } = setup()
    expect(handlers.stopListening()).toEqual({ ok: true, value: true })
    expect(deps.recognizer.cancel).toHaveBeenCalled()
  })
})
