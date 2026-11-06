import { recordFields } from '../../shared/career'
import { scoringRules } from '../../shared/progress'
import { Meter, SkillChart } from './charts'
import { useDashboard } from './useDashboard'

const projectStatus = (value: string): string =>
  recordFields.project.find((field) => field.key === 'status')?.options?.find((o) => o.value === value)?.label ?? value

export function DashboardView() {
  const { dashboard, message } = useDashboard()

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
