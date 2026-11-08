import { describe, expect, it } from 'vitest'
import { improvedSkills, lastWeekSummary, monthReview, progressTrend, type Snapshot } from './history'
import type { TaskRow } from './learning'

// A Sunday.
const today = '2026-11-08'

const snap = (day: string, overall: number | null, skills: Snapshot['skills'] = {}): Snapshot => ({ day, overall, skills })

let nextId = 1
const done = (completedOn: string, minutes = 30, kind = 'learning'): TaskRow => ({
  id: nextId++,
  title: 'T',
  kind,
  dueDate: '',
  minutes,
  status: 'done',
  completedOn
})

const noRows = { milestones: [], goals: [], projects: [] }

describe('progressTrend', () => {
  it('keeps the last 90 days, in order, skipping days with no measure', () => {
    const points = progressTrend(
      [snap('2026-11-08', 50), snap('2026-08-10', 10), snap('2026-08-11', 12), snap('2026-11-01', null), snap('2026-10-01', 30)],
      today
    )
    expect(points).toEqual([
      { day: '2026-08-11', overall: 12 },
      { day: '2026-10-01', overall: 30 },
      { day: '2026-11-08', overall: 50 }
    ])
  })

  it('ignores anything after today', () => {
    expect(progressTrend([snap('2026-12-01', 10)], today)).toEqual([])
  })
})

describe('improvedSkills', () => {
  const current = [
    { name: 'React', demonstrated: 3 },
    { name: 'CSS', demonstrated: 1 },
    { name: 'New', demonstrated: 2 },
    { name: 'Same', demonstrated: 2 }
  ]
  const history = [
    snap('2026-10-20', 10, { React: [3, 1], CSS: [1, 1], Same: [2, 2] }),
    snap('2026-11-03', 20, { React: [3, 2], CSS: [1, 1], Same: [2, 2] })
  ]

  it('compares with the last snapshot before the day, biggest rise first', () => {
    expect(improvedSkills(history, current, '2026-11-01')).toEqual([
      { name: 'New', from: 0, to: 2 },
      { name: 'React', from: 1, to: 3 }
    ])
  })

  it('falls back to the oldest snapshot when none is older', () => {
    expect(improvedSkills(history, current, '2026-01-01')[1]).toEqual({ name: 'React', from: 1, to: 3 })
  })

  it('reports nothing without history', () => {
    expect(improvedSkills([], current, '2026-11-01')).toEqual([])
  })
})

describe('monthReview', () => {
  it('counts this month and last month, and the change in progress', () => {
    const review = monthReview(
      [snap('2026-10-31', 40, { React: [3, 1] })],
      {
        milestones: [
          { goalId: 1, projectId: null, title: 'A', dueDate: '', status: 'done', completedOn: '2026-11-02' },
          { goalId: 1, projectId: null, title: 'B', dueDate: '', status: 'done', completedOn: '2026-10-02' }
        ],
        goals: [{ id: 1, title: 'G', status: 'done', priority: 2, targetDate: '', completedOn: '2026-11-05' }],
        projects: [{ id: 1, name: 'P', status: 'complete', completedOn: '2026-11' }]
      },
      [done('2026-11-01', 40), done(today, 20), done('2026-10-15', 100), done('2026-11-02', 15, 'other')],
      [{ name: 'React', demonstrated: 2 }],
      55,
      today
    )
    expect(review).toEqual({
      month: '2026-11',
      minutes: 60,
      previousMinutes: 100,
      tasksDone: 3,
      achievements: 3,
      improved: [{ name: 'React', from: 1, to: 2 }],
      overallChange: 15
    })
  })

  it('has no change in progress without earlier history', () => {
    expect(monthReview([snap(today, 50)], noRows, [], [], 50, today).overallChange).toBeNull()
    expect(monthReview([], noRows, [], [], 50, today).overallChange).toBeNull()
  })

  it('works out the previous month across a year end', () => {
    const review = monthReview([], noRows, [done('2025-12-20', 70)], [], null, '2026-01-10')
    expect(review.previousMinutes).toBe(70)
  })
})

describe('lastWeekSummary', () => {
  it('covers Monday to Sunday of the previous week', () => {
    // Today is Sunday 8 November, so last week is 26 October to 1 November.
    const summary = lastWeekSummary(
      [done('2026-10-26', 20), done('2026-11-01', 30), done('2026-10-25', 99), done('2026-11-02', 99), done('2026-10-28', 10, 'other')],
      today
    )
    expect(summary).toEqual({ minutes: 50, tasks: 3 })
  })

  it('treats Monday as the start of a new week', () => {
    expect(lastWeekSummary([done('2026-11-08', 20)], '2026-11-09')).toEqual({ minutes: 20, tasks: 1 })
  })
})
