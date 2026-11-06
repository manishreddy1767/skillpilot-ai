import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  emptyValues,
  recordFields,
  type FieldErrors,
  type FieldValues,
  type RecordKind,
  type StoredRecord
} from '../../shared/career'
import { FieldInput } from './FieldInput'
import { useFocusFirstError } from './useFocusFirstError'

interface RecordEditorProps {
  kind: RecordKind
  title: string
  addLabel: string
  emptyText: string
}

interface Draft {
  id: number | null
  values: FieldValues
}

function summary(kind: RecordKind, values: FieldValues): { main: string; detail: string } {
  const [first, second] = recordFields[kind]
  const dates = recordFields[kind]
    .filter((field) => field.type === 'month')
    .map((field) => values[field.key])
    .filter(Boolean)
    .join(' to ')
  const main = kind === 'work' ? `${values['role']} at ${values['company']}` : (values[first!.key] ?? '')
  const extra = kind === 'work' ? '' : (values[second!.key] ?? '')
  return { main, detail: [extra, dates].filter(Boolean).join(' · ') }
}

export function RecordEditor({ kind, title, addLabel, emptyText }: RecordEditorProps) {
  const [records, setRecords] = useState<StoredRecord[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState<number | null>(null)
  const form = useFocusFirstError(errors)

  const load = useCallback(async (): Promise<void> => {
    const result = await window.skillpilot.listRecords(kind)
    if (result.ok) setRecords(result.value)
    else setMessage(result.message)
  }, [kind])

  useEffect(() => {
    void load()
  }, [load])

  const startEditing = (next: Draft): void => {
    setDraft(next)
    setErrors({})
    setMessage('')
    setConfirming(null)
  }

  const cancel = (): void => {
    setDraft(null)
    setErrors({})
    setMessage('')
  }

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!draft) return
    const result = await window.skillpilot.saveRecord(kind, draft.id, draft.values)
    if (result.ok) {
      setDraft(null)
      setErrors({})
      setMessage('')
      await load()
    } else {
      setErrors(result.errors ?? {})
      setMessage(result.message)
    }
  }

  const remove = async (id: number): Promise<void> => {
    const result = await window.skillpilot.deleteRecord(kind, id)
    setConfirming(null)
    if (result.ok) await load()
    else setMessage(result.message)
  }

  return (
    <div>
      <h1>{title}</h1>
      {records.length === 0 && !draft ? <p className="lead">{emptyText}</p> : null}

      <ul className="records">
        {records.map((record) => {
          const { main, detail } = summary(kind, record.values)
          return (
            <li key={record.id}>
              <div>
                <strong>{main}</strong>
                {detail ? <p>{detail}</p> : null}
              </div>
              {confirming === record.id ? (
                <div className="row-actions">
                  <span>Delete this?</span>
                  <button type="button" className="danger" onClick={() => void remove(record.id)}>
                    Yes, delete
                  </button>
                  <button type="button" onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </div>
              ) : (
                <div className="row-actions">
                  <button
                    type="button"
                    aria-label={`Edit ${main}`}
                    onClick={() => startEditing({ id: record.id, values: record.values })}
                  >
                    Edit
                  </button>
                  <button type="button" aria-label={`Delete ${main}`} onClick={() => setConfirming(record.id)}>
                    Delete
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {draft ? (
        <form ref={form} onSubmit={(event) => void save(event)} noValidate>
          <div className="fields">
            {recordFields[kind].map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={draft.values[field.key] ?? ''}
                error={errors[field.key]}
                onChange={(value) => setDraft({ ...draft, values: { ...draft.values, [field.key]: value } })}
              />
            ))}
          </div>
          <div className="actions">
            <button type="submit" className="primary">
              Save
            </button>
            <button type="button" onClick={cancel}>
              Cancel
            </button>
            {message ? <p role="alert">{message}</p> : null}
          </div>
        </form>
      ) : (
        <div className="actions">
          <button
            type="button"
            className="primary"
            onClick={() => startEditing({ id: null, values: emptyValues(recordFields[kind]) })}
          >
            {addLabel}
          </button>
          {message ? <p role="alert">{message}</p> : null}
        </div>
      )}
    </div>
  )
}
