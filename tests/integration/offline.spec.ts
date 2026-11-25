import { execFileSync } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { APP, Harness } from './app-harness'

/**
 * SkillPilot must never reach the internet. These tests try to from every part of the real app, and
 * then ask Windows which connections the app's processes actually have open.
 */
let h: Harness
let server: Server | null = null

test.afterEach(async () => {
  await h.close()
  if (server) await new Promise((done) => server!.close(done))
  server = null
})

const blocked = () => h.app.evaluate(() => (globalThis as { __skillpilotBlocked?: string[] }).__skillpilotBlocked ?? [])

test('pages cannot reach the internet, even by loading an image', async () => {
  h = await Harness.launch()
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  const page = await h.page(APP)
  const results = await page.evaluate(async () => {
    const attempt = async (work: () => Promise<unknown>) => {
      try {
        await work()
        return 'reached'
      } catch {
        return 'blocked'
      }
    }
    const image = await new Promise((done) => {
      const img = new Image()
      img.onload = () => done('reached')
      img.onerror = () => done('blocked')
      img.src = 'https://www.linkedin.com/favicon.ico'
    })
    return {
      fetch: await attempt(() => fetch('https://www.naukri.com/')),
      image
    }
  })
  // The pages' own security policy stops these first; the network lock below is the second wall.
  expect(results).toEqual({ fetch: 'blocked', image: 'blocked' })
})

test('the network lock stops even a window told to open a website', async () => {
  h = await Harness.launch()
  const outcome = await h.app.evaluate(async ({ BrowserWindow }) => {
    const window = new BrowserWindow({ show: false })
    try {
      await window.loadURL('https://www.naukri.com/')
      return 'loaded'
    } catch (error) {
      return (error as Error).message
    } finally {
      window.destroy()
    }
  })
  expect(outcome).toContain('ERR_BLOCKED_BY_CLIENT')
  expect(await blocked()).toContain('www.naukri.com')
})

test('the main process can reach only this laptop', async () => {
  h = await Harness.launch()
  server = createServer((_req, res) => res.end('local ok'))
  await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done))
  const local = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  const result = await h.app.evaluate(async (_electron, address) => {
    const outside = await fetch('https://api.anthropic.com/v1/messages').then(
      () => 'reached',
      (error: Error) => error.message
    )
    const inside = await fetch(address).then((response) => response.text())
    return { outside, inside }
  }, local)
  expect(result.outside).toContain('blocked a connection to api.anthropic.com')
  expect(result.inside).toBe('local ok')
  expect(await blocked()).toContain('api.anthropic.com')
})

test('the spell checker is off, so no dictionary is downloaded', async () => {
  h = await Harness.launch()
  const enabled = await h.app.evaluate(({ session }) => session.defaultSession.isSpellCheckerEnabled())
  expect(enabled).toBe(false)
})

test.describe('on Windows', () => {
  test.skip(process.platform !== 'win32', 'Reads Windows network tables')

  test('the running app holds no connection to anywhere but this laptop', async () => {
    h = await Harness.launch()
    await h.clickWidget()
    await expect.poll(() => h.visible(APP)).toBe(true)
    const page = await h.page(APP)
    for (const section of ['Dashboard', 'Skills', 'Assistant', 'Settings']) {
      await page.getByRole('button', { name: section, exact: true }).click()
    }
    await page.waitForTimeout(2_000)
    const root = h.app.process().pid!
    const output = execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `$ids = @(${root}) + @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${root} } | ForEach-Object ProcessId);` +
        `Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.OwningProcess } | ForEach-Object { $_.RemoteAddress }`
    ]).toString()
    const remotes = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const outside = remotes.filter((address) => !['127.0.0.1', '::1', '0.0.0.0', '::'].includes(address))
    expect(outside).toEqual([])
  })
})
