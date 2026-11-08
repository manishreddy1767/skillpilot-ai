import type { ChildProcess, SpawnOptions } from 'node:child_process'

/** The English recognizers Windows ships, and that this laptop has. */
export const VOICE_LANGUAGES = ['en-US', 'en-GB'] as const
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number]

export interface Heard {
  text: string
  confidence: number
}

type Spawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess

const LISTEN_LIMIT_MS = 30_000

/**
 * A PowerShell script that uses Windows' offline speech engine to recognise one phrase. It prints
 * READY once listening, then one line of JSON. Audio is never saved, and nothing leaves the laptop.
 */
export function speechScript(language: VoiceLanguage, audioFile?: string): string {
  const input = audioFile
    ? `$engine.SetInputToWaveFile('${audioFile.replace(/'/g, "''")}')`
    : '$engine.SetInputToDefaultAudioDevice()'
  return `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Speech
  $culture = New-Object System.Globalization.CultureInfo('${language}')
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
  $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(8)
  $engine.EndSilenceTimeout = [TimeSpan]::FromSeconds(1)
  $engine.BabbleTimeout = [TimeSpan]::FromSeconds(12)
  ${input}
  [Console]::Out.WriteLine('READY')
  [Console]::Out.Flush()
  $result = $engine.Recognize([TimeSpan]::FromSeconds(25))
  if ($result) { @{ text = $result.Text; confidence = $result.Confidence } | ConvertTo-Json -Compress }
  else { '{"text":"","confidence":0}' }
  $engine.Dispose()
} catch {
  @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`
}

/** Reads the script's final line. Anything unexpected becomes a plain error. */
export function parseSpeechOutput(stdout: string): Heard | { error: string } {
  const line = stdout
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter((part) => part.startsWith('{'))
    .at(-1)
  if (!line) return { error: 'The speech engine gave no answer.' }
  try {
    const value = JSON.parse(line) as { text?: unknown; confidence?: unknown; error?: unknown }
    if (typeof value.error === 'string') return { error: value.error }
    return {
      text: typeof value.text === 'string' ? value.text : '',
      confidence: typeof value.confidence === 'number' ? value.confidence : 0
    }
  } catch {
    return { error: 'The speech engine gave an answer that could not be read.' }
  }
}

/** Listens for one phrase at a time. Starting again, or cancelling, stops any earlier listen. */
export class SpeechRecognizer {
  private current: ChildProcess | null = null

  constructor(
    private readonly spawn: Spawn,
    private readonly powershell: string
  ) {}

  get listening(): boolean {
    return this.current !== null
  }

  listen(language: VoiceLanguage, onReady: () => void, audioFile?: string): Promise<Heard> {
    this.cancel()
    const encoded = Buffer.from(speechScript(language, audioFile), 'utf16le').toString('base64')
    const child = this.spawn(this.powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true
    })
    this.current = child

    return new Promise((resolve, reject) => {
      let stdout = ''
      let cancelled = false
      const limit = setTimeout(() => child.kill(), LISTEN_LIMIT_MS)

      child.stdout?.on('data', (chunk: Buffer) => {
        const before = stdout
        stdout += chunk.toString()
        if (!before.includes('READY') && stdout.includes('READY')) onReady()
      })
      child.on('error', () => {
        clearTimeout(limit)
        if (this.current === child) this.current = null
        reject(new Error('Windows speech recognition could not be started.'))
      })
      child.on('close', (_code, signal) => {
        clearTimeout(limit)
        if (this.current === child) this.current = null
        cancelled = cancelled || signal !== null
        if (cancelled) return resolve({ text: '', confidence: 0 })
        const result = parseSpeechOutput(stdout)
        if ('error' in result) reject(new Error(result.error))
        else resolve(result)
      })
      ;(child as ChildProcess & { markCancelled?: () => void }).markCancelled = () => {
        cancelled = true
      }
    })
  }

  cancel(): void {
    const child = this.current as (ChildProcess & { markCancelled?: () => void }) | null
    if (!child) return
    child.markCancelled?.()
    child.kill()
    this.current = null
  }
}
