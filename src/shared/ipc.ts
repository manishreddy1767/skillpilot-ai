import type { FieldValues, OverviewData, RecordKind, Result, StoredRecord } from './career'

export const Channel = {
  DragPress: 'widget:drag-press',
  DragMove: 'widget:drag-move',
  DragRelease: 'widget:drag-release',
  HoverEnter: 'widget:hover-enter',
  HoverLeave: 'widget:hover-leave',
  OpenApp: 'overview:open-app',
  GetOverview: 'overview:get',
  OverviewChanged: 'overview:changed',
  MinimizeToWidget: 'app:minimize-to-widget',
  GetProfile: 'profile:get',
  SaveProfile: 'profile:save',
  ListRecords: 'records:list',
  SaveRecord: 'records:save',
  DeleteRecord: 'records:delete'
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
  getOverview(): Promise<Result<OverviewData>>
  /** Calls back when overview data changes. Returns a function that stops listening. */
  onOverviewChanged(listener: () => void): () => void
  getProfile(): Promise<Result<FieldValues>>
  saveProfile(values: FieldValues): Promise<Result<FieldValues>>
  listRecords(kind: RecordKind): Promise<Result<StoredRecord[]>>
  saveRecord(kind: RecordKind, id: number | null, values: FieldValues): Promise<Result<StoredRecord>>
  deleteRecord(kind: RecordKind, id: number): Promise<Result<boolean>>
}

declare global {
  interface Window {
    skillpilot: SkillPilotApi
  }
}
