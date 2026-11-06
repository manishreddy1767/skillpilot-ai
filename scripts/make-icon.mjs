// Draws the app icon as a PNG using only Node, so no image tooling is needed.
import { mkdirSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'

const size = 256
const pixels = Buffer.alloc(size * (size * 4 + 1))

// A slim diamond pointing up and to the right, like a compass needle.
const inNeedle = (x, y) => {
  const u = (x + y) / Math.SQRT2
  const v = (x - y) / Math.SQRT2
  return Math.abs(u) / 0.16 + Math.abs(v) / 0.6 <= 1
}

for (let row = 0; row < size; row++) {
  const start = row * (size * 4 + 1)
  for (let col = 0; col < size; col++) {
    const x = (col + 0.5 - size / 2) / (size / 2)
    const y = (row + 0.5 - size / 2) / (size / 2)
    const distance = Math.hypot(x, y)
    const alpha = Math.round(Math.min(1, Math.max(0, (1 - distance) * (size / 2))) * 255)
    const color = inNeedle(x, y) ? [255, 255, 255] : distance > 0.84 ? [45, 212, 191] : [15, 23, 42]
    pixels.set([...color, alpha], start + 1 + col * 4)
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
