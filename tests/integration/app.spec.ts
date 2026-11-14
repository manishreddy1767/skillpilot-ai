import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  APP,
  HALF,
  Harness,
  SIZE,
  OVERVIEW,
  WIDGET,
  cleanEnv,
  harness as harnessFile,
  pause,
  root
} from './app-harness'

let h: Harness

test.beforeEach(async () => {
  h = await Harness.launch()
})

test.afterEach(async () => {
  await h.close()
})

test.describe('startup', () => {
  test('shows the widget, keeps the overview hidden, and defers the full app', async () => {
    expect(await h.windowCount()).toBe(2)
    expect((await h.state(WIDGET))?.visible).toBe(true)
    expect((await h.state(OVERVIEW))?.visible).toBe(false)
    expect(await h.state(APP)).toBeNull()
  })

  test('widget has its floating window properties', async () => {
    expect(await h.state(WIDGET)).toMatchObject({
      onTop: true,
      resizable: false,
      focusable: false,
      bounds: { width: SIZE, height: SIZE }
    })
  })

  test('loads all screens without page errors', async () => {
    const errors: string[] = []
    for (const title of [WIDGET, OVERVIEW]) {
      const page = await h.page(title)
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      await page.reload()
    }
    await h.clickWidget()
    await expect.poll(() => h.visible(APP)).toBe(true)
    expect(errors).toEqual([])
  })

  test('renders each screen', async () => {
    await expect((await h.page(WIDGET)).getByRole('button', { name: 'SkillPilot AI' })).toBeVisible()
    await expect((await h.page(OVERVIEW)).getByText('Current goal')).toBeAttached()
    await h.clickWidget()
    const app = await h.page(APP)
    await expect(app.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })
})

test.describe('security', () => {
  test('renderers are sandboxed with no Node access', async () => {
    const preferences = await h.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) =>
        (w.webContents as unknown as { getLastWebPreferences(): object }).getLastWebPreferences()
      )
    )
    for (const p of preferences) {
      expect(p).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false })
    }
    const globals = await (await h.page(WIDGET)).evaluate(() => ({
      require: typeof (window as unknown as { require: unknown }).require,
      process: typeof (window as unknown as { process: unknown }).process
    }))
    expect(globals).toEqual({ require: 'undefined', process: 'undefined' })
  })

  test('the page sees only the bridge functions', async () => {
    const keys = await (await h.page(WIDGET)).evaluate(() => Object.keys(window.skillpilot).sort())
    expect(keys).toEqual([
      'acceptProposal',
      'appReady',
      'clearChat',
      'completeTask',
      'createGapReport',
      'deleteRecord',
      'draftRequirements',
      'dragMove',
      'dragPress',
      'dragRelease',
      'eraseAll',
      'exportData',
      'generateRoadmap',
      'getAiLog',
      'getAiStatus',
      'getChat',
      'getDashboard',
      'getGapAnalysis',
      'getHistory',
      'getLearning',
      'getOverview',
      'getProfile',
      'getRecommendation',
      'getRoleReadiness',
      'getSettings',
      'hoverEnter',
      'hoverLeave',
      'importData',
      'listBackups',
      'listLinks',
      'listProposals',
      'listRecords',
      'listen',
      'minimizeToWidget',
      'onNavigate',
      'onOverviewChanged',
      'onVoiceAsk',
      'onVoiceStatus',
      'openApp',
      'rejectProposal',
      'removeApiKey',
      'rescheduleRoadmap',
      'restoreBackup',
      'saveApiKey',
      'saveProfile',
      'saveRecord',
      'saveSettings',
      'sendChat',
      'setLink',
      'stopListening',
      'suggestProjects',
      'suggestTasks',
      'widgetListen'
    ])
  })

  test('the content security policy blocks inline scripts', async () => {
    const ran = await (await h.page(OVERVIEW)).evaluate(() => {
      const script = document.createElement('script')
      script.textContent = 'window.__injected = true'
      document.head.append(script)
      return (window as unknown as { __injected?: boolean }).__injected === true
    })
    expect(ran).toBe(false)
  })

  test('pages cannot navigate away', async () => {
    const page = await h.page(WIDGET)
    // The target is a real page that would load, so only the guard can stop it.
    await page.evaluate(() => {
      window.location.href = new URL('../app/index.html', window.location.href).href
    })
    await pause(500)
    expect(await page.evaluate(() => document.title)).toBe(WIDGET)
  })

  test('pages cannot open new windows', async () => {
    const opened = await (await h.page(WIDGET)).evaluate(() => {
      return window.open(new URL('../app/index.html', window.location.href).href) !== null
    })
    await pause(300)
    expect(opened).toBe(false)
    expect(await h.windowCount()).toBe(2)
  })

  test('a window cannot send messages meant for another window', async () => {
    const start = (await h.state(WIDGET))!.bounds
    const centre = await h.cursorToWidget()

    // Only the widget may drag.
    await h.call(OVERVIEW, 'dragPress', { x: HALF, y: HALF })
    await h.moveCursor(centre.x + 300, centre.y - 200)
    await h.call(OVERVIEW, 'dragMove')
    await h.call(OVERVIEW, 'dragRelease')
    expect((await h.state(WIDGET))!.bounds).toEqual(start)

    // Only the overview may open the app through this message.
    await h.call(WIDGET, 'openApp')
    await pause(300)
    expect(await h.state(APP)).toBeNull()

    // Only the widget may trigger hover.
    await h.cursorToWidget()
    await h.call(OVERVIEW, 'hoverEnter')
    await pause(400)
    expect(await h.visible(OVERVIEW)).toBe(false)

    // Only the full app may hide itself.
    await h.clickWidget()
    await expect.poll(() => h.visible(APP)).toBe(true)
    await h.call(WIDGET, 'minimizeToWidget')
    await pause(300)
    expect(await h.visible(APP)).toBe(true)
  })

  test('malformed drag data is ignored', async () => {
    const start = (await h.state(WIDGET))!.bounds
    await h.openPanel()
    const { x, y } = await h.cursorToWidget()
    await h.call(WIDGET, 'dragPress', { x: 'left', y: null })
    await h.moveCursor(x + 10, y + 10)
    await h.call(WIDGET, 'dragMove')
    await pause(200)
    // No drag began, so the panel a drag would close is still open.
    expect(await h.visible(OVERVIEW)).toBe(true)
    await h.call(WIDGET, 'dragRelease')
    await pause(200)
    expect((await h.state(WIDGET))!.bounds).toEqual(start)
    expect(await h.state(APP)).toBeNull()
  })
})

