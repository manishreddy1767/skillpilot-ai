import { execFileSync, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { parseVoiceCommand } from '../../shared/voice-commands'
import { SpeechRecognizer, parseSpeechOutput, speechScript } from './recognizer'

const POWERSHELL = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; kill: ReturnType<typeof vi.fn> }
  child.stdout = new PassThrough()
  child.kill = vi.fn(() => child.emit('close', null, 'SIGTERM'))
  return child
}

describe('speechScript', () => {
  it('listens to the microphone by default, in the chosen language', () => {
    const script = speechScript('en-GB')
    expect(script).toContain("CultureInfo('en-GB')")
    expect(script).toContain('SetInputToDefaultAudioDevice()')
    expect(script).toContain('DictationGrammar')
  })

  it('can read a sound file instead, with quotes in the path made safe', () => {
    expect(speechScript('en-US', "C:\\it's\\a.wav")).toContain("SetInputToWaveFile('C:\\it''s\\a.wav')")
  })
})

describe('parseSpeechOutput', () => {
  it.each([
    ['READY\r\n{"text":"open tasks","confidence":0.91}\r\n', { text: 'open tasks', confidence: 0.91 }],
    ['READY\n{"text":"","confidence":0}\n', { text: '', confidence: 0 }],
    ['{"error":"No recognizer of the required ID found."}', { error: 'No recognizer of the required ID found.' }],
    ['', { error: 'The speech engine gave no answer.' }],
    ['READY\n{broken', { error: 'The speech engine gave an answer that could not be read.' }],
    ['{"text":5}', { text: '', confidence: 0 }]
  ])('reads %j', (output, expected) => {
    expect(parseSpeechOutput(output)).toEqual(expected)
  })
})

describe('SpeechRecognizer', () => {
  it('reports when listening starts, then returns what was heard', async () => {
    const child = fakeChild()
    const spawnFake = vi.fn(() => child as never)
    const recognizer = new SpeechRecognizer(spawnFake, 'powershell.exe')
    const onReady = vi.fn()
    const heard = recognizer.listen('en-US', onReady)
    expect(recognizer.listening).toBe(true)
    child.stdout.write('READY\r\n')
    await new Promise((done) => setImmediate(done))
    expect(onReady).toHaveBeenCalledOnce()
    child.stdout.write('{"text":"open tasks","confidence":0.8}\r\n')
    child.emit('close', 0, null)
    await expect(heard).resolves.toEqual({ text: 'open tasks', confidence: 0.8 })
    expect(recognizer.listening).toBe(false)
    const args = (spawnFake.mock.calls[0] as unknown as [string, string[]])[1]
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand'])
    expect(Buffer.from(args[3]!, 'base64').toString('utf16le')).toContain("CultureInfo('en-US')")
  })

  it('rejects with the engine error', async () => {
    const child = fakeChild()
    const recognizer = new SpeechRecognizer(() => child as never, 'powershell.exe')
    const heard = recognizer.listen('en-US', vi.fn())
    child.stdout.write('{"error":"No microphone"}')
    child.emit('close', 0, null)
    await expect(heard).rejects.toThrow('No microphone')
  })

  it('rejects when PowerShell cannot start', async () => {
    const child = fakeChild()
    const recognizer = new SpeechRecognizer(() => child as never, 'missing.exe')
    const heard = recognizer.listen('en-US', vi.fn())
    child.emit('error', new Error('ENOENT'))
    await expect(heard).rejects.toThrow('could not be started')
  })

  it('cancelling stops listening and returns nothing heard', async () => {
    const child = fakeChild()
    const recognizer = new SpeechRecognizer(() => child as never, 'powershell.exe')
    const heard = recognizer.listen('en-US', vi.fn())
    recognizer.cancel()
    await expect(heard).resolves.toEqual({ text: '', confidence: 0 })
    expect(child.kill).toHaveBeenCalled()
    expect(recognizer.listening).toBe(false)
  })

  it('starting again stops the earlier listen', async () => {
    const first = fakeChild()
    const second = fakeChild()
    const spawnFake = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    const recognizer = new SpeechRecognizer(spawnFake as never, 'powershell.exe')
    const earlier = recognizer.listen('en-US', vi.fn())
    void recognizer.listen('en-US', vi.fn())
    await expect(earlier).resolves.toEqual({ text: '', confidence: 0 })
    expect(first.kill).toHaveBeenCalled()
  })
})

/**
 * The real Windows engine, end to end. Windows reads a command aloud into a sound file, and the same
 * script the app uses recognises it. This proves the engine, the script, and the command parser together.
 */
describe.runIf(process.platform === 'win32' && existsSync(POWERSHELL))('the real Windows speech engine', () => {
  let folder: string
  const say = (text: string, file: string) =>
    execFileSync(POWERSHELL, [
      '-NoProfile',
      '-Command',
      `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = -1; $s.SetOutputToWaveFile('${file}'); $s.Speak('${text}'); $s.Dispose()`
    ])

  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), 'skillpilot-voice-'))
  })
  afterAll(() => rmSync(folder, { recursive: true, force: true }))

  it.each([
    ['open tasks', { kind: 'navigate', section: 'tasks' }],
    ['add task read chapter tomorrow', { kind: 'addTask', dueDate: '2026-11-09' }],
    ['add skill docker', { kind: 'addSkill' }]
  ])('hears "%s" and understands it', { timeout: 60_000 }, async (phrase, intent) => {
    const file = join(folder, `${phrase.replace(/\s/g, '-')}.wav`)
    say(phrase, file)
    const recognizer = new SpeechRecognizer(spawn, POWERSHELL)
    const heard = await recognizer.listen('en-US', () => undefined, file)
    console.log(`Spoken "${phrase}", heard "${heard.text}" at ${heard.confidence.toFixed(2)}`)
    expect(parseVoiceCommand(heard.text, '2026-11-08')).toMatchObject(intent)
  })
})
