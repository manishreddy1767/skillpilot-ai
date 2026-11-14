import { describe, expect, it } from 'vitest'
import { bridgeBetween, centreIn, circleRows, contains, overlaps, placePanel, widgetShape } from './geometry'

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

describe('widgetShape', () => {
  const covers = (rows: { x: number; y: number; width: number }[], x: number, y: number) =>
    rows.some((row) => row.y === y && x >= row.x && x < row.x + row.width)

  it('is the robot circle plus the microphone badge at the bottom-right', () => {
    const rows = widgetShape(64, 0.38)
    expect(covers(rows, 32, 32)).toBe(true)
    expect(covers(rows, 0, 0)).toBe(false)
    expect(covers(rows, 63, 0)).toBe(false)
    expect(covers(rows, 0, 63)).toBe(false)
    // The very corner of the window belongs to the badge, which the circle alone would leave out.
    expect(covers(circleRows(64), 60, 60)).toBe(false)
    expect(covers(rows, 60, 60)).toBe(true)
    expect(covers(rows, 63, 63)).toBe(false)
  })

  it('never overlaps itself, and stays inside the window', () => {
    for (const size of [48, 64, 72, 128]) {
      const rows = widgetShape(size, 0.38)
      for (let y = 0; y < size; y++) {
        const line = rows.filter((row) => row.y === y).sort((a, b) => a.x - b.x)
        for (const [index, row] of line.entries()) {
          expect(row.x).toBeGreaterThanOrEqual(0)
          expect(row.x + row.width).toBeLessThanOrEqual(size)
          if (index > 0) expect(row.x).toBeGreaterThanOrEqual(line[index - 1]!.x + line[index - 1]!.width)
        }
      }
    }
  })
})
