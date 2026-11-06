export type FieldType = 'text' | 'long' | 'month' | 'date' | 'time' | 'number' | 'email' | 'url' | 'select'
export type FieldValues = Record<string, string>
export type FieldErrors = Record<string, string>

export interface FieldDef {
  key: string
  column: string
  label: string
  type: FieldType
  required?: boolean
  /** Key of the date field this one cannot come before. */
  notBefore?: string
  /** The allowed choices for a select field. */
  options?: { value: string; label: string }[]
  /** Starting value for a new record. */
  initial?: string
  /** The allowed range for a number field. */
  min?: number
  max?: number
}

export const recordKinds = [
  'education',
  'work',
  'certification',
  'skill',
  'goal',
  'project',
  'evidence',
  'goalMilestone',
  'projectMilestone',
  'targetRole',
  'roleRequirement',
  'roadmap',
  'roadmapItem',
  'task'
] as const
export type RecordKind = (typeof recordKinds)[number]

/** Kinds that belong to a parent record, and so need its id. */
export const childKinds: readonly RecordKind[] = [
  'evidence',
  'goalMilestone',
  'projectMilestone',
  'roleRequirement',
  'roadmapItem'
]

export const linkKinds = ['goalSkill', 'goalProject', 'projectSkill'] as const
export type LinkKind = (typeof linkKinds)[number]

export interface Link {
  id: number
  /** The level a goal needs. Other links have no level. */
  level: number | null
}

export interface StoredRecord {
  id: number
  values: FieldValues
}

export interface OverviewData {
  name: string
  currentGoal: string
  targetRoles: string
  progress: number | null
  learning: string[]
  nextDeadline: { title: string; date: string; overdue: boolean } | null
  latestAchievement: string | null
  tasks: { id: number; title: string; minutes: number; overdue: boolean }[]
  streak: number
  recommendation: string | null
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; message: string; errors?: FieldErrors }

const levelOptions = ['0 - None', '1 - Beginner', '2 - Basic', '3 - Working', '4 - Strong', '5 - Expert'].map(
  (label, value) => ({ value: String(value), label })
)

const milestoneFields: FieldDef[] = [
  { key: 'title', column: 'title', label: 'Milestone', type: 'text', required: true },
  { key: 'dueDate', column: 'due_date', label: 'Due', type: 'date' },
  {
    key: 'status',
    column: 'status',
    label: 'Status',
    type: 'select',
    initial: 'open',
    options: [
      { value: 'open', label: 'Not done' },
      { value: 'done', label: 'Done' }
    ]
  }
]

export const profileFields: FieldDef[] = [
  { key: 'fullName', column: 'full_name', label: 'Full name', type: 'text', required: true },
  { key: 'headline', column: 'headline', label: 'Headline', type: 'text' },
  { key: 'email', column: 'email', label: 'Email', type: 'email' },
  { key: 'phone', column: 'phone', label: 'Phone', type: 'text' },
  { key: 'location', column: 'location', label: 'Location', type: 'text' },
  { key: 'summary', column: 'summary', label: 'About me', type: 'long' },
  { key: 'currentGoal', column: 'current_goal', label: 'Current goal', type: 'text' },
  { key: 'targetRoles', column: 'target_roles', label: 'Target roles', type: 'text' },
  { key: 'shortTermGoals', column: 'short_term_goals', label: 'Short-term goals', type: 'long' },
  { key: 'longTermGoals', column: 'long_term_goals', label: 'Long-term goals', type: 'long' },
  { key: 'interests', column: 'interests', label: 'Interests', type: 'long' },
  { key: 'preferences', column: 'preferences', label: 'Career preferences', type: 'long' }
]

