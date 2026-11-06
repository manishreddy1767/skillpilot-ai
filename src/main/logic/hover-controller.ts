import { bridgeBetween, contains, type Point, type Rect } from './geometry'

export const HOVER_OPEN_DELAY = 180
export const HOVER_CLOSE_DELAY = 250
export const HOVER_POLL_INTERVAL = 100

export interface HoverDeps {
  getCursor(): Point
  getWidgetBounds(): Rect
  getPanelBounds(): Rect
  showPanel(): void
  hidePanel(): void
}

/**
 * Opens the overview after a short rest on the widget and closes it once the
 * cursor has left both windows. Closing polls the cursor, because mouseleave is
 * unreliable when the cursor crosses between two separate windows.
 */
export class HoverController {
  private openTimer: NodeJS.Timeout | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private outsideFor = 0
  private suspended = false

  constructor(private readonly deps: HoverDeps) {}

  get isOpen(): boolean {
    return this.pollTimer !== null
  }

  pointerEntered(): void {
    if (this.suspended || this.isOpen || this.openTimer) return
    this.openTimer = setTimeout(() => {
      this.openTimer = null
      if (!this.suspended && contains(this.deps.getWidgetBounds(), this.deps.getCursor())) {
        this.open()
      }
    }, HOVER_OPEN_DELAY)
  }

  pointerLeft(): void {
    this.cancelOpening()
  }

  /** Closes the panel and keeps it closed, for example during a drag. */
  suspend(): void {
    this.suspended = true
    this.close()
  }

  resume(): void {
    this.suspended = false
  }

  close(): void {
    this.cancelOpening()
    if (!this.pollTimer) return
    clearInterval(this.pollTimer)
    this.pollTimer = null
    this.deps.hidePanel()
  }

  private open(): void {
    this.deps.showPanel()
    this.outsideFor = 0
    this.pollTimer = setInterval(() => this.checkCursor(), HOVER_POLL_INTERVAL)
  }

  private checkCursor(): void {
    const cursor = this.deps.getCursor()
    const widget = this.deps.getWidgetBounds()
    const panel = this.deps.getPanelBounds()
    const inside = [widget, panel, bridgeBetween(widget, panel)].some((r) => contains(r, cursor))

    this.outsideFor = inside ? 0 : this.outsideFor + HOVER_POLL_INTERVAL
    if (this.outsideFor >= HOVER_CLOSE_DELAY) this.close()
  }

  private cancelOpening(): void {
    if (this.openTimer) clearTimeout(this.openTimer)
    this.openTimer = null
  }
}
