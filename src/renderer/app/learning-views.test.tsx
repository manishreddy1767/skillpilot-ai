import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Learning, RoadmapSummary } from '../../shared/learning'
import { DashboardView } from './DashboardView'
import { RoadmapsView } from './RoadmapsView'
import { TasksView } from './TasksView'

const api = () => vi.mocked(window.skillpilot)

const roadmap = (over: Partial<RoadmapSummary> = {}): RoadmapSummary => ({
  id: 2,
  title: 'Path',
  done: 1,
  total: 4,
  percent: 25,
  next: 'CSS layout',
  currentWeek: 5,
  weeksBehind: 2,
  nextWeek: 3,
  hoursLeft: 12,
  ...over
})

const learning = (over: Partial<Learning> = {}): Learning => ({
  streak: 4,
  minutesThisWeek: 150,
  weeklyTarget: 300,
  minutesThisMonth: 600,
  monthlyTarget: 1200,
  pace: 'steady',
  todayTasks: [{ id: 7, title: 'Read chapter', minutes: 30, overdue: true }],
  plannedMinutesToday: 30,
  roadmaps: [],
  ...over
})

const withLearning = (value = learning()) => api().getLearning.mockResolvedValue({ ok: true, value })

describe('TasksView', () => {
  it('shows the streak, weekly progress, and today', async () => {
    withLearning()
    render(<TasksView />)
    expect(await screen.findByText('4 days')).toBeTruthy()
    expect(screen.getByText('150 of 300 min')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Weekly target' }).getAttribute('aria-valuenow')).toBe('50')
    expect(screen.getByText('Overdue · 30 min')).toBeTruthy()
    expect(screen.getByText('30 minutes planned')).toBeTruthy()
  })

  it('shows progress against the monthly target', async () => {
    withLearning()
    render(<TasksView />)
    expect(await screen.findByText('600 of 1200 min')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Monthly target' }).getAttribute('aria-valuenow')).toBe('50')
  })

  it('uses the singular for a one day streak', async () => {
    withLearning(learning({ streak: 1 }))
    render(<TasksView />)
    expect(await screen.findByText('1 day')).toBeTruthy()
  })

  it('caps the weekly meter at 100', async () => {
    withLearning(learning({ minutesThisWeek: 900 }))
    render(<TasksView />)
    await waitFor(() =>
      expect(screen.getByRole('progressbar', { name: 'Weekly target' }).getAttribute('aria-valuenow')).toBe('100')
    )
  })

  it('says when nothing is due', async () => {
    withLearning(learning({ todayTasks: [] }))
    render(<TasksView />)
    expect(await screen.findByText('Nothing is due today.')).toBeTruthy()
  })

  it('completes a task and refreshes', async () => {
    withLearning()
    render(<TasksView />)
    const calls = () => api().getLearning.mock.calls.length
    fireEvent.click(await screen.findByLabelText('Read chapter'))
    const before = calls()
    await waitFor(() => expect(api().completeTask).toHaveBeenCalledWith(7))
    await waitFor(() => expect(calls()).toBeGreaterThanOrEqual(before))
  })

  it('asks the AI for tasks and shows failures', async () => {
    withLearning()
    api().getAiStatus.mockResolvedValue({ ok: true, value: { provider: 'claude', model: 'm', hasKey: true, blocked: '' } })
    api().suggestTasks.mockResolvedValue({ ok: false, message: 'Rate limited.' })
    render(<TasksView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest tasks for today' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Rate limited.')
  })

  it('disables suggestions when AI is unavailable', async () => {
    withLearning()
    api().getAiStatus.mockResolvedValue({
      ok: true,
      value: { provider: 'off', model: '', hasKey: false, blocked: 'AI is off. Choose a provider in Settings.' }
    })
    render(<TasksView />)
    await screen.findByText('AI is off. Choose a provider in Settings.')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Suggest tasks for today' }).disabled).toBe(true)
  })

  it('shows a message if data is unavailable', async () => {
    api().getLearning.mockResolvedValue({ ok: false, message: 'Could not open.' })
    render(<TasksView />)
    expect((await screen.findByRole('alert')).textContent).toBe('Could not open.')
  })
})

describe('RoadmapsView progress', () => {
  const open = async (summary: RoadmapSummary) => {
    withLearning(learning({ roadmaps: [summary] }))
    api().listRecords.mockImplementation((kind) =>
      Promise.resolve({ ok: true, value: kind === 'roadmap' ? [{ id: 2, values: { title: 'Path', startDate: '' } }] : [] })
    )
    render(<RoadmapsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Details for Path' }))
  }

  it('shows progress, next topic, and time left', async () => {
    await open(roadmap())
    expect(await screen.findByText('1 of 4 topics · 12 hours left')).toBeTruthy()
    expect(screen.getByText('Next: CSS layout')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Path progress' }).getAttribute('aria-valuenow')).toBe('25')
  })

  it('offers to catch up when behind', async () => {
    await open(roadmap())
    expect(await screen.findByText('2 weeks behind')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Move remaining topics to start this week' }))
    await waitFor(() => expect(api().rescheduleRoadmap).toHaveBeenCalledWith(2))
  })

  it('offers to start a roadmap with no start date', async () => {
    await open(roadmap({ currentWeek: null, weeksBehind: 0 }))
    expect(await screen.findByRole('button', { name: 'Start this week' })).toBeTruthy()
  })

  it('offers nothing when on track', async () => {
    await open(roadmap({ weeksBehind: 0 }))
    await screen.findByText('Next: CSS layout')
    expect(screen.queryByRole('button', { name: 'Move remaining topics to start this week' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start this week' })).toBeNull()
  })

  it('offers nothing when finished', async () => {
    await open(roadmap({ next: null, nextWeek: null, currentWeek: null, done: 4, percent: 100 }))
    await screen.findByText(/4 of 4 topics/)
    expect(screen.queryByRole('button', { name: 'Start this week' })).toBeNull()
  })
})

describe('DashboardView learning', () => {
  it('shows the streak, week, tasks, roadmaps and recommendation', async () => {
    withLearning(learning({ roadmaps: [roadmap()], pace: 'down' }))
    api().getRecommendation.mockResolvedValue({ ok: true, value: 'Learn CSS layout' })
    api().getRoleReadiness.mockResolvedValue({
      ok: true,
      value: [{ id: 1, title: 'Frontend Dev', readiness: 40, gaps: ['CSS', 'Testing'] }]
    })
    render(<DashboardView />)
    expect(await screen.findByText('4 days')).toBeTruthy()
    expect(screen.getByText('Recommended next')).toBeTruthy()
    expect(await screen.findByText('Learn CSS layout')).toBeTruthy()
    expect(screen.getByText('Read chapter')).toBeTruthy()
    expect(screen.getByText('Next: CSS layout')).toBeTruthy()
    expect(screen.getByText('Your pace has slowed compared with the previous two weeks.')).toBeTruthy()
    expect(await screen.findByText('Gaps: CSS, Testing')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Frontend Dev readiness' })).toBeTruthy()
  })

  it('leaves out role readiness when no requirements exist', async () => {
    withLearning()
    api().getRoleReadiness.mockResolvedValue({ ok: true, value: [{ id: 1, title: 'Dev', readiness: null, gaps: [] }] })
    render(<DashboardView />)
    await screen.findByText('4 days')
    expect(screen.queryByRole('progressbar', { name: 'Dev readiness' })).toBeNull()
  })
})
