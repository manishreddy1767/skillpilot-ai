import { useCallback, useEffect, useState } from 'react'
import type { Proposal } from '../../shared/ai'

interface ProposalListProps {
  /** Change this to reload, for example after the AI has replied. */
  refresh?: number
  onChange?: () => void
}

/** Every AI suggestion waits here. Nothing is saved until it is accepted. */
export function ProposalList({ refresh = 0, onChange }: ProposalListProps) {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [message, setMessage] = useState('')

  const load = useCallback(async (): Promise<void> => {
    const result = await window.skillpilot.listProposals()
    if (result.ok) setProposals(result.value)
  }, [])

  useEffect(() => {
    void load()
  }, [load, refresh])

  const decide = async (id: number, accept: boolean): Promise<void> => {
    const result = accept ? await window.skillpilot.acceptProposal(id) : await window.skillpilot.rejectProposal(id)
    setMessage(result.ok ? '' : result.message)
    await load()
    if (result.ok) onChange?.()
  }

  if (proposals.length === 0 && !message) return null

  return (
    <section className="proposals" aria-label="Suggestions to review">
      <h2>Suggestions to review</h2>
      <p className="lead">Nothing here is saved until you accept it.</p>
      {message ? <p role="alert">{message}</p> : null}
      <ul className="records">
        {proposals.map((proposal) => (
          <li key={proposal.id}>
            <div className="record-row">
              <div className="record-text">
                <strong>{proposal.summary}</strong>
                {proposal.details.map((detail) => (
                  <p key={detail.label}>
                    {detail.label}: {detail.value}
                  </p>
                ))}
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="primary"
                  aria-label={`Accept ${proposal.summary}`}
                  onClick={() => void decide(proposal.id, true)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  aria-label={`Reject ${proposal.summary}`}
                  onClick={() => void decide(proposal.id, false)}
                >
                  Reject
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
