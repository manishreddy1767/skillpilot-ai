import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ChatMessage } from '../../shared/ai'
import { parseVoiceCommand, type SectionId } from '../../shared/voice-commands'
import { ProposalList } from './ProposalList'
import { useAiBlocked } from './useAiStatus'
import { carryOut, localToday } from './voice-actions'

type Voice = 'idle' | 'starting' | 'listening' | 'working'

interface AssistantViewProps {
  /** Opens another section, with a note saying why. Spoken "open tasks" uses this. */
  onNavigate?: (section: SectionId, note: string) => void
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

export function AssistantView({ onNavigate = () => undefined }: AssistantViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [voice, setVoice] = useState<Voice>('idle')
  const [actNow, setActNow] = useState(true)
  const stopped = useRef(false)
  const blocked = useAiBlocked()

  useEffect(() => {
    void window.skillpilot.getChat().then((result) => {
      if (result.ok) setMessages(result.value)
    })
    void window.skillpilot.getSettings().then((result) => {
      if (result.ok) setActNow(result.value['voiceActNow'] !== 'off')
    })
    const stop = window.skillpilot.onVoiceReady(() => setVoice((now) => (now === 'starting' ? 'listening' : now)))
    return () => {
      stop()
      void window.skillpilot.stopListening()
    }
  }, [])

  /** Sends a message. Spoken ones may accept the AI's suggestions straight away. */
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

  const send = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    await ask(draft, false)
  }

  const heard = async (text: string): Promise<void> => {
    const intent = parseVoiceCommand(text, localToday())
    if (!actNow) {
      setDraft(text)
      setNote(`Heard "${text}". Check it, then press Send.`)
      return
    }
    if (intent.kind === 'ask') {
      if (blocked) {
        setDraft(text)
        setNote(`Heard "${text}". The assistant is not set up, so it was not sent.`)
        return
      }
      setNote(`Heard "${text}". Asking the assistant…`)
      if (await ask(text, true)) setNote((now) => (now.endsWith('Asking the assistant…') ? `Heard "${text}".` : now))
      return
    }
    if (intent.kind === 'navigate') {
      onNavigate(intent.section, `Heard "${text}". Opened ${intent.label}.`)
      return
    }
    const done = await carryOut(intent, { api: window.skillpilot, navigate: () => undefined, today: localToday() })
    setNote(`Heard "${text}". ${done}`)
  }

  const toggleMic = async (): Promise<void> => {
    if (voice === 'starting' || voice === 'listening') {
      stopped.current = true
      setVoice('idle')
      await window.skillpilot.stopListening()
      return
    }
    stopped.current = false
    setError('')
    setNote('')
    setVoice('starting')
    const result = await window.skillpilot.listen()
    if (stopped.current) return
    if (!result.ok) {
      setVoice('idle')
      setError(result.message)
      return
    }
    const text = result.value.text.trim()
    if (!text) {
      setVoice('idle')
      setNote('Nothing was heard. Press the microphone and speak again.')
      return
    }
    setVoice('working')
    await heard(text)
    setVoice('idle')
  }

  const clear = async (): Promise<void> => {
    const result = await window.skillpilot.clearChat()
    if (result.ok) setMessages([])
  }

  const listening = voice === 'starting' || voice === 'listening'
  const micLabel = listening ? 'Stop listening' : 'Speak a message or command'

  return (
    <div>
      <h1>Assistant</h1>
      {blocked ? <p className="lead">{blocked}</p> : null}
      {messages.length === 0 && !blocked ? (
        <p className="lead">
          Ask what to learn next, or whether you are ready for a role. Press the microphone to speak, for example
          “add task read chapter four tomorrow” or “open my skills”.
        </p>
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
          <button
            type="button"
            className="mic"
            aria-label={micLabel}
            title={micLabel}
            aria-pressed={listening}
            disabled={busy || voice === 'working'}
            onClick={() => void toggleMic()}
          >
            {listening ? <StopIcon /> : <MicIcon />}
          </button>
          <button type="submit" className="primary" disabled={busy || !draft.trim() || Boolean(blocked)}>
            {busy ? 'Thinking…' : 'Send'}
          </button>
        </div>
        <p className="voice-state" role="status">
          {voice === 'starting' ? 'Starting the microphone…' : voice === 'listening' ? 'Listening… speak now.' : note}
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
