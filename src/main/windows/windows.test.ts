import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => {
  class FakeWindow {
    static created: FakeWindow[] = []
    handlers: Record<string, (...args: unknown[]) => void> = {}
    navigationHandlers: Record<string, (event: { preventDefault(): void }) => void> = {}
    openHandler: (() => { action: string }) | null = null
    setShape = vi.fn()
    showInactive = vi.fn()
    show = vi.fn()
    loadURL = vi.fn()
    loadFile = vi.fn()
    webContents = {
      setWindowOpenHandler: (handler: () => { action: string }) => (this.openHandler = handler),
      on: (name: string, handler: (event: { preventDefault(): void }) => void) => {
        this.navigationHandlers[name] = handler
      }
    }
    constructor(public options: Record<string, unknown>) {
      FakeWindow.created.push(this)
    }
    once(name: string, handler: (...args: unknown[]) => void) {
      this.handlers[name] = handler
    }
  }
  return {
    FakeWindow,
    screen: {
      getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1536, height: 816 } })
    }
  }
})

vi.mock('electron', () => ({ BrowserWindow: mock.FakeWindow, screen: mock.screen }))

import { createAppWindow } from './app-window'
import { loadPage, secureWebPreferences } from './common'
import { OVERVIEW_SIZE, createOverviewWindow } from './overview'
import { WIDGET_SIZE, createWidgetWindow } from './widget'

type Fake = InstanceType<typeof mock.FakeWindow>
const asFake = (window: unknown) => window as Fake

beforeEach(() => {
  mock.FakeWindow.created = []
  vi.stubEnv('ELECTRON_RENDERER_URL', '')
})
afterEach(() => void vi.unstubAllEnvs())

describe('secure web preferences', () => {
  it('sandboxes renderers and keeps Node out of them', () => {
    expect(secureWebPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    })
  })
})

describe('loadPage', () => {
  it('loads the built file in production', () => {
    const window = asFake(createWidgetWindow())
    expect(window.loadFile.mock.calls[0]?.[0]).toMatch(/renderer[\\/]widget[\\/]index\.html$/)
    expect(window.loadURL).not.toHaveBeenCalled()
  })

  it('loads from the dev server when one is running', () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
    const window = asFake(createOverviewWindow())
    expect(window.loadURL).toHaveBeenCalledWith('http://localhost:5173/overview/index.html')
    expect(window.loadFile).not.toHaveBeenCalled()
  })

  it('blocks new windows and navigation away from the app', () => {
    const window = new mock.FakeWindow({})
    loadPage(window as never, 'app')
    expect(window.openHandler?.()).toEqual({ action: 'deny' })
    const preventDefault = vi.fn()
    window.navigationHandlers['will-navigate']?.({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
  })
})

describe('widget window', () => {
  it('floats without a frame, taskbar entry, or keyboard focus', () => {
    expect(asFake(createWidgetWindow()).options).toMatchObject({
      width: WIDGET_SIZE,
      height: WIDGET_SIZE,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      show: false
    })
  })

  it('starts inside the work area', () => {
    const { x, y } = asFake(createWidgetWindow()).options as { x: number; y: number }
    expect(x).toBe(1416)
    expect(y).toBe(696)
  })

  it('uses a round clickable shape', () => {
    const shape = asFake(createWidgetWindow()).setShape.mock.calls[0]?.[0] as unknown[]
    expect(shape).toHaveLength(WIDGET_SIZE)
  })

  it('appears without taking focus, only once it is ready', () => {
    const window = asFake(createWidgetWindow())
    expect(window.showInactive).not.toHaveBeenCalled()
    window.handlers['ready-to-show']?.()
    expect(window.showInactive).toHaveBeenCalledOnce()
    expect(window.show).not.toHaveBeenCalled()
  })
})

describe('overview window', () => {
  it('starts hidden and cannot take focus', () => {
    const window = asFake(createOverviewWindow())
    expect(window.options).toMatchObject({
      ...OVERVIEW_SIZE,
      show: false,
      focusable: false,
      alwaysOnTop: true,
      skipTaskbar: true
    })
    expect(window.showInactive).not.toHaveBeenCalled()
  })

  it('stays ready to paint while hidden', () => {
    const { webPreferences } = asFake(createOverviewWindow()).options
    expect(webPreferences).toMatchObject({ backgroundThrottling: false, sandbox: true })
  })
})

describe('app window', () => {
  it('is an ordinary resizable window with native title bar buttons', () => {
    const { options } = asFake(createAppWindow())
    expect(options).toMatchObject({ titleBarStyle: 'hidden', show: false })
    expect(options).not.toHaveProperty('transparent')
    expect(options).not.toHaveProperty('alwaysOnTop')
    expect(options).toHaveProperty('titleBarOverlay')
  })

  it('shows normally once ready', () => {
    const window = asFake(createAppWindow())
    window.handlers['ready-to-show']?.()
    expect(window.show).toHaveBeenCalledOnce()
  })
})
