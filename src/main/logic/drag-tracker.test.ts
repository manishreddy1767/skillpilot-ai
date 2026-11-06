import { describe, expect, it } from 'vitest'
import { DragTracker } from './drag-tracker'

const offset = { x: 30, y: 20 }

describe('DragTracker', () => {
  it('treats a press with tiny movement as a click', () => {
    const tracker = new DragTracker()
    tracker.press({ x: 100, y: 100 }, offset)
    expect(tracker.move({ x: 102, y: 101 })).toBeNull()
    expect(tracker.release()).toBe('click')
  })

  it('starts dragging at the threshold and keeps the grab point under the cursor', () => {
    const tracker = new DragTracker()
    tracker.press({ x: 100, y: 100 }, offset)
    expect(tracker.move({ x: 104, y: 100 })).toEqual({ x: 74, y: 80 })
    expect(tracker.isDragging).toBe(true)
    expect(tracker.release()).toBe('drag')
  })

  it('stays a drag even if the cursor returns to where it started', () => {
    const tracker = new DragTracker()
    tracker.press({ x: 100, y: 100 }, offset)
    tracker.move({ x: 200, y: 200 })
    expect(tracker.move({ x: 100, y: 100 })).toEqual({ x: 70, y: 80 })
    expect(tracker.release()).toBe('drag')
  })

  it('does not restrict position, including negative coordinates', () => {
    const tracker = new DragTracker()
    tracker.press({ x: 10, y: 10 }, offset)
    expect(tracker.move({ x: -500, y: -300 })).toEqual({ x: -530, y: -320 })
  })

  it('ignores movement and release when nothing is pressed', () => {
    const tracker = new DragTracker()
    expect(tracker.move({ x: 1, y: 1 })).toBeNull()
    expect(tracker.release()).toBeNull()
  })
})
