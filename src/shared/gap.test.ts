import { describe, expect, it } from 'vitest'
import { analyseGap } from './gap'

const req = (skillName: string, requiredLevel = 3, importance = 2) => ({ skillName, requiredLevel, importance })
const skill = (name: string, claimed: number, demonstrated: number) => ({ name, claimed, demonstrated })

describe('analyseGap', () => {
  it('has no score without requirements', () => {
    expect(analyseGap([], [skill('React', 3, 3)])).toEqual({ readiness: null, items: [] })
  })

  it('marks a skill you do not have as missing', () => {
    const { items, readiness } = analyseGap([req('React')], [])
    expect(items[0]).toMatchObject({ status: 'missing', claimed: 0, demonstrated: 0 })
    expect(readiness).toBe(0)
  })

  it('marks a claimed but unproven skill as needing improvement', () => {
    const { items, readiness } = analyseGap([req('React', 4)], [skill('React', 4, 0)])
    expect(items[0]?.status).toBe('improve')
    expect(readiness).toBe(50)
  })

  it('needs demonstrated level to count as met', () => {
    expect(analyseGap([req('React', 3)], [skill('React', 5, 2)]).items[0]?.status).toBe('improve')
    expect(analyseGap([req('React', 3)], [skill('React', 0, 3)]).items[0]?.status).toBe('met')
  })

  it('matches names regardless of case and spacing', () => {
    expect(analyseGap([req(' react ')], [skill('React', 3, 3)]).items[0]?.status).toBe('met')
  })

  it('weights readiness by importance', () => {
    const { readiness } = analyseGap(
      [req('Essential', 3, 3), req('Nice', 3, 1)],
      [skill('Essential', 3, 3)]
    )
    expect(readiness).toBe(75)
  })

  it('lists the biggest gaps first', () => {
    const { items } = analyseGap(
      [req('Met', 1, 3), req('Improve', 3, 3), req('Minor', 3, 1), req('Major', 3, 3)],
      [skill('Met', 1, 1), skill('Improve', 2, 1)]
    )
    expect(items.map((item) => item.skillName)).toEqual(['Major', 'Minor', 'Improve', 'Met'])
  })
})
