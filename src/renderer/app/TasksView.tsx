import { useCallback, useEffect, useState } from 'react'
import type { Learning } from '../../shared/learning'
import { Meter } from './charts'
import { ProposalList } from './ProposalList'
import { RecordEditor } from './RecordEditor'
import { useAiBlocked } from './useAiStatus'

export function TasksView() {
  const [learning, setLearning] = useState<Learning | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [editorKey, setEditorKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const blocked = useAiBlocked()

  const load = useCallback((): void => {
    void window.skillpilot.getLearning().then((result) => {
      if (result.ok) setLearning(result.value)
      else setMessage(result.message)
    })
  }, [])

  useEffect(load, [load, refresh])

  const changed = (): void => setRefresh((value) => value + 1)

  const complete = async (id: number): Promise<void> => {
    const result = await window.skillpilot.completeTask(id)
    if (!result.ok) setMessage(result.message)
    changed()
    setEditorKey((value) => value + 1)
  }

  const suggest = async (): Promise<void> => {
    setBusy(true)
    setMessage('')
    const result = await window.skillpilot.suggestTasks()
    setBusy(false)
    if (!result.ok) setMessage(result.message)
    changed()
  }

  const share = (done: number, target: number): number => (target ? Math.min(100, Math.round((done / target) * 100)) : 0)
  const weekly = learning ? share(learning.minutesThisWeek, learning.weeklyTarget) : 0
  const monthly = learning ? share(learning.minutesThisMonth, learning.monthlyTarget) : 0

  return (
    <div>
      <h1>Tasks</h1>
      {learning ? (
        <div className="tiles compact">
          <div className="tile">
            <span className="tile-label">Learning streak</span>
            <strong>
              {learning.streak} {learning.streak === 1 ? 'day' : 'days'}
            </strong>
          </div>
          <div className="tile">
            <span className="tile-label">This week</span>
            <strong>
              {learning.minutesThisWeek} of {learning.weeklyTarget} min
            </strong>
            <Meter label="Weekly target" value={weekly} />
          </div>
          <div className="tile">
            <span className="tile-label">This month</span>
            <strong>
              {learning.minutesThisMonth} of {learning.monthlyTarget} min
            </strong>
            <Meter label="Monthly target" value={monthly} />
          </div>
        </div>
      ) : null}

      <section>
        <h2>Today</h2>
        {learning?.todayTasks.length === 0 ? <p className="lead">Nothing is due today.</p> : null}
        {learning?.todayTasks.length ? (
          <p className="lead">{learning.plannedMinutesToday} minutes planned</p>
        ) : null}
        <ul className="plain wide-list">
          {learning?.todayTasks.map((task) => (
            <li key={task.id}>
              <label className="check">
                <input type="checkbox" checked={false} onChange={() => void complete(task.id)} />
                {task.title}
              </label>
              <span className="muted">
                {task.overdue ? 'Overdue · ' : ''}
                {task.minutes} min
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>AI suggestions</h2>
        {blocked ? <p className="lead">{blocked}</p> : null}
        <div className="actions tight">
          <button type="button" disabled={Boolean(blocked) || busy} onClick={() => void suggest()}>
            {busy ? 'Working…' : 'Suggest tasks for today'}
          </button>
          {message ? <p role="alert">{message}</p> : null}
        </div>
        <ProposalList
          refresh={refresh}
          onChange={() => {
            changed()
            setEditorKey((value) => value + 1)
          }}
        />
      </section>

      <section>
        <h2>All tasks</h2>
        <RecordEditor
          key={editorKey}
          kind="task"
          addLabel="Add task"
          emptyText="Add a task, with a due date to see it under Today."
          onChange={changed}
        />
      </section>
    </div>
  )
}
