import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Overview } from './Overview'

describe('Overview', () => {
  it('shows every section with its empty state', () => {
    render(<Overview />)
    for (const [title, empty] of [
      ['Current goal', 'No goal set yet'],
      ["Today's tasks", 'Nothing planned for today'],
      ['Learning now', 'No skills in progress'],
      ['Next deadline', 'No upcoming deadlines']
    ]) {
      expect(screen.getByRole('heading', { name: title! })).toBeTruthy()
      expect(screen.getByText(empty!)).toBeTruthy()
    }
  })

  it('opens the full app from the button', () => {
    render(<Overview />)
    fireEvent.click(screen.getByRole('button', { name: 'Open SkillPilot' }))
    expect(window.skillpilot.openApp).toHaveBeenCalledOnce()
  })
})
