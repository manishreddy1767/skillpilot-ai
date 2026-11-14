import type { Result } from '../../shared/career'
import type { VoiceStatus } from '../../shared/ipc'
import { VOICE_LANGUAGES, type Heard, type ListenEvents, type VoiceLanguage } from './speech-host'
import type { VoiceOutcome } from './voice-agent'

export interface VoiceControllerDeps {
  host: {
    listen(language: VoiceLanguage, events: ListenEvents, audioFile?: string): Promise<Heard>
    cancel(): void
    say(text: string): void
  }
  respond(heard: Heard): Promise<VoiceOutcome>
  /** The saved speech language. Anything unknown falls back to US English. */
  language(): string
  /** Whether replies are spoken aloud. */
  speakReplies(): boolean
  /** Only for tests: a sound file to listen to instead of the microphone. */
  audioFile(): string | undefined
  /** Tells every window how listening is going. */
  broadcast(status: VoiceStatus): void
  logError(error: unknown): void
}

const isLanguage = (value: string): value is VoiceLanguage => (VOICE_LANGUAGES as readonly string[]).includes(value)

const plainError = (error: unknown): string => {
  const detail = error instanceof Error ? error.message : ''
  if (/muted/i.test(detail)) {
    return 'Your microphone is muted in Windows. Unmute it with the microphone key on your keyboard, or in Settings > System > Sound > Input, then try again.'
  }
  return /audio|device|microphone/i.test(detail)
    ? 'No microphone could be used. Check one is connected, and that desktop apps may use it in Windows privacy settings.'
    : 'Windows speech recognition did not work. Check that an English speech language is installed in Windows settings.'
}

/** One conversation turn at a time: listen, act, then reply in text and, if wanted, aloud. */
export class VoiceController {
  private turn = 0
  private active = false

  constructor(private readonly deps: VoiceControllerDeps) {}

  get listening(): boolean {
    return this.active
  }

  async listen(): Promise<Result<VoiceOutcome>> {
    const { host, broadcast } = this.deps
    const turn = ++this.turn
    const current = (): boolean => turn === this.turn
    this.active = true
    broadcast({ phase: 'starting' })
    const chosen = this.deps.language()
    let heard: Heard
    try {
      heard = await host.listen(
        isLanguage(chosen) ? chosen : 'en-US',
        {
          onReady: () => current() && broadcast({ phase: 'listening', level: 0 }),
          onLevel: (level) => current() && broadcast({ phase: 'listening', level })
        },
        this.deps.audioFile()
      )
    } catch (error) {
      if (!current()) return { ok: true, value: { heard: '', reply: '' } }
      this.active = false
      this.deps.logError(error)
      const message = plainError(error)
      broadcast({ phase: 'done', reply: message, failed: true })
      return { ok: false, message }
    }

    // Stopped, or replaced by a newer listen: stay quiet.
    if (!current() || !this.active) return { ok: true, value: { heard: '', reply: '' } }
    this.active = false
    broadcast({ phase: 'working', heard: heard.text })
    const outcome = await this.deps.respond(heard)
    if (!current()) return { ok: true, value: outcome }
    broadcast({ phase: 'done', heard: outcome.heard, reply: outcome.reply })
    if (this.deps.speakReplies()) host.say(outcome.reply)
    return { ok: true, value: outcome }
  }

  stop(): Result<boolean> {
    this.turn++
    this.active = false
    this.deps.host.cancel()
    this.deps.broadcast({ phase: 'idle' })
    return { ok: true, value: true }
  }
}
