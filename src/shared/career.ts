export type FieldType = 'text' | 'long' | 'month' | 'email' | 'url'
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
}

export const recordKinds = ['education', 'work', 'certification'] as const
export type RecordKind = (typeof recordKinds)[number]

export interface StoredRecord {
  id: number
  values: FieldValues
}

export interface OverviewData {
  name: string
  currentGoal: string
  targetRoles: string
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; message: string; errors?: FieldErrors }

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
  ]
}

export const MAX_TEXT_LENGTH = 200
export const MAX_LONG_LENGTH = 5000

export function isRecordKind(value: unknown): value is RecordKind {
  return recordKinds.includes(value as RecordKind)
}

export function emptyValues(fields: FieldDef[]): FieldValues {
  return Object.fromEntries(fields.map((field) => [field.key, '']))
}

function fieldError(field: FieldDef, value: string): string | null {
  if (!value) return field.required ? `${field.label} is required` : null
  const limit = field.type === 'long' ? MAX_LONG_LENGTH : MAX_TEXT_LENGTH
  if (value.length > limit) return `${field.label} must be ${limit} characters or fewer`
  if (field.type === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return `${field.label} must be a month, like 2026-03`
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
    values[field.key] = typeof raw === 'string' ? raw.trim() : ''
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
