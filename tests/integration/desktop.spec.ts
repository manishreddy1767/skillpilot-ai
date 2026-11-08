import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, OVERVIEW, WIDGET } from './app-harness'

let h: Harness

test.afterEach(async () => {
  await h.close()
})

async function openApp(): Promise<Page> {
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  return h.page(APP)
}

const go = (page: Page, section: string) => page.getByRole('button', { name: section, exact: true }).click()

async function setOption(page: Page, label: string, value: string): Promise<void> {
  await go(page, 'Settings')
  await page.getByLabel(label).selectOption(value)
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
}

const windowValue = (title: string, read: string) =>
  h.app.evaluate(
    ({ BrowserWindow }, { title, read }) => {
      const window = BrowserWindow.getAllWindows().find((w) => w.getTitle() === title)!
      return (window as unknown as Record<string, () => unknown>)[read]!()
    },
    { title, read }
  )

const localDate = (offsetDays = 0): string => {
  const date = new Date(Date.now() + offsetDays * 86_400_000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Runs the same check the app runs after waking from sleep. */
const checkNow = () => h.app.evaluate(({ powerMonitor }) => void powerMonitor.emit('resume'))
const notices = () => h.app.evaluate(() => (globalThis as unknown as { __notices: { body: string }[] }).__notices)

/** Turns quiet hours off, so results do not depend on when the test runs. */
async function noQuietHours(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const current = await window.skillpilot.getSettings()
    if (current.ok) await window.skillpilot.saveSettings({ ...current.value, quietStart: '00:00', quietEnd: '00:00' })
  })
}

test.describe('widget settings', () => {
  test('size applies at once, and is remembered', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await setOption(page, 'Widget size', '128')
    await expect.poll(async () => (await h.state(WIDGET))?.bounds.width).toBe(128)
    await h.close()
    h = await Harness.launch({ keepData: true })
    expect((await h.state(WIDGET))?.bounds).toMatchObject({ width: 128, height: 128 })
  })

  test('dragging keeps a custom size', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await setOption(page, 'Widget size', '96')
    await expect.poll(async () => (await h.state(WIDGET))?.bounds.width).toBe(96)
    await h.dragWidgetTo(500, 400)
    expect((await h.state(WIDGET))?.bounds).toMatchObject({ x: 464, y: 364, width: 96, height: 96 })
  })

  test('opacity applies at once, and is remembered', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await setOption(page, 'Widget opacity', '50')
    await expect.poll(() => windowValue(WIDGET, 'getOpacity')).toBeCloseTo(0.5, 1)
    await h.close()
    h = await Harness.launch({ keepData: true })
    expect(await windowValue(WIDGET, 'getOpacity')).toBeCloseTo(0.5, 1)
  })

  test('always on top can be turned off in Settings and stays off', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await setOption(page, 'Always on top', 'off')
    await expect.poll(async () => (await h.state(WIDGET))?.onTop).toBe(false)
    expect(await h.trayItemChecked('Always on top')).toBe(false)
    await h.close()
    h = await Harness.launch({ keepData: true })
    expect((await h.state(WIDGET))?.onTop).toBe(false)
  })

  test('a tray toggle is remembered and shown in Settings', async () => {
    h = await Harness.launch()
    await h.clickTrayItem('Always on top')
    await expect.poll(async () => (await h.state(WIDGET))?.onTop).toBe(false)
    const page = await openApp()
    await go(page, 'Settings')
    await expect(page.getByLabel('Always on top')).toHaveValue('off')
    await h.close()
    h = await Harness.launch({ keepData: true })
    expect((await h.state(WIDGET))?.onTop).toBe(false)
  })

  test('click-through set in Settings can still be reversed from the tray', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await setOption(page, 'Click-through mode', 'on')
    expect(await h.trayItemChecked('Click-through mode')).toBe(true)
    await h.clickTrayItem('Click-through mode')
    expect(await h.trayItemChecked('Click-through mode')).toBe(false)
  })

  test('start at login is not registered from a development build', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await setOption(page, 'Start when I log in', 'on')
    const registered = await h.app.evaluate(({ app }) => app.getLoginItemSettings().openAtLogin)
    expect(registered).toBe(false)
  })

  test('the panel fades in fully', async () => {
    h = await Harness.launch()
    await h.openPanel()
    await expect.poll(() => windowValue(OVERVIEW, 'getOpacity')).toBe(1)
  })
})

