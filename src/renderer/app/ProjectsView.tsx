import { LinkPicker } from './LinkPicker'
import { RecordEditor } from './RecordEditor'

export function ProjectsView() {
  return (
    <RecordEditor
      kind="project"
      title="Projects"
      addLabel="Add project"
      emptyText="Add projects that show what you can do."
      details={(record) => (
        <>
          <LinkPicker
            link="projectSkill"
            parentId={record.id}
            optionKind="skill"
            title="Skills demonstrated"
            emptyText="Add skills first, then choose the ones this project shows."
          />
          <h3>Milestones</h3>
          <RecordEditor
            kind="projectMilestone"
            parentId={record.id}
            addLabel="Add milestone"
            emptyText="Break this project into steps."
          />
        </>
      )}
    />
  )
}
