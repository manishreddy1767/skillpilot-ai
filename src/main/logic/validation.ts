import type { Point } from './geometry'

/** Messages from renderers are checked before use, never trusted as typed. */
export function isPoint(value: unknown): value is Point {
  const point = value as Point | null
  return Number.isFinite(point?.x) && Number.isFinite(point?.y)
}
