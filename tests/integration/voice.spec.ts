import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, OVERVIEW, WIDGET, dataFolder } from './app-harness'

/**
 * The whole voice path in the real app: Windows reads a command aloud into a sound file, the app's
 * own speech engine hears it through the same code the microphone uses, and the command is carried out.
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
  const file = join(soundFolder, `${phrase.replace(/\W+/g, '-')}.wav`)
  execFileSync(POWERSHELL, [
    '-NoProfile',
    '-Command',
    `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = -1; $s.SetOutputToWaveFile('${file}'); $s.Speak('${phrase}'); $s.Dispose()`
  ])
  return file
}

/** Plays this recording the next time the app listens, instead of the microphone. */
const willHear = (file: string) =>
  h.app.evaluate((_electron, chosen) => {
    ;(globalThis as { __skillpilotVoiceFile?: string }).__skillpilotVoiceFile = chosen
  }, file)

async function assistant(): Promise<Page> {
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  const page = await h.page(APP)
  await page.getByRole('button', { name: 'Assistant', exact: true }).click()
  return page
}

const speak = (page: Page) => page.getByRole('button', { name: 'Speak a message or command' }).click()

test('a spoken task is added for the day that was said', async () => {
  h = await Harness.launch()
  const page = await assistant()
  // Phrases avoid words dictation confuses, such as "four" and "for", so this tests the app, not the engine.
  await willHear(recording('add task read the testing guide tomorrow'))
  await speak(page)
  await expect(page.getByRole('status')).toContainText('Added the task "Read the testing guide" for tomorrow.', {
    timeout: 30_000
  })
  const tasks = await page.evaluate(() => window.skillpilot.listRecords('task'))
  expect(tasks.ok && tasks.value.map((task) => task.values['title'])).toEqual(['Read the testing guide'])
  await page.getByRole('button', { name: 'Tasks', exact: true }).click()
  await expect(page.getByText('Read the testing guide')).toBeVisible()
})

test('speaking "open my skills" opens Skills', async () => {
  h = await Harness.launch()
  const page = await assistant()
  await willHear(recording('open my skills'))
  await speak(page)
  await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('status')).toContainText('Opened Skills.')
})

test('a spoken "add skill" is saved', async () => {
  h = await Harness.launch()
  const page = await assistant()
  await willHear(recording('add skill python'))
  await speak(page)
  await expect(page.getByRole('status')).toContainText('Added Python to your skills.', { timeout: 30_000 })
  const skills = await page.evaluate(() => window.skillpilot.listRecords('skill'))
  expect(skills.ok && skills.value.map((skill) => skill.values['name'])).toEqual(['Python'])
})

test('a spoken "mark done" ticks off the right task', async () => {
  h = await Harness.launch()
  const page = await assistant()
  await page.evaluate(async () => {
    await window.skillpilot.saveRecord('task', null, { title: 'Read the testing guide' })
    await window.skillpilot.saveRecord('task', null, { title: 'Practise python' })
  })
  await willHear(recording('mark the testing guide as done'))
  await speak(page)
  await expect(page.getByRole('status')).toContainText('Marked "Read the testing guide" as done.', { timeout: 30_000 })
  const tasks = await page.evaluate(() => window.skillpilot.listRecords('task'))
  const status = tasks.ok ? Object.fromEntries(tasks.value.map((task) => [task.values['title'], task.values['status']])) : {}
  expect(status).toEqual({ 'Read the testing guide': 'done', 'Practise python': 'open' })
})

test('silence is reported, and nothing changes', async () => {
  h = await Harness.launch()
  const page = await assistant()
  await willHear(recording(' '))
  await speak(page)
  await expect(page.getByText(/Nothing was heard/)).toBeVisible({ timeout: 30_000 })
  const tasks = await page.evaluate(() => window.skillpilot.listRecords('task'))
  expect(tasks).toEqual({ ok: true, value: [] })
})

test('the stop button stops listening', async () => {
  h = await Harness.launch()
  const page = await assistant()
  await willHear(recording('add skill python'))
  await speak(page)
  await page.getByRole('button', { name: 'Stop listening' }).click()
  await expect(page.getByRole('button', { name: 'Speak a message or command' })).toBeVisible()
  // Give a late answer the chance to arrive. It must be ignored.
  await page.waitForTimeout(4_000)
  const skills = await page.evaluate(() => window.skillpilot.listRecords('skill'))
  expect(skills).toEqual({ ok: true, value: [] })
})

test('only the app window may listen', async () => {
  h = await Harness.launch()
  for (const title of [WIDGET, OVERVIEW]) {
    const results = await (await h.page(title)).evaluate(async () => [
      await window.skillpilot.listen(),
      await window.skillpilot.stopListening()
    ])
    for (const result of results) expect(result).toEqual({ ok: false, message: 'Not allowed.' })
  }
})
