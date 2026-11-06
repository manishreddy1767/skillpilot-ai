import { describe, expect, it } from 'vitest'
import {
  defaultPosition,
  describePosition,
  isReachable,
  resolvePosition,
  type DisplayArea,
  type SavedPosition
} from './widget-position'

const SIZE = 72

function display(id: number, x: number, y: number, width: number, height: number): DisplayArea {
  return {
    id,
    bounds: { x, y, width, height },
    workArea: { x, y, width, height: height - 48 }
  }
}

const laptop = display(1, 0, 0, 1536, 864)
const external = display(2, 1536, 0, 1920, 1080)
const leftExternal = display(3, -1920, -100, 1920, 1080)

const savedOn = (d: DisplayArea, x: number, y: number): SavedPosition => ({
  x,
  y,
  displayId: d.id,
  displayBounds: d.bounds
})

describe('defaultPosition', () => {
  it('sits near the bottom right of the work area', () => {
    expect(defaultPosition(laptop.workArea, SIZE)).toEqual({ x: 1416, y: 696 })
  })

  it('respects a work area that does not start at zero', () => {
    expect(defaultPosition(leftExternal.workArea, SIZE)).toEqual({ x: -120, y: 812 })
  })
})

describe('isReachable', () => {
  it('accepts a position in the middle of a display', () => {
    expect(isReachable({ x: 700, y: 400 }, SIZE, [laptop])).toBe(true)
  })

  it('accepts a widget half off the edge, which is a valid place to put it', () => {
    expect(isReachable({ x: -34, y: -34 }, SIZE, [laptop])).toBe(true)
    expect(isReachable({ x: -36, y: 100 }, SIZE, [laptop])).toBe(true)
  })

  it('rejects a widget with too little on screen to grab', () => {
    expect(isReachable({ x: -37, y: 100 }, SIZE, [laptop])).toBe(false)
    expect(isReachable({ x: 100, y: 829 }, SIZE, [laptop])).toBe(false)
  })

  it('rejects a position with no display', () => {
    expect(isReachable({ x: 5000, y: 5000 }, SIZE, [laptop, external])).toBe(false)
  })

  it('accepts negative positions on a display left of the primary', () => {
    expect(isReachable({ x: -900, y: 300 }, SIZE, [laptop, leftExternal])).toBe(true)
  })

  it('accepts a widget spanning two displays', () => {
    expect(isReachable({ x: 1500, y: 100 }, SIZE, [laptop, external])).toBe(true)
  })
})

describe('resolvePosition', () => {
  it('uses the default when nothing was saved', () => {
    expect(resolvePosition(null, SIZE, [laptop], laptop)).toEqual({ x: 1416, y: 696 })
  })

  it('returns exactly to a reachable position', () => {
    const saved = savedOn(laptop, 733, 391)
    expect(resolvePosition(saved, SIZE, [laptop], laptop)).toEqual({ x: 733, y: 391 })
  })

  it('leaves a half off-screen widget where the user put it', () => {
    const saved = savedOn(laptop, -34, -34)
    expect(resolvePosition(saved, SIZE, [laptop], laptop)).toEqual({ x: -34, y: -34 })
  })

  it('moves to the same relative spot on the primary when the monitor is gone', () => {
    const saved = savedOn(external, 1536 + 960, 540)
    expect(resolvePosition(saved, SIZE, [laptop], laptop)).toEqual({ x: 768, y: 408 })
  })

  it('stays on its own display when that display shrinks', () => {
    const big = display(1, 0, 0, 3840, 2160)
    const saved = savedOn(big, 3000, 2000)
    const position = resolvePosition(saved, SIZE, [laptop], laptop)
    expect(isReachable(position, SIZE, [laptop])).toBe(true)
    expect(position).toEqual({ x: 1200, y: 744 })
  })

  it('keeps the whole widget inside the work area when recovering', () => {
    const saved = savedOn(external, 1536 + 1919, 1079)
    const { x, y } = resolvePosition(saved, SIZE, [laptop], laptop)
    expect(x + SIZE).toBeLessThanOrEqual(1536)
    expect(y + SIZE).toBeLessThanOrEqual(816)
  })

  it('recovers onto a primary that does not start at zero', () => {
    const saved = savedOn(laptop, 700, 400)
    const position = resolvePosition(saved, SIZE, [external], external)
    expect(position.x).toBeGreaterThanOrEqual(1536)
    expect(isReachable(position, SIZE, [external])).toBe(true)
  })

  it('returns whole pixels', () => {
    const saved = savedOn(external, 1536 + 333, 777)
    const { x, y } = resolvePosition(saved, SIZE, [laptop], laptop)
    expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true)
  })
})

describe('describePosition', () => {
  it('records the display under the centre of the widget', () => {
    expect(describePosition({ x: 1600, y: 100 }, SIZE, [laptop, external], laptop)).toEqual(
      savedOn(external, 1600, 100)
    )
  })

  it('picks the display holding the centre when spanning two', () => {
    const position = { x: 1530, y: 100 }
    expect(describePosition(position, SIZE, [laptop, external], laptop).displayId).toBe(2)
  })

  it('falls back to the primary when the centre is on no display', () => {
    const saved = describePosition({ x: -60, y: 10 }, SIZE, [laptop], laptop)
    expect(saved).toEqual(savedOn(laptop, -60, 10))
  })
})
