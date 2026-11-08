import { useEffect, useState } from 'react'
import { recordFields } from '../../shared/career'
import type { RoleReadiness } from '../../shared/ipc'
import type { Learning } from '../../shared/learning'
import { scoringRules } from '../../shared/progress'
import { Meter, SkillChart } from './charts'
import { HistorySection } from './HistorySection'
import { useDashboard } from './useDashboard'

const projectStatus = (value: string): string =>
  recordFields.project.find((field) => field.key === 'status')?.options?.find((o) => o.value === value)?.label ?? value

export function DashboardView() {
  const { dashboard, message } = useDashboard()
  const [learning, setLearning] = useState<Learning | null>(null)
  const [recommendation, setRecommendation] = useState<string | null>(null)
  const [roles, setRoles] = useState<RoleReadiness[]>([])

  useEffect(() => {
    void window.skillpilot.getLearning().then((result) => {
      if (result.ok) setLearning(result.value)
    })
    void window.skillpilot.getRecommendation().then((result) => {
      if (result.ok) setRecommendation(result.value)
    })
    void window.skillpilot.getRoleReadiness().then((result) => {
      if (result.ok) setRoles(result.value)
    })
  }, [])

  if (message) {
    return (
      <div>
        <h1>Dashboard</h1>
        <p role="alert">{message}</p>
      </div>
    )
  }
  if (!dashboard) return <h1>Dashboard</h1>

  const { overall, skills, goals, projects, deadlines, achievements } = dashboard
  const proven = skills.filter((skill) => skill.proof === 'proven').length
  const activeGoals = goals.filter((goal) => goal.status === 'active')
  const isEmpty = skills.length === 0 && goals.length === 0 && projects.length === 0

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      {isEmpty ? (
        <p className="lead">Add a skill, a goal, or a project, and your progress will appear here.</p>
      ) : null}

      <div className="tiles">
        <div className="tile hero">
          <span className="tile-label">Overall progress</span>
          <strong>{overall === null ? '–' : `${overall}%`}</strong>
          {overall === null ? <span className="tile-note">Add an active goal to measure this</span> : null}
        </div>
        <div className="tile">
          <span className="tile-label">Skills</span>
          <strong>{skills.length}</strong>
          <span className="tile-note">{proven} proven</span>
        </div>
        <div className="tile">
          <span className="tile-label">Active goals</span>
          <strong>{activeGoals.length}</strong>
          <span className="tile-note">{goals.length} in total</span>
        </div>
        <div className="tile">
          <span className="tile-label">Projects</span>
          <strong>{projects.length}</strong>
          <span className="tile-note">
            {projects.filter((project) => project.status === 'complete').length} complete
          </span>
        </div>
      </div>

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
          </div>
        </div>
      ) : null}
      {learning?.pace === 'down' ? (
        <p className="goal-note">Your pace has slowed compared with the previous two weeks.</p>
      ) : null}

      {recommendation ? (
        <section>
          <h2>Recommended next</h2>
          <p>{recommendation}</p>
        </section>
      ) : null}

      {learning?.todayTasks.length ? (
        <section>
          <h2>Today's tasks</h2>
          <ul className="plain wide-list">
            {learning.todayTasks.map((task) => (
              <li key={task.id}>
                <span>{task.title}</span>
                <span className="muted">
                  {task.overdue ? 'Overdue · ' : ''}
                  {task.minutes} min
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {roles.some((role) => role.readiness !== null) ? (
        <section>
          <h2>Target roles</h2>
          {roles.map((role) =>
            role.readiness === null ? null : (
              <div className="goal-line" key={role.id}>
                <div className="goal-head">
                  <span>{role.title}</span>
                  <span>{role.readiness}%</span>
                </div>
                <Meter label={`${role.title} readiness`} value={role.readiness} />
                {role.gaps.length > 0 ? <p className="goal-note">Gaps: {role.gaps.join(', ')}</p> : null}
              </div>
            )
          )}
        </section>
      ) : null}

      {learning?.roadmaps.length ? (
        <section>
          <h2>Roadmaps</h2>
          {learning.roadmaps.map((roadmap) => (
            <div className="goal-line" key={roadmap.id}>
              <div className="goal-head">
                <span>{roadmap.title}</span>
                <span>{roadmap.percent}%</span>
              </div>
              <Meter label={`${roadmap.title} progress`} value={roadmap.percent} />
              {roadmap.next ? <p className="goal-note">Next: {roadmap.next}</p> : null}
            </div>
          ))}
        </section>
      ) : null}

      {activeGoals.length > 0 ? (
        <section>
          <h2>Goals</h2>
          {activeGoals.map((goal) => (
            <div className="goal-line" key={goal.id}>
              <div className="goal-head">
                <span>{goal.title}</span>
                <span>{goal.progress}%</span>
              </div>
              <Meter label={`${goal.title} progress`} value={goal.progress} />
              {goal.missingSkills.length > 0 ? (
                <p className="goal-note">Still needed: {goal.missingSkills.join(', ')}</p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {skills.length > 0 ? (
        <section>
          <h2>Skills</h2>
          <SkillChart skills={skills} />
        </section>
      ) : null}

      {projects.length > 0 ? (
        <section>
          <h2>Projects</h2>
          <ul className="plain wide-list">
            {projects.map((project) => (
              <li key={project.id}>
                <span>
                  {project.name}
                  {project.skills.length > 0 ? <span className="muted"> · {project.skills.join(', ')}</span> : null}
                </span>
                <span className="muted">
                  {project.milestonesTotal > 0
                    ? `${project.milestonesDone} of ${project.milestonesTotal} milestones · `
                    : ''}
                  {projectStatus(project.status)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <HistorySection />

      <div className="columns">
        <section>
          <h2>Upcoming deadlines</h2>
          {deadlines.length === 0 ? <p className="lead">No upcoming deadlines</p> : null}
          <ul className="plain">
            {deadlines.map((deadline) => (
              <li key={`${deadline.title}-${deadline.date}`}>
                <span>{deadline.title}</span>
                <span className="muted">
                  {deadline.overdue ? 'Overdue · ' : ''}
                  {deadline.date}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2>Recent achievements</h2>
          {achievements.length === 0 ? <p className="lead">Nothing yet</p> : null}
          <ul className="plain">
            {achievements.map((achievement) => (
              <li key={`${achievement.title}-${achievement.date}`}>
                <span>{achievement.title}</span>
                <span className="muted">{achievement.date}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <details className="rules">
        <summary>How these numbers are worked out</summary>
        <ul>
          {scoringRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </details>
    </div>
  )
}
