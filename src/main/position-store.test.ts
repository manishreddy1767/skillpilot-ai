import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadPosition, savePosition } from './position-store'

const position = {
  x: -34,
  y: 120,
  displayId: 2528732444,
  displayBounds: { x: 0, y: 0, width: 1536, height: 864 }
}

let folder: string
let path: string

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'skillpilot-position-'))
  path = join(folder, 'nested', 'widget-position.json')
})

afterEach(() => rmSync(folder, { recursive: true, force: true }))

describe('position store', () => {
  it('reads back what it saved', () => {
    savePosition(path, position)
    expect(loadPosition(path)).toEqual(position)
  })

  it('overwrites the previous position and leaves no temporary file', () => {
    savePosition(path, position)
    savePosition(path, { ...position, x: 500 })
    expect(loadPosition(path)?.x).toBe(500)
    expect(readdirSync(join(folder, 'nested'))).toEqual(['widget-position.json'])
  })

  it('returns nothing when there is no file', () => {
    expect(existsSync(path)).toBe(false)
    expect(loadPosition(path)).toBeNull()
  })

  it.each([
    ['broken JSON', '{"x": 1,'],
    ['an empty file', ''],
    ['the wrong shape', '[1, 2, 3]'],
    ['null', 'null'],
    ['text coordinates', JSON.stringify({ ...position, x: 'left' })],
    ['no display id', JSON.stringify({ x: 1, y: 2, displayBounds: position.displayBounds })],
    ['no display bounds', JSON.stringify({ x: 1, y: 2, displayId: 1 })],
    ['a zero-width display', JSON.stringify({ ...position, displayBounds: { x: 0, y: 0, width: 0, height: 864 } })]
  ])('treats %s as nothing saved', (_name, content) => {
    savePosition(path, position)
    writeFileSync(path, content)
    expect(loadPosition(path)).toBeNull()
  })
})
