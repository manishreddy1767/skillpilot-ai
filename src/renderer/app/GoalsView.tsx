import { Meter } from './charts'
import { LinkPicker } from './LinkPicker'
import { RecordEditor } from './RecordEditor'
import { useDashboard } from './useDashboard'

export function GoalsView() {
  const { dashboard, reload } = useDashboard()

  return (
    <RecordEditor
      kind="goal"
      title="Goals"
      addLabel="Add goal"
      emptyText="Add a career goal, then give it milestones and required skills."
      onChange={reload}
      details={(record) => {
        const goal = dashboard?.goals.find((item) => item.id === record.id)
        return (
          <>
            {goal ? (
              <div className="goal-line">
                <div className="goal-head">
                  <span>
                    {goal.milestonesDone} of {goal.milestonesTotal} milestones, {goal.skillsMet} of {goal.skillsTotal}{' '}
                    skills
                  </span>
                  <span>{goal.progress}%</span>
                </div>
                <Meter label={`${goal.title} progress`} value={goal.progress} />
                {goal.missingSkills.length > 0 ? (
                  <p className="goal-note">Still needed: {goal.missingSkills.join(', ')}</p>
                ) : null}
              </div>
            ) : null}
            <h3>Milestones</h3>
            <RecordEditor
              kind="goalMilestone"
              parentId={record.id}
              addLabel="Add milestone"
              emptyText="Break this goal into steps."
              onChange={reload}
            />
            <LinkPicker
              link="goalSkill"
              parentId={record.id}
              optionKind="skill"
              title="Required skills"
              emptyText="Add skills first, then choose the ones this goal needs."
              withLevel
              onChange={reload}
            />
            <LinkPicker
              link="goalProject"
              parentId={record.id}
              optionKind="project"
              title="Related projects"
              emptyText="Add projects first, then link the ones that support this goal."
            />
          </>
        )
      }}
    />
  )
}
