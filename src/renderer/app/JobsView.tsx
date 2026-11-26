import { useEffect, useState, type FormEvent } from 'react'
import type { RankedJob } from '../../shared/ipc'
import { JOB_SITES, type JobMatch, type JobSite, type SkillFit } from '../../shared/job-match'
import { Meter } from './charts'
import { ProposalList } from './ProposalList'
import { RecordEditor } from './RecordEditor'

const fitLabels: Record<SkillFit, { icon: string; label: string }> = {
  proven: { icon: '✓', label: 'You have it, with proof' },
  claimed: { icon: '◐', label: 'You have it, not yet proven' },
  missing: { icon: '!', label: 'Missing' }
}

/** Searches the job sites in your own browser. SkillPilot itself sends nothing. */
function FindJobs() {
  const [keywords, setKeywords] = useState('')
  const [location, setLocation] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void window.skillpilot.listRecords('targetRole').then((result) => {
      const first = result.ok ? result.value[0]?.values['title'] : ''
      if (first) setKeywords((now) => now || first)
    })
  }, [])

  const search = async (site: JobSite): Promise<void> => {
    const result = await window.skillpilot.searchJobs(site, keywords, location)
    const label = JOB_SITES.find((item) => item.id === site)?.label ?? site
    setMessage(result.ok ? { ok: true, text: `Opened ${label} in your browser.${result.value}` } : { ok: false, text: result.message })
  }

  return (
    <section>
      <h2>Find jobs</h2>
      <p className="lead">
        Opens the job site's search in Chrome. SkillPilot never signs in, reads, or sends anything to these sites. When
        you find a job, save the page (Ctrl+S) and import it below, or add it by hand.
      </p>
      <form className="fields" onSubmit={(event: FormEvent) => event.preventDefault()}>
        <div className="field">
          <label htmlFor="job-keywords">Job title or skills</label>
          <input id="job-keywords" value={keywords} onChange={(event) => setKeywords(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="job-location">Location</label>
          <input id="job-location" value={location} placeholder="Any" onChange={(event) => setLocation(event.target.value)} />
        </div>
      </form>
      <div className="actions tight">
        {JOB_SITES.map((site) => (
          <button key={site.id} type="button" disabled={!keywords.trim()} onClick={() => void search(site.id)}>
            Search {site.label}
          </button>
        ))}
      </div>
      {message ? <p role={message.ok ? 'status' : 'alert'}>{message.text}</p> : null}
    </section>
  )
}

function BestMatches({ refresh }: { refresh: number }) {
  const [jobs, setJobs] = useState<RankedJob[]>([])

  useEffect(() => {
    void window.skillpilot.rankJobs().then((result) => {
      if (result.ok) setJobs(result.value)
    })
  }, [refresh])

  if (jobs.length === 0) return null
  return (
    <section>
      <h2>Best matches</h2>
      <ul className="records">
        {jobs.map((job) => (
          <li key={job.id}>
            <div className="goal-head">
              <strong>
                {job.title}
                {job.company ? ` at ${job.company}` : ''}
              </strong>
              <span>{job.score}% match</span>
            </div>
            <Meter label={`${job.title} match`} value={job.score} />
            <p>
              {job.missing.length ? `Missing: ${job.missing.slice(0, 6).join(', ')}${job.missing.length > 6 ? '…' : ''}` : 'Nothing missing'}
              {job.entryLevel ? ' · Open to freshers' : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SkillList({ title, skills }: { title: string; skills: JobMatch['skills'] }) {
  if (skills.length === 0) return null
  return (
    <>
      <h3>{title}</h3>
      <ul className="plain">
        {skills.map((skill) => (
          <li key={skill.name}>
            <span>{skill.name}</span>
            <span className="muted">
              <span aria-hidden="true">{fitLabels[skill.fit].icon}</span> {fitLabels[skill.fit].label}
              {skill.level ? `, level ${skill.level}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

function JobDetails({ jobId, title, hasLink, onTailorResume }: { jobId: number; title: string; hasLink: boolean; onTailorResume?: (jobId: number) => void }) {
  const [match, setMatch] = useState<JobMatch | null>(null)
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    void window.skillpilot.matchJob(jobId).then((result) => {
      if (result.ok) setMatch(result.value)
      else setMessage(result.message)
    })
  }, [jobId, refresh])

  const suggest = async (): Promise<void> => {
    const result = await window.skillpilot.suggestJobSkills(jobId)
    setMessage(result.ok ? (result.value ? '' : 'You already have every skill this job names.') : result.message)
    setRefresh((value) => value + 1)
  }

  const openLink = async (): Promise<void> => {
    const result = await window.skillpilot.openJobLink(jobId)
    setMessage(result.ok ? result.value.trim() : result.message)
  }

  return (
    <>
      {match ? (
        <>
          <div className="goal-line">
            <div className="goal-head">
              <span>Your match</span>
              <span>{match.score}%</span>
            </div>
            <Meter label={`${title} match`} value={match.score} />
            <p className="goal-note">
              {[
                match.experience ? `Asks for ${match.experience} years of experience` : '',
                match.entryLevel ? 'Open to freshers' : '',
                match.role ? `Closest library role: ${match.role.title}` : ''
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {match.skills.length === 0 ? (
            <p className="lead">No skills were recognised. Paste the full job description to see your match.</p>
          ) : null}
          <SkillList title="Essential" skills={match.skills.filter((skill) => skill.essential)} />
          <SkillList title="Nice to have" skills={match.skills.filter((skill) => !skill.essential)} />
        </>
      ) : null}
      <div className="actions tight">
        <button type="button" disabled={!match?.missing.length} onClick={() => void suggest()}>
          Suggest the missing skills to learn
        </button>
        {onTailorResume ? (
          <button type="button" className="primary" onClick={() => onTailorResume(jobId)}>
            Build a tailored resume
          </button>
        ) : null}
        {hasLink ? (
          <button type="button" onClick={() => void openLink()}>
            Open job in Chrome
          </button>
        ) : null}
      </div>
      {message ? <p role="status">{message}</p> : null}
      <ProposalList refresh={refresh} onChange={() => setRefresh((value) => value + 1)} />
    </>
  )
}

export function JobsView({ onTailorResume }: { onTailorResume?: (jobId: number) => void } = {}) {
  const [refresh, setRefresh] = useState(0)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const importPage = async (): Promise<void> => {
    const result = await window.skillpilot.importJobPage()
    if (!result.ok) return setMessage({ ok: false, text: result.message })
    if (result.value === null) return setMessage(null)
    setMessage({ ok: true, text: 'Job imported. Check the details below.' })
    setRefresh((value) => value + 1)
  }

  return (
    <div>
      <h1>Jobs</h1>
      <p className="lead">Jobs you are considering, matched against your skills on this laptop.</p>
      <FindJobs />
      <section>
        <h2>Add a job</h2>
        <div className="actions tight">
          <button type="button" onClick={() => void importPage()}>
            Import a saved job page
          </button>
          {message ? <p role={message.ok ? 'status' : 'alert'}>{message.text}</p> : null}
        </div>
      </section>
      <BestMatches refresh={refresh} />
      <section>
        <h2>Saved jobs</h2>
        <RecordEditor
          key={refresh}
          kind="job"
          addLabel="Add job by hand"
          emptyText="Add a job by pasting its description, or import a saved job page."
          onChange={() => setRefresh((value) => value + 1)}
          details={(record) => (
            <JobDetails jobId={record.id} title={record.values['title'] ?? ''} hasLink={Boolean(record.values['url'])} onTailorResume={onTailorResume} />
          )}
        />
      </section>
    </div>
  )
}
