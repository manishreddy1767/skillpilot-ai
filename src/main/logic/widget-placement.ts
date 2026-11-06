import type { Point } from './geometry'
import {
  defaultPosition,
  describePosition,
  resolvePosition,
  type DisplayArea,
  type SavedPosition
} from './widget-position'

export interface PlacementDeps {
  size: number
  getDisplays(): DisplayArea[]
  getPrimary(): DisplayArea
  load(): SavedPosition | null
  save(position: SavedPosition): void
}

/**
 * Tracks where the user put the widget. Only the user changes that spot: a recovery
 * after a display change moves the window but keeps the spot, so the widget can go
 * back when the display returns.
 */
export class WidgetPlacement {
  private home: SavedPosition | null

  constructor(private readonly deps: PlacementDeps) {
    this.home = deps.load()
  }

  /** Where the widget should be right now. */
  target(): Point {
    const { size, getDisplays, getPrimary } = this.deps
    return resolvePosition(this.home, size, getDisplays(), getPrimary())
  }

  /** Call when the user finishes dragging. */
  userMoved(position: Point): void {
    const { size, getDisplays, getPrimary, save } = this.deps
    this.home = describePosition(position, size, getDisplays(), getPrimary())
    save(this.home)
  }

  /** Returns the widget to its starting spot, for when it is hard to find. */
  reset(): Point {
    const primary = this.deps.getPrimary()
    const position = defaultPosition(primary.workArea, this.deps.size)
    this.userMoved(position)
    return position
  }
}
