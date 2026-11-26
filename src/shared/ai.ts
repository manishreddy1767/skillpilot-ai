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

/** The actions the local AI may choose for a request in your own words. */
export const UNDERSTOOD_ACTIONS = [
  'open',
  'web_search',
  'youtube_search',
  'job_search',
  'go_to',
  'add_task',
  'add_skill',
  'add_goal',
  'answer'
] as const

/** What the local AI took a request in your own words to mean. */
export interface Understood {
  action: (typeof UNDERSTOOD_ACTIONS)[number]
  /** The app, site, search words, section, or title the action is about. */
  target: string
  /** For a job search. */
  site: 'linkedin' | 'naukri' | 'indeed' | 'foundit' | 'none'
  location: string
  /** Unused: questions are answered by the chat. */
  answer: string
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
