import { describe, expect, it } from 'vitest'
import type { GapItem } from './gap'
import { HOURS_PER_LEVEL, requirementsFor, roadmapFromGaps } from './library-plans'
import { libraryRole } from './skills-library'

const gap = (skillName: string, requiredLevel: number, importance: number, claimed = 0, demonstrated = 0): GapItem => ({
  skillName,
  requiredLevel,
  importance,
  claimed,
  demonstrated,
  status: demonstrated >= requiredLevel ? 'met' : claimed || demonstrated ? 'improve' : 'missing'
})

describe('requirementsFor', () => {
  it("lists a library role's needs", () => {
    const needs = requirementsFor(libraryRole('frontend-developer')!, [])
    expect(needs[0]).toEqual({ skillName: 'HTML', requiredLevel: 3, importance: 3 })
    expect(needs.map((need) => need.skillName)).toContain('React')
  })

  it('leaves out skills the role already lists, under any name', () => {
    const needs = requirementsFor(libraryRole('frontend-developer')!, ['reactjs', 'JS', 'html5'])
    const names = needs.map((need) => need.skillName)
    expect(names).not.toContain('React')
    expect(names).not.toContain('JavaScript')
    expect(names).not.toContain('HTML')
    expect(names).toContain('CSS')
  })
})

describe('roadmapFromGaps', () => {
  it('skips what is met, and puts prerequisites first', () => {
    const plan = roadmapFromGaps('Frontend Developer', [
      gap('React', 3, 3),
      gap('JavaScript', 3, 3, 1),
      gap('HTML', 3, 3, 3, 3),
      gap('Jest', 1, 1)
    ], 100)
    expect(plan.title).toBe('Frontend Developer plan')
    expect(plan.items.map((item) => item.title)).toEqual([
      'JavaScript: from level 1 to 3',
      'React: reach level 3',
      'Jest: reach level 1'
    ])
  })

  it('estimates effort from the levels to climb', () => {
    const [item] = roadmapFromGaps('X', [gap('SQL', 3, 3, 1)], 100).items
    expect(item!.effortHours).toBe(2 * HOURS_PER_LEVEL)
  })

  it('spreads topics over weeks by the time available', () => {
    const plan = roadmapFromGaps('X', [gap('SQL', 2, 3), gap('Excel', 2, 3), gap('Statistics', 2, 3)], 16)
    expect(plan.items.map((item) => item.week)).toEqual([1, 2, 3])
  })

  it("uses the library's resources and exercise, without links", () => {
    const [item] = roadmapFromGaps('X', [gap('Docker', 2, 3)], 10).items
    expect(item!.resources).toContain('Docker docs')
    expect(item!.exercise).toContain('Compose')
    expect(item!.details).toBe('Builds on Linux.')
    expect(JSON.stringify(item)).not.toMatch(/https?:/)
  })

  it('still plans a skill the library does not know', () => {
    const [item] = roadmapFromGaps('X', [gap('Basket weaving', 2, 2)], 10).items
    expect(item).toMatchObject({ title: 'Basket weaving: reach level 2', resources: expect.stringContaining('Basket weaving') })
  })

  it('has nothing to plan when every need is met', () => {
    expect(roadmapFromGaps('X', [gap('SQL', 2, 3, 2, 2)], 10).items).toEqual([])
  })
})
