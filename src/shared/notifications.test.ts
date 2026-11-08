import { describe, expect, it } from 'vitest'
import type { Learning } from './learning'
import { dueNotices, isQuietTime, type NoticeInput } from './notifications'
import type { Dashboard } from './progress'
import { defaultSettings } from './settings'

const today = '2026-11-06'

const dashboard = (over: Partial<Dashboard> = {}): Dashboard => ({
  overall: null,
  skills: [],
  goals: [],
  projects: [],
  deadlines: [],
  achievements: [],
  ...over
})

const learning = (over: Partial<Learning> = {}): Learning => ({
  streak: 0,
  minutesThisWeek: 0,
  weeklyTarget: 300,
  minutesThisMonth: 0,
  monthlyTarget: 1200,
  pace: 'none',
  todayTasks: [],
  plannedMinutesToday: 0,
  roadmaps: [],
  ...over
})

const input = (over: Partial<NoticeInput> = {}): NoticeInput => ({
  settings: { ...defaultSettings, notifyDailyLimit: '10' },
  today,
  time: '12:00',
  dashboard: dashboard(),
  learning: learning(),
  roles: [],
  recommendation: null,
  alreadySent: new Set(),
  sentToday: 0,
  lastWeek: { minutes: 0, tasks: 0 },
  reminders: [],
  ...over
})

const task = { id: 1, title: 'Read', minutes: 30, overdue: false }
const titles = (over: Partial<NoticeInput>) => dueNotices(input(over)).map((notice) => notice.title)

describe('isQuietTime', () => {
  it.each([
    ['23:00', true],
    ['02:00', true],
    ['07:59', true],
    ['08:00', false],
    ['21:59', false],
    ['22:00', true]
  ])('overnight quiet hours at %s is %s', (time, quiet) => {
    expect(isQuietTime(time, '22:00', '08:00')).toBe(quiet)
  })

  it('handles a daytime quiet period', () => {
    expect(isQuietTime('13:00', '12:00', '14:00')).toBe(true)
    expect(isQuietTime('14:00', '12:00', '14:00')).toBe(false)
  })

  it('treats equal times as no quiet hours', () => {
    expect(isQuietTime('03:00', '00:00', '00:00')).toBe(false)
  })
})

