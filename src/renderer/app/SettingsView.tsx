import { useEffect, useState, type FormEvent } from 'react'
import type { AiLogEntry, AiStatus } from '../../shared/ai'
import type { FieldDef, FieldErrors } from '../../shared/career'
import {
  aiSettingFields,
  learningSettingFields,
  notificationSettingFields,
  voiceSettingFields,
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
  { title: 'Voice', fields: voiceSettingFields },
  { title: 'Widget and startup', fields: widgetSettingFields }
]

/** Whether the local model can run, what is installed, and the promise that nothing leaves the laptop. */
function LocalAiSection({ refresh }: { refresh: number }) {
  const [status, setStatus] = useState<AiStatus | null>(null)

  useEffect(() => {
    void window.skillpilot.getAiStatus().then((result) => {
      if (result.ok) setStatus(result.value)
    })
  }, [refresh])

  return (
    <section>
      <h2>Local AI</h2>
      <p className="lead">
        SkillPilot's AI runs only on this laptop, using Ollama. Nothing about you is sent anywhere: the app blocks every
        connection to the internet.
      </p>
      {status ? (
        <>
          <p role="status">
            {status.blocked ? status.blocked : `Ready, using ${status.model}.`}
          </p>
          {status.localModels ? (
            <p className="lead">
              Installed models: {status.localModels.length ? status.localModels.join(', ') : 'none yet'}. To add one, run
              "ollama pull" with its name in a terminal.
            </p>
          ) : null}
        </>
      ) : null}
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
        The exact text of your last 30 requests to the local AI. They stay on this laptop, like everything else.
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
  const [saved, setSaved] = useState(0)
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
      setSaved((count) => count + 1)
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
      <LocalAiSection refresh={saved} />
      <SentLog />
      <DataSection />
    </div>
  )
}
