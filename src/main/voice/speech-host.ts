import type { ChildProcess, SpawnOptions } from 'node:child_process'

/** The English recognizers Windows ships, and that this laptop has. */
export const VOICE_LANGUAGES = ['en-US', 'en-GB'] as const
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number]

/**
 * What was heard. `command` means it matched one of the phrases the app listens for, which is far
 * more reliable than `dictation` (any English). `rejected` is the engine's best guess at speech it was
 * not sure of, and `none` means nothing was said.
 */
export interface Heard {
  text: string
  confidence: number
  source: 'command' | 'dictation' | 'rejected' | 'none'
}

export interface ListenEvents {
  /** The microphone is open. */
  onReady(): void
  /** How loud the microphone is, from 0 to 100, a few times a second. */
  onLevel(level: number): void
}

type Spawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess

const LISTEN_LIMIT_MS = 30_000
export const IDLE_LIMIT_MS = 10 * 60_000

const encode = (text: string): string => Buffer.from(text, 'utf8').toString('base64')

/**
 * A PowerShell script that keeps Windows' offline speech engine loaded, so listening starts at once.
 * It reads one command per line and writes one JSON object per line. Audio is never saved, and
 * nothing leaves the laptop.
 *
 * Commands: `grammar <base64 json>`, `listen <language> [base64 wav path]`, `cancel`, `say <base64 text>`.
 */
export const HOST_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
function Send($value) { [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
function FromBase64($text) { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($text)) }
function Choices([string[]]$words) {
  $choices = New-Object System.Speech.Recognition.Choices
  foreach ($word in $words) { if ($word) { $choices.Add($word) } }
  return $choices
}
function Phrase([string[]]$starts, [bool]$dictation, [string[]]$ends) {
  $builder = New-Object System.Speech.Recognition.GrammarBuilder
  $builder.Culture = $script:culture
  $builder.Append((Choices $starts))
  if ($dictation) { $builder.AppendDictation() }
  if ($ends) { $builder.Append((New-Object System.Speech.Recognition.GrammarBuilder((Choices $ends))), 0, 1) }
  return $builder
}

$script:vocabulary = @{ open = @('chrome'); phrases = @('volume up') }
$script:engines = @{}
$script:engine = $null
$script:rejected = $null
$script:lastLevel = [DateTime]::MinValue
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

function Get-Engine($language) {
  if ($script:engines.ContainsKey($language)) { return $script:engines[$language] }
  $script:culture = New-Object System.Globalization.CultureInfo($language)
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($script:culture)
  try {
    $all = New-Object System.Speech.Recognition.Choices
    $open = New-Object System.Speech.Recognition.GrammarBuilder
    $open.Culture = $script:culture
    $open.Append((Choices @('open', 'launch', 'start', 'go to', 'open up', 'show me', 'switch to')))
    $open.Append((New-Object System.Speech.Recognition.GrammarBuilder((Choices @('the', 'my')))), 0, 1)
    $open.Append((Choices $script:vocabulary.open))
    $open.Append((New-Object System.Speech.Recognition.GrammarBuilder((Choices @('in chrome', 'in edge', 'in firefox', 'on chrome', 'using chrome')))), 0, 1)
    $all.Add($open)
    $all.Add((Phrase @('add task', 'add a task', 'add a new task', 'create a task', 'new task', 'remind me to') $true $null))
    $all.Add((Phrase @('add skill', 'add a skill', 'add a new skill', 'i am learning') $true $null))
    $all.Add((Phrase @('add goal', 'add a goal', 'set a goal to', 'new goal') $true $null))
    $all.Add((Phrase @('mark', 'tick off', 'complete', 'i finished') $true @('as done', 'done', 'as complete')))
    $all.Add((Phrase @('search for', 'search', 'google', 'look up') $true @('on youtube', 'on google', 'in chrome', 'in edge')))
    $all.Add((Phrase @('play') $true @('on youtube')))
    foreach ($phrase in $script:vocabulary.phrases) { $all.Add($phrase) }
    $builder = New-Object System.Speech.Recognition.GrammarBuilder($all)
    $builder.Culture = $script:culture
    $commands = New-Object System.Speech.Recognition.Grammar($builder)
    $commands.Name = 'command'
    $commands.Priority = 1
    $engine.LoadGrammar($commands)
  } catch {
    Send @{ type = 'warning'; message = "Command phrases could not be loaded: $($_.Exception.Message)" }
  }
  $dictation = New-Object System.Speech.Recognition.DictationGrammar
  $dictation.Name = 'dictation'
  $dictation.Weight = 0.5
  $engine.LoadGrammar($dictation)
  $engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(8)
  $engine.BabbleTimeout = [TimeSpan]::FromSeconds(15)
  $engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(700)
  $engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(1200)
  Register-ObjectEvent -InputObject $engine -EventName AudioLevelUpdated -SourceIdentifier "level-$language" | Out-Null
  Register-ObjectEvent -InputObject $engine -EventName SpeechRecognitionRejected -SourceIdentifier "rejected-$language" | Out-Null
  Register-ObjectEvent -InputObject $engine -EventName RecognizeCompleted -SourceIdentifier "done-$language" | Out-Null
  $script:engines[$language] = $engine
  return $engine
}

function Reset-Engines {
  foreach ($language in @($script:engines.Keys)) {
    foreach ($name in 'level', 'rejected', 'done') { Unregister-Event -SourceIdentifier "$name-$language" -ErrorAction SilentlyContinue }
    $script:engines[$language].Dispose()
  }
  $script:engines = @{}
}

function Handle-Command($line) {
  $parts = $line.Split(' ')
  switch ($parts[0]) {
    'grammar' {
      $value = (FromBase64 $parts[1]) | ConvertFrom-Json
      $script:vocabulary = @{ open = @($value.open); phrases = @($value.phrases) }
      Reset-Engines
    }
    'listen' {
      $synth.SpeakAsyncCancelAll()
      if ($script:engine) { $script:engine.RecognizeAsyncCancel() }
      $script:engine = Get-Engine $parts[1]
      if ($parts.Length -gt 2) { $script:engine.SetInputToWaveFile((FromBase64 $parts[2])) } else { $script:engine.SetInputToDefaultAudioDevice() }
      $script:rejected = $null
      $script:engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Single)
      Send @{ type = 'ready' }
    }
    'cancel' { if ($script:engine) { $script:engine.RecognizeAsyncCancel() } }
    'say' { $synth.SpeakAsyncCancelAll(); $synth.SpeakAsync((FromBase64 $parts[1])) | Out-Null }
    'quit' { exit 0 }
  }
}