test.describe('shortcuts', () => {
  test('are registered, and released when turned off', async () => {
    h = await Harness.launch()
    const registered = () =>
      h.app.evaluate(({ globalShortcut }) => [
        globalShortcut.isRegistered('Control+Alt+Shift+S'),
        globalShortcut.isRegistered('Control+Alt+Shift+O')
      ])
    expect(await registered()).toEqual([true, true])
    const page = await openApp()
    await setOption(page, 'Keyboard shortcuts (Ctrl+Alt+Shift+S, Ctrl+Alt+Shift+O)', 'off')
    expect(await registered()).toEqual([false, false])
  })

  test('the tray hides and shows the widget, and it returns to its spot', async () => {
    h = await Harness.launch()
    await h.dragWidgetTo(500, 400)
    await h.clickTrayItem('Hide widget')
    await expect.poll(() => h.visible(WIDGET)).toBe(false)
    await h.clickTrayItem('Show widget')
    await expect.poll(() => h.visible(WIDGET)).toBe(true)
    expect((await h.state(WIDGET))?.bounds).toMatchObject({ x: 464, y: 364 })
  })
})

test.describe('notifications', () => {
  test('a deadline tomorrow is shown once', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await noQuietHours(page)
    await page.evaluate(
      (date) => window.skillpilot.saveRecord('task', null, { title: 'Send application', dueDate: date }),
      localDate(1)
    )
    await checkNow()
    await expect.poll(async () => (await notices()).map((n) => n.body)).toContain('Send application is due tomorrow.')
    await checkNow()
    await new Promise((done) => setTimeout(done, 300))
    expect((await notices()).filter((n) => n.body.includes('Send application'))).toHaveLength(1)
  })

  test('does not repeat after a restart', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await noQuietHours(page)
    await page.evaluate(
      (date) => window.skillpilot.saveRecord('task', null, { title: 'Once only', dueDate: date }),
      localDate(1)
    )
    await checkNow()
    await expect.poll(async () => (await notices()).length).toBe(1)
    await h.close()
    h = await Harness.launch({ keepData: true })
    await checkNow()
    await new Promise((done) => setTimeout(done, 300))
    expect(await notices()).toEqual([])
  })

  test('a turned-off type stays silent', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await noQuietHours(page)
    await setOption(page, 'Upcoming deadlines', 'off')
    await page.evaluate(
      (date) => window.skillpilot.saveRecord('task', null, { title: 'Silent', dueDate: date }),
      localDate(1)
    )
    await checkNow()
    await new Promise((done) => setTimeout(done, 300))
    expect(await notices()).toEqual([])
  })

  test('clicking a notification opens the full app', async () => {
    h = await Harness.launch()
    const page = await openApp()
    await noQuietHours(page)
    await h.call(APP, 'minimizeToWidget')
    await expect.poll(() => h.visible(APP)).toBe(false)
    await page.evaluate(
      (date) => window.skillpilot.saveRecord('task', null, { title: 'Open me', dueDate: date }),
      localDate(1)
    )
    await checkNow()
    await expect.poll(async () => (await notices()).length).toBe(1)
    await h.app.evaluate(() => {
      const shown = (globalThis as unknown as { __noticeObjects: { emit(name: string): void }[] }).__noticeObjects
      shown[0]!.emit('click')
    })
    await expect.poll(() => h.visible(APP)).toBe(true)
  })
})
