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

/** One thing the agent did: the tool it chose, what it gave it, and what came back. */
export interface AgentStep {
  action: string
  input: string
  result: string
}

export interface AgentRun {
  answer: string
  steps: AgentStep[]
  /** Suggestions it made, waiting for approval. */
  suggested: number
  chat: ChatMessage[]
}

export interface AiStatus {
  provider: string
  model: string
  /** Why AI cannot run right now. Empty when it can. */
  blocked: string
  /** Models installed in Ollama, or null when Ollama is not running. */
  localModels: string[] | null
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
