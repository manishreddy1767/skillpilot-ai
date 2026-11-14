import { useEffect, useState } from 'react'
import type { VoiceStatus } from '../../shared/ipc'
import type { OverviewData } from '../../shared/career'
import { RobotIcon } from '../RobotIcon'
import './overview.css'

export function Overview() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [voice, setVoice] = useState<VoiceStatus>({ phase: 'idle' })

  useEffect(() => window.skillpilot.onVoiceStatus(setVoice), [])

  useEffect(() => {
    const load = async (): Promise<void> => {
      const result = await window.skillpilot.getOverview()
      setData(result.ok ? result.value : null)
    }
    void load()
    return window.skillpilot.onOverviewChanged(() => void load())
  }, [])

  const firstName = data?.name.split(/\s+/)[0]
  const deadline = data?.nextDeadline
  const progress = data?.progress ?? null

  return (
    <main className="panel">
      <header>
        <RobotIcon />
        <div>
          <h1>SkillPilot AI</h1>
          <p>{firstName ? `Hi ${firstName}, here's your career at a glance` : 'Your career at a glance'}</p>
        </div>
      </header>
      <VoiceCard status={voice} />
      <section>
        <h2>Current goal</h2>
        <p className="clamped">{data?.currentGoal || 'No goal set yet'}</p>
        {data?.targetRoles ? <p className="detail clamped">Target: {data.targetRoles}</p> : null}
        {progress !== null ? (
          <div className="progress">
            <div
              className="track"
              role="progressbar"
              aria-label="Overall progress"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="fill" style={{ width: `${progress}%` }} />
            </div>
            <span>Overall {progress}%</span>
          </div>
        ) : null}
      </section>
      <section>
        <h2>Today's tasks</h2>
        {data?.tasks.length ? (
          data.tasks.map((task) => (
            <label className="task" key={task.id}>
              <input type="checkbox" checked={false} onChange={() => void window.skillpilot.completeTask(task.id)} />
              <span className="clamped">{task.title}</span>
            </label>
          ))
        ) : (
          <p>Nothing planned for today</p>
        )}
        {data?.streak ? <p className="detail">{data.streak} day streak</p> : null}
      </section>
      <section>
        <h2>Learning now</h2>
        <p className="clamped">{data?.learning.length ? data.learning.join(', ') : 'No skills in progress'}</p>
      </section>
      <section>
        <h2>Next deadline</h2>
        <p className="clamped">{deadline ? deadline.title : 'No upcoming deadlines'}</p>
        {deadline ? (
          <p className="detail">
            {deadline.overdue ? 'Overdue · ' : ''}
            {deadline.date}
          </p>
        ) : null}
      </section>
      <section>
        <h2>Latest achievement</h2>
        <p className="clamped">{data?.latestAchievement ?? 'Nothing yet'}</p>
      </section>
      <section>
        <h2>Recommended next</h2>
        <p className="clamped">{data?.recommendation ?? 'Nothing yet'}</p>
      </section>
      <button type="button" onClick={() => window.skillpilot.openApp()}>
        Open SkillPilot
      </button>
    </main>
  )
}

const BARS = [4, 12, 22, 34, 48]

/** The widget's microphone, talking back: listening, what was heard, and what was done. */
function VoiceCard({ status }: { status: VoiceStatus }) {
  if (status.phase === 'idle') return null
  const text =
    status.phase === 'starting'
      ? 'Starting the microphone…'
      : status.phase === 'listening'
        ? 'Listening… speak now.'
        : status.phase === 'working'
          ? 'Working on it…'
          : status.reply
  return (
    <section className={`voice-card${status.failed ? ' failed' : ''}`} role="status" aria-live="polite">
      <h2>Voice</h2>
      {status.phase === 'listening' ? (
        <span className="meter" aria-hidden="true">
          {BARS.map((threshold) => (
            <span key={threshold} className={(status.level ?? 0) >= threshold ? 'on' : ''} />
          ))}
        </span>
      ) : null}
      {status.heard ? <p className="heard">“{status.heard}”</p> : null}
      <p>{text}</p>
    </section>
  )
}
