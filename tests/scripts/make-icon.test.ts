import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { crc32, inflateSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')
const size = 256
let folder: string
let png: Buffer

interface Chunk {
  type: string
  data: Buffer
  crc: number
  body: Buffer
}

function readChunks(file: Buffer): Chunk[] {
  const chunks: Chunk[] = []
  for (let at = 8; at < file.length; ) {
    const length = file.readUInt32BE(at)
    const body = file.subarray(at + 4, at + 8 + length)
    chunks.push({
      type: body.subarray(0, 4).toString(),
      data: body.subarray(4),
      crc: file.readUInt32BE(at + 8 + length),
      body
    })
    at += 12 + length
  }
  return chunks
}

function alphaAt(pixels: Buffer, row: number, col: number): number {
  return pixels[row * (size * 4 + 1) + 1 + col * 4 + 3]!
}

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), 'skillpilot-icon-'))
  execFileSync(process.execPath, [join(root, 'scripts/make-icon.mjs')], { cwd: folder })
  png = readFileSync(join(folder, 'resources/icon.png'))
})

afterAll(() => rmSync(folder, { recursive: true, force: true }))

describe('make-icon', () => {
  it('writes a valid PNG with correct checksums', () => {
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const chunks = readChunks(png)
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
    for (const chunk of chunks) expect(crc32(chunk.body)).toBe(chunk.crc)
  })

  it('is 256 by 256, as the installer needs, with an alpha channel', () => {
    const header = readChunks(png)[0]!.data
    expect(header.readUInt32BE(0)).toBe(size)
    expect(header.readUInt32BE(4)).toBe(size)
    expect(header[8]).toBe(8)
    expect(header[9]).toBe(6)
  })

  it('is round: transparent corners, solid centre', () => {
    const pixels = inflateSync(readChunks(png)[1]!.data)
    expect(alphaAt(pixels, 0, 0)).toBe(0)
    expect(alphaAt(pixels, size - 1, size - 1)).toBe(0)
    expect(alphaAt(pixels, size / 2, size / 2)).toBe(255)
  })

  it('matches the committed icon', () => {
    expect(png.equals(readFileSync(join(root, 'resources/icon.png')))).toBe(true)
  })
})
