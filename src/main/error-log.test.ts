import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatError, installErrorLog, writeErrorLog } from './error-log'

let folder: string
let logPath: string

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'skillpilot-log-'))
  logPath = join(folder, 'logs', 'errors.log')
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
  process.removeAllListeners('skillpilot-test')
})

const when = new Date('2026-11-06T10:00:00.000Z')

describe('formatError', () => {
  it('includes the time and the stack', () => {
    const line = formatError(new Error('boom'), when)
    expect(line).toContain('[2026-11-06T10:00:00.000Z]')
    expect(line).toContain('Error: boom')
    expect(line).toContain('error-log.test')
  })

  it('handles values that are not errors', () => {
    expect(formatError('plain text', when)).toBe('[2026-11-06T10:00:00.000Z] plain text\n')
  })
})

describe('writeErrorLog', () => {
  it('creates the folder and appends each error', () => {
    writeErrorLog(logPath, 'first', when)
    writeErrorLog(logPath, 'second', when)
    expect(existsSync(logPath)).toBe(true)
    expect(readFileSync(logPath, 'utf8').trim().split('\n')).toHaveLength(2)
  })
})

describe('installErrorLog', () => {
  function install(path = logPath) {
    const on = vi.spyOn(process, 'on').mockImplementation(() => process)
    const showError = vi.fn()
    installErrorLog(path, showError)
    const handlers = Object.fromEntries(on.mock.calls) as Record<string, (e: unknown) => void>
    on.mockRestore()
    return { handlers, showError }
  }

  it('listens for both kinds of unexpected failure', () => {
    const { handlers } = install()
    expect(Object.keys(handlers).sort()).toEqual(['uncaughtException', 'unhandledRejection'])
  })

  it('saves the error and tells the user where the details are', () => {
    const { handlers, showError } = install()
    handlers['uncaughtException']?.(new Error('boom'))
    expect(readFileSync(logPath, 'utf8')).toContain('Error: boom')
    expect(showError).toHaveBeenCalledOnce()
    expect(showError.mock.calls[0]?.[1]).toContain('boom')
    expect(showError.mock.calls[0]?.[1]).toContain(logPath)
  })

  it('still reports the error if the log cannot be written', () => {
    const { handlers, showError } = install(join(folder, '\0bad', 'errors.log'))
    handlers['unhandledRejection']?.('failed')
    expect(showError).toHaveBeenCalledOnce()
  })
})
