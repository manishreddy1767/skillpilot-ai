import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CareerStore } from './db/career-store'
import { migrate } from './db/migrations'
import { createDataHandlers } from './data-handlers'

const open: DatabaseSync[] = []

function setup() {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, () => undefined)
  const store = new CareerStore(db)
  const notifyOverview = vi.fn()
  const logError = vi.fn()
  const today = () => '2026-11-06'
  return { db, store, notifyOverview, logError, h: createDataHandlers({ getStore: () => store, notifyOverview, logError, today }) }
}

afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
})

const education = { institution: 'Uni', qualification: 'BSc' }

describe('profile handlers', () => {
  it('saves valid input and tells the overview', () => {
    const { h, notifyOverview } = setup()
    const result = h.saveProfile({ fullName: ' Sam Doe ', currentGoal: 'Ship' })
    expect(result).toMatchObject({ ok: true, value: { fullName: 'Sam Doe', currentGoal: 'Ship' } })
    expect(notifyOverview).toHaveBeenCalledOnce()
  })

  it('rejects invalid input, field by field, and saves nothing', () => {
    const { h, notifyOverview } = setup()
    const result = h.saveProfile({ fullName: '', email: 'nope' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors ?? {}).sort()).toEqual(['email', 'fullName'])
    expect(notifyOverview).not.toHaveBeenCalled()
    expect(h.getProfile()).toMatchObject({ ok: true, value: { email: '' } })
  })

  it('reads the overview', () => {
    const { h } = setup()
    h.saveProfile({ fullName: 'Sam', currentGoal: 'Ship', targetRoles: 'Dev' })
    expect(h.getOverview()).toEqual({
      ok: true,
      value: {
        name: 'Sam',
        currentGoal: 'Ship',
        targetRoles: 'Dev',
        progress: null,
        learning: [],
        nextDeadline: null,
        latestAchievement: null,
        tasks: [],
        streak: 0,
        recommendation: null
      }
    })
  })
})

