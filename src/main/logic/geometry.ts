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

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** The top-left corner that centres something of this size in an area. */
export function centreIn(area: Rect, size: Size): Point {
  return {
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + (area.height - size.height) / 2)
  }
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

/**
 * The widget's clickable shape: the round robot plus the round microphone badge at its bottom-right.
 * Rows where the two meet are merged, so there are never gaps or overlaps.
 */
export function widgetShape(size: number, badgeRatio: number): Rect[] {
  const badge = Math.round(size * badgeRatio)
  const offset = size - badge
  const badgeRows = new Map(circleRows(badge).map((row) => [row.y + offset, row.x + offset]))
  const rows: Rect[] = []
  for (const row of circleRows(size)) {
    const badgeX = badgeRows.get(row.y)
    if (badgeX === undefined) {
      rows.push(row)
      continue
    }
    const badgeEnd = size - (badgeX - offset)
    const start = Math.min(row.x, badgeX)
    const end = Math.max(row.x + row.width, badgeEnd)
    if (badgeX <= row.x + row.width) rows.push({ x: start, y: row.y, width: end - start, height: 1 })
    else rows.push(row, { x: badgeX, y: row.y, width: badgeEnd - badgeX, height: 1 })
  }
  return rows
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}