describe('dueNotices', () => {
  it('stays silent with nothing to say', () => {
    expect(dueNotices(input())).toEqual([])
  })

  it('warns of a deadline within three days, in plain words', () => {
    const body = (date: string) =>
      dueNotices(input({ dashboard: dashboard({ deadlines: [{ title: 'Apply', date, overdue: false }] }) }))[0]?.body
    expect(body(today)).toBe('Apply is due today.')
    expect(body('2026-11-07')).toBe('Apply is due tomorrow.')
    expect(body('2026-11-09')).toBe('Apply is due in 3 days.')
    expect(body('2026-11-10')).toBeUndefined()
  })

  it('does not nag about overdue deadlines', () => {
    const deadlines = [{ title: 'Late', date: '2026-11-01', overdue: true }]
    expect(titles({ dashboard: dashboard({ deadlines }) })).toEqual([])
  })

  it('mentions unfinished tasks only in the evening', () => {
    const tasks = learning({ todayTasks: [task] })
    expect(titles({ learning: tasks, time: '17:59' })).toEqual([])
    expect(dueNotices(input({ learning: tasks, time: '18:00' }))[0]?.body).toBe('You have 1 task left today.')
    const two = learning({ todayTasks: [task, { ...task, id: 2 }] })
    expect(dueNotices(input({ learning: two, time: '19:00' }))[0]?.body).toBe('You have 2 tasks left today.')
  })

  it('celebrates only what was achieved today', () => {
    const achievements = [
      { title: 'Reached Step', date: today },
      { title: 'Reached Old', date: '2026-10-01' }
    ]
    expect(dueNotices(input({ dashboard: dashboard({ achievements }) })).map((n) => n.body)).toEqual(['Reached Step.'])
  })

  it('mentions a slowdown', () => {
    expect(titles({ learning: learning({ pace: 'down' }) })).toEqual(['Your learning has slowed down'])
    expect(titles({ learning: learning({ pace: 'steady' }) })).toEqual([])
  })

  it('mentions a missing skill for a role', () => {
    const [notice] = dueNotices(input({ roles: [{ id: 1, title: 'Dev', gaps: ['CSS', 'Testing'] }] }))
    expect(notice?.body).toContain('CSS')
    expect(titles({ roles: [{ id: 1, title: 'Dev', gaps: [] }] })).toEqual([])
  })

  it('mentions a next step', () => {
    expect(dueNotices(input({ recommendation: 'Learn CSS' }))[0]?.body).toBe('Learn CSS')
  })

  it.each([
    ['notifyDeadlines', { dashboard: dashboard({ deadlines: [{ title: 'A', date: today, overdue: false }] }) }],
    ['notifyTasks', { learning: learning({ todayTasks: [task] }), time: '19:00' }],
    ['notifyMilestones', { dashboard: dashboard({ achievements: [{ title: 'A', date: today }] }) }],
    ['notifySlowdown', { learning: learning({ pace: 'down' as const }) }],
    ['notifyGaps', { roles: [{ id: 1, title: 'Dev', gaps: ['CSS'] }] }],
    ['notifyNextStep', { recommendation: 'Next' }]
  ])('%s can be turned off', (key, over) => {
    expect(dueNotices(input(over))).toHaveLength(1)
    const settings = { ...defaultSettings, notifyDailyLimit: '10', [key]: 'off' }
    expect(dueNotices(input({ ...over, settings }))).toEqual([])
  })

  it('sends a weekly summary on Monday morning only', () => {
    const lastWeek = { minutes: 90, tasks: 3 }
    expect(dueNotices(input({ lastWeek, today: '2026-11-09', time: '09:30' }))[0]?.body).toBe(
      'Last week you finished 3 tasks and learned for 90 minutes.'
    )
    expect(titles({ lastWeek, today: '2026-11-09', time: '08:59' })).toEqual([])
    expect(titles({ lastWeek, today: '2026-11-10', time: '09:30' })).toEqual([])
    expect(titles({ lastWeek: { minutes: 0, tasks: 0 }, today: '2026-11-09', time: '09:30' })).toEqual([])
    const off = { ...defaultSettings, notifyDailyLimit: '10', notifySummary: 'off' }
    expect(titles({ lastWeek, today: '2026-11-09', time: '09:30', settings: off })).toEqual([])
  })

  it('sends reminders even in quiet hours and past the limit, once each', () => {
    const reminders = [{ id: 4, title: 'Practise piano' }]
    const settings = { ...defaultSettings, notifyDailyLimit: '1' }
    expect(dueNotices(input({ reminders, time: '23:30', settings, sentToday: 5 }))).toEqual([
      { key: 'reminder:4:2026-11-06', title: 'Reminder', body: 'Practise piano' }
    ])
    expect(dueNotices(input({ reminders, alreadySent: new Set(['reminder:4:2026-11-06']) }))).toEqual([])
    const off = { ...defaultSettings, notifyDailyLimit: '10', notifyReminders: 'off' }
    expect(dueNotices(input({ reminders, settings: off }))).toEqual([])
  })

  it('stays quiet during quiet hours', () => {
    expect(titles({ recommendation: 'Next', time: '23:30' })).toEqual([])
  })

  it('never repeats a notification', () => {
    const [notice] = dueNotices(input({ recommendation: 'Next' }))
    expect(dueNotices(input({ recommendation: 'Next', alreadySent: new Set([notice!.key]) }))).toEqual([])
  })

  it('respects the daily limit, keeping the most important', () => {
    const over = {
      recommendation: 'Next',
      learning: learning({ pace: 'down' as const }),
      dashboard: dashboard({ deadlines: [{ title: 'A', date: today, overdue: false }] })
    }
    const settings = { ...defaultSettings, notifyDailyLimit: '3' }
    expect(titles({ ...over, settings, sentToday: 1 })).toEqual(['Upcoming deadline', 'Your learning has slowed down'])
    expect(titles({ ...over, settings, sentToday: 3 })).toEqual([])
  })

  it('repeats a weekly reminder only in a new week', () => {
    const roles = [{ id: 1, title: 'Dev', gaps: ['CSS'] }]
    const friday = dueNotices(input({ roles }))[0]?.key
    const sunday = dueNotices(input({ roles, today: '2026-11-08' }))[0]?.key
    const monday = dueNotices(input({ roles, today: '2026-11-09' }))[0]?.key
    expect(sunday).toBe(friday)
    expect(monday).not.toBe(friday)
  })
})
