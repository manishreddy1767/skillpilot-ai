/** Things the AI may suggest. Nothing is applied until the user accepts it. */
export type ProposalKind =
  | 'addSkill'
  | 'addGoal'
  | 'addTask'
  | 'addRoleRequirement'
  | 'addRoadmap'
  | 'addProject'
  | 'updateSkillLevel'
  | 'completeTopic'

export interface Proposal {
  id: number
  kind: ProposalKind
  summary: string
  /** What would be added, as label and value pairs, for the review card. */
  details: { label: string; value: string }[]
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface GapReport {
  id: number
  summary: string
  priorities: string[]
  createdAt: string
}

export interface AiStatus {
  provider: string
  model: string
  hasKey: boolean
  /** Why AI cannot run right now. Empty when it can. */
  blocked: string
}

export interface AiLogEntry {
  id: number
  feature: string
  provider: string
  model: string
  sent: string
  ok: boolean
  inputTokens: number
  outputTokens: number
  createdAt: string
}
