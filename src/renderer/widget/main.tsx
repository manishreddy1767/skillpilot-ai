import { useRef, type PointerEvent } from 'react'
import { createRoot } from 'react-dom/client'
import './widget.css'

function Widget() {
  const pressed = useRef(false)

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pressed.current = true
    window.skillpilot.dragPress({ x: event.clientX, y: event.clientY })
  }

  const onPointerMove = () => {
    if (pressed.current) window.skillpilot.dragMove()
  }

  const finishPress = () => {
    if (!pressed.current) return
    pressed.current = false
    window.skillpilot.dragRelease()
  }

  return (
    <div
      className="widget"
      role="button"
      aria-label="SkillPilot AI"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPress}
      onLostPointerCapture={finishPress}
      onPointerEnter={() => window.skillpilot.hoverEnter()}
      onPointerLeave={() => window.skillpilot.hoverLeave()}
    >
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5eead4" />
            <stop offset="1" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        <circle cx="36" cy="36" r="35" fill="#0f172a" />
        <circle cx="36" cy="36" r="32" fill="none" stroke="url(#ring)" strokeWidth="3" />
        <path d="M49 23 L40 40 L32 32 Z" fill="#5eead4" />
        <path d="M23 49 L32 32 L40 40 Z" fill="#f8fafc" />
      </svg>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Widget />)
