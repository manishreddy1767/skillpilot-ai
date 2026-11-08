import type { AiLogEntry, AiStatus, ChatMessage, GapReport, Proposal } from './ai'
import type { FieldValues, Link, LinkKind, OverviewData, RecordKind, Result, StoredRecord } from './career'
import type { GapAnalysis } from './gap'
import type { History } from './history'
import type { Learning } from './learning'
import type { Dashboard } from './progress'
import type { Settings } from './settings'

export interface BackupInfo {
  name: string
  kind: 'daily' | 'before upgrade' | 'before change'
  savedAt: string
  sizeKb: number
}

export interface RoleReadiness {
  id: number
  title: string
  readiness: number | null
  gaps: string[]
}

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
  DeleteRecord: 'records:delete',
  ListLinks: 'links:list',
  SetLink: 'links:set',
  GetDashboard: 'dashboard:get',
  GetSettings: 'settings:get',
  SaveSettings: 'settings:save',
  GetAiStatus: 'ai:status',
  SaveApiKey: 'ai:save-key',
  RemoveApiKey: 'ai:remove-key',
  GetChat: 'chat:get',
  SendChat: 'chat:send',
  ClearChat: 'chat:clear',
  GetGapAnalysis: 'gap:get',
  DraftRequirements: 'ai:draft-requirements',
  CreateGapReport: 'ai:gap-report',
  GenerateRoadmap: 'ai:roadmap',
  SuggestTasks: 'ai:suggest-tasks',
  ListProposals: 'proposals:list',
  AcceptProposal: 'proposals:accept',
  RejectProposal: 'proposals:reject',
  GetAiLog: 'ai:log',
  GetLearning: 'learning:get',
  GetRecommendation: 'learning:recommendation',
  GetRoleReadiness: 'learning:roles',
  CompleteTask: 'tasks:complete',
  RescheduleRoadmap: 'roadmaps:reschedule',
  ExportData: 'data:export',
  ImportData: 'data:import',
  ListBackups: 'data:backups',
  RestoreBackup: 'data:restore',
  EraseAll: 'data:erase',
  GetHistory: 'history:get',
  SuggestProjects: 'ai:suggest-projects'
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
  listRecords(kind: RecordKind, parentId?: number): Promise<Result<StoredRecord[]>>
  saveRecord(
    kind: RecordKind,
    id: number | null,
    values: FieldValues,
    parentId?: number
  ): Promise<Result<StoredRecord>>
  deleteRecord(kind: RecordKind, id: number, parentId?: number): Promise<Result<boolean>>
  listLinks(kind: LinkKind, parentId: number): Promise<Result<Link[]>>
  setLink(
    kind: LinkKind,
    parentId: number,
    childId: number,
    linked: boolean,
    level?: number
  ): Promise<Result<boolean>>
  getDashboard(): Promise<Result<Dashboard>>
  getSettings(): Promise<Result<Settings>>
  saveSettings(values: Settings): Promise<Result<Settings>>
  getAiStatus(): Promise<Result<AiStatus>>
  saveApiKey(key: string): Promise<Result<boolean>>
  removeApiKey(): Promise<Result<boolean>>
  getChat(): Promise<Result<ChatMessage[]>>
  sendChat(message: string): Promise<Result<ChatMessage[]>>
  clearChat(): Promise<Result<boolean>>
  getGapAnalysis(roleId: number): Promise<Result<{ analysis: GapAnalysis; report: GapReport | null }>>
  draftRequirements(roleId: number): Promise<Result<number>>
  createGapReport(roleId: number): Promise<Result<GapReport>>
  generateRoadmap(roleId: number): Promise<Result<boolean>>
  suggestTasks(): Promise<Result<number>>
  listProposals(): Promise<Result<Proposal[]>>
  acceptProposal(id: number): Promise<Result<boolean>>
  rejectProposal(id: number): Promise<Result<boolean>>
  getAiLog(): Promise<Result<AiLogEntry[]>>
  getLearning(): Promise<Result<Learning>>
  getRecommendation(): Promise<Result<string | null>>
  getRoleReadiness(): Promise<Result<RoleReadiness[]>>
  completeTask(id: number): Promise<Result<boolean>>
  rescheduleRoadmap(id: number): Promise<Result<boolean>>
  exportData(): Promise<Result<string | null>>
  importData(): Promise<Result<string | null>>
  listBackups(): Promise<Result<BackupInfo[]>>
  restoreBackup(name: string): Promise<Result<boolean>>
  eraseAll(confirmation: string): Promise<Result<boolean>>
  getHistory(): Promise<Result<History>>
  suggestProjects(): Promise<Result<number>>
}

declare global {
  interface Window {
    skillpilot: SkillPilotApi
  }
}
