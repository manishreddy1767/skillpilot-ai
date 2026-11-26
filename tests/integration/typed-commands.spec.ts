import { expect, test, type Page } from '@playwright/test'
import { APP, Harness } from './app-harness'

let h: Harness

test.afterEach(async () => {
  await h.close()
})

/** Starts the app with browser and desktop actions recorded instead of done. */
async function assistant(): Promise<Page> {
  h = await Harness.launch()
  await h.app.evaluate(() => {
    ;(globalThis as { __skillpilotDesktopLog?: string[] }).__skillpilotDesktopLog = []
  })
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  const page = await h.page(APP)
  await page.getByRole('button', { name: 'Assistant', exact: true }).click()
  return page
}

const desktopLog = () => h.app.evaluate(() => (globalThis as { __skillpilotDesktopLog?: string[] }).__skillpilotDesktopLog ?? [])

const send = async (page: Page, text: string) => {
  await page.getByLabel('Your message').fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
}

test('typing "open youtube" opens YouTube in the browser, even with the AI off', async () => {
  const page = await assistant()
  await page.evaluate(async () => {
    const settings = await window.skillpilot.getSettings()
    if (settings.ok) await window.skillpilot.saveSettings({ ...settings.value, aiProvider: 'off' })
  })
  await send(page, 'open youtube')
  await expect(page.locator('.voice-state')).toHaveText('Opening Youtube.')
  expect(await desktopLog()).toContain('openUrl ["https://www.youtube.com",null]')
  const chat = await page.evaluate(() => window.skillpilot.getChat())
  expect(chat).toEqual({ ok: true, value: [] })
})

test('typed commands open apps, search job sites, add tasks, and open screens', async () => {
  const page = await assistant()
  await send(page, 'open chrome')
  await expect(page.locator('.voice-state')).toHaveText('Opening Google Chrome.')
  await send(page, 'search naukri for react jobs in pune')
  await expect(page.locator('.voice-state')).toHaveText('Searching Naukri for react jobs in pune.')
  await send(page, 'add task read the testing guide tomorrow')
  await expect(page.locator('.voice-state')).toHaveText('Added the task "Read the testing guide" for tomorrow.')
  await send(page, 'open my tasks')
  await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible()
  const log = await desktopLog()
  expect(log.some((line) => line.startsWith('launchApp'))).toBe(true)
  expect(log).toContain('openUrl ["https://www.naukri.com/react-jobs-in-pune?k=react&l=pune","chrome"]')
})

test('other windows cannot run commands', async () => {
  h = await Harness.launch()
  for (const title of ['SkillPilot Widget', 'SkillPilot Overview']) {
    expect(await (await h.page(title)).evaluate(() => window.skillpilot.runCommand('open youtube'))).toEqual({ ok: false, message: 'Not allowed.' })
  }
})

test('"remind me to … at …" sets a reminder, and the notification arrives at that time', async () => {
  const page = await assistant()
  await send(page, 'remind me to stretch at 12 am')
  await expect(page.locator('.voice-state')).toHaveText(/Added the task "Stretch" for today, with a reminder at 12:00 am\./)
  const tasks = await page.evaluate(() => window.skillpilot.listRecords('task'))
  expect(tasks.ok && tasks.value[0]!.values).toMatchObject({ title: 'Stretch', remindAt: '00:00' })
  // 12 am has already passed today, so the next check sends the reminder.
  await h.app.evaluate(({ powerMonitor }) => void powerMonitor.emit('resume'))
  await expect
    .poll(() => h.app.evaluate(() => ((globalThis as unknown as { __notices?: { title: string; body: string }[] }).__notices ?? []).map((n) => `${n.title}: ${n.body}`)))
    .toContain('Reminder: Stretch')
})
