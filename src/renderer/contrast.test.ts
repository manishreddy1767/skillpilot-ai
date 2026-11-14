import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { robotColors } from '../shared/robot-icon'

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

/** The colours in theme.css, so these checks follow any change to it. */
const theme = Object.fromEntries(
  [...readFileSync(join(__dirname, 'theme.css'), 'utf8').matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map(([, name, value]) => [
    name!,
    value!
  ])
) as Record<string, string>
const t = (name: string): string => {
  const value = theme[name]
  if (!value) throw new Error(`theme.css has no --${name}`)
  return value
}

// Every text colour used in the app, on each surface it appears on.
const textPairs: [string, string, string][] = [
  ['body text', 'text', 'bg'],
  ['body text on panels', 'text', 'panel'],
  ['body text in inputs', 'text', 'panel-2'],
  ['secondary text', 'text-2', 'panel'],
  ['muted text', 'muted', 'bg'],
  ['muted text on panels', 'muted', 'panel'],
  ['muted text in the input bar', 'muted', 'panel-2'],
  ['headings and status in cyan', 'accent', 'bg'],
  ['cyan on panels', 'accent', 'panel'],
  ['primary button text', 'accent-text', 'accent-bg'],
  ['active navigation', 'accent-text', 'accent-bg'],
  ['primary button text on hover', 'accent-text', 'user-bubble'],
  ['danger button text', 'text', 'danger-bg'],
  ['error text', 'error', 'bg'],
  ['error text on panels', 'error', 'panel'],
  ['user chat bubble', 'text', 'user-bubble'],
  ['voice note', 'text', 'accent-bg']
]

describe('colour contrast', () => {
  it('passes the contrast formula on known values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
  })

  it.each(textPairs)('%s meets WCAG AA for normal text', (_name, text, surface) => {
    expect(contrast(t(text), t(surface))).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['input and card borders', 'line', 'bg', 1.4],
    ['chart bars and card corners', 'fill', 'panel', 3],
    ['claimed level bars', 'violet', 'panel', 3],
    ['focus ring', 'accent', 'bg', 3],
    ['danger borders', 'danger', 'bg', 3]
  ])('%s are visible enough against the surface', (_name, colour, surface, minimum) => {
    expect(contrast(t(colour), t(surface))).toBeGreaterThanOrEqual(minimum)
  })

  it('stays dark, so nothing glares', () => {
    for (const surface of ['bg', 'panel', 'panel-2', 'accent-bg', 'user-bubble']) {
      expect(luminance(t(surface))).toBeLessThan(0.03)
    }
    // Soft grey text rather than white.
    expect(luminance(t('text'))).toBeLessThan(0.7)
  })

  it('the robot stands out from its base', () => {
    expect(contrast(robotColors.light, robotColors.base)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(robotColors.metal, robotColors.base)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(robotColors.ring, robotColors.base)).toBeGreaterThanOrEqual(3)
  })
})
