import { useCallback, useEffect, useState } from 'react'
import type { GapReport } from '../../shared/ai'
import type { GapAnalysis, GapStatus } from '../../shared/gap'
import { Meter } from './charts'
import { ProposalList } from './ProposalList'
import { RecordEditor } from './RecordEditor'
import { useAiBlocked } from './useAiStatus'

const statusLabels: Record<GapStatus, { icon: string; label: string }> = {
  met: { icon: '✓', label: 'Met' },
  improve: { icon: '◐', label: 'Needs work' },
  missing: { icon: '!', label: 'Missing' }
}

function RoleDetails({ roleId, title }: { roleId: number; title: string }) {
  const [analysis, setAnalysis] = useState<GapAnalysis | null>(null)
  const [report, setReport] = useState<GapReport | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const blocked = useAiBlocked()

  const load = useCallback((): void => {
    void window.skillpilot.getGapAnalysis(roleId).then((result) => {
      if (result.ok) {
        setAnalysis(result.value.analysis)
        setReport(result.value.report)
      } else {
        setMessage(result.message)
      }
    })
  }, [roleId])

  useEffect(load, [load, refresh])

  const run = async (label: string, work: () => Promise<{ ok: boolean; message?: string }>): Promise<void> => {
    setBusy(label)
    setMessage('')
    const result = await work()
    setBusy('')
    if (!result.ok) setMessage(result.message ?? 'That did not work.')
    setRefresh((value) => value + 1)
  }

  return (
    <>
      {analysis?.readiness !== null && analysis?.readiness !== undefined ? (
        <div className="goal-line">
          <div className="goal-head">
            <span>Readiness</span>
            <span>{analysis.readiness}%</span>
          </div>
          <Meter label={`${title} readiness`} value={analysis.readiness} />
        </div>
      ) : null}

      {analysis?.items.length ? (
        <table className="gap-table">
          <thead>
            <tr>
              <th scope="col">Skill</th>
              <th scope="col">Needed</th>
              <th scope="col">Demonstrated</th>
              <th scope="col">Claimed</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {analysis.items.map((item) => (
              <tr key={item.skillName}>
                <td>{item.skillName}</td>
                <td>{item.requiredLevel}</td>
                <td>{item.demonstrated}</td>
                <td>{item.claimed}</td>
                <td>
                  <span aria-hidden="true">{statusLabels[item.status].icon}</span> {statusLabels[item.status].label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <h3>Requirements</h3>
      <RecordEditor
        kind="roleRequirement"
        parentId={roleId}
        addLabel="Add requirement"
        emptyText="List the skills this role needs, or ask the AI to draft them."
        onChange={() => setRefresh((value) => value + 1)}
      />

      <h3>AI help</h3>
      {blocked ? <p className="lead">{blocked}</p> : null}
      <div className="actions tight">
        <button
          type="button"
          disabled={Boolean(blocked) || Boolean(busy)}
          onClick={() => void run('requirements', () => window.skillpilot.draftRequirements(roleId))}
        >
          {busy === 'requirements' ? 'Working…' : 'Draft requirements'}
        </button>
        <button
          type="button"
          disabled={Boolean(blocked) || Boolean(busy)}
          onClick={() => void run('report', () => window.skillpilot.createGapReport(roleId))}
        >
          {busy === 'report' ? 'Working…' : 'Write gap report'}
        </button>
        <button
          type="button"
          disabled={Boolean(blocked) || Boolean(busy)}
          onClick={() => void run('roadmap', () => window.skillpilot.generateRoadmap(roleId))}
        >
          {busy === 'roadmap' ? 'Working…' : 'Create roadmap'}
        </button>
      </div>
      {message ? <p role="alert">{message}</p> : null}

      <ProposalList refresh={refresh} onChange={() => setRefresh((value) => value + 1)} />

      {report ? (
        <div className="report">
          <h3>Gap report</h3>
          <p>{report.summary}</p>
          <ol>
            {report.priorities.map((priority) => (
              <li key={priority}>{priority}</li>
            ))}
          </ol>
          <p className="muted">Written {report.createdAt}</p>
        </div>
      ) : null}
    </>
  )
}

export function RolesView() {
  return (
    <RecordEditor
      kind="targetRole"
      title="Target roles"
      addLabel="Add target role"
      emptyText="Add a role you are aiming for, to see how close you are."
      details={(record) => <RoleDetails roleId={record.id} title={record.values['title'] ?? ''} />}
    />
  )
}
