import { describe, expect, it } from 'vitest'
import {
  addDays,
  buildLearning,
  dueReminders,
  catchUpStart,
  daysBetween,
  learningPace,
  learningStreak,
  summariseRoadmap,
  type TaskRow
} from './learning'

// A Friday.
const today = '2026-11-06'

let nextId = 1
const task = (over: Partial<TaskRow> = {}): TaskRow => ({
  id: nextId++,
  title: 'Task',
  kind: 'learning',
  dueDate: '',
  minutes: 30,
  status: 'open',
  completedOn: '',
  ...over
})
const done = (completedOn: string, over: Partial<TaskRow> = {}) => task({ status: 'done', completedOn, ...over })

describe('dates', () => {
  it('adds days across a month end and a leap day', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('counts days between', () => {
    expect(daysBetween('2026-11-01', today)).toBe(5)
    expect(daysBetween(today, '2026-11-01')).toBe(-5)
  })
})

describe('learningStreak', () => {
  it('is zero with nothing done', () => {
    expect(learningStreak([], today)).toBe(0)
  })

  it('counts consecutive days ending today', () => {
    expect(learningStreak([done(today), done('2026-11-05'), done('2026-11-04')], today)).toBe(3)
  })

  it('stays alive until today is over', () => {
    expect(learningStreak([done('2026-11-05'), done('2026-11-04')], today)).toBe(2)
  })

  it('is broken by a missed day', () => {
    expect(learningStreak([done(today), done('2026-11-04')], today)).toBe(1)
    expect(learningStreak([done('2026-11-04')], today)).toBe(0)
  })

  it('counts a day once, however many tasks', () => {
    expect(learningStreak([done(today), done(today)], today)).toBe(1)
  })

  it('does not count "other" tasks', () => {
    expect(learningStreak([done(today, { kind: 'other' })], today)).toBe(0)
  })
})

describe('learningPace', () => {
  it('is none with no activity', () => {
    expect(learningPace([], today)).toBe('none')
  })

  it('is up when more was done lately', () => {
    expect(learningPace([done(today, { minutes: 200 }), done('2026-10-20', { minutes: 100 })], today)).toBe('up')
  })

  it('is down when less was done lately', () => {
    expect(learningPace([done(today, { minutes: 50 }), done('2026-10-20', { minutes: 100 })], today)).toBe('down')
  })

  it('is steady when similar', () => {
    expect(learningPace([done(today, { minutes: 100 }), done('2026-10-20', { minutes: 100 })], today)).toBe('steady')
  })

  it('splits the periods at 14 days', () => {
    expect(learningPace([done('2026-10-24', { minutes: 100 })], today)).toBe('up')
    expect(learningPace([done('2026-10-23', { minutes: 100 })], today)).toBe('down')
  })

  it('ignores anything older than four weeks', () => {
    expect(learningPace([done('2026-09-01', { minutes: 100 })], today)).toBe('none')
  })
})

describe('summariseRoadmap', () => {
  const item = (week: number, status = 'open', effortHours = 5) => ({
    roadmapId: 1,
    title: `Week ${week}`,
    week,
    effortHours,
    status
  })
  const roadmap = (startDate: string) => ({ id: 1, title: 'Path', startDate })

  it('handles an empty roadmap', () => {
    expect(summariseRoadmap(roadmap(''), [], today)).toMatchObject({
      done: 0,
      total: 0,
      percent: 0,
      next: null,
      currentWeek: null,
      weeksBehind: 0
    })
  })

  it('reports progress, next topic, and hours left', () => {
    expect(summariseRoadmap(roadmap(''), [item(2), item(1, 'done'), item(3)], today)).toMatchObject({
      done: 1,
      total: 3,
      percent: 33,
      next: 'Week 2',
      hoursLeft: 10
    })
  })

  it('ignores items from other roadmaps', () => {
    expect(summariseRoadmap(roadmap(''), [{ ...item(1), roadmapId: 2 }], today).total).toBe(0)
  })

  it('works out the current week', () => {
    expect(summariseRoadmap(roadmap(today), [item(1)], today).currentWeek).toBe(1)
    expect(summariseRoadmap(roadmap('2026-10-30'), [item(1)], today).currentWeek).toBe(2)
  })

  it('has no current week before the start date', () => {
    expect(summariseRoadmap(roadmap('2027-01-01'), [item(1)], today)).toMatchObject({ currentWeek: null, weeksBehind: 0 })
  })

  it('reports how far behind the next topic is', () => {
    expect(summariseRoadmap(roadmap('2026-10-16'), [item(1)], today)).toMatchObject({ currentWeek: 4, weeksBehind: 3 })
  })

  it('is not behind when ahead, or when finished', () => {
    expect(summariseRoadmap(roadmap(today), [item(5)], today).weeksBehind).toBe(0)
    expect(summariseRoadmap(roadmap('2026-01-01'), [item(1, 'done')], today).weeksBehind).toBe(0)
  })
})

describe('catchUpStart', () => {
  it('puts the next topic in the current week', () => {
    const start = catchUpStart(3, today)
    const summary = summariseRoadmap({ id: 1, title: 'P', startDate: start }, [{ roadmapId: 1, title: 'T', week: 3, effortHours: 1, status: 'open' }], today)
    expect(summary).toMatchObject({ currentWeek: 3, weeksBehind: 0 })
  })
})

describe('dueReminders', () => {
  it('returns open tasks due today whose time has come', () => {
    const tasks = [
      task({ title: 'Now', dueDate: today, remindAt: '09:00' }),
      task({ title: 'Later', dueDate: today, remindAt: '18:00' }),
      task({ title: 'Tomorrow', dueDate: '2026-11-07', remindAt: '09:00' }),
      task({ title: 'No time', dueDate: today }),
      done(today, { title: 'Finished', dueDate: today, remindAt: '08:00' })
    ]
    expect(dueReminders(tasks, today, '12:00').map((t) => t.title)).toEqual(['Now'])
  })
})

describe('buildLearning', () => {
  it('lists open tasks due today or earlier, oldest first', () => {
    const { todayTasks, plannedMinutesToday } = buildLearning(
      {
        tasks: [
          task({ title: 'Today', dueDate: today, minutes: 20 }),
          task({ title: 'Late', dueDate: '2026-11-01', minutes: 10 }),
          task({ title: 'Future', dueDate: '2026-12-01' }),
          task({ title: 'Undated' }),
          done(today, { title: 'Finished', dueDate: today })
        ],
        roadmaps: [],
        items: []
      },
      today,
      300
    )
    expect(todayTasks.map((t) => [t.title, t.overdue])).toEqual([
      ['Late', true],
      ['Today', false]
    ])
    expect(plannedMinutesToday).toBe(30)
  })

  it('counts minutes from Monday, and keeps the target', () => {
    const { minutesThisWeek, weeklyTarget } = buildLearning(
      {
        tasks: [
          done('2026-11-02', { minutes: 40 }),
          done(today, { minutes: 20 }),
          done('2026-11-01', { minutes: 100 }),
          done(today, { minutes: 15, kind: 'other' })
        ],
        roadmaps: [],
        items: []
      },
      today,
      300
    )
    expect(minutesThisWeek).toBe(60)
    expect(weeklyTarget).toBe(300)
  })

  it('counts minutes this month against the monthly target', () => {
    const { minutesThisMonth, monthlyTarget } = buildLearning(
      { tasks: [done('2026-11-01', { minutes: 40 }), done('2026-10-31', { minutes: 99 })], roadmaps: [], items: [] },
      today,
      300,
      1200
    )
    expect([minutesThisMonth, monthlyTarget]).toEqual([40, 1200])
  })

  it('treats a Sunday as the end of the same week', () => {
    const { minutesThisWeek } = buildLearning(
      { tasks: [done('2026-11-02', { minutes: 40 })], roadmaps: [], items: [] },
      '2026-11-08',
      300
    )
    expect(minutesThisWeek).toBe(40)
  })
})