export const recordFields: Record<RecordKind, FieldDef[]> = {
  education: [
    { key: 'institution', column: 'institution', label: 'Institution', type: 'text', required: true },
    { key: 'qualification', column: 'qualification', label: 'Qualification', type: 'text', required: true },
    { key: 'fieldOfStudy', column: 'field_of_study', label: 'Field of study', type: 'text' },
    { key: 'startDate', column: 'start_date', label: 'Start', type: 'month' },
    { key: 'endDate', column: 'end_date', label: 'End', type: 'month', notBefore: 'startDate' },
    { key: 'notes', column: 'notes', label: 'Notes', type: 'long' }
  ],
  work: [
    { key: 'company', column: 'company', label: 'Company', type: 'text', required: true },
    { key: 'role', column: 'role', label: 'Role', type: 'text', required: true },
    { key: 'startDate', column: 'start_date', label: 'Start', type: 'month' },
    { key: 'endDate', column: 'end_date', label: 'End', type: 'month', notBefore: 'startDate' },
    { key: 'description', column: 'description', label: 'What I did', type: 'long' }
  ],
  certification: [
    { key: 'name', column: 'name', label: 'Certification', type: 'text', required: true },
    { key: 'issuer', column: 'issuer', label: 'Issuer', type: 'text' },
    { key: 'issueDate', column: 'issue_date', label: 'Issued', type: 'month' },
    { key: 'expiryDate', column: 'expiry_date', label: 'Expires', type: 'month', notBefore: 'issueDate' },
    { key: 'credentialUrl', column: 'credential_url', label: 'Credential link', type: 'url' }
  ],
  skill: [
    { key: 'name', column: 'name', label: 'Skill', type: 'text', required: true },
    {
      key: 'category',
      column: 'category',
      label: 'Category',
      type: 'select',
      initial: 'technical',
      options: [
        { value: 'technical', label: 'Technical' },
        { value: 'non-technical', label: 'Non-technical' }
      ]
    },
    {
      key: 'claimedLevel',
      column: 'claimed_level',
      label: 'My level',
      type: 'select',
      initial: '0',
      options: levelOptions
    },
    {
      key: 'status',
      column: 'status',
      label: 'Status',
      type: 'select',
      initial: 'learning',
      options: [
        { value: 'learning', label: 'Learning now' },
        { value: 'using', label: 'Using' },
        { value: 'completed', label: 'Completed' }
      ]
    },
    { key: 'notes', column: 'notes', label: 'Notes', type: 'long' }
  ],
  goal: [
    { key: 'title', column: 'title', label: 'Goal', type: 'text', required: true },
    { key: 'targetDate', column: 'target_date', label: 'Target date', type: 'date' },
    {
      key: 'priority',
      column: 'priority',
      label: 'Priority',
      type: 'select',
      initial: '2',
      options: [
        { value: '1', label: 'Low' },
        { value: '2', label: 'Medium' },
        { value: '3', label: 'High' }
      ]
    },
    {
      key: 'status',
      column: 'status',
      label: 'Status',
      type: 'select',
      initial: 'active',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'paused', label: 'Paused' },
        { value: 'done', label: 'Done' }
      ]
    },
    { key: 'description', column: 'description', label: 'Description', type: 'long' }
  ],
  project: [
    { key: 'name', column: 'name', label: 'Project', type: 'text', required: true },
    { key: 'technologies', column: 'technologies', label: 'Technologies', type: 'text' },
    {
      key: 'status',
      column: 'status',
      label: 'Status',
      type: 'select',
      initial: 'planned',
      options: [
        { value: 'planned', label: 'Planned' },
        { value: 'active', label: 'In progress' },
        { value: 'complete', label: 'Complete' }
      ]
    },
    { key: 'completedOn', column: 'completed_on', label: 'Completed', type: 'month' },
    { key: 'repoUrl', column: 'repo_url', label: 'GitHub link', type: 'url' },
    { key: 'description', column: 'description', label: 'Description', type: 'long' }
  ],
  evidence: [
    { key: 'description', column: 'description', label: 'What shows this skill', type: 'text', required: true },
    {
      key: 'kind',
      column: 'kind',
      label: 'Type',
      type: 'select',
      initial: 'practice',
      options: [
        { value: 'practice', label: 'Practice' },
        { value: 'course', label: 'Course' },
        { value: 'certification', label: 'Certification' },
        { value: 'work', label: 'Work' },
        { value: 'other', label: 'Other' }
      ]
    },
    {
      key: 'strength',
      column: 'strength',
      label: 'Strength',
      type: 'select',
      initial: '2',
      options: [
        { value: '1', label: 'Minor (1 point)' },
        { value: '2', label: 'Solid (2 points)' },
        { value: '3', label: 'Strong (3 points)' }
      ]
    },
    { key: 'observedOn', column: 'observed_on', label: 'When', type: 'month' }
  ],
  goalMilestone: milestoneFields,
  projectMilestone: milestoneFields,
  targetRole: [
    { key: 'title', column: 'title', label: 'Target role', type: 'text', required: true },
    { key: 'notes', column: 'notes', label: 'Notes', type: 'long' }
  ],
  roleRequirement: [
    { key: 'skillName', column: 'skill_name', label: 'Required skill', type: 'text', required: true },
    {
      key: 'requiredLevel',
      column: 'required_level',
      label: 'Level needed',
      type: 'select',
      initial: '3',
      options: levelOptions.slice(1)
    },
    {
      key: 'importance',
      column: 'importance',
      label: 'Importance',
      type: 'select',
      initial: '2',
      options: [
        { value: '1', label: 'Nice to have' },
        { value: '2', label: 'Important' },
        { value: '3', label: 'Essential' }
      ]
    }
  ],
  roadmap: [
    { key: 'title', column: 'title', label: 'Roadmap', type: 'text', required: true },
    { key: 'startDate', column: 'start_date', label: 'Start date', type: 'date' }
  ],
  roadmapItem: [
    { key: 'title', column: 'title', label: 'Topic', type: 'text', required: true },
    { key: 'week', column: 'week', label: 'Week', type: 'number', initial: '1', min: 1, max: 104 },
    { key: 'effortHours', column: 'effort_hours', label: 'Effort (hours)', type: 'number', initial: '0', min: 0, max: 500 },
    {
      key: 'status',
      column: 'status',
      label: 'Status',
      type: 'select',
      initial: 'open',
      options: [
        { value: 'open', label: 'Not done' },
        { value: 'done', label: 'Done' }
      ]
    },
    { key: 'details', column: 'details', label: 'Details', type: 'long' },
    { key: 'exercise', column: 'exercise', label: 'Practical exercise', type: 'long' },
    { key: 'resources', column: 'resources', label: 'Resources', type: 'long' }
  ],
  task: [
    { key: 'title', column: 'title', label: 'Task', type: 'text', required: true },
    {
      key: 'kind',
      column: 'kind',
      label: 'Type',
      type: 'select',
      initial: 'learning',
      options: [
        { value: 'learning', label: 'Learning' },
        { value: 'practice', label: 'Practice' },
        { value: 'project', label: 'Project' },
        { value: 'other', label: 'Other' }
      ]
    },
    { key: 'dueDate', column: 'due_date', label: 'Due', type: 'date' },
    { key: 'minutes', column: 'minutes', label: 'Minutes', type: 'number', initial: '30', min: 5, max: 480 },
    {
      key: 'status',
      column: 'status',
      label: 'Status',
      type: 'select',
      initial: 'open',
      options: [
        { value: 'open', label: 'To do' },
        { value: 'done', label: 'Done' }
      ]
    }
  ]
}

