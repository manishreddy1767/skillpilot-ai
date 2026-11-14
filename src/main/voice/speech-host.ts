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
  /** The loudest the microphone got, from 0 to 100, when listening to a real microphone. */
  peak?: number
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
 * Commands: `grammar <base64 json>`, `listen <id> <language> [base64 wav path]`, `cancel`, `say <base64 text>`.
 * Every message about a listen carries its id, so a late answer to an old listen is never mistaken for a new one.
 */
export const HOST_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
function Send($value) { [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
function FromBase64($text) { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($text)) }

# Reads whether Windows has the default microphone muted, through the Core Audio API.
try {
  Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { int f(); int g(); int GetChannelCount(out int c); int SetMasterVolumeLevel(float l, Guid g); int SetMasterVolumeLevelScalar(float l, Guid g); int GetMasterVolumeLevel(out float l); int GetMasterVolumeLevelScalar(out float l); int a(); int b(); int c(); int d(); int e(); int SetMute(bool m, Guid g); int GetMute(out bool m); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int EnumAudioEndpoints(int f, int s, out IntPtr d); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
public static class SkillPilotMicrophone {
  public static bool Muted() {
    var devices = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDevice device;
    if (devices.GetDefaultAudioEndpoint(1, 0, out device) != 0) return false;
    var id = typeof(IAudioEndpointVolume).GUID;
    object volume;
    device.Activate(ref id, 23, IntPtr.Zero, out volume);
    bool muted;
    ((IAudioEndpointVolume)volume).GetMute(out muted);
    return muted;
  }
}
'@
  $script:canCheckMute = $true
} catch { $script:canCheckMute = $false }
function Test-Muted { if (-not $script:canCheckMute) { return $false }; try { return [SkillPilotMicrophone]::Muted() } catch { return $false } }
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
# A recognition is running. New vocabulary waits until it ends, and so does a new listen.
$script:busy = $false
$script:stale = $false
$script:queued = $null
$script:listenId = 0
$script:peak = 0
$script:levels = 0
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

function Get-Engine($language) {
  if ($script:engines.ContainsKey($language)) { return $script:engines[$language] }
  $script:culture = New-Object System.Globalization.CultureInfo($language)
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($script:culture)
  try {
    $all = New-Object System.Speech.Recognition.Choices
    # Windows refuses an empty choice, so only listen for what there is.
    $names = @($script:vocabulary.open | Where-Object { $_ })
    if ($names.Count -gt 0) {
    $open = New-Object System.Speech.Recognition.GrammarBuilder
    $open.Culture = $script:culture
    $open.Append((Choices @('open', 'launch', 'start', 'go to', 'open up', 'show me', 'switch to')))
    $open.Append((New-Object System.Speech.Recognition.GrammarBuilder((Choices @('the', 'my')))), 0, 1)
    $open.Append((Choices $names))
    $open.Append((New-Object System.Speech.Recognition.GrammarBuilder((Choices @('in chrome', 'in edge', 'in firefox', 'on chrome', 'using chrome')))), 0, 1)
    $all.Add($open)
    }
    $all.Add((Phrase @('add task', 'add a task', 'add a new task', 'create a task', 'new task', 'remind me to') $true $null))
    $all.Add((Phrase @('add skill', 'add a skill', 'add a new skill', 'i am learning') $true $null))
    $all.Add((Phrase @('add goal', 'add a goal', 'set a goal to', 'new goal') $true $null))
    $all.Add((Phrase @('mark', 'tick off', 'complete', 'i finished') $true @('as done', 'done', 'as complete')))
    $all.Add((Phrase @('search for', 'search', 'google', 'look up') $true @('on youtube', 'on google', 'in chrome', 'in edge')))
    $all.Add((Phrase @('play') $true @('on youtube')))
    foreach ($phrase in @($script:vocabulary.phrases | Where-Object { $_ })) { $all.Add($phrase) }
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

function Start-Listening($parts) {
  if ($script:stale) { Reset-Engines; $script:stale = $false }
  $script:listenId = [int]$parts[1]
  if ($parts.Length -le 3 -and (Test-Muted)) {
    Send @{ type = 'error'; id = $script:listenId; message = 'The microphone is muted in Windows.' }
    return
  }
  $script:peak = 0
  $script:levels = 0
  $script:engine = Get-Engine $parts[2]
  if ($parts.Length -gt 3) { $script:engine.SetInputToWaveFile((FromBase64 $parts[3])) } else { $script:engine.SetInputToDefaultAudioDevice() }
  $script:rejected = $null
  $script:busy = $true
  $script:engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Single)
  Send @{ type = 'ready'; id = $script:listenId }
}

function Handle-Command($line) {
  $parts = $line.Split(' ')
  switch ($parts[0]) {
    'grammar' {
      $value = (FromBase64 $parts[1]) | ConvertFrom-Json
      $script:vocabulary = @{ open = @($value.open); phrases = @($value.phrases) }
      if ($script:busy) { $script:stale = $true } else { Reset-Engines }
    }
    'listen' {
      $synth.SpeakAsyncCancelAll()
      if ($script:busy) { $script:queued = $line; $script:engine.RecognizeAsyncCancel() }
      else { Start-Listening $parts }
    }
    'cancel' { if ($script:busy) { $script:engine.RecognizeAsyncCancel() } }
    'say' { $synth.SpeakAsyncCancelAll(); $synth.SpeakAsync((FromBase64 $parts[1])) | Out-Null }
    'quit' { exit 0 }
  }
}

function Handle-Event($item) {
  $name = $item.SourceIdentifier.Split('-')[0]
  $info = $item.SourceEventArgs
  if ($name -eq 'level') {
    $now = [DateTime]::Now
    $script:levels++
    if ($info.AudioLevel -gt $script:peak) { $script:peak = $info.AudioLevel }
    if (($now - $script:lastLevel).TotalMilliseconds -ge 90) { $script:lastLevel = $now; Send @{ type = 'level'; id = $script:listenId; value = $info.AudioLevel } }
  } elseif ($name -eq 'rejected') {
    if ($info.Result -and $info.Result.Text) { $script:rejected = @{ text = $info.Result.Text; confidence = $info.Result.Confidence } }
  } elseif ($name -eq 'done') {
    $script:busy = $false
    try { $script:engine.SetInputToNull() } catch {}
    # The app already moved on from a cancelled listen, so it gets no answer.
    if ($info.Cancelled) { }
    elseif ($info.Error) { Send @{ type = 'error'; id = $script:listenId; message = $info.Error.Message } }
    elseif ($info.Result) { Send @{ type = 'result'; id = $script:listenId; text = $info.Result.Text; confidence = $info.Result.Confidence; source = $info.Result.Grammar.Name; peak = $(if ($script:levels) { $script:peak } else { $null }) } }
    elseif ($script:rejected) { Send @{ type = 'result'; id = $script:listenId; text = $script:rejected.text; confidence = $script:rejected.confidence; source = 'rejected'; peak = $(if ($script:levels) { $script:peak } else { $null }) } }
    else { Send @{ type = 'result'; id = $script:listenId; text = ''; confidence = 0; source = 'none'; peak = $(if ($script:levels) { $script:peak } else { $null }) } }
    if ($script:queued) {
      $next = $script:queued
      $script:queued = $null
      try { Start-Listening $next.Split(' ') } catch { Send @{ type = 'error'; message = $_.Exception.Message } }
    }
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
  | { type: 'started' }
  | { type: 'ready'; id: number }
  | { type: 'level'; id: number; value: number }
  | { type: 'result'; id: number; text: string; confidence: number; source: string; peak?: number | null }
  | { type: 'error'; id?: number; message: string }
  | { type: 'warning'; message: string }

interface Waiting extends ListenEvents {
  id: number
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
  private nextId = 0

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
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.cancel(), LISTEN_LIMIT_MS)
      this.waiting = { ...events, id, resolve, reject, timer }
      this.send(`listen ${id} ${language}${audioFile ? ` ${encode(audioFile)}` : ''}`)
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
    // Anything about an earlier listen is out of date.
    if ('id' in message && message.id !== undefined && message.id !== this.waiting?.id) return
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
          source: asSource(message.source),
          ...(typeof message.peak === 'number' ? { peak: message.peak } : {})
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
