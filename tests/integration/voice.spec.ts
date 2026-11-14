import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, OVERVIEW, WIDGET, dataFolder } from './app-harness'

/**
 * The whole voice path in the real app: Windows reads a command aloud into a sound file, the app's
 * own speech engine hears it through the same code the microphone uses, and the command is carried
 * out. Desktop actions and spoken replies are recorded instead of done, so tests open nothing.
 */
const POWERSHELL = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const soundFolder = join(dataFolder, 'voice')
let h: Harness

test.skip(process.platform !== 'win32', 'Windows speech only')
test.setTimeout(90_000)

test.afterEach(async () => {
  await h.close()
})

function recording(phrase: string): string {
  mkdirSync(soundFolder, { recursive: true })
  const file = join(soundFolder, `${phrase.replace(/\W+/g, '-') || 'silence'}.wav`)
  execFileSync(POWERSHELL, [
    '-NoProfile',
    '-Command',
    `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = -1; $s.SetOutputToWaveFile('${file}'); $s.Speak('${phrase}'); $s.Dispose()`
  ])
  return file
}

/** Starts the app with the desktop recorded rather than touched. */
async function launch(): Promise<void> {
  h = await Harness.launch()
  await h.app.evaluate(() => {
    ;(globalThis as { __skillpilotDesktopLog?: string[] }).__skillpilotDesktopLog = []
  })
}

/** Plays this recording the next time the app listens, instead of the microphone. */
const willHear = (phrase: string) =>
  h.app.evaluate((_electron, chosen) => {
    ;(globalThis as { __skillpilotVoiceFile?: string }).__skillpilotVoiceFile = chosen
  }, recording(phrase))

const desktopLog = () => h.app.evaluate(() => (globalThis as { __skillpilotDesktopLog?: string[] }).__skillpilotDesktopLog ?? [])

async function assistant(): Promise<Page> {
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  const page = await h.page(APP)
  await page.getByRole('button', { name: 'Assistant', exact: true }).click()
  return page
}

const speak = (page: Page) => page.getByRole('button', { name: 'Speak a message or command' }).click()
const status = (page: Page) => page.locator('.voice-state')

test.describe('the microphone in the chat bar', () => {
  test('a spoken task is added for the day that was said', async () => {
    await launch()
    const page = await assistant()
    await willHear('add task read the testing guide tomorrow')
    await speak(page)
    await expect(status(page)).toContainText('Added the task "Read the testing guide" for tomorrow.', { timeout: 30_000 })
    const tasks = await page.evaluate(() => window.skillpilot.listRecords('task'))
    expect(tasks.ok && tasks.value.map((task) => task.values['title'])).toEqual(['Read the testing guide'])
    expect(await desktopLog()).toEqual(['say "Added the task \\"Read the testing guide\\" for tomorrow."'])
  })

  test('"open chrome" launches Chrome from the Start menu', async () => {
    await launch()
    const page = await assistant()
    await willHear('open chrome')
    await speak(page)
    await expect(status(page)).toContainText('Opening Google Chrome.', { timeout: 30_000 })
    expect(await desktopLog()).toContainEqual(expect.stringMatching(/^launchApp \[\{"name":"Google Chrome","id":"Chrome"\}\]$/))
  })

  test('"open youtube in chrome" opens the website in Chrome', async () => {
    await launch()
    const page = await assistant()
    await willHear('open youtube in chrome')
    await speak(page)
    await expect(status(page)).toContainText('Opening Youtube in Chrome.', { timeout: 30_000 })
    expect(await desktopLog()).toContain('openUrl ["https://www.youtube.com","chrome"]')
  })

  test('"search for react hooks" searches Google', async () => {
    await launch()
    const page = await assistant()
    await willHear('search for react hooks')
    await speak(page)
    await expect(status(page)).toContainText('Searching Google for', { timeout: 30_000 })
    expect((await desktopLog()).some((line) => line.startsWith('openUrl ["https://www.google.com/search?q=react'))).toBe(true)
  })

  test('speaking "open my skills" opens Skills', async () => {
    await launch()
    const page = await assistant()
    await willHear('open my skills')
    await speak(page)
    await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.voice-note')).toContainText('Opening Skills.')
  })

  test('silence is reported, and nothing changes', async () => {
    await launch()
    const page = await assistant()
    await willHear(' ')
    await speak(page)
    await expect(status(page)).toContainText("I didn't hear anything", { timeout: 30_000 })
    expect(await page.evaluate(() => window.skillpilot.listRecords('task'))).toEqual({ ok: true, value: [] })
  })

  test('the stop button stops listening', async () => {
    await launch()
    const page = await assistant()
    await willHear('add skill python')
    await speak(page)
    await page.getByRole('button', { name: 'Stop listening' }).click()
    await expect(page.getByRole('button', { name: 'Speak a message or command' })).toBeVisible()
    // Give a late answer the chance to arrive. It must be ignored.
    await page.waitForTimeout(3_000)
    expect(await page.evaluate(() => window.skillpilot.listRecords('skill'))).toEqual({ ok: true, value: [] })
  })
})