test.describe('dragging', () => {
  test('moves the widget with the cursor and keeps its size', async () => {
    await h.dragWidgetTo(500, 400)
    expect((await h.state(WIDGET))!.bounds).toEqual({ x: 500 - HALF, y: 400 - HALF, width: SIZE, height: SIZE })
  })

  test('fractional grab offsets land on whole pixels and never grow the widget', async () => {
    for (let i = 0; i < 5; i++) {
      const { x, y } = await h.cursorToWidget()
      await h.call(WIDGET, 'dragPress', { x: 30.4, y: 20.8 })
      await h.moveCursor(x - 37, y - 53)
      await h.call(WIDGET, 'dragMove')
      await h.call(WIDGET, 'dragRelease')
      const { bounds } = (await h.state(WIDGET))!
      expect(Number.isInteger(bounds.x) && Number.isInteger(bounds.y)).toBe(true)
    }
    // At 125% scaling the reported size can round up at some positions, so size is
    // compared at a position that maps exactly to physical pixels.
    await h.dragWidgetTo(500, 400)
    expect((await h.state(WIDGET))!.bounds).toMatchObject({ width: SIZE, height: SIZE })
  })

  test('follows the cursor even if the page sends no move events', async () => {
    const { x, y } = await h.cursorToWidget()
    await h.call(WIDGET, 'dragPress', { x: HALF, y: HALF })
    await h.moveCursor(x - 400, y - 300)
    await expect.poll(async () => (await h.state(WIDGET))!.bounds.x).toBe(x - 400 - HALF)
    await h.call(WIDGET, 'dragRelease')
  })

  test('ends exactly under the cursor when released', async () => {
    const { x, y } = await h.cursorToWidget()
    await h.call(WIDGET, 'dragPress', { x: HALF, y: HALF })
    await h.moveCursor(x - 400, y - 300)
    await h.call(WIDGET, 'dragRelease')
    expect((await h.state(WIDGET))!.bounds).toMatchObject({ x: x - 400 - HALF, y: y - 300 - HALF })
  })

  test('stops following once released', async () => {
    const { x, y } = await h.cursorToWidget()
    await h.call(WIDGET, 'dragPress', { x: HALF, y: HALF })
    await h.moveCursor(x - 400, y - 300)
    await h.call(WIDGET, 'dragRelease')
    await h.moveCursor(5, 5)
    await pause(100)
    expect((await h.state(WIDGET))!.bounds).toMatchObject({ x: x - 400 - HALF, y: y - 300 - HALF })
  })

  test('has no position limits', async () => {
    for (const [x, y] of [
      [768, 432],
      [2, 2],
      [-500, -300],
      [9000, 5000]
    ] as const) {
      await h.dragWidgetTo(x, y)
      expect((await h.state(WIDGET))!.bounds).toMatchObject({ x: x - HALF, y: y - HALF })
    }
  })

  test('a drag does not open the app', async () => {
    await h.dragWidgetTo(500, 400)
    await pause(300)
    expect(await h.state(APP)).toBeNull()
  })

  test('a tiny wobble is still a click', async () => {
    const { x, y } = await h.cursorToWidget()
    const start = (await h.state(WIDGET))!.bounds
    await h.call(WIDGET, 'dragPress', { x: HALF, y: HALF })
    await h.moveCursor(x + 2, y + 1)
    await h.call(WIDGET, 'dragMove')
    await h.call(WIDGET, 'dragRelease')
    await expect.poll(() => h.visible(APP)).toBe(true)
    expect((await h.state(WIDGET))!.bounds).toEqual(start)
  })

  test('closes an open panel, and hover works again afterwards', async () => {
    await h.openPanel()
    await h.dragWidgetTo(500, 400)
    expect(await h.visible(OVERVIEW)).toBe(false)
    await h.openPanel()
    expect(await h.visible(OVERVIEW)).toBe(true)
  })
})

