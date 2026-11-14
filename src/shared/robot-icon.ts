/**
 * The SkillPilot symbol: a friendly robot with one hand raised, ready to help.
 *
 * One list of plain shapes on a 72 by 72 grid. The widget draws it as SVG, and
 * `scripts/make-icon.mjs` draws the same list into the PNG used for the tray, taskbar,
 * and installer, so the two can never drift apart. Shapes are painted in order.
 */

export type Point = [number, number]

export type Shape =
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string }
  | { kind: 'ring'; cx: number; cy: number; r: number; width: number; stroke: string }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: string }
  /** A line through the points with round ends and joins. */
  | { kind: 'line'; points: Point[]; width: number; stroke: string }

export const ROBOT_SIZE = 72

export const robotColors = {
  base: '#080b0f',
  ring: '#2f8fa1',
  metal: '#a7b4c2',
  metalDark: '#6f7d8c',
  visor: '#0b1218',
  light: '#5fd3e6'
}

const c = robotColors

/** A smile as a gentle curve, sampled into points so both renderers can draw it as a line. */
const smile: Point[] = Array.from({ length: 7 }, (_, step) => {
  const t = step / 6
  const x = 32 + 8 * t
  const y = 34.6 + 2.2 * Math.sin(Math.PI * t)
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100]
})

export const robotShapes: Shape[] = [
  // The round base the widget sits on.
  { kind: 'circle', cx: 36, cy: 36, r: 35.5, fill: c.base },
  { kind: 'ring', cx: 36, cy: 36, r: 33, width: 2.4, stroke: c.ring },

  // Antenna, with its light on.
  { kind: 'line', points: [[36, 20], [36, 14.5]], width: 2, stroke: c.metalDark },
  { kind: 'circle', cx: 36, cy: 12.5, r: 3, fill: c.light },

  // Ears, then the head.
  { kind: 'rect', x: 16.5, y: 27, w: 4, h: 9, rx: 1.5, fill: c.metalDark },
  { kind: 'rect', x: 51.5, y: 27, w: 4, h: 9, rx: 1.5, fill: c.metalDark },
  { kind: 'rect', x: 19.5, y: 19.5, w: 33, h: 24, rx: 7, fill: c.metal },

  // The visor, glowing eyes, and a smile.
  { kind: 'rect', x: 23.5, y: 24.5, w: 25, h: 14, rx: 5, fill: c.visor },
  { kind: 'circle', cx: 30.5, cy: 30.5, r: 2.6, fill: c.light },
  { kind: 'circle', cx: 41.5, cy: 30.5, r: 2.6, fill: c.light },
  { kind: 'line', points: smile, width: 1.6, stroke: c.light },

  // Neck and arms: one resting, one raised to wave.
  { kind: 'rect', x: 32, y: 43, w: 8, h: 4, rx: 1, fill: c.metalDark },
  { kind: 'line', points: [[26, 50], [20, 57]], width: 3.6, stroke: c.metalDark },
  { kind: 'line', points: [[46, 50], [52.5, 44], [54.5, 37.5]], width: 3.6, stroke: c.metalDark },
  { kind: 'circle', cx: 54.8, cy: 35.2, r: 3.4, fill: c.metal },

  // Body, with a light on the chest.
  { kind: 'rect', x: 24.5, y: 46.5, w: 23, h: 15, rx: 5, fill: c.metal },
  { kind: 'rect', x: 31, y: 50.5, w: 10, h: 6, rx: 2, fill: c.visor },
  { kind: 'circle', cx: 36, cy: 53.5, r: 1.7, fill: c.light }
]
