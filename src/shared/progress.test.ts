import { describe, expect, it } from 'vitest'
import {
  buildDashboard,
  demonstratedLevel,
  goalProgress,
  overallProgress,
  proofStatus,
  skillCredit,
  type CareerRows
} from './progress'

const empty: CareerRows = {
  skills: [],
  evidence: [],
  history: [],
  projects: [],
  projectSkills: [],
  goals: [],
  goalSkills: [],
  milestones: [],
  dueTasks: []
}

const skill = (id: number, name: string, claimed = 0) => ({
  id,
  name,
  category: 'technical',
  status: 'learning',
  claimed
})
const project = (id: number, status: string, completedOn = '') => ({
  id,
  name: `Project ${id}`,
  status,
  completedOn
})
const goal = (id: number, over: Partial<CareerRows['goals'][number]> = {}) => ({
  id,
  title: `Goal ${id}`,
  status: 'active',
  priority: 2,
  targetDate: '',
  completedOn: '',
  ...over
})
const milestone = (over: Partial<CareerRows['milestones'][number]> = {}) => ({
  goalId: null,
  projectId: null,
  title: 'Step',
  dueDate: '',
  status: 'open',
  completedOn: '',
  ...over
})

describe('demonstratedLevel', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 3],
    [6, 4],
    [8, 4],
    [9, 5],
    [100, 5]
  ])('%i points is level %i', (points, level) => {
    expect(demonstratedLevel(points)).toBe(level)
  })
})

describe('proofStatus', () => {
  it.each([
    [0, 0, 'none'],
    [4, 0, 'unproven'],
    [4, 2, 'partly'],
    [4, 4, 'proven'],
    [2, 4, 'proven'],
    [0, 1, 'proven']
  ])('claimed %i, demonstrated %i is %s', (claimed, demonstrated, status) => {
    expect(proofStatus(claimed, demonstrated)).toBe(status)
  })
})

describe('skillCredit', () => {
  it('gives full credit once demonstrated reaches the requirement', () => {
    expect(skillCredit(3, 0, 3)).toBe(1)
    expect(skillCredit(5, 5, 3)).toBe(1)
  })

  it('counts demonstrated levels fully', () => {
    expect(skillCredit(2, 2, 4)).toBe(0.5)
  })

  it('counts claimed levels beyond that as half', () => {
    expect(skillCredit(0, 4, 4)).toBe(0.5)
    expect(skillCredit(2, 4, 4)).toBe(0.75)
  })

  it('caps claimed credit at the requirement', () => {
    expect(skillCredit(0, 5, 2)).toBe(0.5)
  })

  it('gives nothing for no skill', () => {
    expect(skillCredit(0, 0, 3)).toBe(0)
  })

  it('treats no requirement as met', () => {
    expect(skillCredit(0, 0, 0)).toBe(1)
  })
})

describe('goalProgress', () => {
  it('is zero with nothing to measure', () => {
    expect(goalProgress('active', 0, 0, [])).toBe(0)
  })

  it('uses milestones alone when there are no skills', () => {
    expect(goalProgress('active', 1, 4, [])).toBe(25)
  })

  it('uses skills alone when there are no milestones', () => {
    expect(goalProgress('active', 0, 0, [1, 0.5])).toBe(75)
  })

  it('averages the two parts equally', () => {
    expect(goalProgress('active', 1, 2, [1])).toBe(75)
  })

  it('is complete once the goal is done', () => {
    expect(goalProgress('done', 0, 4, [0])).toBe(100)
  })
})

describe('overallProgress', () => {
  it('has no value without active goals', () => {
    expect(overallProgress([])).toBeNull()
    expect(overallProgress([{ status: 'paused', priority: 3, progress: 50 }])).toBeNull()
  })

  it('weights by priority', () => {
    const goals = [
      { status: 'active', priority: 3, progress: 100 },
      { status: 'active', priority: 1, progress: 0 }
    ]
    expect(overallProgress(goals)).toBe(75)
  })

  it('ignores goals that are not active', () => {
    const goals = [
      { status: 'active', priority: 1, progress: 40 },
      { status: 'done', priority: 3, progress: 100 },
      { status: 'paused', priority: 3, progress: 0 }
    ]
    expect(overallProgress(goals)).toBe(40)
  })
})

