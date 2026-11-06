import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Overview } from './Overview'

const withData = (name: string, currentGoal: string, targetRoles: string, over = {}) =>
  vi.mocked(window.skillpilot.getOverview).mockResolvedValue({
    ok: true,
    value: {
      name,
      currentGoal,
      targetRoles,
      progress: null,
      learning: [],
      nextDeadline: null,
      latestAchievement: null,
      ...over
    }
  })

describe('Overview', () => {
  it('shows every section with its empty state', async () => {
    render(<Overview />)
    for (const [title, empty] of [
      ['Current goal', 'No goal set yet'],
      ["Today's tasks", 'Nothing planned for today'],
      ['Learning now', 'No skills in progress'],
      ['Next deadline', 'No upcoming deadlines'],
      ['Latest achievement', 'Nothing yet']
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

  it('shows progress, learning, deadline and achievement', async () => {
    withData('Sam', 'Goal', '', {
      progress: 45,
      learning: ['React', 'SQL'],
      nextDeadline: { title: 'Apply', date: '2026-01-01', overdue: true },
      latestAchievement: 'Reached Step'
    })
    render(<Overview />)
    expect(await screen.findByText('React, SQL')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('45')
    expect(screen.getByText('Overall 45%')).toBeTruthy()
    expect(screen.getByText('Apply')).toBeTruthy()
    expect(screen.getByText('Overdue · 2026-01-01')).toBeTruthy()
    expect(screen.getByText('Reached Step')).toBeTruthy()
  })

  it('shows a deadline that is not overdue without a warning', async () => {
    withData('Sam', 'Goal', '', { nextDeadline: { title: 'Apply', date: '2099-01-01', overdue: false } })
    render(<Overview />)
    expect(await screen.findByText('2099-01-01')).toBeTruthy()
  })

  it('shows no progress bar until there is a measure', async () => {
    render(<Overview />)
    await screen.findByText('No goal set yet')
    expect(screen.queryByRole('progressbar')).toBeNull()
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
