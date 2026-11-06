import type { ChangeEvent } from 'react'
import type { FieldDef } from '../../shared/career'

interface FieldInputProps {
  field: FieldDef
  value: string
  error?: string | undefined
  /** Keeps ids unique when one form sits inside another record's details. */
  idPrefix?: string | undefined
  onChange(value: string): void
}

const inputType = { text: 'text', email: 'email', url: 'url', month: 'month', date: 'date' } as const

export function FieldInput({ field, value, error, idPrefix = 'field', onChange }: FieldInputProps) {
  const id = `${idPrefix}-${field.key}`
  const shared = {
    id,
    value,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(event.target.value)
  }

  const control = () => {
    if (field.type === 'long') return <textarea rows={3} {...shared} />
    if (field.type === 'select') {
      return (
        <select {...shared}>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }
    return <input type={inputType[field.type]} {...shared} />
  }

  return (
    <div className={field.type === 'long' ? 'field wide' : 'field'}>
      <label htmlFor={id}>
        {field.label}
        {field.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {control()}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
