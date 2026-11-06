import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Rect } from './logic/geometry'
import { isPoint } from './logic/validation'
import type { SavedPosition } from './logic/widget-position'

function isRect(value: unknown): value is Rect {
  const rect = value as Rect | null
  return isPoint(rect) && Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0
}

function isSavedPosition(value: unknown): value is SavedPosition {
  const saved = value as SavedPosition | null
  return isPoint(saved) && Number.isFinite(saved.displayId) && isRect(saved.displayBounds)
}

/** A missing or damaged file simply means no saved position. */
export function loadPosition(path: string): SavedPosition | null {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return isSavedPosition(value) ? value : null
  } catch {
    return null
  }
}

/** Writes to a temporary file first, so a crash cannot leave a half-written file. */
export function savePosition(path: string, position: SavedPosition): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  writeFileSync(temporary, JSON.stringify(position, null, 2))
  renameSync(temporary, path)
}
