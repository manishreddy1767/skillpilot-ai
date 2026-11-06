import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const launcher = resolve(__dirname, '../../scripts/dev.mjs')
let folder: string

/** Runs the launcher with a stand-in `npx` that reports what it was given. */
function launch(args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  env[pathKey] = `${folder}${delimiter}${env[pathKey] ?? ''}`
  return spawnSync(process.execPath, [launcher, ...args], { env, encoding: 'utf8' })
}

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), 'skillpilot-dev-'))
  writeFileSync(
    join(folder, 'npx.cmd'),
    '@echo RUN_AS_NODE=[%ELECTRON_RUN_AS_NODE%] ARGS=[%*]\r\n@exit /b 3\r\n'
  )
})

afterAll(() => rmSync(folder, { recursive: true, force: true }))

describe('dev launcher', () => {
  it('clears ELECTRON_RUN_AS_NODE before starting', () => {
    expect(launch([]).stdout).toContain('RUN_AS_NODE=[]')
  })

  it('runs the dev server by default', () => {
    expect(launch([]).stdout).toContain('ARGS=[electron-vite dev]')
  })

  it('passes another command through', () => {
    expect(launch(['preview']).stdout).toContain('ARGS=[electron-vite preview]')
  })

  it('exits with the same code as the child', () => {
    expect(launch([]).status).toBe(3)
  })
})
