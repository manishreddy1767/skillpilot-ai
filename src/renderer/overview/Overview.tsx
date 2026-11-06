import { useEffect, useState } from 'react'
import type { OverviewData } from '../../shared/career'
import './overview.css'

export function Overview() {
  const [data, setData] = useState<OverviewData | null>(null)

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
        <h1>SkillPilot AI</h1>
        <p>{firstName ? `Hi ${firstName}, here's your career at a glance` : 'Your career at a glance'}</p>
      </header>
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
        <p>Nothing planned for today</p>
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
      <button type="button" onClick={() => window.skillpilot.openApp()}>
        Open SkillPilot
      </button>
    </main>
  )
}
