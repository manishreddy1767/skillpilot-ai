import type { Point, Rect } from './geometry'

const DEFAULT_MARGIN = 48

export interface DisplayArea {
  id: number
  bounds: Rect
  workArea: Rect
}

/** Where the user put the widget, and which display that was relative to. */
export interface SavedPosition extends Point {
  displayId: number
  displayBounds: Rect
}

export function defaultPosition(workArea: Rect, size: number): Point {
  return {
    x: workArea.x + workArea.width - size - DEFAULT_MARGIN,
    y: workArea.y + workArea.height - size - DEFAULT_MARGIN
  }
}

function visibleLength(start: number, size: number, areaStart: number, areaSize: number): number {
  return Math.min(start + size, areaStart + areaSize) - Math.max(start, areaStart)
}

/**
 * The icon is round, so it can be grabbed only if about half of it is on a display.
 * This decides recovery after a display change and never limits dragging.
 */
export function isReachable(point: Point, size: number, displays: DisplayArea[]): boolean {
  const needed = Math.ceil(size / 2)
  return displays.some(
    ({ bounds }) =>
      visibleLength(point.x, size, bounds.x, bounds.width) >= needed &&
      visibleLength(point.y, size, bounds.y, bounds.height) >= needed
  )
}

/** The top-left corner the widget belongs at, given the displays connected right now. */
export function resolvePosition(
  saved: SavedPosition | null,
  size: number,
  displays: DisplayArea[],
  primary: DisplayArea
): Point {
  if (!saved) return defaultPosition(primary.workArea, size)
  if (isReachable(saved, size, displays)) return { x: saved.x, y: saved.y }

  // Same relative spot: on its own display if that remains, otherwise the primary.
  const { workArea } = displays.find((display) => display.id === saved.displayId) ?? primary
  const { displayBounds: from } = saved
  const relativeX = (saved.x - from.x) / from.width
  const relativeY = (saved.y - from.y) / from.height
  return {
    x: Math.round(clamp(workArea.x + relativeX * workArea.width, workArea.x, workArea.x + workArea.width - size)),
    y: Math.round(clamp(workArea.y + relativeY * workArea.height, workArea.y, workArea.y + workArea.height - size))
  }
}

/** Records a position against the display under the centre of the widget. */
export function describePosition(
  point: Point,
  size: number,
  displays: DisplayArea[],
  primary: DisplayArea
): SavedPosition {
  const centre = { x: point.x + size / 2, y: point.y + size / 2 }
  const display =
    displays.find(
      ({ bounds }) =>
        centre.x >= bounds.x &&
        centre.x < bounds.x + bounds.width &&
        centre.y >= bounds.y &&
        centre.y < bounds.y + bounds.height
    ) ?? primary
  return { x: point.x, y: point.y, displayId: display.id, displayBounds: display.bounds }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}
