import { execFileSync, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parseVoiceCommand } from '../../shared/voice-commands'
import { HOST_SCRIPT, SpeechHost, type Heard } from './speech-host'

const POWERSHELL = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stdin: PassThrough
    kill: ReturnType<typeof vi.fn>
    sent: string[]
  }
  child.stdout = new PassThrough()
  child.stdin = new PassThrough()
  child.sent = []
  child.stdin.on('data', (chunk: Buffer) => child.sent.push(...chunk.toString().split('\n').filter(Boolean)))
  child.kill = vi.fn(() => child.emit('close', null, 'SIGTERM'))
  return child
}

const tick = () => new Promise((done) => setImmediate(done))
const say = (child: ReturnType<typeof fakeChild>, value: object) => child.stdout.write(`${JSON.stringify(value)}\r\n`)
const decode = (line: string) => Buffer.from(line.split(' ')[1]!, 'base64').toString('utf8')
const events = () => ({ onReady: vi.fn(), onLevel: vi.fn() })

function setup() {
  const child = fakeChild()
  const spawnFake = vi.fn(() => child as never)
  const warnings: string[] = []
  const host = new SpeechHost(spawnFake, 'powershell.exe', (message) => warnings.push(message), 1_000)
  return { child, spawnFake, host, warnings }
}

afterEach(() => vi.useRealTimers())

describe('HOST_SCRIPT', () => {
  it('listens with command phrases first and dictation as a fallback', () => {
    expect(HOST_SCRIPT).toContain("$commands.Name = 'command'")
    expect(HOST_SCRIPT).toContain('$commands.Priority = 1')
    expect(HOST_SCRIPT).toContain("$dictation.Name = 'dictation'")
    expect(HOST_SCRIPT).toContain('SetInputToDefaultAudioDevice()')
  })

  it('never reuses PowerShell names that already mean something', () => {
    expect(HOST_SCRIPT).not.toMatch(/\$(?:args|input|event)\b/)
  })
})

