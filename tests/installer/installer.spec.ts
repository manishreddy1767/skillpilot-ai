import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const root = resolve(__dirname, '../..')
const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version
const installer = join(root, 'release', `SkillPilot AI Setup ${version}.exe`)
const work = mkdtempSync(join(tmpdir(), 'skillpilot-install-'))
const target = join(work, 'app')
const dataFolder = join(work, 'data')
const program = join(target, 'SkillPilot AI.exe')
const realDatabase = join(process.env['APPDATA'] ?? '', 'SkillPilot AI', 'skillpilot.db')
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'

let app: ElectronApplication
let server: Server
let base = ''
const realDatabaseBefore = existsSync(realDatabase) ? statSync(realDatabase).size : -1

function cleanEnv(): Record<string, string> {
  const env = { ...process.env, ANTHROPIC_BASE_URL: base } as Record<string, string>
  delete env['ELECTRON_RUN_AS_NODE']
  return env
}

async function page(title: string): Promise<Page> {
  await expect
    .poll(async () => {
      for (const window of app.windows()) if ((await window.title()) === title) return true
      return false
    })
    .toBe(true)
  for (const window of app.windows()) if ((await window.title()) === title) return window
  throw new Error(`No window ${title}`)
}

function runKeyHas(name: string): boolean {
  try {
    return execSync(`reg query "${RUN_KEY}"`, { encoding: 'utf8' }).includes(name)
  } catch {
    return false
  }
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      send('message_start', {
        type: 'message_start',
        message: {
          id: 'm',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 }
        }
      })
      send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
      send('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: JSON.stringify({ reply: 'Packaged reply', proposals: [] }) }
      })
      send('content_block_stop', { type: 'content_block_stop', index: 0 })
      send('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 2 }
      })
      send('message_stop', { type: 'message_stop' })
      res.end()
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

test.afterAll(async () => {
  await app?.close().catch(() => undefined)
  await new Promise((done) => server.close(done))
  const uninstaller = join(target, 'Uninstall SkillPilot AI.exe')
  if (existsSync(uninstaller)) execFileSync(uninstaller, ['/S'], { stdio: 'ignore' })
  // Windows can hold the folder briefly after the uninstaller exits.
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 1000 })
  } catch {
    console.log(`Could not remove ${work}`)
  }
})

test('installs silently into the chosen folder', () => {
  expect(existsSync(installer)).toBe(true)
  // The NSIS /D option must come last and must not be quoted.
  execSync(`"${installer}" /S /currentuser /D=${target}`, { stdio: 'ignore' })
  expect(existsSync(program)).toBe(true)
  expect(existsSync(join(target, 'Uninstall SkillPilot AI.exe'))).toBe(true)
})

test('the installed app starts on its own data folder', async () => {
  const started = Date.now()
  app = await _electron.launch({
    executablePath: program,
    args: [`--user-data-dir=${dataFolder}`],
    env: cleanEnv()
  })
  const folder = await app.evaluate(({ app }) => app.getPath('userData'))
  // Everything after this changes data, so stop here if it is not the test folder.
  expect(resolve(folder)).toBe(resolve(dataFolder))
  await page('SkillPilot Widget')
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'SkillPilot Widget' && w.isVisible())
      )
    )
    .toBe(true)
  writeFileSync(join(work, 'startup-ms.txt'), String(Date.now() - started))
  expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true)
  console.log(`Startup to visible widget, including test tooling: ${Date.now() - started} ms`)
})

test('the bundled database, encryption and AI all work', async () => {
  await app.evaluate(({ BrowserWindow, ipcMain }) => {
    void BrowserWindow
    ipcMain.emit('overview:open-app', {
      sender: BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'SkillPilot Overview')!.webContents
    })
  })
  const appPage = await page('SkillPilot AI')
  const result = await appPage.evaluate(async () => {
    const api = window.skillpilot
    const profile = await api.saveProfile({ fullName: 'Installer Test' })
    const settings = await api.getSettings()
    if (!settings.ok) throw new Error(settings.message)
    await api.saveSettings({ ...settings.value, aiProvider: 'claude' })
    const key = await api.saveApiKey('sk-installer-test')
    const chat = await api.sendChat('Hello')
    return { profile: profile.ok, key: key.ok, chat }
  })
  expect(result.profile).toBe(true)
  expect(result.key).toBe(true)
  expect(result.chat).toMatchObject({ ok: true, value: [{ content: 'Hello' }, { content: 'Packaged reply' }] })
  expect(existsSync(join(dataFolder, 'skillpilot.db'))).toBe(true)
  expect(readFileSync(join(dataFolder, 'api-key.enc')).includes('sk-installer-test')).toBe(false)
})

test('a real Windows notification is delivered', async () => {
  const outcome = await app.evaluate(
    ({ Notification }) =>
      new Promise<string>((done) => {
        const notice = new Notification({ title: 'SkillPilot AI', body: 'Installer test notification.' })
        notice.on('show', () => done('shown'))
        notice.on('failed', (_event, error) => done(`failed: ${error}`))
        notice.show()
        setTimeout(() => done('no response'), 8000)
      })
  )
  expect(outcome).toBe('shown')
})

test('start at login registers with Windows, and can be removed', async () => {
  const appPage = await page('SkillPilot AI')
  const setLogin = (value: string) =>
    appPage.evaluate(async (state) => {
      const current = await window.skillpilot.getSettings()
      if (!current.ok) throw new Error(current.message)
      return window.skillpilot.saveSettings({ ...current.value, startAtLogin: state })
    }, value)

  await setLogin('on')
  expect(await app.evaluate(({ app }) => app.getLoginItemSettings().openAtLogin)).toBe(true)
  expect(runKeyHas('SkillPilot')).toBe(true)

  await setLogin('off')
  expect(await app.evaluate(({ app }) => app.getLoginItemSettings().openAtLogin)).toBe(false)
  expect(runKeyHas('SkillPilot')).toBe(false)
})

test('memory and CPU stay modest', async () => {
  await new Promise((done) => setTimeout(done, 10_000))
  const script = `
    $p = Get-Process | Where-Object { $_.Path -eq '${program.replace(/'/g, "''")}' }
    $a = ($p | Measure-Object CPU -Sum).Sum
    Start-Sleep 10
    $p2 = Get-Process | Where-Object { $_.Path -eq '${program.replace(/'/g, "''")}' }
    $b = ($p2 | Measure-Object CPU -Sum).Sum
    '{0}|{1}|{2}|{3}' -f $p2.Count, [math]::Round(($p2 | Measure-Object WorkingSet64 -Sum).Sum / 1MB), [math]::Round(($p2 | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB), [math]::Round(($b - $a), 2)
  `
  const output = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim()
  const [processes, workingSet, privateMemory, cpuSeconds] = output.split('|').map(Number)
  console.log(`Full window open: ${processes} processes, ${workingSet} MB working set, ${privateMemory} MB private, ${cpuSeconds}s CPU over 10s idle`)
  expect(workingSet).toBeLessThan(1000)
  expect(cpuSeconds).toBeLessThan(2)
})

test('uninstalling removes the app and leaves real data alone', async () => {
  await app.close()
  await new Promise((done) => setTimeout(done, 1500))
  execFileSync(join(target, 'Uninstall SkillPilot AI.exe'), ['/S'], { stdio: 'ignore' })
  await expect.poll(() => existsSync(program), { timeout: 30_000 }).toBe(false)
  if (realDatabaseBefore >= 0) expect(existsSync(realDatabase)).toBe(true)
  expect(runKeyHas('SkillPilot')).toBe(false)
})
