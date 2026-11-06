import { useEffect, useState, type FormEvent } from 'react'
import { emptyValues, profileFields, type FieldErrors, type FieldValues } from '../../shared/career'
import { FieldInput } from './FieldInput'
import { useFocusFirstError } from './useFocusFirstError'

type Status = { kind: 'idle' | 'saved' } | { kind: 'error'; message: string }

export function ProfileForm() {
  const [values, setValues] = useState<FieldValues>(() => emptyValues(profileFields))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [loaded, setLoaded] = useState(false)
  const form = useFocusFirstError(errors)

  useEffect(() => {
    void window.skillpilot.getProfile().then((result) => {
      if (result.ok) {
        setValues(result.value)
        setLoaded(true)
      } else {
        setStatus({ kind: 'error', message: result.message })
      }
    })
  }, [])

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const result = await window.skillpilot.saveProfile(values)
    if (result.ok) {
      setValues(result.value)
      setErrors({})
      setStatus({ kind: 'saved' })
    } else {
      setErrors(result.errors ?? {})
      setStatus({ kind: 'error', message: result.message })
    }
  }

  return (
    <form ref={form} onSubmit={(event) => void save(event)} noValidate>
      <h1>Profile</h1>
      <p className="lead">This stays on your laptop. It's what SkillPilot uses to understand you.</p>
      <div className="fields">
        {profileFields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            value={values[field.key] ?? ''}
            error={errors[field.key]}
            onChange={(value) => {
              setValues({ ...values, [field.key]: value })
              setStatus({ kind: 'idle' })
            }}
          />
        ))}
      </div>
      <div className="actions">
        <button type="submit" className="primary" disabled={!loaded}>
          Save profile
        </button>
        {status.kind === 'saved' ? <p role="status">Saved</p> : null}
        {status.kind === 'error' ? <p role="alert">{status.message}</p> : null}
      </div>
    </form>
  )
}
