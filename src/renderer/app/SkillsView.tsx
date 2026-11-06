import { SkillChart } from './charts'
import { RecordEditor } from './RecordEditor'
import { useDashboard } from './useDashboard'

export function SkillsView() {
  const { dashboard, reload } = useDashboard()

  return (
    <div>
      <h1>Skills</h1>
      <SkillChart skills={dashboard?.skills ?? []} />
      <RecordEditor
        kind="skill"
        addLabel="Add skill"
        emptyText="Add the skills you have and the ones you are learning."
        onChange={reload}
        details={(record) => {
          const summary = dashboard?.skills.find((skill) => skill.id === record.id)
          return (
            <>
              {summary ? (
                <p className="lead">
                  Demonstrated level {summary.demonstrated}, from {summary.evidenceCount} evidence{' '}
                  {summary.evidenceCount === 1 ? 'item' : 'items'}.
                  {summary.history.length > 1 ? ` My level over time: ${summary.history.join(' → ')}.` : ''}
                </p>
              ) : null}
              <h3>Evidence</h3>
              <RecordEditor
                kind="evidence"
                parentId={record.id}
                addLabel="Add evidence"
                emptyText="Add something that shows this skill. Linked projects count automatically."
                onChange={reload}
              />
            </>
          )
        }}
      />
    </div>
  )
}