test.describe('the microphone beside the robot', () => {
  test('answers in the hover panel, which stays open while it talks', async () => {
    await launch()
    await willHear('open chrome')
    await (await h.page(WIDGET)).getByRole('button', { name: 'Talk to SkillPilot' }).click()
    await expect.poll(() => h.visible(OVERVIEW)).toBe(true)
    const panel = await h.page(OVERVIEW)
    await expect(panel.locator('.voice-card')).toContainText('Opening Google Chrome.', { timeout: 30_000 })
    await expect(panel.locator('.voice-card')).toContainText('“open chrome”')
    expect(await desktopLog()).toContainEqual(expect.stringContaining('launchApp'))
    expect(await desktopLog()).toContain('say "Opening Google Chrome."')
  })

  test('"open my tasks" opens the app on Tasks, even before the app has ever been opened', async () => {
    await launch()
    await willHear('open my tasks')
    await (await h.page(WIDGET)).getByRole('button', { name: 'Talk to SkillPilot' }).click()
    await expect.poll(() => h.visible(APP), { timeout: 30_000 }).toBe(true)
    const page = await h.page(APP)
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible()
    await expect(page.locator('.voice-note')).toContainText('Heard "open my tasks". Opening Tasks.')
  })

  test('pressing it again stops listening', async () => {
    await launch()
    await willHear('add skill python')
    const widget = await h.page(WIDGET)
    await widget.getByRole('button', { name: 'Talk to SkillPilot' }).click()
    await widget.getByRole('button', { name: 'Stop listening' }).click()
    await expect(widget.getByRole('button', { name: 'Talk to SkillPilot' })).toBeVisible()
    await (await h.page(OVERVIEW)).waitForTimeout(3_000)
    expect(await desktopLog()).toEqual([])
  })

  test('the robot still drags and opens the app as before', async () => {
    await launch()
    await h.clickWidget()
    await expect.poll(() => h.visible(APP)).toBe(true)
  })
})

test('only the app window and the widget may listen', async () => {
  await launch()
  const overview = await h.page(OVERVIEW)
  expect(await overview.evaluate(() => window.skillpilot.listen())).toEqual({ ok: false, message: 'Not allowed.' })
  expect(await overview.evaluate(() => window.skillpilot.stopListening())).toEqual({ ok: false, message: 'Not allowed.' })
  expect(await (await h.page(WIDGET)).evaluate(() => window.skillpilot.listen())).toEqual({ ok: false, message: 'Not allowed.' })
  // The panel cannot start the widget's microphone either.
  await willHear('open chrome')
  await overview.evaluate(() => window.skillpilot.widgetListen())
  await overview.waitForTimeout(2_000)
  expect(await desktopLog()).toEqual([])
})