function Handle-Event($item) {
  $name = $item.SourceIdentifier.Split('-')[0]
  $info = $item.SourceEventArgs
  if ($name -eq 'level') {
    $now = [DateTime]::Now
    if (($now - $script:lastLevel).TotalMilliseconds -ge 90) { $script:lastLevel = $now; Send @{ type = 'level'; value = $info.AudioLevel } }
  } elseif ($name -eq 'rejected') {
    if ($info.Result -and $info.Result.Text) { $script:rejected = @{ text = $info.Result.Text; confidence = $info.Result.Confidence } }
  } elseif ($name -eq 'done') {
    try { $script:engine.SetInputToNull() } catch {}
    if ($info.Error) { Send @{ type = 'error'; message = $info.Error.Message } }
    elseif ($info.Cancelled) { Send @{ type = 'result'; text = ''; confidence = 0; source = 'none' } }
    elseif ($info.Result) { Send @{ type = 'result'; text = $info.Result.Text; confidence = $info.Result.Confidence; source = $info.Result.Grammar.Name } }
    elseif ($script:rejected) { Send @{ type = 'result'; text = $script:rejected.text; confidence = $script:rejected.confidence; source = 'rejected' } }
    else { Send @{ type = 'result'; text = ''; confidence = 0; source = 'none' } }
  }
}

