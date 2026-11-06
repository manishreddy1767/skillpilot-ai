import type { ChangeEvent } from 'react'
import type { FieldDef } from '../../shared/career'

interface FieldInputProps {
  field: FieldDef
  value: string
  error?: string | undefined
  onChange(value: string): void
}

const inputType = { text: 'text', email: 'email', url: 'url', month: 'month' } as const

export function FieldInput({ field, value, error, onChange }: FieldInputProps) {
  const id = `field-${field.key}`
  const shared = {
    id,
    value,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value)
  }

  return (
    <div className={field.type === 'long' ? 'field wide' : 'field'}>
      <label htmlFor={id}>
        {field.label}
        {field.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {field.type === 'long' ? (
        <textarea rows={3} {...shared} />
      ) : (
        <input type={inputType[field.type]} {...shared} />
      )}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
