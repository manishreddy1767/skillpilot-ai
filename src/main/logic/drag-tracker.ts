import type { Point } from './geometry'

/** Movement below this many pixels counts as a click rather than a drag. */
export const DRAG_THRESHOLD = 4

/**
 * Tells a click from a drag and works out where the widget belongs. It places no
 * limits on position: the widget follows the cursor everywhere.
 */
export class DragTracker {
  private pressedAt: Point | null = null
  private grabOffset: Point = { x: 0, y: 0 }
  private dragging = false

  get isDragging(): boolean {
    return this.dragging
  }

  press(cursor: Point, grabOffset: Point): void {
    this.pressedAt = cursor
    this.grabOffset = grabOffset
    this.dragging = false
  }

  /** Returns the widget's new top-left corner, or null if it should not move. */
  move(cursor: Point): Point | null {
    if (!this.pressedAt) return null
    if (!this.dragging) {
      const distance = Math.hypot(cursor.x - this.pressedAt.x, cursor.y - this.pressedAt.y)
      if (distance < DRAG_THRESHOLD) return null
      this.dragging = true
    }
    // Display scaling makes grab offsets fractional, but windows sit on whole pixels.
    return {
      x: Math.round(cursor.x - this.grabOffset.x),
      y: Math.round(cursor.y - this.grabOffset.y)
    }
  }

  /** Ends the press. `null` means no press was active. */
  release(): 'click' | 'drag' | null {
    if (!this.pressedAt) return null
    const result = this.dragging ? 'drag' : 'click'
    this.pressedAt = null
    this.dragging = false
    return result
  }
}
