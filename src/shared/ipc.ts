export const Channel = {
  DragPress: 'widget:drag-press',
  DragMove: 'widget:drag-move',
  DragRelease: 'widget:drag-release',
  HoverEnter: 'widget:hover-enter',
  HoverLeave: 'widget:hover-leave',
  OpenApp: 'overview:open-app',
  MinimizeToWidget: 'app:minimize-to-widget'
} as const

/** The whole surface renderers can reach. They get nothing else from the main process. */
export interface SkillPilotApi {
  dragPress(grabOffset: { x: number; y: number }): void
  dragMove(): void
  dragRelease(): void
  hoverEnter(): void
  hoverLeave(): void
  openApp(): void
  minimizeToWidget(): void
}

declare global {
  interface Window {
    skillpilot: SkillPilotApi
  }
}
