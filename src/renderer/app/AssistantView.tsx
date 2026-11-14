import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ChatMessage } from '../../shared/ai'
import type { VoiceStatus } from '../../shared/ipc'
import type { SectionId } from '../../shared/voice-commands'
import { RobotIcon } from '../RobotIcon'
import { ProposalList } from './ProposalList'
import { useAiBlocked } from './useAiStatus'

interface AssistantViewProps {
  /** Opens another section, with a note saying why. Spoken "open my skills" uses this. */
  onNavigate?: (section: SectionId, note: string) => void
  /** A question spoken to the widget, to send as soon as this screen opens. */
  pendingAsk?: string | null
  onPendingAskTaken?: () => void
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
      />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  )
}

/** Five bars that rise with the microphone level, so you can see you are being heard. */
export function LevelMeter({ level }: { level: number }) {
  return (
    <span className="level-meter" aria-hidden="true">
      {[4, 12, 22, 34, 48].map((threshold) => (
        <span key={threshold} className={level >= threshold ? 'on' : ''} />
      ))}
    </span>
  )
}

export function AssistantView({ onNavigate = () => undefined, pendingAsk = null, onPendingAskTaken }: AssistantViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [voice, setVoice] = useState<VoiceStatus>({ phase: 'idle' })
  const waiting = useRef(false)
  const blocked = useAiBlocked()

  useEffect(() => {
    void window.skillpilot.getChat().then((result) => {
      if (result.ok) setMessages(result.value)
    })
    const stop = window.skillpilot.onVoiceStatus((status) => {
      // Only this screen's own request shows here. The widget's shows in the hover panel.
      if (waiting.current && status.phase !== 'done' && status.phase !== 'idle') setVoice(status)
    })
    return () => {
      stop()
      if (waiting.current) void window.skillpilot.stopListening()
    }
  }, [])

  /** Sends a message. Spoken ones accept the AI's suggestions straight away. */
  const ask = async (text: string, acceptSuggestions: boolean): Promise<boolean> => {
    setBusy(true)
    setError('')
    const before = acceptSuggestions ? await window.skillpilot.listProposals() : null
    const result = await window.skillpilot.sendChat(text)
    if (!result.ok) {
      setBusy(false)
      setError(result.message)
      return false
    }
    setMessages(result.value)
    setDraft('')
    let accepted = 0
    if (before?.ok) {
      const known = new Set(before.value.map((proposal) => proposal.id))
      const after = await window.skillpilot.listProposals()
      for (const proposal of after.ok ? after.value : []) {
        if (!known.has(proposal.id) && (await window.skillpilot.acceptProposal(proposal.id)).ok) accepted += 1
      }
    }
    setBusy(false)
    setRefresh((value) => value + 1)
    if (accepted > 0) setNote(`Applied ${accepted} ${accepted === 1 ? 'suggestion' : 'suggestions'} from the assistant.`)
    return true
  }

  // A question spoken to the widget is sent once, as soon as this screen opens.
  useEffect(() => {
    if (!pendingAsk) return
    onPendingAskTaken?.()
    setNote(`Heard "${pendingAsk}".`)
    void ask(pendingAsk, true)
  }, [pendingAsk])

  const send = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    await ask(draft, false)
  }

  const listening = voice.phase === 'starting' || voice.phase === 'listening'

  const toggleMic = async (): Promise<void> => {
    if (listening) {
      waiting.current = false
      setVoice({ phase: 'idle' })
      await window.skillpilot.stopListening()
      return
    }
    waiting.current = true
    setError('')
    setNote('')
    setVoice({ phase: 'starting' })
    const result = await window.skillpilot.listen()
    if (!waiting.current) return
    waiting.current = false
    setVoice({ phase: 'idle' })
    if (!result.ok) {
      setError(result.message)
      return
    }
    const { heard, reply, navigate, minimize, draft: typed, ask: question } = result.value
    if (!heard && !reply) return
    const said = heard ? `Heard "${heard}". ${reply}` : reply
    if (navigate) {
      onNavigate(navigate, said)
      return
    }
    if (minimize) window.skillpilot.minimizeToWidget()
    if (typed) setDraft(typed)
    setNote(question ? `Heard "${heard}".` : said)
    if (question) await ask(question, true)
  }

  const clear = async (): Promise<void> => {
    const result = await window.skillpilot.clearChat()
    if (result.ok) setMessages([])
  }

  const micLabel = listening ? 'Stop listening' : 'Speak a message or command'
  const statusText =
    voice.phase === 'starting'
      ? 'Starting the microphone…'
      : voice.phase === 'listening'
        ? 'Listening… speak now.'
        : voice.phase === 'working'
          ? `Heard "${voice.heard ?? ''}". Working on it…`
          : note

  return (
    <div>
      <h1>Assistant</h1>
      {messages.length === 0 ? (
        <div className="hello">
          <RobotIcon />
          <div>
            <p className="hello-title">Ready to help.</p>
            {blocked ? <p className="lead">{blocked}</p> : null}
            <p className="lead">
              Press the microphone and say things like “open Chrome”, “open YouTube in Chrome”, “search for React
              hooks”, “add task read the guide tomorrow”, or “open my skills”.
            </p>
          </div>
        </div>
      ) : blocked ? (
        <p className="lead">{blocked}</p>
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
        <label htmlFor="chat-input" className="composer-label">
          Your message
        </label>
        <div className={`composer${listening ? ' listening' : ''}`}>
          <textarea
            id="chat-input"
            rows={2}
            value={draft}
            disabled={busy}
            placeholder={listening ? 'Listening…' : 'Type, or press the microphone to speak'}
            onChange={(event) => setDraft(event.target.value)}
          />
          {voice.phase === 'listening' ? <LevelMeter level={voice.level ?? 0} /> : null}
          <button
            type="button"
            className="mic"
            aria-label={micLabel}
            title={micLabel}
            aria-pressed={listening}
            disabled={busy || voice.phase === 'working'}
            onClick={() => void toggleMic()}
          >
            {listening ? <StopIcon /> : <MicIcon />}
          </button>
          <button type="submit" className="primary" disabled={busy || !draft.trim() || Boolean(blocked)}>
            {busy ? 'Thinking…' : 'Send'}
          </button>
        </div>
        <p className="voice-state" role="status">
          {statusText}
        </p>
        <div className="actions">
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
