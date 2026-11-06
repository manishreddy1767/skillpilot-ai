import { useCallback, useEffect, useState } from 'react'
import type { RoadmapSummary } from '../../shared/learning'
import { Meter } from './charts'
import { ProposalList } from './ProposalList'
import { RecordEditor } from './RecordEditor'

function RoadmapProgress({ summary, onChange }: { summary: RoadmapSummary; onChange: () => void }) {
  const reschedule = async (): Promise<void> => {
    await window.skillpilot.rescheduleRoadmap(summary.id)
    onChange()
  }

  return (
    <div className="goal-line">
      <div className="goal-head">
        <span>
          {summary.done} of {summary.total} topics · {summary.hoursLeft} hours left
        </span>
        <span>{summary.percent}%</span>
      </div>
      <Meter label={`${summary.title} progress`} value={summary.percent} />
      {summary.next ? <p className="goal-note">Next: {summary.next}</p> : null}
      {summary.weeksBehind > 0 ? (
        <div className="actions tight">
          <p>
            {summary.weeksBehind} {summary.weeksBehind === 1 ? 'week' : 'weeks'} behind
          </p>
          <button type="button" onClick={() => void reschedule()}>
            Move remaining topics to start this week
          </button>
        </div>
      ) : null}
      {summary.next && summary.currentWeek === null ? (
        <div className="actions tight">
          <button type="button" onClick={() => void reschedule()}>
            Start this week
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function RoadmapsView() {
  const [summaries, setSummaries] = useState<RoadmapSummary[]>([])

  const load = useCallback((): void => {
    void window.skillpilot.getLearning().then((result) => {
      if (result.ok) setSummaries(result.value.roadmaps)
    })
  }, [])

  useEffect(load, [load])

  return (
    <div>
      <ProposalList onChange={load} />
      <RecordEditor
        kind="roadmap"
        title="Roadmaps"
        addLabel="Add roadmap"
        emptyText="Create a roadmap yourself, or ask the AI for one from a target role."
        onChange={load}
        details={(record) => {
          const summary = summaries.find((item) => item.id === record.id)
          return (
            <>
              {summary ? <RoadmapProgress summary={summary} onChange={load} /> : null}
              <h3>Topics</h3>
              <RecordEditor
                kind="roadmapItem"
                parentId={record.id}
                addLabel="Add topic"
                emptyText="Add the topics to work through, week by week."
                onChange={load}
              />
            </>
          )
        }}
      />
    </div>
  )
}
