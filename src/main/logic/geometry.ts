export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}

export function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  )
}

/**
 * Picks where the hover panel opens beside the widget. This only ever moves the
 * panel: the widget stays wherever it was put, even partly off screen.
 */
export function placePanel(widget: Rect, panel: Size, workArea: Rect, gap: number): Rect {
  const right = widget.x + widget.width + gap
  const left = widget.x - gap - panel.width
  const fitsRight = right + panel.width <= workArea.x + workArea.width
  const fitsLeft = left >= workArea.x
  const x = fitsRight || !fitsLeft ? right : left

  const centredY = widget.y + widget.height / 2 - panel.height / 2
  return {
    x: Math.round(clamp(x, workArea.x, workArea.x + workArea.width - panel.width)),
    y: Math.round(clamp(centredY, workArea.y, workArea.y + workArea.height - panel.height)),
    width: panel.width,
    height: panel.height
  }
}

/** The strip between widget and panel, so crossing it does not close the panel. */
export function bridgeBetween(widget: Rect, panel: Rect): Rect {
  const panelIsRight = panel.x >= widget.x + widget.width
  const x = panelIsRight ? widget.x + widget.width : panel.x + panel.width
  const end = panelIsRight ? panel.x : widget.x
  return { x, y: widget.y, width: Math.max(0, end - x), height: widget.height }
}

/** One rectangle per pixel row of a circle, for a round clickable window shape. */
export function circleRows(diameter: number): Rect[] {
  const radius = diameter / 2
  const rows: Rect[] = []
  for (let y = 0; y < diameter; y++) {
    const offset = y + 0.5 - radius
    const half = Math.sqrt(Math.max(0, radius * radius - offset * offset))
    const x = Math.floor(radius - half)
    rows.push({ x, y, width: diameter - 2 * x, height: 1 })
  }
  return rows
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}
