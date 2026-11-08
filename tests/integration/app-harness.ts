import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { DEFAULT_WIDGET_SIZE } from '../../src/shared/settings'

/** The widget's default size, and the centre point tests grab it by. */
export const SIZE = DEFAULT_WIDGET_SIZE
export const HALF = SIZE / 2

export const root = resolve(__dirname, '../..')
export const harness = resolve(__dirname, 'harness.cjs')
export const WIDGET = 'SkillPilot Widget'
export const OVERVIEW = 'SkillPilot Overview'
export const APP = 'SkillPilot AI'
export const dataFolder = join(tmpdir(), 'skillpilot-ai-test')
export const positionFile = join(dataFolder, 'widget-position.json')
export const databaseFile = join(dataFolder, 'skillpilot.db')
export const backupFolder = join(dataFolder, 'backups')

/** Removes everything a test could have saved. */
export function clearSavedData(): void {
  for (const name of ['', '-wal', '-shm']) rmSync(databaseFile + name, { force: true })
  rmSync(join(dataFolder, 'api-key.enc'), { force: true })
  rmSync(join(dataFolder, 'test-export.json'), { force: true })
  rmSync(backupFolder, { recursive: true, force: true })
}

export function cleanEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>
  delete env['ELECTRON_RUN_AS_NODE']
  return env
}

export interface FakeDisplay {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
}

export interface WindowState {
  visible: boolean
  bounds: { x: number; y: number; width: number; height: number }
  onTop: boolean
  resizable: boolean
  focusable: boolean
}

/** Drives the real app. The cursor is faked inside it, so the real mouse is left alone. */
export class Harness {
  private constructor(readonly app: ElectronApplication) {}

  /** Starts clean unless told to keep the saved position or data. */
  static async launch({
    keepPosition = false,
    keepData = false,
    quietErrors = false,
    aiBase = ''
  } = {}): Promise<Harness> {
    if (!keepPosition) rmSync(positionFile, { force: true })
    if (!keepData) clearSavedData()
    const env = cleanEnv()
    if (quietErrors) env['SKILLPILOT_QUIET_ERRORS'] = '1'
    if (aiBase) env['ANTHROPIC_BASE_URL'] = aiBase
    const app = await _electron.launch({ args: [harness], cwd: root, env })
    const harnessApp = new Harness(app)
    await expect.poll(() => harnessApp.windowCount()).toBe(2)
    await harnessApp.page(WIDGET)
    await harnessApp.page(OVERVIEW)
    await expect.poll(async () => (await harnessApp.state(WIDGET))?.visible).toBe(true)
    await app.evaluate(({ screen }) => {
      const state = globalThis as unknown as { __cursor: { x: number; y: number } }
      state.__cursor = { x: 5, y: 5 }
      screen.getCursorScreenPoint = () => state.__cursor
    })
    return harnessApp
  }

  async close(): Promise<void> {
    await this.app.close().catch(() => undefined)
  }

  windowCount(): Promise<number> {
    return this.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  }

  async page(title: string): Promise<Page> {
    await expect
      .poll(async () => {
        for (const page of this.app.windows()) if ((await page.title()) === title) return true
        return false
      })
      .toBe(true)
    for (const page of this.app.windows()) if ((await page.title()) === title) return page
    throw new Error(`No page titled ${title}`)
  }

  state(title: string): Promise<WindowState | null> {
    return this.app.evaluate(({ BrowserWindow }, wanted) => {
      const window = BrowserWindow.getAllWindows().find((w) => w.getTitle() === wanted)
      if (!window) return null
      return {
        visible: window.isVisible(),
        bounds: window.getBounds(),
        onTop: window.isAlwaysOnTop(),
        resizable: window.isResizable(),
        focusable: window.isFocusable()
      }
    }, title)
  }

  async visible(title: string): Promise<boolean> {
    return (await this.state(title))?.visible ?? false
  }

  moveCursor(x: number, y: number): Promise<void> {
    return this.app.evaluate((_electron, point) => {
      ;(globalThis as unknown as { __cursor: unknown }).__cursor = point
    }, { x, y })
  }

  async cursorToWidget(): Promise<{ x: number; y: number }> {
    const { bounds } = (await this.state(WIDGET))!
    const centre = { x: bounds.x + HALF, y: bounds.y + HALF }
    await this.moveCursor(centre.x, centre.y)
    return centre
  }

  /** Sends a bridge call from a window's own page, exactly as its UI would. */
  async call(title: string, method: string, ...args: unknown[]): Promise<void> {
    const page = await this.page(title)
    await page.evaluate(
      ([name, params]) => {
        const api = window.skillpilot as unknown as Record<string, (...a: unknown[]) => void>
        api[name as string]!(...(params as unknown[]))
      },
      [method, args] as const
    )
  }

  async openPanel(): Promise<void> {
    await this.cursorToWidget()
    await this.call(WIDGET, 'hoverEnter')
    await expect.poll(() => this.visible(OVERVIEW)).toBe(true)
  }

  async clickWidget(): Promise<void> {
    await this.cursorToWidget()
    await this.call(WIDGET, 'dragPress', { x: HALF, y: HALF })
    await this.call(WIDGET, 'dragRelease')
  }

  async dragWidgetTo(x: number, y: number): Promise<void> {
    await this.cursorToWidget()
    await this.call(WIDGET, 'dragPress', { x: HALF, y: HALF })
    await this.moveCursor(x, y)
    await this.call(WIDGET, 'dragMove')
    await this.call(WIDGET, 'dragRelease')
  }

  errorBoxes(): Promise<string[]> {
    return this.app.evaluate(() => (globalThis as unknown as { __errorBoxes: string[] }).__errorBoxes)
  }

  /** Replaces the connected displays, as if monitors changed, and announces it. */
  async setDisplays(displays: FakeDisplay[], event = 'display-removed'): Promise<void> {
    await this.app.evaluate(({ screen }, { list, name }) => {
      screen.getAllDisplays = () => list as never
      screen.getPrimaryDisplay = () => list[0] as never
      ;(screen as unknown as { emit(name: string): void }).emit(name)
    }, { list: displays, name: event })
    // Lets the app's settle delay finish, so one change cannot do the next one's work.
    await pause(450)
  }

  /** The real display, for building fake layouts around it. */
  realDisplay(): Promise<FakeDisplay> {
    return this.app.evaluate(({ screen }) => {
      const { id, bounds, workArea } = screen.getPrimaryDisplay()
      return { id, bounds, workArea }
    })
  }

  clickTrayItem(label: string): Promise<void> {
    return this.app.evaluate((_electron, wanted) => {
      const menu = (globalThis as unknown as { __trayMenu: Electron.Menu }).__trayMenu
      const item = menu.items.find((entry) => entry.label === wanted)
      if (!item) throw new Error(`No tray item ${wanted}`)
      ;(item.click as unknown as () => void)()
    }, label)
  }

  trayItemChecked(label: string): Promise<boolean | undefined> {
    return this.app.evaluate((_electron, wanted) => {
      const menu = (globalThis as unknown as { __trayMenu: Electron.Menu }).__trayMenu
      return menu.items.find((entry) => entry.label === wanted)?.checked
    }, label)
  }
}

export const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
