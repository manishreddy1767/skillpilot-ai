import type { Result } from '../../shared/career'
import { VOICE_LANGUAGES, type Heard, type SpeechRecognizer, type VoiceLanguage } from './recognizer'

export interface VoiceDeps {
  recognizer: Pick<SpeechRecognizer, 'listen' | 'cancel'>
  /** The saved speech language. Anything unknown falls back to US English. */
  language(): string
  /** Tells the app window that the microphone is now open. */
  onReady(): void
  /** Only for tests: a sound file to listen to instead of the microphone. */
  audioFile(): string | undefined
  logError(error: unknown): void
}

const isLanguage = (value: string): value is VoiceLanguage => (VOICE_LANGUAGES as readonly string[]).includes(value)

export function createVoiceHandlers({ recognizer, language, onReady, audioFile, logError }: VoiceDeps) {
  return {
    listen: async (): Promise<Result<Heard>> => {
      const chosen = language()
      try {
        const heard = await recognizer.listen(isLanguage(chosen) ? chosen : 'en-US', onReady, audioFile())
        return { ok: true, value: heard }
      } catch (error) {
        logError(error)
        const detail = error instanceof Error ? error.message : ''
        const microphone = /audio|device|microphone/i.test(detail)
        return {
          ok: false,
          message: microphone
            ? 'No microphone could be used. Check one is connected, and that desktop apps may use it in Windows privacy settings.'
            : 'Windows speech recognition did not work. Check that an English speech language is installed in Windows settings.'
        }
      }
    },

    stopListening: (): Result<boolean> => {
      recognizer.cancel()
      return { ok: true, value: true }
    }
  }
}
