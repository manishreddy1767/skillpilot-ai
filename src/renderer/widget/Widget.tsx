import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { VoiceStatus } from '../../shared/ipc'
import { MIC_BADGE_RATIO } from '../../shared/settings'
import { RobotIcon } from '../RobotIcon'
import './widget.css'

export function Widget() {
  const pressed = useRef(false)
  const [voice, setVoice] = useState<VoiceStatus['phase']>('idle')

  useEffect(() => window.skillpilot.onVoiceStatus((status) => setVoice(status.phase)), [])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pressed.current = true
    window.skillpilot.dragPress({ x: event.clientX, y: event.clientY })
  }

  const onPointerMove = () => {
    if (pressed.current) window.skillpilot.dragMove()
    // After a drag the page can miss the pointer leaving, and so never see it re-enter.
    else window.skillpilot.hoverEnter()
  }

  const finishPress = () => {
    if (!pressed.current) return
    pressed.current = false
    window.skillpilot.dragRelease()
  }

  const listening = voice === 'starting' || voice === 'listening'
  const micLabel = listening ? 'Stop listening' : 'Talk to SkillPilot'

  return (
    <div
      className="widget-frame"
      onPointerEnter={() => window.skillpilot.hoverEnter()}
      onPointerLeave={() => window.skillpilot.hoverLeave()}
    >
      <div
        className="widget"
        role="button"
        aria-label="SkillPilot AI"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPress}
        onLostPointerCapture={finishPress}
      >
        <RobotIcon />
      </div>
      <button
        type="button"
        className={`widget-mic ${voice}`}
        style={{ width: `${MIC_BADGE_RATIO * 100}%`, height: `${MIC_BADGE_RATIO * 100}%` }}
        aria-label={micLabel}
        title={micLabel}
        aria-pressed={listening}
        onClick={() => window.skillpilot.widgetListen()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {listening ? (
            <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
          ) : (
            <path
              fill="currentColor"
              d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
            />
          )}
        </svg>
      </button>
    </div>
  )
}
