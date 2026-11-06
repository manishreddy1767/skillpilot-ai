import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Item {
  label?: string
  type?: string
  checked?: boolean
  click?: (item: { checked: boolean }) => void
}

const mock = vi.hoisted(() => {
  const image = { resize: vi.fn() }
  image.resize.mockReturnValue(image)
  const tray = {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn()
  }
  return {
    image,
    tray,
    createFromPath: vi.fn(() => image),
    buildFromTemplate: vi.fn((template: unknown) => template),
    Tray: vi.fn(function () {
      return tray
    })
  }
})

vi.mock('electron', () => ({
  Tray: mock.Tray,
  Menu: { buildFromTemplate: mock.buildFromTemplate },
  nativeImage: { createFromPath: mock.createFromPath },
  app: { getAppPath: () => 'C:/app' }
}))

import { createTray, type TrayActions } from './tray'

function setup(overrides: Partial<TrayActions> = {}) {
  const actions: TrayActions = {
    openApp: vi.fn(),
    isAlwaysOnTop: vi.fn(() => true),
    setAlwaysOnTop: vi.fn(),
    isClickThrough: vi.fn(() => false),
    setClickThrough: vi.fn(),
    resetWidgetPosition: vi.fn(),
    quit: vi.fn(),
    ...overrides
  }
  createTray(actions)
  return actions
}

const latestMenu = () => mock.tray.setContextMenu.mock.lastCall?.[0] as Item[]
const item = (label: string) => latestMenu().find((entry) => entry.label === label)!

beforeEach(() => {
  mock.tray.setContextMenu.mockClear()
  mock.tray.on.mockClear()
  mock.createFromPath.mockClear()
})

describe('tray', () => {
  it('loads the app icon at tray size', () => {
    setup()
    expect(mock.createFromPath.mock.calls[0]).toEqual([expect.stringMatching(/icon\.png$/)])
    expect(mock.image.resize).toHaveBeenCalledWith({ width: 16, height: 16 })
    expect(mock.tray.setToolTip).toHaveBeenCalledWith('SkillPilot AI')
  })

  it('offers open, both modes, reset, and quit', () => {
    setup()
    const labels = latestMenu().flatMap((entry) => (entry.label ? [entry.label] : []))
    expect(labels).toEqual([
      'Open SkillPilot AI',
      'Always on top',
      'Click-through mode',
      'Reset widget position',
      'Quit SkillPilot AI'
    ])
  })

  it('shows the current state of each mode', () => {
    setup({ isAlwaysOnTop: () => false, isClickThrough: () => true })
    expect(item('Always on top').checked).toBe(false)
    expect(item('Click-through mode').checked).toBe(true)
  })

  it('resets the widget position from the menu', () => {
    const actions = setup()
    item('Reset widget position').click?.({ checked: false })
    expect(actions.resetWidgetPosition).toHaveBeenCalledOnce()
  })

  it('quits from the menu', () => {
    const actions = setup()
    item('Quit SkillPilot AI').click?.({ checked: false })
    expect(actions.quit).toHaveBeenCalledOnce()
  })

  it('opens the app from the menu and from a left click', () => {
    const actions = setup()
    item('Open SkillPilot AI').click?.({ checked: false })
    expect(actions.openApp).toHaveBeenCalledOnce()
    expect(mock.tray.on).toHaveBeenCalledWith('click', actions.openApp)
  })

  it('applies a toggle, then rebuilds the menu with the new state', () => {
    let onTop = true
    const actions = setup({
      isAlwaysOnTop: () => onTop,
      setAlwaysOnTop: vi.fn((enabled: boolean) => (onTop = enabled))
    })
    item('Always on top').click?.({ checked: false })
    expect(actions.setAlwaysOnTop).toHaveBeenCalledWith(false)
    expect(item('Always on top').checked).toBe(false)
  })

  it('applies click-through and rebuilds the menu', () => {
    let through = false
    const actions = setup({
      isClickThrough: () => through,
      setClickThrough: vi.fn((enabled: boolean) => (through = enabled))
    })
    item('Click-through mode').click?.({ checked: true })
    expect(actions.setClickThrough).toHaveBeenCalledWith(true)
    expect(item('Click-through mode').checked).toBe(true)
  })
})
