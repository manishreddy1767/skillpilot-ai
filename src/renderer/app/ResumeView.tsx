import { useCallback, useEffect, useState } from 'react'
import type { StoredRecord } from '../../shared/career'
import type { SavedResume } from '../../shared/ipc'
import { applySuggestion, keywordCoverage, type ResumeData, type ResumeEntry, type ResumeSuggestion } from '../../shared/resume'
import { RESUME_TEMPLATES, resumeBody, type ResumeTemplate } from '../../shared/resume-html'
import { Meter } from './charts'
import { useAiBlocked } from './useAiStatus'

interface ResumeViewProps {
  /** A job to tailor to straight away, chosen from the Jobs screen. */
  initialJobId?: number | null
}

const sectionNames: Record<ResumeSuggestion['section'], string> = { summary: 'Summary', experience: 'Experience', projects: 'Project' }

/** Points edited as one per line. */
function EntryEditor({ label, entry, onChange, onRemove }: { label: string; entry: ResumeEntry; onChange: (entry: ResumeEntry) => void; onRemove?: () => void }) {
  const id = `resume-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="field wide">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={Math.max(2, entry.bullets.length)}
        value={entry.bullets.join('\n')}
        onChange={(event) => onChange({ ...entry, bullets: event.target.value.split('\n').slice(0, 20) })}
      />
      {onRemove ? (
        <div className="actions tight">
          <button type="button" onClick={onRemove}>
            Leave out {entry.heading}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function ResumeView({ initialJobId = null }: ResumeViewProps) {
  const [jobs, setJobs] = useState<StoredRecord[]>([])
  const [jobId, setJobId] = useState<number | null>(initialJobId)
  const [template, setTemplate] = useState<ResumeTemplate>('classic')
  const [resume, setResume] = useState<ResumeData | null>(null)
  const [suggestions, setSuggestions] = useState<ResumeSuggestion[]>([])
  const [saved, setSaved] = useState<SavedResume[]>([])
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const blocked = useAiBlocked()

  const loadSaved = useCallback((): void => {
    void window.skillpilot.listResumes().then((result) => {
      if (result.ok) setSaved(result.value)
    })
  }, [])

  useEffect(() => {
    void window.skillpilot.listRecords('job').then((result) => {
      if (result.ok) setJobs(result.value)
    })
    loadSaved()
  }, [loadSaved])

  const job = jobs.find((item) => item.id === jobId)
  const jobTitle = job ? [job.values['title'], job.values['company']].filter(Boolean).join(' at ') : 'General resume'

  const build = async (): Promise<void> => {
    setBusy('build')
    setMessage(null)
    setSuggestions([])
    const result = await window.skillpilot.buildResume(jobId)
    setBusy('')
    if (result.ok) setResume(result.value)
    else setMessage({ ok: false, text: result.message })
  }

  useEffect(() => {
    if (initialJobId !== null) void build()
    // Built once for a job chosen on the Jobs screen.
  }, [initialJobId])

  /** Edits keep the keyword check up to date. */
  const change = (next: ResumeData): void => {
    const asked = next.keywords ? [...next.keywords.matched, ...next.keywords.missing] : []
    setResume(next.keywords ? { ...next, keywords: keywordCoverage(next, asked) } : next)
  }

  const save = async (): Promise<void> => {
    if (!resume) return
    const result = await window.skillpilot.saveResume(jobId, jobTitle, resume)
    setMessage(result.ok ? { ok: true, text: 'Saved this version.' } : { ok: false, text: result.message })
    loadSaved()
  }

  const exportAs = async (format: 'pdf' | 'txt'): Promise<void> => {
    if (!resume) return
    const result = await window.skillpilot.exportResume(resume, template, format)
    if (!result.ok) setMessage({ ok: false, text: result.message })
    else if (result.value) setMessage({ ok: true, text: `Saved to ${result.value}` })
  }

  const polish = async (): Promise<void> => {
    if (!resume) return
    setBusy('polish')
    setMessage(null)
    const result = await window.skillpilot.polishResume(jobId, resume)
    setBusy('')
    if (!result.ok) return setMessage({ ok: false, text: result.message })
    setSuggestions(result.value)
    if (result.value.length === 0) setMessage({ ok: true, text: 'The local AI had no honest improvements to suggest.' })
  }

  const decide = (suggestion: ResumeSuggestion, accept: boolean): void => {
    if (accept && resume) change(applySuggestion(resume, suggestion))
    setSuggestions((list) => list.filter((item) => item.id !== suggestion.id))
  }

  const open = async (id: number): Promise<void> => {
    const result = await window.skillpilot.getResume(id)
    if (result.ok) {
      setResume(result.value)
      setJobId(saved.find((item) => item.id === id)?.jobId ?? null)
      setSuggestions([])
    } else {
      setMessage({ ok: false, text: result.message })
    }
  }

  const remove = async (id: number): Promise<void> => {
    await window.skillpilot.deleteResume(id)
    loadSaved()
  }

  return (
    <div>
      <h1>Resume</h1>
      <p className="lead">
        Built from what you have entered, on this laptop. It never adds skills or experience you do not have.
      </p>

      <section>
        <div className="fields">
          <div className="field">
            <label htmlFor="resume-job">Tailor to</label>
            <select id="resume-job" value={jobId ?? ''} onChange={(event) => setJobId(event.target.value ? Number(event.target.value) : null)}>
              <option value="">General resume</option>
              {jobs.map((item) => (
                <option key={item.id} value={item.id}>
                  {[item.values['title'], item.values['company']].filter(Boolean).join(' at ')}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="resume-template">Template</label>
            <select id="resume-template" value={template} onChange={(event) => setTemplate(event.target.value as ResumeTemplate)}>
              {RESUME_TEMPLATES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="actions">
          <button type="button" className="primary" disabled={Boolean(busy)} onClick={() => void build()}>
            {busy === 'build' ? 'Building…' : resume ? 'Rebuild' : 'Build resume'}
          </button>
          {message ? <p role={message.ok ? 'status' : 'alert'}>{message.text}</p> : null}
        </div>
      </section>

      {resume ? (
        <>
          {resume.keywords ? (
            <section aria-label="Keyword check">
              <h2>Keyword check</h2>
              <div className="goal-line">
                <div className="goal-head">
                  <span>Job keywords your resume shows</span>
                  <span>{resume.keywords.coverage}%</span>
                </div>
                <Meter label="Keyword coverage" value={resume.keywords.coverage} />
              </div>
              {resume.keywords.matched.length ? <p>Shown: {resume.keywords.matched.join(', ')}</p> : null}
              {resume.keywords.missing.length ? (
                <p>
                  Missing: {resume.keywords.missing.join(', ')}. Only add these, in Skills, if you really have them.
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="resume-layout">
            <section className="resume-editor" aria-label="Edit resume">
              <h2>Edit</h2>
              <div className="field wide">
                <label htmlFor="resume-headline">Headline</label>
                <input id="resume-headline" value={resume.headline} onChange={(event) => change({ ...resume, headline: event.target.value })} />
              </div>
              <div className="field wide">
                <label htmlFor="resume-summary">Summary</label>
                <textarea id="resume-summary" rows={3} value={resume.summary} onChange={(event) => change({ ...resume, summary: event.target.value })} />
              </div>
              <h3>Skills</h3>
              <ul className="chips">
                {resume.skills.flatMap((group) =>
                  group.items.map((item) => (
                    <li key={`${group.group}-${item}`}>
                      {item}
                      <button
                        type="button"
                        aria-label={`Leave out ${item}`}
                        onClick={() =>
                          change({
                            ...resume,
                            skills: resume.skills
                              .map((g) => (g.group === group.group ? { ...g, items: g.items.filter((name) => name !== item) } : g))
                              .filter((g) => g.items.length)
                          })
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))
                )}
              </ul>
              {resume.experience.map((entry, index) => (
                <EntryEditor
                  key={`experience-${index}`}
                  label={`Points for ${entry.heading} at ${entry.subheading}`}
                  entry={entry}
                  onChange={(next) => change({ ...resume, experience: resume.experience.map((item, at) => (at === index ? next : item)) })}
                />
              ))}
              {resume.projects.map((entry, index) => (
                <EntryEditor
                  key={`project-${index}`}
                  label={`Points for project ${entry.heading}`}
                  entry={entry}
                  onChange={(next) => change({ ...resume, projects: resume.projects.map((item, at) => (at === index ? next : item)) })}
                  onRemove={() => change({ ...resume, projects: resume.projects.filter((_, at) => at !== index) })}
                />
              ))}

              <h3>Wording</h3>
              {blocked ? <p className="lead">{blocked}</p> : null}
              <div className="actions tight">
                <button type="button" disabled={Boolean(blocked) || Boolean(busy)} onClick={() => void polish()}>
                  {busy === 'polish' ? 'Thinking…' : 'Suggest clearer wording'}
                </button>
              </div>
              {suggestions.length ? (
                <ul className="records" aria-label="Wording suggestions">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.id}>
                      <strong>{sectionNames[suggestion.section]}</strong>
                      <p>Now: {suggestion.original}</p>
                      <p>Suggested: {suggestion.reworded}</p>
                      <div className="row-actions">
                        <button type="button" className="primary" aria-label={`Accept: ${suggestion.reworded}`} onClick={() => decide(suggestion, true)}>
                          Accept
                        </button>
                        <button type="button" aria-label={`Reject: ${suggestion.reworded}`} onClick={() => decide(suggestion, false)}>
                          Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="actions">
                <button type="button" className="primary" onClick={() => void save()}>
                  Save version
                </button>
                <button type="button" onClick={() => void exportAs('pdf')}>
                  Export PDF
                </button>
                <button type="button" onClick={() => void exportAs('txt')}>
                  Export text
                </button>
              </div>
            </section>

            <section className="resume-preview-wrap" aria-label="Preview">
              <h2>Preview</h2>
              {/* Built from escaped text only, so nothing typed can run. */}
              <div className={`resume-preview ${template}`} dangerouslySetInnerHTML={{ __html: resumeBody(resume) }} />
            </section>
          </div>
        </>
      ) : null}

      {saved.length ? (
        <section>
          <h2>Saved versions</h2>
          <ul className="plain">
            {saved.map((item) => (
              <li key={item.id}>
                <span>
                  {item.title} <span className="muted">· {item.createdAt}</span>
                </span>
                <span className="row-actions">
                  <button type="button" aria-label={`Open ${item.title} from ${item.createdAt}`} onClick={() => void open(item.id)}>
                    Open
                  </button>
                  <button type="button" aria-label={`Delete ${item.title} from ${item.createdAt}`} onClick={() => void remove(item.id)}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
