import { useState } from 'react'
import { LinkPicker } from './LinkPicker'
import { ProposalList } from './ProposalList'
import { RecordEditor } from './RecordEditor'
import { useAiBlocked } from './useAiStatus'

export function ProjectsView() {
  const blocked = useAiBlocked()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [editorKey, setEditorKey] = useState(0)

  const suggest = async (): Promise<void> => {
    setBusy(true)
    setMessage('')
    const result = await window.skillpilot.suggestProjects()
    setBusy(false)
    if (!result.ok) setMessage(result.message)
    setRefresh((value) => value + 1)
  }

  return (
    <div>
      <RecordEditor
        key={editorKey}
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
      <section>
        <h2>Project ideas</h2>
        <p className="lead">Ideas that would demonstrate the skills your goals and target roles still need.</p>
        {blocked ? <p className="lead">{blocked}</p> : null}
        <div className="actions tight">
          <button type="button" disabled={Boolean(blocked) || busy} onClick={() => void suggest()}>
            {busy ? 'Working…' : 'Suggest projects for my gaps'}
          </button>
          {message ? <p role="alert">{message}</p> : null}
        </div>
        <ProposalList refresh={refresh} onChange={() => setEditorKey((value) => value + 1)} />
      </section>
    </div>
  )
}
