import { readFileSync, statSync, writeFileSync } from 'node:fs'
import type { Result } from '../shared/career'
import type { BackupInfo, DataTransfer } from './db/portability'
import { parseExport } from './db/portability'

export interface PortabilityDeps {
  getTransfer(): DataTransfer | null
  /** Asks where to save. Null when cancelled. */
  chooseSavePath(suggestedName: string): Promise<string | null>
  /** Asks which file to open. Null when cancelled. */
  chooseOpenPath(): Promise<string | null>
  /** Refreshes every window after data was replaced. */
  afterReplace(): void
  removeKey(): void
  logError(error: unknown): void
  today(): string
}

const MAX_FILE_BYTES = 50 * 1024 * 1024
const UNAVAILABLE = 'Your data could not be opened. Restart the app, and see the error log if it continues.'
const CONFIRM_ERASE = 'ERASE'

const failure = (message: string): { ok: false; message: string } => ({ ok: false, message })
const cancelled = { ok: true as const, value: null }

export function createPortabilityHandlers(deps: PortabilityDeps) {
  const { getTransfer, chooseSavePath, chooseOpenPath, afterReplace, removeKey, logError, today } = deps

  const guarded = async <T>(work: (transfer: DataTransfer) => Promise<Result<T>> | Result<T>): Promise<Result<T>> => {
    const transfer = getTransfer()
    if (!transfer) return failure(UNAVAILABLE)
    try {
      return await work(transfer)
    } catch (error) {
      logError(error)
      return failure('That did not work, and your data is unchanged.')
    }
  }

  return {
    exportData: (): Promise<Result<string | null>> =>
      guarded(async (transfer) => {
        const path = await chooseSavePath(`SkillPilot AI export ${today()}.json`)
        if (!path) return cancelled
        writeFileSync(path, JSON.stringify(transfer.exportData(new Date().toISOString()), null, 2))
        return { ok: true, value: path }
      }),

    importData: (): Promise<Result<string | null>> =>
      guarded(async (transfer) => {
        const path = await chooseOpenPath()
        if (!path) return cancelled
        if (statSync(path).size > MAX_FILE_BYTES) return failure('That file is too large to import.')
        let parsed: unknown
        try {
          parsed = JSON.parse(readFileSync(path, 'utf8'))
        } catch {
          return failure('That file could not be read. It may be damaged.')
        }
        const checked = parseExport(parsed, transfer.schemaVersion)
        if (!checked.ok) return checked
        try {
          transfer.importData(checked.file)
        } catch (error) {
          logError(error)
          return failure('That file has data the app cannot accept, so nothing was changed.')
        }
        afterReplace()
        return { ok: true, value: path }
      }),

    listBackups: (): Promise<Result<BackupInfo[]>> =>
      guarded((transfer) => ({ ok: true, value: transfer.listBackups() })),

    restoreBackup: (name: unknown): Promise<Result<boolean>> =>
      guarded((transfer) => {
        if (typeof name !== 'string') return failure('That backup no longer exists.')
        const result = transfer.restoreBackup(name)
        if (!result.ok) return result
        afterReplace()
        return { ok: true, value: true }
      }),

    eraseAll: (confirmation: unknown): Promise<Result<boolean>> =>
      guarded((transfer) => {
        if (confirmation !== CONFIRM_ERASE) return failure(`Type ${CONFIRM_ERASE} to confirm.`)
        transfer.eraseAll()
        removeKey()
        afterReplace()
        return { ok: true, value: true }
      })
  }
}
