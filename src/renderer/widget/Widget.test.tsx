import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Widget } from './Widget'

const widget = () => {
  render(<Widget />)
  return screen.getByRole('button', { name: 'SkillPilot AI' })
}

describe('Widget', () => {
  it('starts a press on left button, reporting where it was grabbed', () => {
    const el = widget()
    fireEvent.pointerDown(el, { button: 0, clientX: 30, clientY: 20, pointerId: 1 })
    expect(window.skillpilot.dragPress).toHaveBeenCalledWith({ x: 30, y: 20 })
    expect(el.setPointerCapture).toHaveBeenCalledWith(1)
  })

  it('ignores the right mouse button', () => {
    const el = widget()
    fireEvent.pointerDown(el, { button: 2 })
    fireEvent.pointerMove(el)
    expect(window.skillpilot.dragPress).not.toHaveBeenCalled()
    expect(window.skillpilot.dragMove).not.toHaveBeenCalled()
  })

  it('reports movement only while pressed', () => {
    const el = widget()
    fireEvent.pointerMove(el)
    expect(window.skillpilot.dragMove).not.toHaveBeenCalled()
    fireEvent.pointerDown(el, { button: 0 })
    fireEvent.pointerMove(el)
    expect(window.skillpilot.dragMove).toHaveBeenCalledOnce()
    fireEvent.pointerUp(el)
    fireEvent.pointerMove(el)
    expect(window.skillpilot.dragMove).toHaveBeenCalledOnce()
  })

  it('releases once when both pointer up and lost capture fire', () => {
    const el = widget()
    fireEvent.pointerDown(el, { button: 0 })
    fireEvent.pointerUp(el)
    fireEvent.lostPointerCapture(el)
    expect(window.skillpilot.dragRelease).toHaveBeenCalledOnce()
  })

  it('still releases if capture is lost without a pointer up', () => {
    const el = widget()
    fireEvent.pointerDown(el, { button: 0 })
    fireEvent.lostPointerCapture(el)
    expect(window.skillpilot.dragRelease).toHaveBeenCalledOnce()
  })

  it('does not release when nothing was pressed', () => {
    const el = widget()
    fireEvent.pointerUp(el)
    expect(window.skillpilot.dragRelease).not.toHaveBeenCalled()
  })

  it('treats movement over the widget as hovering, but not during a drag', () => {
    const el = widget()
    fireEvent.pointerMove(el)
    expect(window.skillpilot.hoverEnter).toHaveBeenCalledOnce()
    fireEvent.pointerDown(el, { button: 0 })
    fireEvent.pointerMove(el)
    expect(window.skillpilot.hoverEnter).toHaveBeenCalledOnce()
  })

  it('reports the pointer entering and leaving', () => {
    const el = widget()
    fireEvent.pointerEnter(el)
    expect(window.skillpilot.hoverEnter).toHaveBeenCalledOnce()
    fireEvent.pointerLeave(el)
    expect(window.skillpilot.hoverLeave).toHaveBeenCalledOnce()
  })
})
