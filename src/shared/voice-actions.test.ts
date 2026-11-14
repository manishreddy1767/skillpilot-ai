import { describe, expect, it, vi } from 'vitest'
import type { StoredRecord } from './career'
import { carryOut, dayName, isDataIntent, localToday, type VoiceApi } from './voice-actions'

const today = '2026-11-08'
const task = (id: number, title: string, extra: Record<string, string> = {}): StoredRecord => ({
  id,
  values: { title, status: 'open', ...extra }
})

function fakeApi(records: StoredRecord[] = []) {
  const api = {
    listRecords: vi.fn(() => Promise.resolve({ ok: true as const, value: records })),
    saveRecord: vi.fn((_kind: string, _id: null, values: Record<string, string>) =>
      Promise.resolve({ ok: true as const, value: { id: 1, values } })
    ),
    completeTask: vi.fn(() => Promise.resolve({ ok: true as const, value: true }))
  }
  return api as typeof api & VoiceApi
}

describe('dates', () => {
  it('uses the laptop clock, not UTC', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('names the day plainly', () => {
    expect(dayName(today, today)).toBe('today')
    expect(dayName('2026-11-09', today)).toBe('tomorrow')
    expect(dayName('2026-11-13', today)).toBe('Friday 13 November')
  })
})

describe('isDataIntent', () => {
  it('is true only for changes to career data', () => {
    expect(isDataIntent({ kind: 'addSkill', name: 'Go' })).toBe(true)
    expect(isDataIntent({ kind: 'whatsDue' })).toBe(true)
    expect(isDataIntent({ kind: 'open', target: 'chrome' })).toBe(false)
    expect(isDataIntent({ kind: 'navigate', section: 'tasks', label: 'Tasks' })).toBe(false)
  })
})

describe('carryOut', () => {
  it('adds a task for the spoken day and says which day', async () => {
    const api = fakeApi()
    await expect(carryOut({ kind: 'addTask', title: 'Read', dueDate: '2026-11-09' }, api, today)).resolves.toBe(
      'Added the task "Read" for tomorrow.'
    )
    expect(api.saveRecord).toHaveBeenCalledWith('task', null, { title: 'Read', dueDate: '2026-11-09' })
  })

  it('reports a save that failed', async () => {
    const api = fakeApi()
    api.saveRecord.mockResolvedValueOnce({ ok: false, message: 'Disk full.' } as never)
    await expect(carryOut({ kind: 'addTask', title: 'Read', dueDate: today }, api, today)).resolves.toBe('Disk full.')
  })

  it('works with results returned directly, as the main process gives them', async () => {
    const api: VoiceApi = {
      listRecords: () => ({ ok: true, value: [] }),
      saveRecord: (_kind, _id, values) => ({ ok: true, value: { id: 1, values } }),
      completeTask: () => ({ ok: true, value: true })
    }
    await expect(carryOut({ kind: 'addSkill', name: 'Go' }, api, today)).resolves.toBe('Added Go to your skills.')
  })

  it('adds a skill or goal once, never a duplicate', async () => {
    const api = fakeApi()
    await expect(carryOut({ kind: 'addSkill', name: 'Docker' }, api, today)).resolves.toBe('Added Docker to your skills.')
    api.listRecords.mockResolvedValueOnce({ ok: true, value: [{ id: 1, values: { name: 'docker' } }] })
    await expect(carryOut({ kind: 'addSkill', name: 'Docker' }, api, today)).resolves.toContain('already')
    await expect(carryOut({ kind: 'addGoal', title: 'Get hired' }, api, today)).resolves.toBe('Added the goal "Get hired".')
    expect(api.saveRecord).toHaveBeenCalledTimes(2)
  })

  it('ticks off the one matching open task', async () => {
    const api = fakeApi([task(1, 'Read chapter four', { status: 'done' }), task(2, 'Read chapter four again'), task(3, 'Practise SQL')])
    await expect(carryOut({ kind: 'completeTask', query: 'practise sql' }, api, today)).resolves.toBe('Marked "Practise SQL" as done.')
    expect(api.completeTask).toHaveBeenCalledExactlyOnceWith(3)
  })

  it('ticks nothing off when it is unsure', async () => {
    const api = fakeApi([task(1, 'Read chapter four'), task(2, 'Read the guide')])
    await expect(carryOut({ kind: 'completeTask', query: 'read' }, api, today)).resolves.toContain('nothing was ticked off')
    expect(api.completeTask).not.toHaveBeenCalled()
  })

  it('lists what is due today and overdue, but not later or finished tasks', async () => {
    const api = fakeApi([
      task(1, 'Overdue', { dueDate: '2026-11-01' }),
      task(2, 'Today', { dueDate: today }),
      task(3, 'Later', { dueDate: '2026-11-20' }),
      task(4, 'Finished', { dueDate: today, status: 'done' }),
      task(5, 'Undated')
    ])
    await expect(carryOut({ kind: 'whatsDue' }, api, today)).resolves.toBe('Due today: Overdue, Today.')
    await expect(carryOut({ kind: 'whatsDue' }, fakeApi(), today)).resolves.toBe('Nothing is due today.')
  })
})
