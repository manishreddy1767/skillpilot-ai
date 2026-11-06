import { ProposalList } from './ProposalList'
import { RecordEditor } from './RecordEditor'

export function RoadmapsView() {
  return (
    <div>
      <ProposalList />
      <RecordEditor
        kind="roadmap"
        title="Roadmaps"
        addLabel="Add roadmap"
        emptyText="Create a roadmap yourself, or ask the AI for one from a target role."
        details={(record) => (
          <>
            <h3>Topics</h3>
            <RecordEditor
              kind="roadmapItem"
              parentId={record.id}
              addLabel="Add topic"
              emptyText="Add the topics to work through, week by week."
            />
          </>
        )}
      />
    </div>
  )
}