describe('record handlers', () => {
  it('adds, updates, lists and deletes', () => {
    const { h } = setup()
    const added = h.saveRecord('education', null, education)
    if (!added.ok) throw new Error('not saved')
    h.saveRecord('education', added.value.id, { ...education, institution: 'New' })
    expect(h.listRecords('education')).toMatchObject({
      ok: true,
      value: [{ id: added.value.id, values: { institution: 'New' } }]
    })
    expect(h.deleteRecord('education', added.value.id)).toEqual({ ok: true, value: true })
    expect(h.listRecords('education')).toEqual({ ok: true, value: [] })
  })

  it('rejects invalid fields', () => {
    const result = setup().h.saveRecord('education', null, { institution: 'Uni' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toHaveProperty('qualification')
  })

  it('says when an updated record no longer exists', () => {
    expect(setup().h.saveRecord('education', 99, education)).toMatchObject({
      ok: false,
      message: 'That record no longer exists.'
    })
  })

  it.each(['profile', 'sqlite_master', '', null, 1])('rejects the kind %s', (kind) => {
    const { h } = setup()
    const refused = { ok: false, message: 'Unknown record type.' }
    expect(h.listRecords(kind)).toEqual(refused)
    expect(h.saveRecord(kind, null, education)).toEqual(refused)
    expect(h.deleteRecord(kind, 1)).toEqual(refused)
  })

  it.each(['1', 0, -1, 1.5, Number.NaN, {}, undefined])('rejects the id %s', (id) => {
    const { h } = setup()
    expect(h.saveRecord('education', id, education).ok).toBe(false)
    expect(h.deleteRecord('education', id).ok).toBe(false)
  })
})

describe('skills, goals and projects', () => {
  const addSkill = (h: ReturnType<typeof setup>['h'], name: string, claimedLevel = '2') => {
    const result = h.saveRecord('skill', null, { name, claimedLevel })
    if (!result.ok) throw new Error(result.message)
    return result.value.id
  }
  const addGoal = (h: ReturnType<typeof setup>['h'], title: string, over = {}) => {
    const result = h.saveRecord('goal', null, { title, ...over })
    if (!result.ok) throw new Error(result.message)
    return result.value.id
  }
  const addProject = (h: ReturnType<typeof setup>['h'], name: string, status: string) => {
    const result = h.saveRecord('project', null, { name, status })
    if (!result.ok) throw new Error(result.message)
    return result.value.id
  }
  const dashboard = (h: ReturnType<typeof setup>['h']) => {
    const result = h.getDashboard()
    if (!result.ok) throw new Error(result.message)
    return result.value
  }

  it('refuses a duplicate skill name, ignoring case, on the name field', () => {
    const { h, logError } = setup()
    addSkill(h, 'React')
    const result = h.saveRecord('skill', null, { name: 'react' })
    expect(result).toMatchObject({ ok: false, errors: { name: expect.stringContaining('already have') } })
    expect(logError).not.toHaveBeenCalled()
  })

  it('tells the overview about every kind of change', () => {
    const { h, notifyOverview } = setup()
    const skill = addSkill(h, 'React')
    const goal = addGoal(h, 'Ship')
    h.setLink('goalSkill', goal, skill, true, 3)
    h.deleteRecord('goal', goal)
    expect(notifyOverview).toHaveBeenCalledTimes(4)
  })

  it('evidence needs a parent skill, and raises the demonstrated level', () => {
    const { h } = setup()
    const skill = addSkill(h, 'React', '4')
    expect(h.saveRecord('evidence', null, { description: 'x' }).ok).toBe(false)
    h.saveRecord('evidence', null, { description: 'Built an app', strength: '3' }, skill)
    expect(dashboard(h).skills[0]).toMatchObject({ claimed: 4, demonstrated: 2, proof: 'partly' })
    expect(h.listRecords('evidence', skill)).toMatchObject({ ok: true, value: [{ values: { description: 'Built an app' } }] })
  })

  it('child records are only reachable through their own parent', () => {
    const { h } = setup()
    const first = addSkill(h, 'React')
    const second = addSkill(h, 'SQL')
    const saved = h.saveRecord('evidence', null, { description: 'mine' }, first)
    if (!saved.ok) throw new Error('not saved')
    expect(h.listRecords('evidence', second)).toEqual({ ok: true, value: [] })
    expect(h.saveRecord('evidence', saved.value.id, { description: 'stolen' }, second).ok).toBe(false)
    expect(h.deleteRecord('evidence', saved.value.id, second)).toEqual({ ok: true, value: false })
  })

  it('a parent id on a top-level kind is refused', () => {
    expect(setup().h.listRecords('skill', 1).ok).toBe(false)
  })

  it('a child of a missing parent fails safely', () => {
    const { h, logError } = setup()
    expect(h.saveRecord('evidence', null, { description: 'x' }, 999).ok).toBe(false)
    expect(logError).toHaveBeenCalledOnce()
  })

  it('a completed project proves every linked skill', () => {
    const { h } = setup()
    const skills = ['React', 'Python', 'PostgreSQL'].map((name) => addSkill(h, name, '0'))
    const project = addProject(h, 'App', 'complete')
    for (const skill of skills) h.setLink('projectSkill', project, skill, true)
    expect(dashboard(h).skills.map((s) => s.demonstrated)).toEqual([2, 2, 2])
    h.setLink('projectSkill', project, skills[0]!, false)
    expect(dashboard(h).skills.find((s) => s.name === 'React')?.demonstrated).toBe(0)
  })

  it('certifications and work experience count as evidence, and go when deleted', () => {
    const { h } = setup()
    const skill = addSkill(h, 'SQL', '0')
    const cert = h.saveRecord('certification', null, { name: 'DB Cert' })
    const work = h.saveRecord('work', null, { company: 'Co', role: 'Analyst' })
    if (!cert.ok || !work.ok) throw new Error('not saved')
    h.setLink('certificationSkill', cert.value.id, skill, true)
    h.setLink('workSkill', work.value.id, skill, true)
    expect(dashboard(h).skills[0]).toMatchObject({ demonstrated: 3, evidenceCount: 2 })
    h.deleteRecord('work', work.value.id)
    expect(dashboard(h).skills[0]).toMatchObject({ demonstrated: 2, evidenceCount: 1 })
    expect(h.listLinks('certificationSkill', cert.value.id)).toEqual({ ok: true, value: [{ id: skill, level: null }] })
  })

  it('links are kept, updated, and removed', () => {
    const { h } = setup()
    const goal = addGoal(h, 'Ship')
    const skill = addSkill(h, 'React')
    h.setLink('goalSkill', goal, skill, true, 2)
    h.setLink('goalSkill', goal, skill, true, 4)
    expect(h.listLinks('goalSkill', goal)).toEqual({ ok: true, value: [{ id: skill, level: 4 }] })
    h.setLink('goalSkill', goal, skill, false)
    expect(h.listLinks('goalSkill', goal)).toEqual({ ok: true, value: [] })
  })

  it('linking twice is harmless', () => {
    const { h } = setup()
    const goal = addGoal(h, 'Ship')
    const project = addProject(h, 'App', 'active')
    h.setLink('goalProject', goal, project, true)
    h.setLink('goalProject', goal, project, true)
    expect(h.listLinks('goalProject', goal)).toEqual({ ok: true, value: [{ id: project, level: null }] })
  })

  it.each([
    ['kind', 'skill', 1, 1, true, undefined],
    ['parent', 'goalSkill', 'x', 1, true, undefined],
    ['child', 'goalSkill', 1, 0, true, undefined],
    ['flag', 'goalSkill', 1, 1, 'yes', undefined],
    ['level', 'goalSkill', 1, 1, true, 6]
  ])('refuses a link with a bad %s', (_name, kind, parent, child, linked, level) => {
    expect(setup().h.setLink(kind, parent, child, linked, level).ok).toBe(false)
  })

  it('refuses to list links for a bad parent', () => {
    expect(setup().h.listLinks('goalSkill', 'x').ok).toBe(false)
  })

  it('keeps level history as levels change', () => {
    const { h } = setup()
    const id = addSkill(h, 'React', '1')
    h.saveRecord('skill', id, { name: 'React', claimedLevel: '3' })
    h.saveRecord('skill', id, { name: 'React', claimedLevel: '3', notes: 'same level' })
    h.saveRecord('skill', id, { name: 'React', claimedLevel: '4' })
    expect(dashboard(h).skills[0]?.history).toEqual([1, 3, 4])
  })

  it('stamps completion dates, and clears them when reopened', () => {
    const { h } = setup()
    const goal = addGoal(h, 'Ship')
    const saved = h.saveRecord('goalMilestone', null, { title: 'First step' }, goal)
    if (!saved.ok) throw new Error('not saved')
    h.saveRecord('goalMilestone', saved.value.id, { title: 'First step', status: 'done' }, goal)
    expect(dashboard(h).achievements[0]?.title).toBe('Reached First step')
    h.saveRecord('goalMilestone', saved.value.id, { title: 'First step', status: 'open' }, goal)
    expect(dashboard(h).achievements).toEqual([])
  })

  it('stamps goals and milestones that are created already done', () => {
    const { h } = setup()
    const goal = addGoal(h, 'Done goal', { status: 'done' })
    h.saveRecord('goalMilestone', null, { title: 'Done step', status: 'done' }, goal)
    expect(dashboard(h).achievements.map((a) => a.title).sort()).toEqual(['Achieved Done goal', 'Reached Done step'])
  })

  it('reopening a goal removes its achievement', () => {
    const { h } = setup()
    const goal = addGoal(h, 'Ship', { status: 'done' })
    h.saveRecord('goal', goal, { title: 'Ship', status: 'active' })
    expect(dashboard(h).achievements).toEqual([])
  })

  it('deleting a skill removes its evidence and links', () => {
    const { h, db } = setup()
    const skill = addSkill(h, 'React')
    const goal = addGoal(h, 'Ship')
    h.saveRecord('evidence', null, { description: 'x' }, skill)
    h.setLink('goalSkill', goal, skill, true, 3)
    h.deleteRecord('skill', skill)
    expect(db.prepare('SELECT count(*) AS n FROM evidence').get()).toEqual({ n: 0 })
    expect(h.listLinks('goalSkill', goal)).toEqual({ ok: true, value: [] })
  })

  it('deleting a goal removes its milestones, but not its skills', () => {
    const { h, db } = setup()
    const goal = addGoal(h, 'Ship')
    addSkill(h, 'React')
    h.saveRecord('goalMilestone', null, { title: 'Step' }, goal)
    h.deleteRecord('goal', goal)
    expect(db.prepare('SELECT count(*) AS n FROM milestone').get()).toEqual({ n: 0 })
    expect(dashboard(h).skills).toHaveLength(1)
  })

  it('the overview gathers learning, deadline, achievement and progress', () => {
    const { h } = setup()
    addSkill(h, 'React')
    const goal = addGoal(h, 'Become a developer', { targetDate: '2027-01-01' })
    h.saveRecord('goalMilestone', null, { title: 'Done step', status: 'done' }, goal)
    h.saveRecord('goalMilestone', null, { title: 'Next step', dueDate: '2026-12-01' }, goal)
    expect(h.getOverview()).toMatchObject({
      ok: true,
      value: {
        currentGoal: 'Become a developer',
        progress: 50,
        learning: ['React'],
        nextDeadline: { title: 'Next step', date: '2026-12-01', overdue: false },
        latestAchievement: 'Reached Done step'
      }
    })
  })

  it('the goal typed in the profile takes priority in the overview', () => {
    const { h } = setup()
    addGoal(h, 'From goals')
    h.saveProfile({ fullName: 'Sam', currentGoal: 'From profile' })
    expect(h.getOverview()).toMatchObject({ value: { currentGoal: 'From profile' } })
  })
})

describe('learning', () => {
  it('reports the weekly target and tasks due', () => {
    const { store, notifyOverview, logError } = setup()
    const h = createDataHandlers({
      getStore: () => store,
      notifyOverview,
      logError,
      today: () => '2026-11-06',
      weeklyTarget: () => 300
    })
    h.saveRecord('task', null, { title: 'Read', dueDate: '2026-11-06' })
    expect(h.getLearning()).toMatchObject({ ok: true, value: { weeklyTarget: 300, todayTasks: [{ title: 'Read' }] } })
  })

  it('completes a task and tells the overview', () => {
    const { h, notifyOverview } = setup()
    const saved = h.saveRecord('task', null, { title: 'Read', dueDate: '2026-11-06' })
    if (!saved.ok) throw new Error('not saved')
    notifyOverview.mockClear()
    expect(h.completeTask(saved.value.id)).toEqual({ ok: true, value: true })
    expect(notifyOverview).toHaveBeenCalledOnce()
    expect(h.getOverview()).toMatchObject({ value: { tasks: [] } })
  })

  it.each(['1', 0, null])('refuses the task %s', (id) => {
    expect(setup().h.completeTask(id).ok).toBe(false)
  })

  it('catches a roadmap up so the next topic is this week', () => {
    const { h } = setup()
    const roadmap = h.saveRecord('roadmap', null, { title: 'Path', startDate: '2020-01-06' })
    if (!roadmap.ok) throw new Error('not saved')
    h.saveRecord('roadmapItem', null, { title: 'Topic', week: '3' }, roadmap.value.id)
    expect(h.getLearning()).toMatchObject({ value: { roadmaps: [{ weeksBehind: expect.any(Number) }] } })
    expect(h.rescheduleRoadmap(roadmap.value.id).ok).toBe(true)
    expect(h.getLearning()).toMatchObject({ value: { roadmaps: [{ currentWeek: 3, weeksBehind: 0 }] } })
  })

  it('refuses to reschedule a missing or finished roadmap', () => {
    const { h } = setup()
    expect(h.rescheduleRoadmap('x').ok).toBe(false)
    expect(h.rescheduleRoadmap(99)).toMatchObject({ message: expect.stringContaining('no longer exists') })
    const roadmap = h.saveRecord('roadmap', null, { title: 'Empty' })
    if (!roadmap.ok) throw new Error('not saved')
    expect(h.rescheduleRoadmap(roadmap.value.id)).toMatchObject({ message: expect.stringContaining('no topics') })
  })

  it('recommends the newest report priority first, then the next topic', () => {
    const { store, notifyOverview, logError } = setup()
    let priority: string | null = null
    const h = createDataHandlers({
      getStore: () => store,
      notifyOverview,
      logError,
      today: () => '2026-11-06',
      latestPriority: () => priority
    })
    expect(h.getRecommendation()).toEqual({ ok: true, value: null })
    const roadmap = h.saveRecord('roadmap', null, { title: 'Path' })
    if (!roadmap.ok) throw new Error('not saved')
    h.saveRecord('roadmapItem', null, { title: 'CSS' }, roadmap.value.id)
    expect(h.getRecommendation()).toEqual({ ok: true, value: 'CSS' })
    priority = 'Learn testing'
    expect(h.getRecommendation()).toEqual({ ok: true, value: 'Learn testing' })
  })

  it('scores role readiness', () => {
    const { h } = setup()
    const role = h.saveRecord('targetRole', null, { title: 'Dev' })
    if (!role.ok) throw new Error('not saved')
    expect(h.getRoleReadiness()).toEqual({ ok: true, value: [{ id: role.value.id, title: 'Dev', readiness: null, gaps: [] }] })
    h.saveRecord('roleRequirement', null, { skillName: 'CSS' }, role.value.id)
    expect(h.getRoleReadiness()).toMatchObject({ value: [{ readiness: 0, gaps: ['CSS'] }] })
  })
})

describe('repeating tasks', () => {
  const nextOpen = (db: DatabaseSync) =>
    db.prepare("SELECT title, due_date AS due, repeat, remind_at AS remind FROM task WHERE status = 'open'").all()

  it.each([
    ['daily', '2026-11-06', '2026-11-07'],
    ['weekly', '2026-11-06', '2026-11-13'],
    ['weekdays', '2026-11-05', '2026-11-06'],
    ['weekdays', '2026-11-06', '2026-11-09'],
    ['weekdays', '2026-11-07', '2026-11-09']
  ])('a %s task due %s comes back on %s', (repeat, dueDate, next) => {
    const { h, db } = setup()
    const task = h.saveRecord('task', null, { title: 'Practise', dueDate, repeat, remindAt: '09:00' })
    if (!task.ok) throw new Error('not saved')
    h.completeTask(task.value.id)
    expect(nextOpen(db)).toEqual([{ title: 'Practise', due: next, repeat, remind: '09:00' }])
  })

  it('does not repeat a one-off task', () => {
    const { h, db } = setup()
    const task = h.saveRecord('task', null, { title: 'Once', dueDate: '2026-11-06' })
    if (!task.ok) throw new Error('not saved')
    h.completeTask(task.value.id)
    expect(nextOpen(db)).toEqual([])
  })

  it('does not make a second copy when finished, reopened, and finished again', () => {
    const { h, db } = setup()
    const task = h.saveRecord('task', null, { title: 'Daily', dueDate: '2026-11-06', repeat: 'daily' })
    if (!task.ok) throw new Error('not saved')
    h.completeTask(task.value.id)
    h.saveRecord('task', task.value.id, { title: 'Daily', dueDate: '2026-11-06', repeat: 'daily', status: 'open' })
    h.completeTask(task.value.id)
    expect(nextOpen(db)).toHaveLength(1)
  })

  it('repeats when finished through an edit, as well as by ticking', () => {
    const { h, db } = setup()
    const task = h.saveRecord('task', null, { title: 'Weekly', dueDate: '2026-11-06', repeat: 'weekly' })
    if (!task.ok) throw new Error('not saved')
    h.saveRecord('task', task.value.id, { title: 'Weekly', dueDate: '2026-11-06', repeat: 'weekly', status: 'done' })
    expect(nextOpen(db)).toEqual([{ title: 'Weekly', due: '2026-11-13', repeat: 'weekly', remind: '' }])
  })

  it('refuses an unknown repeat or a bad reminder time', () => {
    const { h } = setup()
    expect(h.saveRecord('task', null, { title: 'T', repeat: 'hourly' }).ok).toBe(false)
    expect(h.saveRecord('task', null, { title: 'T', remindAt: '25:00' }).ok).toBe(false)
  })
})

describe('history', () => {
  it('records one snapshot a day, and builds the trend and month from them', () => {
    const { h, store } = setup()
    h.saveRecord('skill', null, { name: 'React', claimedLevel: '2' })
    const goal = h.saveRecord('goal', null, { title: 'Goal' })
    if (!goal.ok) throw new Error('not saved')
    h.saveRecord('goalMilestone', null, { title: 'Step', status: 'done' }, goal.value.id)
    h.recordSnapshot()
    h.recordSnapshot()
    expect(store.readSnapshots()).toEqual([{ day: '2026-11-06', overall: 100, skills: { React: [2, 0] } }])
    store.recordSnapshot({ day: '2026-11-01', overall: 40, skills: {} })
    expect(h.getHistory()).toMatchObject({
      ok: true,
      value: {
        trend: [
          { day: '2026-11-01', overall: 40 },
          { day: '2026-11-06', overall: 100 }
        ],
        month: { month: '2026-11', achievements: 1 }
      }
    })
  })

  it('tolerates a damaged snapshot', () => {
    const { store, db } = setup()
    db.exec("INSERT INTO progress_snapshot (day, overall, skills) VALUES ('2026-11-01', 5, 'not json')")
    expect(store.readSnapshots()).toEqual([{ day: '2026-11-01', overall: 5, skills: {} }])
  })
})

describe('failures', () => {
  it('explains when the database is unavailable', () => {
    const h = createDataHandlers({
      getStore: () => null,
      notifyOverview: vi.fn(),
      logError: vi.fn(),
      today: () => '2026-11-06'
    })
    for (const result of [h.getProfile(), h.getOverview(), h.listRecords('work')]) {
      expect(result).toMatchObject({ ok: false, message: expect.stringContaining('could not be opened') })
    }
  })

  it('logs a database error and returns a plain message', () => {
    const { db, h, logError } = setup()
    db.close()
    const result = h.saveProfile({ fullName: 'Sam' })
    expect(result).toEqual({ ok: false, message: 'That could not be saved. Your earlier data is unchanged.' })
    expect(logError).toHaveBeenCalledOnce()
  })
})
