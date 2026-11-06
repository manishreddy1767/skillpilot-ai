import { describe, expect, it } from 'vitest'
import { bridgeBetween, centreIn, circleRows, contains, overlaps, placePanel } from './geometry'

const workArea = { x: 0, y: 0, width: 1536, height: 816 }
const panel = { width: 340, height: 420 }
const widgetAt = (x: number, y: number) => ({ x, y, width: 72, height: 72 })

describe('contains', () => {
  it('includes the top-left edge and excludes the bottom-right edge', () => {
    const rect = { x: 10, y: 10, width: 5, height: 5 }
    expect(contains(rect, { x: 10, y: 10 })).toBe(true)
    expect(contains(rect, { x: 15, y: 12 })).toBe(false)
  })
})

describe('overlaps', () => {
  const rect = { x: 10, y: 10, width: 10, height: 10 }

  it('finds shared area', () => {
    expect(overlaps(rect, { x: 15, y: 15, width: 10, height: 10 })).toBe(true)
  })

  it('does not count touching edges', () => {
    expect(overlaps(rect, { x: 20, y: 10, width: 10, height: 10 })).toBe(false)
  })

  it('finds no overlap when apart', () => {
    expect(overlaps(rect, { x: 100, y: 100, width: 10, height: 10 })).toBe(false)
  })
})

describe('centreIn', () => {
  it('centres inside an area', () => {
    expect(centreIn({ x: 0, y: 0, width: 1536, height: 816 }, { width: 1100, height: 720 })).toEqual({
      x: 218,
      y: 48
    })
  })

  it('respects an area that does not start at zero', () => {
    const area = { x: -1920, y: 100, width: 1920, height: 1040 }
    expect(centreIn(area, { width: 1100, height: 720 })).toEqual({ x: -1510, y: 260 })
  })
})

describe('placePanel', () => {
  it('opens to the right when there is room', () => {
    expect(placePanel(widgetAt(100, 300), panel, workArea, 8).x).toBe(180)
  })

  it('flips to the left near the right edge', () => {
    expect(placePanel(widgetAt(1400, 300), panel, workArea, 8).x).toBe(1052)
  })

  it('stays on screen vertically near the bottom', () => {
    const placed = placePanel(widgetAt(100, 780), panel, workArea, 8)
    expect(placed.y + placed.height).toBeLessThanOrEqual(816)
  })

  it('stays on screen when the widget is partly off screen', () => {
    const placed = placePanel(widgetAt(-40, -40), panel, workArea, 8)
    expect(placed.x).toBeGreaterThanOrEqual(0)
    expect(placed.y).toBeGreaterThanOrEqual(0)
  })

  it('respects a work area that does not start at zero', () => {
    const second = { x: -1920, y: 100, width: 1920, height: 1080 }
    const placed = placePanel(widgetAt(-100, 200), panel, second, 8)
    expect(placed.x).toBe(-448)
    expect(placed.y).toBe(100)
  })
})

describe('bridgeBetween', () => {
  it('covers the gap when the panel is on the right', () => {
    const bridge = bridgeBetween(widgetAt(100, 300), { x: 180, y: 200, ...panel })
    expect(bridge).toEqual({ x: 172, y: 300, width: 8, height: 72 })
  })

  it('covers the gap when the panel is on the left', () => {
    const bridge = bridgeBetween(widgetAt(1400, 300), { x: 1052, y: 200, ...panel })
    expect(bridge).toEqual({ x: 1392, y: 300, width: 8, height: 72 })
  })
})

describe('circleRows', () => {
  it('produces one row per pixel, widest in the middle', () => {
    const rows = circleRows(72)
    expect(rows).toHaveLength(72)
    expect(rows[36]?.width).toBe(72)
    expect(rows[0]?.width).toBeLessThan(30)
  })
})