describe('SpeechHost', () => {
  it('starts once, sends the vocabulary, and stays running between listens', async () => {
    const { child, spawnFake, host } = setup()
    host.setVocabulary(['Chrome', 'vs code', 'w3schools', 'c++'], ["what's due today"])
    const first = host.listen('en-GB', events())
    expect(spawnFake).toHaveBeenCalledOnce()
    expect(JSON.parse(decode(child.sent[0]!))).toEqual({ open: ['chrome', 'vs code'], phrases: ["what's due today"] })
    expect(child.sent[1]).toBe('listen 1 en-GB')
    say(child, { type: 'result', text: 'open chrome', confidence: 0.93, source: 'command' })
    await expect(first).resolves.toEqual({ text: 'open chrome', confidence: 0.93, source: 'command' })

    const second = host.listen('en-US', events())
    say(child, { type: 'result', text: '', confidence: 0, source: 'none' })
    await expect(second).resolves.toMatchObject({ source: 'none' })
    expect(spawnFake).toHaveBeenCalledOnce()
    host.dispose()
  })

  it('reports when the microphone opens and how loud it is', async () => {
    const { child, host } = setup()
    const listening = events()
    const heard = host.listen('en-US', listening)
    say(child, { type: 'ready' })
    say(child, { type: 'level', value: 37 })
    await tick()
    expect(listening.onReady).toHaveBeenCalledOnce()
    expect(listening.onLevel).toHaveBeenCalledWith(37)
    say(child, { type: 'result', text: 'mute', confidence: 0.8, source: 'command' })
    await heard
    host.dispose()
  })

  it('handles lines split across chunks, and ignores stray output', async () => {
    const { child, host } = setup()
    const heard = host.listen('en-US', events())
    child.stdout.write('Some warning text\r\n{"type":"result","text":"vol')
    child.stdout.write('ume up","confidence":0.7,"source":"command"}\r\n')
    await expect(heard).resolves.toEqual({ text: 'volume up', confidence: 0.7, source: 'command' })
    host.dispose()
  })

  it('passes on how loud the microphone got, only when it reported a level', async () => {
    const { child, host } = setup()
    const first = host.listen('en-US', events())
    say(child, { type: 'result', id: 1, text: '', confidence: 0, source: 'none', peak: 1 })
    await expect(first).resolves.toEqual({ text: '', confidence: 0, source: 'none', peak: 1 })
    const second = host.listen('en-US', events())
    say(child, { type: 'result', id: 2, text: '', confidence: 0, source: 'none', peak: null })
    await expect(second).resolves.toEqual({ text: '', confidence: 0, source: 'none' })
    host.dispose()
  })

  it('checks the microphone is not muted before listening to it, but not for a recording', () => {
    expect(HOST_SCRIPT).toContain('[SkillPilotMicrophone]::Muted()')
    expect(HOST_SCRIPT).toContain("if ($parts.Length -le 3 -and (Test-Muted))")
  })

  it('passes on what the engine was unsure of, marked as rejected', async () => {
    const { child, host } = setup()
    const heard = host.listen('en-US', events())
    say(child, { type: 'result', text: 'in the senate', confidence: 0.12, source: 'rejected' })
    await expect(heard).resolves.toEqual<Heard>({ text: 'in the senate', confidence: 0.12, source: 'rejected' })
    host.dispose()
  })

  it('sends a recording path safely encoded', () => {
    const { child, host } = setup()
    void host.listen('en-US', events(), "C:\\it's here\\a.wav")
    expect(decode(child.sent[1]!.replace('listen 1 en-US ', 'x '))).toBe("C:\\it's here\\a.wav")
    host.dispose()
  })

  it('rejects with the engine error', async () => {
    const { child, host } = setup()
    const heard = host.listen('en-US', events())
    say(child, { type: 'error', message: 'No audio input device' })
    await expect(heard).rejects.toThrow('No audio input device')
    host.dispose()
  })

  it('rejects if the process cannot start or stops', async () => {
    const { child, host } = setup()
    const heard = host.listen('en-US', events())
    child.emit('error', new Error('ENOENT'))
    await expect(heard).rejects.toThrow('could not be started')
    expect(host.running).toBe(false)
  })

  it('cancelling returns nothing heard and tells the engine to stop', async () => {
    const { child, host } = setup()
    const heard = host.listen('en-US', events())
    host.cancel()
    await expect(heard).resolves.toMatchObject({ text: '', source: 'none' })
    expect(child.sent).toContain('cancel')
    expect(host.listening).toBe(false)
    host.dispose()
  })

  it('a late answer after cancelling is ignored', async () => {
    const { child, host } = setup()
    const first = host.listen('en-US', events())
    host.cancel()
    await first
    const second = host.listen('en-US', events())
    say(child, { type: 'result', text: 'open chrome', confidence: 0.9, source: 'command' })
    await expect(second).resolves.toMatchObject({ text: 'open chrome' })
    host.dispose()
  })

  it('an answer to an earlier listen is never taken as the answer to a newer one', async () => {
    const { child, host } = setup()
    const first = host.listen('en-US', events())
    host.cancel()
    await first
    const second = host.listen('en-US', events())
    expect(child.sent.filter((line) => line.startsWith('listen'))).toEqual(['listen 1 en-US', 'listen 2 en-US'])
    const listening = vi.fn()
    say(child, { type: 'result', id: 1, text: 'open chrome', confidence: 0.9, source: 'command' })
    say(child, { type: 'result', id: 2, text: 'volume up', confidence: 0.9, source: 'command' })
    await expect(second).resolves.toMatchObject({ text: 'volume up' })
    expect(listening).not.toHaveBeenCalled()
    host.dispose()
  })

  it('speaks replies, encoded, and skips empty ones', () => {
    const { child, host } = setup()
    host.say('')
    expect(child.sent).toEqual([])
    host.say('Opening Chrome.')
    expect(decode(child.sent.at(-1)!)).toBe('Opening Chrome.')
    host.dispose()
  })

  it('updates the vocabulary of a running engine', () => {
    const { child, host } = setup()
    host.say('Hello')
    host.setVocabulary(['notepad'], [])
    expect(JSON.parse(decode(child.sent.at(-1)!))).toEqual({ open: ['notepad'], phrases: [] })
    host.dispose()
  })

  it('closes after a quiet spell, but never while listening', async () => {
    vi.useFakeTimers()
    const { child, host } = setup()
    host.say('Hello')
    vi.advanceTimersByTime(1_000)
    expect(child.kill).toHaveBeenCalledOnce()
    expect(host.running).toBe(false)

    const again = setup()
    const heard = again.host.listen('en-US', events())
    vi.advanceTimersByTime(1_500)
    expect(again.child.kill).not.toHaveBeenCalled()
    say(again.child, { type: 'result', text: '', confidence: 0, source: 'none' })
    await vi.advanceTimersByTimeAsync(0)
    await heard
    again.host.dispose()
  })
})

/**
 * The real Windows engine. Windows reads each command into a sound file, and the host recognises it
 * with the same command phrases the app uses.
 */
