import { useRef, type PointerEvent } from 'react'
import { RobotIcon } from '../RobotIcon'
import './widget.css'

export function Widget() {
  const pressed = useRef(false)

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
      <RobotIcon />
    </div>
  )
}
