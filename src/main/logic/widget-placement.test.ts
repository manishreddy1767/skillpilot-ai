import { describe, expect, it, vi } from 'vitest'
import { WidgetPlacement } from './widget-placement'
import type { DisplayArea, SavedPosition } from './widget-position'

const laptop: DisplayArea = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1536, height: 864 },
  workArea: { x: 0, y: 0, width: 1536, height: 816 }
}
const external: DisplayArea = {
  id: 2,
  bounds: { x: 1536, y: 0, width: 1920, height: 1080 },
  workArea: { x: 1536, y: 0, width: 1920, height: 1032 }
}

function setup(saved: SavedPosition | null = null, connected = [laptop, external]) {
  let displays = connected
  const save = vi.fn()
  const placement = new WidgetPlacement({
    size: 72,
    getDisplays: () => displays,
    getPrimary: () => laptop,
    load: () => saved,
    save
  })
  return { placement, save, connect: (next: DisplayArea[]) => (displays = next) }
}

describe('WidgetPlacement', () => {
  it('starts at the default when nothing was saved', () => {
    expect(setup().placement.target()).toEqual({ x: 1416, y: 696 })
  })

  it('starts where it was saved', () => {
    const saved = { x: 300, y: 200, displayId: 1, displayBounds: laptop.bounds }
    expect(setup(saved).placement.target()).toEqual({ x: 300, y: 200 })
  })

  it('saves and uses a position the user chose', () => {
    const { placement, save } = setup()
    placement.userMoved({ x: 2000, y: 300 })
    expect(save).toHaveBeenCalledExactlyOnceWith({
      x: 2000,
      y: 300,
      displayId: 2,
      displayBounds: external.bounds
    })
    expect(placement.target()).toEqual({ x: 2000, y: 300 })
  })

  it('recovers when a monitor goes, and returns when it comes back', () => {
    const { placement, save, connect } = setup()
    placement.userMoved({ x: 2496, y: 540 })
    save.mockClear()

    connect([laptop])
    expect(placement.target()).toEqual({ x: 768, y: 408 })

    connect([laptop, external])
    expect(placement.target()).toEqual({ x: 2496, y: 540 })
    expect(save).not.toHaveBeenCalled()
  })

  it('a drag during recovery becomes the new spot', () => {
    const { placement, connect } = setup()
    placement.userMoved({ x: 2496, y: 540 })
    connect([laptop])
    placement.userMoved({ x: 100, y: 100 })
    connect([laptop, external])
    expect(placement.target()).toEqual({ x: 100, y: 100 })
  })

  it('reset returns to the default on the primary and saves it', () => {
    const { placement, save } = setup({ x: 2000, y: 300, displayId: 2, displayBounds: external.bounds })
    expect(placement.reset()).toEqual({ x: 1416, y: 696 })
    expect(placement.target()).toEqual({ x: 1416, y: 696 })
    expect(save).toHaveBeenCalledOnce()
  })
})