test.describe('hover overview', () => {
  test('opens after resting on the widget, without changing focus', async () => {
    await h.openPanel()
    const focused = await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.getTitle())
    expect(focused).not.toBe(OVERVIEW)
    expect(focused).not.toBe(WIDGET)
  })

  test('does not open if the cursor left before the delay', async () => {
    await h.cursorToWidget()
    await h.call(WIDGET, 'hoverEnter')
    await h.call(WIDGET, 'hoverLeave')
    await pause(400)
    expect(await h.visible(OVERVIEW)).toBe(false)
  })

  test('does not open if the cursor is no longer on the widget', async () => {
    await h.cursorToWidget()
    await h.call(WIDGET, 'hoverEnter')
    await h.moveCursor(5, 5)
    await pause(400)
    expect(await h.visible(OVERVIEW)).toBe(false)
  })

  test('opens to the left when there is no room on the right', async () => {
    await h.openPanel()
    const widget = (await h.state(WIDGET))!.bounds
    const panel = (await h.state(OVERVIEW))!.bounds
    expect(panel.x + panel.width + 8).toBe(widget.x)
  })

  test('opens to the right when there is room', async () => {
    await h.dragWidgetTo(200, 400)
    await h.openPanel()
    const widget = (await h.state(WIDGET))!.bounds
    expect((await h.state(OVERVIEW))!.bounds.x).toBe(widget.x + widget.width + 8)
  })

  test('stays open while the cursor is on the panel, then closes when it leaves', async () => {
    await h.openPanel()
    const panel = (await h.state(OVERVIEW))!.bounds
    await h.moveCursor(panel.x + 100, panel.y + 100)
    await pause(600)
    expect(await h.visible(OVERVIEW)).toBe(true)
    await h.moveCursor(5, 5)
    await expect.poll(() => h.visible(OVERVIEW)).toBe(false)
  })

  test('the panel button opens the app and closes the panel', async () => {
    await h.openPanel()
    await h.call(OVERVIEW, 'openApp')
    await expect.poll(() => h.visible(APP)).toBe(true)
    expect(await h.visible(OVERVIEW)).toBe(false)
  })
})

test.describe('full app window', () => {
  test('a click opens it, and a click again reuses the same window', async () => {
    await h.clickWidget()
    await expect.poll(() => h.visible(APP)).toBe(true)
    await h.call(APP, 'minimizeToWidget')
    await expect.poll(() => h.visible(APP)).toBe(false)
    await h.clickWidget()
    await expect.poll(() => h.visible(APP)).toBe(true)
    expect(await h.windowCount()).toBe(3)
  })

  test('minimizing keeps the widget in place', async () => {
    await h.dragWidgetTo(500, 400)
    await h.clickWidget()
    await expect.poll(() => h.visible(APP)).toBe(true)
    await h.call(APP, 'minimizeToWidget')
    await expect.poll(() => h.visible(APP)).toBe(false)
    expect(await h.state(WIDGET)).toMatchObject({ visible: true, bounds: { x: 500 - HALF, y: 400 - HALF } })
  })

  test('closing it hides it and leaves the app running', async () => {
    await h.clickWidget()
    await expect.poll(() => h.visible(APP)).toBe(true)
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle() === 'SkillPilot AI')
        ?.close()
    })
    await expect.poll(() => h.visible(APP)).toBe(false)
    expect(await h.windowCount()).toBe(3)
    expect(await h.visible(WIDGET)).toBe(true)
  })
})

