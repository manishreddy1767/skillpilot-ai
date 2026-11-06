import { useEffect, useState, type FormEvent } from 'react'
import type { ChatMessage } from '../../shared/ai'
import { ProposalList } from './ProposalList'
import { useAiBlocked } from './useAiStatus'

export function AssistantView() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const blocked = useAiBlocked()

  useEffect(() => {
    void window.skillpilot.getChat().then((result) => {
      if (result.ok) setMessages(result.value)
    })
  }, [])

  const send = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const result = await window.skillpilot.sendChat(draft)
    setBusy(false)
    if (result.ok) {
      setMessages(result.value)
      setDraft('')
      setRefresh((value) => value + 1)
    } else {
      setError(result.message)
    }
  }

  const clear = async (): Promise<void> => {
    const result = await window.skillpilot.clearChat()
    if (result.ok) setMessages([])
  }

  return (
    <div>
      <h1>Assistant</h1>
      {blocked ? <p className="lead">{blocked}</p> : null}
      {messages.length === 0 && !blocked ? (
        <p className="lead">Ask what to learn next, or whether you are ready for a role.</p>
      ) : null}

      <ul className="chat">
        {messages.map((message) => (
          <li key={message.id} className={`bubble ${message.role}`}>
            <span className="muted">{message.role === 'user' ? 'You' : 'SkillPilot'}</span>
            <p>{message.content}</p>
          </li>
        ))}
      </ul>

      <ProposalList refresh={refresh} />

      <form onSubmit={(event) => void send(event)}>
        <div className="field wide">
          <label htmlFor="chat-input">Your message</label>
          <textarea
            id="chat-input"
            rows={3}
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <div className="actions">
          <button type="submit" className="primary" disabled={busy || !draft.trim() || Boolean(blocked)}>
            {busy ? 'Thinking…' : 'Send'}
          </button>
          {messages.length > 0 ? (
            <button type="button" onClick={() => void clear()}>
              Clear conversation
            </button>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
        </div>
      </form>
    </div>
  )
}