$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$pending = $reader.ReadLineAsync()
Send @{ type = 'started' }
while ($true) {
  if ($pending.IsCompleted) {
    $line = $pending.Result
    if ($null -eq $line) { exit 0 }
    $pending = $reader.ReadLineAsync()
    try { Handle-Command $line } catch { Send @{ type = 'error'; message = $_.Exception.Message } }
  }
  foreach ($item in @(Get-Event -ErrorAction SilentlyContinue)) {
    Remove-Event -EventIdentifier $item.EventIdentifier
    try { Handle-Event $item } catch { Send @{ type = 'error'; message = $_.Exception.Message } }
  }
  Start-Sleep -Milliseconds 20
}
`

type HostMessage =
  | { type: 'started' | 'ready' }
  | { type: 'level'; value: number }
  | { type: 'result'; text: string; confidence: number; source: string }
  | { type: 'error' | 'warning'; message: string }

interface Waiting extends ListenEvents {
  resolve(heard: Heard): void
  reject(error: Error): void
  timer: NodeJS.Timeout
}

const asSource = (value: string): Heard['source'] =>
  value === 'command' || value === 'dictation' || value === 'rejected' ? value : 'none'

/** Words the engine can take: letters and spaces only, so a stray symbol cannot break the grammar. */
const speakable = (words: string[]): string[] =>
  [...new Set(words.map((word) => word.toLowerCase().trim()).filter((word) => /^[a-z][a-z ']*$/.test(word)))]

/** One long-lived speech process. Listening, cancelling, and speaking all go through it. */
export class SpeechHost {
  private child: ChildProcess | null = null
  private buffer = ''
  private waiting: Waiting | null = null
  private idle: NodeJS.Timeout | null = null
  private vocabulary = { open: [] as string[], phrases: [] as string[] }

  constructor(
    private readonly spawn: Spawn,
    private readonly powershell: string,
    private readonly onWarning: (message: string) => void = () => undefined,
    private readonly idleLimit = IDLE_LIMIT_MS
  ) {}

  get listening(): boolean {
    return this.waiting !== null
  }

  get running(): boolean {
    return this.child !== null
  }

  /** The names that may follow "open", and whole phrases to listen for. Takes effect at once. */
  setVocabulary(open: string[], phrases: string[]): void {
    this.vocabulary = { open: speakable(open), phrases: speakable(phrases) }
    if (this.child) this.sendGrammar()
  }

  listen(language: VoiceLanguage, events: ListenEvents, audioFile?: string): Promise<Heard> {
    this.cancel()
    this.ensure()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.finish({ text: '', confidence: 0, source: 'none' }), LISTEN_LIMIT_MS)
      this.waiting = { ...events, resolve, reject, timer }
      this.send(`listen ${language}${audioFile ? ` ${encode(audioFile)}` : ''}`)
    })
  }

  /** Stops listening. Whatever was being listened for resolves as nothing heard. */
  cancel(): void {
    if (!this.waiting) return
    this.send('cancel')
    this.finish({ text: '', confidence: 0, source: 'none' })
  }

  /** Says a reply aloud, interrupting anything still being said. */
  say(text: string): void {
    if (!text.trim()) return
    this.ensure()
    this.send(`say ${encode(text)}`)
  }

  dispose(): void {
    this.cancel()
    if (this.idle) clearTimeout(this.idle)
    this.child?.kill()
    this.child = null
  }

  private ensure(): void {
    this.keepAlive()
    if (this.child) return
    const encoded = Buffer.from(HOST_SCRIPT, 'utf16le').toString('base64')
    const child = this.spawn(this.powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true
    })
    this.child = child
    this.buffer = ''
    child.stdout?.on('data', (chunk: Buffer) => this.read(chunk.toString()))
    child.on('error', () => this.lost(child, 'Windows speech recognition could not be started.'))
    child.on('close', () => this.lost(child, 'Windows speech recognition stopped unexpectedly.'))
    this.sendGrammar()
  }

  private keepAlive(): void {
    if (this.idle) clearTimeout(this.idle)
    this.idle = setTimeout(() => {
      if (this.waiting) return this.keepAlive()
      this.dispose()
    }, this.idleLimit)
  }

  private sendGrammar(): void {
    this.send(`grammar ${encode(JSON.stringify(this.vocabulary))}`)
  }

  private send(line: string): void {
    this.child?.stdin?.write(`${line}\n`)
  }

  private read(text: string): void {
    this.buffer += text
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim().startsWith('{')) continue
      try {
        this.handle(JSON.parse(line) as HostMessage)
      } catch {
        // A line that is not JSON is ignored, so stray output cannot stop listening.
      }
    }
  }

  private handle(message: HostMessage): void {
    switch (message.type) {
      case 'ready':
        this.waiting?.onReady()
        return
      case 'level':
        this.waiting?.onLevel(Number(message.value) || 0)
        return
      case 'result':
        this.finish({
          text: typeof message.text === 'string' ? message.text.trim() : '',
          confidence: typeof message.confidence === 'number' ? message.confidence : 0,
          source: asSource(message.source)
        })
        return
      case 'error':
        this.fail(new Error(message.message))
        return
      case 'warning':
        this.onWarning(message.message)
        return
    }
  }

  private finish(heard: Heard): void {
    const waiting = this.waiting
    if (!waiting) return
    this.waiting = null
    clearTimeout(waiting.timer)
    waiting.resolve(heard)
  }

  private fail(error: Error): void {
    const waiting = this.waiting
    if (!waiting) return this.onWarning(error.message)
    this.waiting = null
    clearTimeout(waiting.timer)
    waiting.reject(error)
  }

  private lost(child: ChildProcess, message: string): void {
    if (this.child !== child) return
    this.child = null
    this.fail(new Error(message))
  }
}