test.describe('tray', () => {
  test('Open shows the full app', async () => {
    await h.clickTrayItem('Open SkillPilot AI')
    await expect.poll(() => h.visible(APP)).toBe(true)
  })

  test('Always on top turns off and on for widget and overview', async () => {
    await h.clickTrayItem('Always on top')
    await expect.poll(async () => (await h.state(WIDGET))?.onTop).toBe(false)
    expect((await h.state(OVERVIEW))?.onTop).toBe(false)
    expect(await h.trayItemChecked('Always on top')).toBe(false)
    await h.clickTrayItem('Always on top')
    await expect.poll(async () => (await h.state(WIDGET))?.onTop).toBe(true)
    expect(await h.trayItemChecked('Always on top')).toBe(true)
  })

  test('Click-through applies to the widget, closes the panel, and reverses', async () => {
    await h.app.evaluate(({ BrowserWindow }) => {
      const widget = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'SkillPilot Widget')!
      const calls: boolean[] = []
      const original = widget.setIgnoreMouseEvents.bind(widget)
      widget.setIgnoreMouseEvents = (ignore, options) => {
        calls.push(ignore)
        original(ignore, options)
      }
      ;(globalThis as unknown as { __ignoreCalls: boolean[] }).__ignoreCalls = calls
    })
    const calls = () =>
      h.app.evaluate(() => (globalThis as unknown as { __ignoreCalls: boolean[] }).__ignoreCalls)

    await h.openPanel()
    await h.clickTrayItem('Click-through mode')
    await expect.poll(() => h.visible(OVERVIEW)).toBe(false)
    expect(await h.trayItemChecked('Click-through mode')).toBe(true)
    await h.clickTrayItem('Click-through mode')
    expect(await calls()).toEqual([true, false])
    expect(await h.trayItemChecked('Click-through mode')).toBe(false)
  })

  for (const appOpen of [false, true]) {
    test(`Quit exits completely with the full app ${appOpen ? 'open' : 'closed'}`, async () => {
      if (appOpen) {
        await h.clickWidget()
        await expect.poll(() => h.visible(APP)).toBe(true)
      }
      const process = h.app.process()
      const exited = new Promise<number | null>((done) => process.once('exit', done))
      await h.clickTrayItem('Quit SkillPilot AI')
      expect(await exited).toBe(0)
    })
  }
})

test.describe('error handling', () => {
  test('an unexpected error is logged, reported, and does not stop the app', async () => {
    // Unique per run, because the test data folder and its log persist between runs.
    const marker = `integration boom ${Date.now()}`
    const seen = await h.app.evaluate(async ({ app, dialog }, text) => {
      const shown: string[] = []
      dialog.showErrorBox = (_title, message) => void shown.push(message)
      setTimeout(() => {
        throw new Error(text)
      })
      await new Promise((done) => setTimeout(done, 200))
      return { shown, logPath: app.getPath('userData') + '/logs/errors.log' }
    }, marker)
    expect(seen.shown).toHaveLength(1)
    expect(seen.shown[0]).toContain(marker)
    expect(seen.shown[0]).toContain('Details were saved to')
    expect(readFileSync(seen.logPath, 'utf8')).toContain(marker)
    expect(await h.visible(WIDGET)).toBe(true)
  })

  test('hover stops once quitting has started', async () => {
    await h.cursorToWidget()
    // Holds the quit open, so a late hover would have time to fire.
    await h.app.evaluate(({ app }) => {
      app.once('before-quit', (event) => event.preventDefault())
      app.quit()
    })
    await h.call(WIDGET, 'hoverEnter')
    await pause(400)
    expect(await h.visible(OVERVIEW)).toBe(false)
  })
})

test('tests use their own data folder, away from the real app', async () => {
  const folder = await h.app.evaluate(({ app }) => app.getPath('userData'))
  expect(folder).toContain('skillpilot-ai-test')
})

test('a second copy exits and opens the full app in the first', async () => {
  const electron = resolve(root, 'node_modules/electron/dist/electron.exe')
  const second = spawn(electron, [harnessFile], { cwd: root, env: cleanEnv() })
  const code = await new Promise<number | null>((done) => second.once('exit', done))
  expect(code).toBe(0)
  expect(await h.visible(WIDGET)).toBe(true)
  await expect.poll(() => h.visible(APP)).toBe(true)
})
