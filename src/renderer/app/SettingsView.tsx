import { useEffect, useState, type FormEvent } from 'react'
import type { AiLogEntry, AiStatus } from '../../shared/ai'
import type { FieldDef, FieldErrors } from '../../shared/career'
import {
  aiSettingFields,
  learningSettingFields,
  notificationSettingFields,
  widgetSettingFields,
  type Settings
} from '../../shared/settings'
import { DataSection } from './DataSection'
import { FieldInput } from './FieldInput'
import { useFocusFirstError } from './useFocusFirstError'

const groups: { title: string; fields: FieldDef[] }[] = [
  { title: 'AI', fields: aiSettingFields },
  { title: 'Learning', fields: learningSettingFields },
  { title: 'Notifications', fields: notificationSettingFields },
  { title: 'Widget and startup', fields: widgetSettingFields }
]

function ApiKeySection({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [key, setKey] = useState('')
  const [message, setMessage] = useState('')

  const load = (): void => {
    void window.skillpilot.getAiStatus().then((result) => {
      if (result.ok) setStatus(result.value)
    })
  }
  useEffect(load, [])

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const result = await window.skillpilot.saveApiKey(key)
    setMessage(result.ok ? '' : result.message)
    if (result.ok) {
      setKey('')
      load()
      onChange()
    }
  }

  const remove = async (): Promise<void> => {
    await window.skillpilot.removeApiKey()
    load()
    onChange()
  }

  return (
    <section>
      <h2>Anthropic API key</h2>
      <p className="lead">
        Encrypted by Windows and kept on this laptop. It is never shown again, and API use is billed to your Anthropic
        account.
      </p>
      {status?.hasKey ? (
        <div className="actions tight">
          <p role="status">
            <span aria-hidden="true">✓</span> A key is saved
          </p>
          <button type="button" onClick={() => void remove()}>
            Remove key
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void save(event)}>
          <div className="field wide-input">
            <label htmlFor="api-key">API key</label>
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </div>
          <div className="actions tight">
            <button type="submit" className="primary" disabled={!key.trim()}>
              Save key
            </button>
            {message ? <p role="alert">{message}</p> : null}
          </div>
        </form>
      )}
    </section>
  )
}

function SentLog() {
  const [log, setLog] = useState<AiLogEntry[]>([])

  useEffect(() => {
    void window.skillpilot.getAiLog().then((result) => {
      if (result.ok) setLog(result.value)
    })
  }, [])

  return (
    <section>
      <h2>What was sent</h2>
      <p className="lead">
        The exact text of your last 30 AI requests. Your name, email, phone, location, employers, and schools are left
        out, unless you typed them into a message or free-text field.
      </p>
      {log.length === 0 ? <p className="lead">Nothing has been sent.</p> : null}
      {log.map((entry) => (
        <details className="sent" key={entry.id}>
          <summary>
            {entry.createdAt} · {entry.feature} · {entry.provider} {entry.model} ·{' '}
            {entry.ok ? `${entry.inputTokens + entry.outputTokens} tokens` : 'failed'}
          </summary>
          <pre>{entry.sent}</pre>
        </details>
      ))}
    </section>
  )
}

export function SettingsView() {
  const [values, setValues] = useState<Settings | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const form = useFocusFirstError(errors)

  useEffect(() => {
    void window.skillpilot.getSettings().then((result) => {
      if (result.ok) setValues(result.value)
      else setStatus({ ok: false, text: result.message })
    })
  }, [])

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!values) return
    const result = await window.skillpilot.saveSettings(values)
    if (result.ok) {
      setValues(result.value)
      setErrors({})
      setStatus({ ok: true, text: 'Saved' })
    } else {
      setErrors(result.errors ?? {})
      setStatus({ ok: false, text: result.message })
    }
  }

  return (
    <div>
      <h1>Settings</h1>
      <form ref={form} onSubmit={(event) => void save(event)} noValidate>
        {groups.map((group) => (
          <section key={group.title}>
            <h2>{group.title}</h2>
            {group.title === 'Widget and startup' ? (
              <p className="lead">Ctrl+Alt+Shift+S shows or hides the widget. Ctrl+Alt+Shift+O opens SkillPilot from anywhere.</p>
            ) : null}
            <div className="fields">
              {group.fields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  idPrefix="setting"
                  value={values?.[field.key] ?? ''}
                  error={errors[field.key]}
                  onChange={(value) => {
                    if (values) setValues({ ...values, [field.key]: value })
                    setStatus(null)
                  }}
                />
              ))}
            </div>
          </section>
        ))}
        <div className="actions">
          <button type="submit" className="primary" disabled={!values}>
            Save settings
          </button>
          {status?.ok ? <p role="status">{status.text}</p> : null}
          {status && !status.ok ? <p role="alert">{status.text}</p> : null}
        </div>
      </form>
      <ApiKeySection onChange={() => undefined} />
      <SentLog />
      <DataSection />
    </div>
  )
}
