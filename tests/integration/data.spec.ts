import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, OVERVIEW, WIDGET, dataFolder } from './app-harness'

const exportFile = join(dataFolder, 'test-export.json')
let h: Harness

test.afterEach(async () => {
  await h.close()
})

async function openApp(): Promise<Page> {
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  return h.page(APP)
}

const settings = async (page: Page) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your data' })).toBeVisible()
}

/** Answers the next file dialog with this path, as if chosen by hand. */
const answerDialogs = (path: string | null) =>
  h.app.evaluate(({ dialog }, chosen) => {
    dialog.showSaveDialog = (async () => ({ canceled: chosen === null, filePath: chosen ?? '' })) as never
    dialog.showOpenDialog = (async () => ({ canceled: chosen === null, filePaths: chosen ? [chosen] : [] })) as never
  }, path)

async function seed(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const api = window.skillpilot
    await api.saveProfile({ fullName: 'Sam', currentGoal: 'Keep me' })
    await api.saveRecord('skill', null, { name: 'React', claimedLevel: '3' })
    const goal = await api.saveRecord('goal', null, { title: 'Done goal', status: 'done' })
    if (goal.ok) await api.saveRecord('goalMilestone', null, { title: 'Step', status: 'done' }, goal.value.id)
  })
}

test('export, erase, and import bring everything back', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await seed(page)
  await answerDialogs(exportFile)
  await settings(page)
  await page.getByRole('button', { name: 'Export my data' }).click()
  await expect(page.getByText(`Saved to ${exportFile}`)).toBeVisible()

  const text = readFileSync(exportFile, 'utf8')
  expect(text).toContain('Keep me')

  await page.getByLabel('Confirmation').fill('ERASE')
  await page.getByRole('button', { name: 'Erase everything' }).click()
  await expect((await h.page(OVERVIEW)).getByText('No goal set yet')).toBeAttached()

  const reloaded = await h.page(APP)
  await settings(reloaded)
  await reloaded.getByRole('button', { name: 'Import a file' }).click()
  await reloaded.getByRole('button', { name: 'Choose file and replace' }).click()
  await expect((await h.page(OVERVIEW)).getByText('Keep me')).toBeAttached()

  const after = await h.page(APP)
  await after.getByRole('button', { name: 'Skills', exact: true }).click()
  await expect(after.getByRole('button', { name: 'Edit React' })).toBeVisible()
  await after.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(after.getByText('Achieved Done goal')).toBeVisible()
})

test('a cloud API key left by an older version is deleted at startup', async () => {
  const keyFile = join(dataFolder, 'api-key.enc')
  mkdirSync(dataFolder, { recursive: true })
  writeFileSync(keyFile, 'old encrypted key')
  h = await Harness.launch({ keepData: true })
  expect(existsSync(keyFile)).toBe(false)
})

test('a damaged file is refused and nothing changes', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await seed(page)
  writeFileSync(exportFile, '{"app":"SkillPilot AI","schemaVersion":1,"tables":{}}')
  await answerDialogs(exportFile)
  await settings(page)
  await page.getByRole('button', { name: 'Import a file' }).click()
  await page.getByRole('button', { name: 'Choose file and replace' }).click()
  await expect(page.getByRole('alert')).toContainText('different version')
  await expect((await h.page(OVERVIEW)).getByText('Keep me')).toBeAttached()
})

test('a cancelled dialog changes nothing', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await seed(page)
  await answerDialogs(null)
  await settings(page)
  await page.getByRole('button', { name: 'Import a file' }).click()
  await page.getByRole('button', { name: 'Choose file and replace' }).click()
  await expect(page.getByRole('button', { name: 'Import a file' })).toBeVisible()
  await expect((await h.page(OVERVIEW)).getByText('Keep me')).toBeAttached()
})

test('a backup can be restored from the app', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await seed(page)
  await page.evaluate(() => window.skillpilot.eraseAll('ERASE'))
  const reloaded = await h.page(APP)
  await settings(reloaded)
  const safety = reloaded.getByRole('listitem').filter({ hasText: 'before change' }).first()
  await safety.getByRole('button', { name: /Restore backup/ }).click()
  await reloaded.getByRole('button', { name: 'Replace current data' }).click()
  await expect((await h.page(OVERVIEW)).getByText('Keep me')).toBeAttached()
  // The app window reloads after a restore. Closing mid-reload can stall the test's shutdown.
  await expect((await h.page(APP)).getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test('a window gone right after replacing data raises no "object has been destroyed" error', async () => {
  const errorLog = join(dataFolder, 'logs', 'errors.log')
  const before = existsSync(errorLog) ? readFileSync(errorLog, 'utf8').length : 0
  h = await Harness.launch()
  const page = await openApp()
  await page.evaluate(() => window.skillpilot.eraseAll('ERASE'))
  // The app window goes away within the moment before it would reload, as it does when quitting.
  await h.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'SkillPilot AI')?.destroy()
  })
  await new Promise((done) => setTimeout(done, 800))
  const added = existsSync(errorLog) ? readFileSync(errorLog, 'utf8').slice(before) : ''
  expect(added).not.toContain('Object has been destroyed')
})

test('other windows cannot export, import, restore, or erase', async () => {
  h = await Harness.launch()
  await answerDialogs(exportFile)
  for (const title of [WIDGET, OVERVIEW]) {
    const results = await (await h.page(title)).evaluate(async () => {
      const api = window.skillpilot
      return [await api.exportData(), await api.importData(), await api.listBackups(), await api.restoreBackup('x'), await api.eraseAll('ERASE')]
    })
    for (const result of results) expect(result).toEqual({ ok: false, message: 'Not allowed.' })
  }
})
