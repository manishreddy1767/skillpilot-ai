import { describe, expect, it } from 'vitest'
import { isPoint } from './validation'

describe('isPoint', () => {
  it('accepts finite coordinates, including zero and negatives', () => {
    expect(isPoint({ x: 0, y: -12.5 })).toBe(true)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'x'],
    ['a missing axis', { x: 1 }],
    ['string coordinates', { x: '1', y: '2' }],
    ['NaN', { x: Number.NaN, y: 1 }],
    ['infinity', { x: 1, y: Number.POSITIVE_INFINITY }]
  ])('rejects %s', (_name, value) => {
    expect(isPoint(value)).toBe(false)
  })
})
