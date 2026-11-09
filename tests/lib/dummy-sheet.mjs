// A dummy pet sheet for tests and the real-app check, drawn by code (no petdex sheet is used):
// the petdex layout, 8 columns × 9 rows of 192 × 208 cells, as two single-colour masks (only
// alpha counts). Only the rows the helper uses are drawn (0 idle, 3 waving, 4 jumping, 5 failed,
// 8 review); every other row is empty.
//   ink:  a frame line round each cell, (row + 1) small squares along the top (so a picture shows
//         which row is playing), and a bar whose place moves with the frame number
//   fill: a solid block in the middle of each drawn cell
// makePng writes a plain RGBA PNG with node:zlib, so nothing needs installing.
import zlib from 'node:zlib'

export const CELL_W = 192
export const CELL_H = 208
export const COLS = 8
export const ROWS = 9
export const DRAWN_ROWS = [0, 3, 4, 5, 8]

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

// alphaAt(x, y) -> 0..255; colour is black (the mask only reads alpha).
export function makePng(width, height, alphaAt) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x++) raw[row + 1 + x * 4 + 3] = alphaAt(x, y)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

export function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

// Alpha of the decoded image at (x, y): enough of a PNG reader for our own files (filter 0 only).
export function pngAlpha(buf) {
  const { width, height } = pngSize(buf)
  let idat = []
  for (let p = 8; p < buf.length; ) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len))
    p += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  return (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : raw[y * (width * 4 + 1) + 1 + x * 4 + 3])
}

function inkAlpha(x, y) {
  const col = Math.floor(x / CELL_W)
  const row = Math.floor(y / CELL_H)
  if (!DRAWN_ROWS.includes(row) || col > 5) return 0
  const cx = x % CELL_W
  const cy = y % CELL_H
  const frameLine = (cx >= 20 && cx < 172 && (cy === 30 || cy === 31 || cy === 196 || cy === 197)) || (cy >= 30 && cy < 198 && (cx === 20 || cx === 21 || cx === 170 || cx === 171))
  const dots = cy >= 40 && cy < 52 && cx >= 32 && (cx - 32) % 18 < 12 && (cx - 32) / 18 < row + 1
  const barX = 34 + col * 22
  const bar = cy >= 70 && cy < 186 && cx >= barX && cx < barX + 16
  return frameLine || dots || bar ? 255 : 0
}

function fillAlpha(x, y) {
  const col = Math.floor(x / CELL_W)
  const row = Math.floor(y / CELL_H)
  if (!DRAWN_ROWS.includes(row) || col > 5) return 0
  const cx = x % CELL_W
  const cy = y % CELL_H
  return cx >= 22 && cx < 170 && cy >= 32 && cy < 196 ? 255 : 0
}

export function dummySheetPngs() {
  const w = CELL_W * COLS
  const h = CELL_H * ROWS
  return { ink: makePng(w, h, inkAlpha), fill: makePng(w, h, fillAlpha) }
}

export function dummySheet() {
  const { ink, fill } = dummySheetPngs()
  return { ink: 'data:image/png;base64,' + ink.toString('base64'), fill: 'data:image/png;base64,' + fill.toString('base64') }
}
