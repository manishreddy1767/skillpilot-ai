import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function formatError(error: unknown, when: Date): string {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
  return `[${when.toISOString()}] ${detail}\n`
}

export function writeErrorLog(logPath: string, error: unknown, when = new Date()): void {
  mkdirSync(dirname(logPath), { recursive: true })
  appendFileSync(logPath, formatError(error, when))
}

/** Saves unexpected main process errors, so the exact details are never lost. */
export function installErrorLog(
  logPath: string,
  showError: (title: string, message: string) => void
): void {
  const report = (error: unknown): void => {
    try {
      writeErrorLog(logPath, error)
    } catch {
      // The message below still tells the user what happened.
    }
    const message = error instanceof Error ? error.message : String(error)
    showError('SkillPilot AI error', `${message}\n\nDetails were saved to:\n${logPath}`)
  }
  process.on('uncaughtException', report)
  process.on('unhandledRejection', report)
}
