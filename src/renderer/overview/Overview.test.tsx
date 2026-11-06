import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Overview } from './Overview'

const withData = (name: string, currentGoal: string, targetRoles: string) =>
  vi.mocked(window.skillpilot.getOverview).mockResolvedValue({
    ok: true,
    value: { name, currentGoal, targetRoles }
  })

describe('Overview', () => {
  it('shows every section with its empty state', async () => {
    render(<Overview />)
    for (const [title, empty] of [
      ['Current goal', 'No goal set yet'],
      ["Today's tasks", 'Nothing planned for today'],
      ['Learning now', 'No skills in progress'],
      ['Next deadline', 'No upcoming deadlines']
    ]) {
      expect(await screen.findByRole('heading', { name: title! })).toBeTruthy()
      expect(screen.getByText(empty!)).toBeTruthy()
    }
    expect(screen.getByText('Your career at a glance')).toBeTruthy()
  })

  it('shows saved details', async () => {
    withData('Sam Doe', 'Become a developer', 'Frontend Developer')
    render(<Overview />)
    expect(await screen.findByText('Become a developer')).toBeTruthy()
    expect(screen.getByText('Target: Frontend Developer')).toBeTruthy()
    expect(screen.getByText("Hi Sam, here's your career at a glance")).toBeTruthy()
    expect(screen.queryByText('No goal set yet')).toBeNull()
  })

  it('updates when the data changes', async () => {
    render(<Overview />)
    await screen.findByText('No goal set yet')
    withData('Sam', 'New goal', '')
    const listener = vi.mocked(window.skillpilot.onOverviewChanged).mock.calls[0]![0]
    await act(async () => listener())
    expect(screen.getByText('New goal')).toBeTruthy()
  })

  it('stops listening when removed', async () => {
    const stop = vi.fn()
    vi.mocked(window.skillpilot.onOverviewChanged).mockReturnValue(stop)
    const { unmount } = render(<Overview />)
    await screen.findByText('No goal set yet')
    unmount()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('falls back to empty states if data is unavailable', async () => {
    vi.mocked(window.skillpilot.getOverview).mockResolvedValue({ ok: false, message: 'nope' })
    render(<Overview />)
    expect(await screen.findByText('No goal set yet')).toBeTruthy()
  })

  it('opens the full app from the button', async () => {
    render(<Overview />)
    await screen.findByText('No goal set yet')
    fireEvent.click(screen.getByRole('button', { name: 'Open SkillPilot' }))
    expect(window.skillpilot.openApp).toHaveBeenCalledOnce()
  })
})
