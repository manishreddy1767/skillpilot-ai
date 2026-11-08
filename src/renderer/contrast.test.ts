import { describe, expect, it } from 'vitest'

/** WCAG relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

const surfaces = { page: '#0f172a', card: '#1e293b' }

// Every text colour used in the app, on each surface it appears on.
const textPairs: [string, string, string][] = [
  ['body text', '#e2e8f0', surfaces.page],
  ['body text on cards', '#e2e8f0', surfaces.card],
  ['secondary text', '#cbd5e1', surfaces.card],
  ['muted text', '#94a3b8', surfaces.page],
  ['muted text on cards', '#94a3b8', surfaces.card],
  ['headings in teal', '#5eead4', surfaces.card],
  ['active navigation', '#5eead4', surfaces.card],
  ['primary button text', '#0f172a', '#2dd4bf'],
  ['danger button text', '#e2e8f0', '#7f1d1d'],
  ['error text', '#fca5a5', surfaces.page],
  ['error text on cards', '#fca5a5', surfaces.card],
  ['user chat bubble', '#e2e8f0', '#134e4a']
]

describe('colour contrast', () => {
  it('passes the contrast formula on known values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
  })

  it.each(textPairs)('%s meets WCAG AA for normal text', (_name, text, surface) => {
    expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['input borders', '#334155', surfaces.page, 1.4],
    ['chart bars', '#0d9488', surfaces.card, 3],
    ['focus ring', '#5eead4', surfaces.page, 3]
  ])('%s are visible enough against the surface', (_name, colour, surface, minimum) => {
    expect(contrast(colour, surface)).toBeGreaterThanOrEqual(minimum)
  })
})
