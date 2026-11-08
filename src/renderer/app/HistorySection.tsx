import { useEffect, useState } from 'react'
import type { History } from '../../shared/history'
import { TrendChart } from './TrendChart'

const monthName = (month: string): string =>
  new Date(`${month}-01T00:00:00`).toLocaleString(undefined, { month: 'long', year: 'numeric' })

export function HistorySection() {
  const [history, setHistory] = useState<History | null>(null)

  useEffect(() => {
    void window.skillpilot.getHistory().then((result) => {
      if (result.ok) setHistory(result.value)
    })
  }, [])

  if (!history) return null
  const { trend, month } = history
  const change = month.minutes - month.previousMinutes

  return (
    <>
      <section>
        <h2>Progress over time</h2>
        <TrendChart points={trend} />
      </section>

      <section>
        <h2>{monthName(month.month)} so far</h2>
        <ul className="plain wide-list">
          <li>
            <span>Learning time</span>
            <span className="muted">
              {month.minutes} min
              {month.previousMinutes > 0 || month.minutes > 0
                ? ` · ${change >= 0 ? `${change} more` : `${-change} fewer`} than last month`
                : ''}
            </span>
          </li>
          <li>
            <span>Tasks finished</span>
            <span className="muted">{month.tasksDone}</span>
          </li>
          <li>
            <span>Milestones, goals and projects completed</span>
            <span className="muted">{month.achievements}</span>
          </li>
          {month.overallChange !== null ? (
            <li>
              <span>Overall progress</span>
              <span className="muted">
                {month.overallChange >= 0 ? `Up ${month.overallChange}` : `Down ${-month.overallChange}`} points
              </span>
            </li>
          ) : null}
        </ul>
        {month.improved.length > 0 ? (
          <>
            <h3>Skills that improved</h3>
            <ul className="plain wide-list">
              {month.improved.map((skill) => (
                <li key={skill.name}>
                  <span>{skill.name}</span>
                  <span className="muted">
                    Demonstrated level {skill.from} → {skill.to}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </>
  )
}
