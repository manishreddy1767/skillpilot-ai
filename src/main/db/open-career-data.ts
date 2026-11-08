import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { AiStore } from '../ai/ai-store'
import { dailyBackup, preMigrationBackup } from './backup'
import { CareerStore } from './career-store'
import { migrate, migrations } from './migrations'
import { DataTransfer } from './portability'

const BACKUP_CHECK_INTERVAL = 60 * 60 * 1000

export interface CareerData {
  /** Null when the database could not be opened. The widget still runs. */
  store: CareerStore | null
  aiStore: AiStore | null
  transfer: DataTransfer | null
  close(): void
}

export interface OpenOptions {
  folder: string
  logError(error: unknown): void
  /** For failures the user must know about. */
  alertError(error: unknown): void
  steps?: string[]
}

export function openCareerData({
  folder,
  logError,
  alertError,
  steps = migrations
}: OpenOptions): CareerData {
  const backups = join(folder, 'backups')
  let db: DatabaseSync | null = null

  try {
    mkdirSync(folder, { recursive: true })
    db = new DatabaseSync(join(folder, 'skillpilot.db'))
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    const opened = db
    migrate(opened, (fromVersion) => preMigrationBackup(opened, backups, fromVersion), steps)

    const backUp = (): void => {
      try {
        dailyBackup(opened, backups)
      } catch (error) {
        // A missed backup should not interrupt the user. It retries within the hour.
        logError(error)
      }
    }
    backUp()
    const timer = setInterval(backUp, BACKUP_CHECK_INTERVAL)
    timer.unref()

    return {
      store: new CareerStore(opened),
      aiStore: new AiStore(opened),
      transfer: new DataTransfer(opened, backups),
      close: () => {
        clearInterval(timer)
        opened.close()
      }
    }
  } catch (error) {
    // The file is left exactly as it was, so nothing is lost.
    try {
      db?.close()
    } catch {
      // Already failing: the original error is the one worth reporting.
    }
    logError(error)
    alertError(error)
    return { store: null, aiStore: null, transfer: null, close: () => undefined }
  }
}