describe.runIf(process.platform === 'win32' && existsSync(POWERSHELL))('the real Windows speech engine', () => {
  let folder: string
  let host: SpeechHost
  const record = (text: string) => {
    const file = join(folder, `${text.replace(/\W+/g, '-')}.wav`)
    execFileSync(POWERSHELL, [
      '-NoProfile',
      '-Command',
      `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = -1; $s.SetOutputToWaveFile('${file}'); $s.Speak('${text}'); $s.Dispose()`
    ])
    return file
  }

  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), 'skillpilot-host-'))
    host = new SpeechHost(spawn, POWERSHELL, (message) => console.log(`Warning: ${message}`))
    host.setVocabulary(
      ['chrome', 'google chrome', 'youtube', 'vs code', 'notepad', 'tasks', 'skills', 'downloads'],
      ["what's due today", 'volume up', 'mute', 'lock my computer', 'what time is it']
    )
  })
  afterAll(() => {
    host.dispose()
    rmSync(folder, { recursive: true, force: true })
  })

  it.each([
    ['open chrome', { kind: 'open', target: 'chrome' }],
    ['open youtube in chrome', { kind: 'open', target: 'youtube', browser: 'chrome' }],
    ['search for react hooks on youtube', { kind: 'search', site: 'youtube' }],
    ['add task read the testing guide tomorrow', { kind: 'addTask', title: 'Read the testing guide' }],
    ['volume up', { kind: 'volume', change: 'up' }],
    ['what time is it', { kind: 'time' }],
    ['open my skills', { kind: 'navigate', section: 'skills' }]
  ])('hears "%s" as a command', { timeout: 60_000 }, async (phrase, intent) => {
    // Windows reports microphone levels only from a real microphone, not a sound file.
    const heard = await host.listen('en-US', { onReady: () => undefined, onLevel: () => undefined }, record(phrase))
    console.log(`Spoken "${phrase}", heard "${heard.text}" (${heard.source}, ${heard.confidence.toFixed(2)})`)
    expect(heard.source).toBe('command')
    expect(parseVoiceCommand(heard.text, '2026-11-14')).toMatchObject(intent)
  })

  it('keeps listening when new vocabulary arrives mid-listen', { timeout: 60_000 }, async () => {
    const heard = host.listen('en-US', { onReady: () => undefined, onLevel: () => undefined }, record('open notepad'))
    host.setVocabulary(['notepad', 'chrome', 'calculator'], ['mute', 'volume up'])
    await expect(heard).resolves.toMatchObject({ text: 'open notepad', source: 'command' })
    const next = await host.listen('en-US', { onReady: () => undefined, onLevel: () => undefined }, record('open calculator'))
    expect(next).toMatchObject({ text: 'open calculator', source: 'command' })
  })

  it('listens again straight after a cancel, without the old answer', { timeout: 60_000 }, async () => {
    const first = host.listen('en-US', { onReady: () => undefined, onLevel: () => undefined }, record('open chrome'))
    host.cancel()
    await expect(first).resolves.toMatchObject({ source: 'none' })
    const second = await host.listen('en-US', { onReady: () => undefined, onLevel: () => undefined }, record('volume up'))
    expect(second).toMatchObject({ text: expect.stringMatching(/^volume up$/i), source: 'command' })
  })

  it('still listens for commands when it has no names to open yet', { timeout: 60_000 }, async () => {
    const bare = new SpeechHost(spawn, POWERSHELL, (message) => console.log(`Warning: ${message}`))
    const warnings: string[] = []
    const quiet = new SpeechHost(spawn, POWERSHELL, (message) => warnings.push(message))
    quiet.setVocabulary([], ['volume up'])
    const heard = await quiet.listen('en-US', { onReady: () => undefined, onLevel: () => undefined }, record('volume up'))
    quiet.dispose()
    bare.dispose()
    expect(warnings).toEqual([])
    expect(heard).toMatchObject({ source: 'command' })
  })

  it('hears free speech through dictation', { timeout: 60_000 }, async () => {
    const heard = await host.listen('en-US', { onReady: () => undefined, onLevel: () => undefined }, record('tell me a joke'))
    console.log(`Free speech heard "${heard.text}" (${heard.source}, ${heard.confidence.toFixed(2)})`)
    expect(['dictation', 'rejected']).toContain(heard.source)
  })

  it('speaks a reply without failing', { timeout: 30_000 }, async () => {
    host.say('Ready to help.')
    const heard = await host.listen('en-US', { onReady: () => undefined, onLevel: () => undefined }, record('mute'))
    expect(heard.text.toLowerCase()).toContain('mute')
  })
})
