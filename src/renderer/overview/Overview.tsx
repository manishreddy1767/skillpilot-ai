import { useEffect, useState } from 'react'
import type { OverviewData } from '../../shared/career'
import './overview.css'

const upcoming = [
  { title: "Today's tasks", empty: 'Nothing planned for today' },
  { title: 'Learning now', empty: 'No skills in progress' },
  { title: 'Next deadline', empty: 'No upcoming deadlines' }
]

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
      </section>
      {upcoming.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <p>{section.empty}</p>
        </section>
      ))}
      <button type="button" onClick={() => window.skillpilot.openApp()}>
        Open SkillPilot
      </button>
    </main>
  )
}
