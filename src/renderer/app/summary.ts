import { recordFields, type FieldDef, type FieldValues, type RecordKind } from '../../shared/career'

function shown(field: FieldDef, value: string): string {
  if (field.type === 'number' || field.type === 'time') return `${field.label}: ${value}`
  return field.options?.find((option) => option.value === value)?.label ?? value
}

/** The two lines that describe a record in a list. */
export function describeRecord(kind: RecordKind, values: FieldValues): { main: string; detail: string } {
  const fields = recordFields[kind]
  const main = kind === 'work' ? `${values['role']} at ${values['company']}` : (values[fields[0]!.key] ?? '')

  const filled = fields.slice(1).filter((field) => {
    const skipped = field.type === 'long' || field.type === 'url' || (kind === 'work' && field.key === 'role')
    return values[field.key] && !skipped
  })
  const labels = filled.filter((field) => field.type !== 'month').map((field) => shown(field, values[field.key]!))
  const months = filled.filter((field) => field.type === 'month').map((field) => values[field.key]!)
  const parts = months.length ? [...labels, months.join(' to ')] : labels

  return { main, detail: parts.join(' · ') }
}
