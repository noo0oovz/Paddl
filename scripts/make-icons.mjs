// Generates the PWA app icons (dark tile, glowing lime pickleball, cyan court-line ring) with no dependencies.
import zlib from 'node:zlib'
import fs from 'node:fs'

function crc32(buf) {
  let c
  let crc = ~0
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return ~crc >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const BG1 = [9, 13, 24]
const BG2 = [5, 7, 13]
const LIME = [182, 255, 59]
const LIME_DARK = [111, 184, 0]
const LIME_LIGHT = [243, 255, 200]
const CYAN = [34, 211, 238]
const INK = [11, 20, 0]
// Dimple positions as fractions of the ball radius.
const HOLES = [[-0.3, -0.4], [0.35, -0.45], [0, 0.0], [-0.55, 0.25], [0.55, 0.2], [0, 0.6]]

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const R = 0.3 // ball radius as a fraction of the tile
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const u = x / size - 0.5
      const v = y / size - 0.5
      const d = Math.hypot(u, v)
      let px = mix(BG1, BG2, Math.min(1, (u + v + 1) / 2))

      // glow around the ball
      const glow = Math.max(0, 1 - d / 0.52)
      px = mix(px, LIME, glow * glow * 0.22)

      // dashed cyan ring
      const ang = Math.atan2(v, u)
      if (Math.abs(d - 0.42) < 0.008 && Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 40) % 2 === 0) px = mix(px, CYAN, 0.75)

      // the ball, shaded like a sphere
      if (d < R) {
        const hx = (u + 0.1) / R
        const hy = (v + 0.12) / R
        const shade = Math.min(1, Math.hypot(hx, hy) / 1.35)
        px = shade < 0.5 ? mix(LIME_LIGHT, LIME, shade * 2) : mix(LIME, LIME_DARK, (shade - 0.5) * 2)
        for (const [hx0, hy0] of HOLES) {
          if (Math.hypot(u - hx0 * R * 0.78, v - hy0 * R * 0.78) < R * 0.085) px = mix(px, INK, 0.85)
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = px[0]
      raw[o + 1] = px[1]
      raw[o + 2] = px[2]
      raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

for (const s of [192, 512]) fs.writeFileSync(`public/icon-${s}.png`, png(s))
console.log('icons written')