export const MAX_TEXT_LENGTH = 200
export const MAX_LONG_LENGTH = 5000

export function isRecordKind(value: unknown): value is RecordKind {
  return recordKinds.includes(value as RecordKind)
}

export function isLinkKind(value: unknown): value is LinkKind {
  return linkKinds.includes(value as LinkKind)
}

export function emptyValues(fields: FieldDef[]): FieldValues {
  return Object.fromEntries(fields.map((field) => [field.key, field.initial ?? '']))
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function fieldError(field: FieldDef, value: string): string | null {
  if (!value) return field.required ? `${field.label} is required` : null
  const limit = field.type === 'long' ? MAX_LONG_LENGTH : MAX_TEXT_LENGTH
  if (value.length > limit) return `${field.label} must be ${limit} characters or fewer`
  if (field.type === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return `${field.label} must be a month, like 2026-03`
  }
  if (field.type === 'date' && !isRealDate(value)) {
    return `${field.label} must be a date, like 2026-03-15`
  }
  if (field.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return `${field.label} must be a time, like 22:00`
  }
  if (field.type === 'number') {
    const number = Number(value)
    const inRange = Number.isInteger(number) && number >= (field.min ?? 0) && number <= (field.max ?? Infinity)
    if (!inRange) return `${field.label} must be a whole number from ${field.min ?? 0} to ${field.max}`
  }
  if (field.type === 'select' && !field.options?.some((option) => option.value === value)) {
    return `Choose a valid ${field.label.toLowerCase()}`
  }
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return 'Enter a valid email address'
  }
  if (field.type === 'url' && !/^https?:\/\/\S+$/i.test(value)) {
    return 'Enter a link starting with http:// or https://'
  }
  return null
}

/** Trims and checks input. Only known fields are kept, so anything else is dropped. */
export function validateFields(
  fields: FieldDef[],
  input: unknown
): { values: FieldValues; errors: FieldErrors } {
  const source = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const values: FieldValues = {}
  const errors: FieldErrors = {}

  for (const field of fields) {
    const raw = source[field.key]
    const text = typeof raw === 'string' ? raw.trim() : ''
    values[field.key] = text || (field.initial ?? '')
    const error = fieldError(field, values[field.key]!)
    if (error) errors[field.key] = error
  }

  for (const field of fields) {
    const earlier = field.notBefore ? values[field.notBefore] : ''
    const value = values[field.key]
    if (earlier && value && !errors[field.key] && value < earlier) {
      errors[field.key] = `${field.label} cannot be before ${fields.find((f) => f.key === field.notBefore)?.label}`
    }
  }

  return { values, errors }
}
