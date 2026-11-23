// Generates simple PNG app icons (green tile + pickleball) with no dependencies.
import zlib from 'node:zlib'
import fs from 'node:fs'

function crc32(buf) {
  let c, crc = ~0
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return ~crc >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const holes = [[-8, -8], [8, -8], [0, 2], [-12, 10], [12, 10]].map(([x, y]) => [x / 64, y / 64])
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const u = x / size - 0.5, v = y / size - 0.5
      let px = [22, 163, 74]
      if (Math.hypot(u, v) < 0.28) {
        px = [253, 224, 71]
        for (const [hx, hy] of holes) if (Math.hypot(u - hx, v - hy) < 0.045) px = [22, 163, 74]
      }
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = px[0]; raw[o + 1] = px[1]; raw[o + 2] = px[2]; raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
for (const s of [192, 512]) fs.writeFileSync(`public/icon-${s}.png`, png(s))
