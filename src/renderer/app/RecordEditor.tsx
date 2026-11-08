import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  emptyValues,
  recordFields,
  type FieldErrors,
  type FieldValues,
  type RecordKind,
  type StoredRecord
} from '../../shared/career'
import { FieldInput } from './FieldInput'
import { describeRecord } from './summary'
import { useFocusFirstError } from './useFocusFirstError'

interface RecordEditorProps {
  kind: RecordKind
  /** Left out when the editor sits inside a screen that has its own heading. */
  title?: string
  addLabel: string
  emptyText: string
  /** The owning record, for kinds that belong to one. */
  parentId?: number
  /** Extra content a record can expand to show. */
  details?: (record: StoredRecord) => ReactNode
  /** Called after anything is added, changed, or removed. */
  onChange?: () => void
}

interface Draft {
  id: number | null
  values: FieldValues
}

export function RecordEditor({
  kind,
  title,
  addLabel,
  emptyText,
  parentId,
  details,
  onChange
}: RecordEditorProps) {
  const [records, setRecords] = useState<StoredRecord[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const form = useFocusFirstError(errors)

  const load = useCallback(async (): Promise<void> => {
    const result = await window.skillpilot.listRecords(kind, parentId)
    if (result.ok) setRecords(result.value)
    else setMessage(result.message)
  }, [kind, parentId])

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
    const result = await window.skillpilot.saveRecord(kind, draft.id, draft.values, parentId)
    if (result.ok) {
      cancel()
      await load()
      onChange?.()
    } else {
      setErrors(result.errors ?? {})
      setMessage(result.message)
    }
  }

  const remove = async (id: number): Promise<void> => {
    const result = await window.skillpilot.deleteRecord(kind, id, parentId)
    setConfirming(null)
    if (result.ok) {
      await load()
      onChange?.()
    } else {
      setMessage(result.message)
    }
  }

  return (
    <div>
      {title ? <h1>{title}</h1> : null}
      {records.length === 0 && !draft ? <p className="lead">{emptyText}</p> : null}

      <ul className="records">
        {records.map((record) => {
          const { main, detail } = describeRecord(kind, record.values)
          const open = expanded === record.id
          return (
            <li key={record.id}>
              <div className="record-row">
                <div className="record-text">
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
                    {details ? (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-label={`Details for ${main}`}
                        onClick={() => setExpanded(open ? null : record.id)}
                      >
                        {/* The words stay the same, so the spoken name always matches what is shown. */}
                        <span aria-hidden="true">{open ? '▾ ' : '▸ '}</span>
                        Details
                      </button>
                    ) : null}
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
              </div>
              {open && details ? <div className="record-details">{details(record)}</div> : null}
            </li>
          )
        })}
      </ul>

      {draft ? (
        <form
          ref={form}
          onSubmit={(event) => void save(event)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel()
          }}
          noValidate
        >
          <div className="fields">
            {recordFields[kind].map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                idPrefix={kind}
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
