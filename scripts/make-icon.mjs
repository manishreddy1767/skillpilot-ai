// Draws the app icon as a PNG using only Node, so no image tooling is needed.
// The shapes come from the same list the widget draws, so the icon always matches it.
import { mkdirSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { ROBOT_SIZE, robotShapes } from '../src/shared/robot-icon.ts'

const size = 256
const scale = ROBOT_SIZE / size
const samples = 4
const pixels = Buffer.alloc(size * (size * 4 + 1))

const rgb = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))

/** Distance from a point to a segment. */
function toSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

/** Whether a point on the 72 grid is inside a shape. */
function covers(shape, x, y) {
  switch (shape.kind) {
    case 'circle':
      return Math.hypot(x - shape.cx, y - shape.cy) <= shape.r
    case 'ring':
      return Math.abs(Math.hypot(x - shape.cx, y - shape.cy) - shape.r) <= shape.width / 2
    case 'rect': {
      const r = shape.rx
      const qx = Math.abs(x - (shape.x + shape.w / 2)) - (shape.w / 2 - r)
      const qy = Math.abs(y - (shape.y + shape.h / 2)) - (shape.h / 2 - r)
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= r
    }
    case 'line':
      return shape.points.slice(1).some((end, i) => toSegment(x, y, shape.points[i], end) <= shape.width / 2)
  }
}

const painted = robotShapes.map((shape) => ({ shape, color: rgb(shape.kind === 'ring' || shape.kind === 'line' ? shape.stroke : shape.fill) }))

for (let row = 0; row < size; row++) {
  const start = row * (size * 4 + 1)
  for (let col = 0; col < size; col++) {
    // Average the colour of several points inside the pixel, for smooth edges.
    const sum = [0, 0, 0, 0]
    for (let sy = 0; sy < samples; sy++) {
      for (let sx = 0; sx < samples; sx++) {
        const x = (col + (sx + 0.5) / samples) * scale
        const y = (row + (sy + 0.5) / samples) * scale
        let color = null
        for (const { shape, color: fill } of painted) if (covers(shape, x, y)) color = fill
        if (color) {
          sum[0] += color[0]
          sum[1] += color[1]
          sum[2] += color[2]
          sum[3] += 1
        }
      }
    }
    const covered = sum[3]
    const pixel = covered ? [sum[0] / covered, sum[1] / covered, sum[2] / covered, (covered / samples ** 2) * 255] : [0, 0, 0, 0]
    pixels.set(pixel.map(Math.round), start + 1 + col * 4)
  }
}

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const header = Buffer.alloc(13)
header.writeUInt32BE(size, 0)
header.writeUInt32BE(size, 4)
header.set([8, 6, 0, 0, 0], 8)

mkdirSync('resources', { recursive: true })
writeFileSync(
  'resources/icon.png',
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0))
  ])
)
