import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('shows the welcome screen', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Welcome to SkillPilot AI' })).toBeTruthy()
  })

  it('minimizes back to the widget', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Minimize to widget' }))
    expect(window.skillpilot.minimizeToWidget).toHaveBeenCalledOnce()
  })
})