describe('buildDashboard', () => {
  const today = '2026-11-06'

  it('handles an empty database', () => {
    expect(buildDashboard(empty, today)).toEqual({
      overall: null,
      skills: [],
      goals: [],
      projects: [],
      deadlines: [],
      achievements: []
    })
  })

  it('a claim alone demonstrates nothing', () => {
    const { skills } = buildDashboard({ ...empty, skills: [skill(1, 'React', 4)] }, today)
    expect(skills[0]).toMatchObject({ claimed: 4, demonstrated: 0, proof: 'unproven', evidenceCount: 0 })
  })

  it('adds evidence strength into a level', () => {
    const { skills } = buildDashboard(
      {
        ...empty,
        skills: [skill(1, 'React', 3), skill(2, 'Other')],
        evidence: [
          { skillId: 1, strength: 3 },
          { skillId: 1, strength: 2 },
          { skillId: 2, strength: 3 }
        ]
      },
      today
    )
    expect(skills[0]).toMatchObject({ demonstrated: 3, proof: 'proven', evidenceCount: 2 })
  })

  it.each([
    ['planned', 0, 0],
    ['active', 1, 1],
    ['complete', 2, 1]
  ])('a %s project gives level %i', (status, level, count) => {
    const { skills } = buildDashboard(
      {
        ...empty,
        skills: [skill(1, 'React')],
        projects: [project(1, status)],
        projectSkills: [{ projectId: 1, skillId: 1 }]
      },
      today
    )
    expect(skills[0]).toMatchObject({ demonstrated: level, evidenceCount: count })
  })

  it('one project counts towards every linked skill', () => {
    const { skills, projects } = buildDashboard(
      {
        ...empty,
        skills: [skill(1, 'React'), skill(2, 'Python'), skill(3, 'PostgreSQL')],
        projects: [project(1, 'complete')],
        projectSkills: [1, 2, 3].map((skillId) => ({ projectId: 1, skillId }))
      },
      today
    )
    expect(skills.map((s) => s.demonstrated)).toEqual([2, 2, 2])
    expect(projects[0]?.skills).toEqual(['React', 'Python', 'PostgreSQL'])
  })

  it('keeps claimed history in order for each skill', () => {
    const { skills } = buildDashboard(
      {
        ...empty,
        skills: [skill(1, 'React', 3)],
        history: [
          { skillId: 1, level: 1 },
          { skillId: 9, level: 5 },
          { skillId: 1, level: 3 }
        ]
      },
      today
    )
    expect(skills[0]?.history).toEqual([1, 3])
  })

  it('scores a goal from milestones and skills, naming what is missing', () => {
    const { goals, overall } = buildDashboard(
      {
        ...empty,
        skills: [skill(1, 'React'), skill(2, 'SQL')],
        evidence: [{ skillId: 1, strength: 3 }],
        goals: [goal(1)],
        goalSkills: [
          { goalId: 1, skillId: 1, level: 2 },
          { goalId: 1, skillId: 2, level: 2 }
        ],
        milestones: [milestone({ goalId: 1, status: 'done' }), milestone({ goalId: 1 })]
      },
      today
    )
    expect(goals[0]).toMatchObject({
      progress: 50,
      milestonesDone: 1,
      milestonesTotal: 2,
      skillsMet: 1,
      skillsTotal: 2,
      missingSkills: ['SQL']
    })
    expect(overall).toBe(50)
  })

  it('keeps milestones with their own goal or project', () => {
    const { goals, projects } = buildDashboard(
      {
        ...empty,
        goals: [goal(1), goal(2)],
        projects: [project(1, 'active')],
        milestones: [milestone({ goalId: 2 }), milestone({ projectId: 1, status: 'done' })]
      },
      today
    )
    expect(goals.map((g) => g.milestonesTotal)).toEqual([0, 1])
    expect(projects[0]).toMatchObject({ milestonesDone: 1, milestonesTotal: 1 })
  })

  it('lists open deadlines soonest first and flags overdue ones', () => {
    const { deadlines } = buildDashboard(
      {
        ...empty,
        goals: [
          goal(1, { title: 'Later', targetDate: '2027-01-01' }),
          goal(2, { title: 'Paused', status: 'paused', targetDate: '2026-01-01' })
        ],
        milestones: [
          milestone({ title: 'Late', dueDate: '2026-11-01' }),
          milestone({ title: 'Today', dueDate: today }),
          milestone({ title: 'Finished', dueDate: '2026-01-01', status: 'done' }),
          milestone({ title: 'No date' })
        ]
      },
      today
    )
    expect(deadlines).toEqual([
      { title: 'Late', date: '2026-11-01', overdue: true },
      { title: 'Today', date: today, overdue: false },
      { title: 'Later', date: '2027-01-01', overdue: false }
    ])
  })

  it('counts open tasks as deadlines', () => {
    const { deadlines } = buildDashboard({ ...empty, dueTasks: [{ title: 'Task', dueDate: '2026-12-01' }] }, today)
    expect(deadlines).toEqual([{ title: 'Task', date: '2026-12-01', overdue: false }])
  })

  it('shows at most five deadlines and achievements', () => {
    const many = Array.from({ length: 8 }, (_v, i) => i + 1)
    const { deadlines, achievements } = buildDashboard(
      {
        ...empty,
        milestones: [
          ...many.map((i) => milestone({ title: `Open ${i}`, dueDate: `2026-12-0${i}` })),
          ...many.map((i) => milestone({ title: `Done ${i}`, status: 'done', completedOn: `2026-10-0${i}` }))
        ]
      },
      today
    )
    expect(deadlines).toHaveLength(5)
    expect(achievements).toHaveLength(5)
    expect(achievements[0]?.title).toBe('Reached Done 8')
  })

  it('counts a finished project with no date, listing it last', () => {
    const { achievements } = buildDashboard(
      {
        ...empty,
        projects: [project(1, 'complete')],
        milestones: [milestone({ title: 'Step', status: 'done', completedOn: '2026-08-15' })]
      },
      today
    )
    expect(achievements.map((a) => a.title)).toEqual(['Reached Step', 'Finished Project 1'])
  })

  it('collects achievements newest first', () => {
    const { achievements } = buildDashboard(
      {
        ...empty,
        projects: [project(1, 'complete', '2026-09')],
        goals: [goal(1, { status: 'done', completedOn: '2026-10-20' })],
        milestones: [milestone({ title: 'Step', status: 'done', completedOn: '2026-08-15' })]
      },
      today
    )
    expect(achievements.map((a) => a.title)).toEqual(['Achieved Goal 1', 'Finished Project 1', 'Reached Step'])
  })
})
