import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HoverController } from './hover-controller'

const widget = { x: 100, y: 100, width: 72, height: 72 }
const panel = { x: 180, y: 0, width: 340, height: 420 }
const onWidget = { x: 130, y: 130 }
const onBridge = { x: 176, y: 130 }
const onPanel = { x: 300, y: 200 }
const away = { x: 900, y: 700 }

function setup() {
  let cursor = onWidget
  const showPanel = vi.fn()
  const hidePanel = vi.fn()
  const hover = new HoverController({
    getCursor: () => cursor,
    getWidgetBounds: () => widget,
    getPanelBounds: () => panel,
    showPanel,
    hidePanel
  })
  return { hover, showPanel, hidePanel, moveTo: (p: typeof cursor) => (cursor = p) }
}

describe('HoverController', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  it('opens only after the cursor rests on the widget', () => {
    const { hover, showPanel } = setup()
    hover.pointerEntered()
    vi.advanceTimersByTime(179)
    expect(showPanel).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(showPanel).toHaveBeenCalledOnce()
  })

  it('does not open when the cursor just passes over', () => {
    const { hover, showPanel } = setup()
    hover.pointerEntered()
    vi.advanceTimersByTime(100)
    hover.pointerLeft()
    vi.advanceTimersByTime(500)
    expect(showPanel).not.toHaveBeenCalled()
  })

  it('does not open if the leave event was missed but the cursor has gone', () => {
    const { hover, showPanel, moveTo } = setup()
    hover.pointerEntered()
    moveTo(away)
    vi.advanceTimersByTime(180)
    expect(showPanel).not.toHaveBeenCalled()
  })

  it('stays open while the cursor crosses to the panel', () => {
    const { hover, hidePanel, moveTo } = setup()
    hover.pointerEntered()
    vi.advanceTimersByTime(180)
    moveTo(onBridge)
    vi.advanceTimersByTime(600)
    moveTo(onPanel)
    vi.advanceTimersByTime(600)
    expect(hidePanel).not.toHaveBeenCalled()
  })

  it('closes shortly after the cursor leaves both windows', () => {
    const { hover, hidePanel, moveTo } = setup()
    hover.pointerEntered()
    vi.advanceTimersByTime(180)
    moveTo(away)
    vi.advanceTimersByTime(500)
    expect(hidePanel).toHaveBeenCalledOnce()
    expect(hover.isOpen).toBe(false)
  })

  it('forgives a brief exit from the panel', () => {
    const { hover, hidePanel, moveTo } = setup()
    hover.pointerEntered()
    vi.advanceTimersByTime(180)
    moveTo(away)
    vi.advanceTimersByTime(100)
    moveTo(onPanel)
    vi.advanceTimersByTime(600)
    expect(hidePanel).not.toHaveBeenCalled()
  })

  it('closes and stays closed while suspended', () => {
    const { hover, showPanel, hidePanel } = setup()
    hover.pointerEntered()
    vi.advanceTimersByTime(180)
    hover.suspend()
    expect(hidePanel).toHaveBeenCalledOnce()
    hover.pointerEntered()
    vi.advanceTimersByTime(500)
    expect(showPanel).toHaveBeenCalledOnce()
    hover.resume()
    hover.pointerEntered()
    vi.advanceTimersByTime(180)
    expect(showPanel).toHaveBeenCalledTimes(2)
  })
})
