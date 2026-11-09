// The helper's character: one swappable component, used by the page only through <Character>.
// Today it draws hhdesign's hand (design/hermes-look-r3) as inline SVG. Given a pet sheet
// (src/pet-sheet.js) it draws the pet instead, the way hhtech checked in the real app
// (dev/checks/hhtech-pet/plugin.template.js): two stacked divs, the fill below and the ink on top,
// each a CSS mask holding the sheet, painted in theme colours (the ink is var(--ui-accent)); the
// mask position picks the frame, and element.animate() steps through the row's frames.
// Poses are the petdex rows the helper uses: idle, waving, jumping, failed, review (poseFor).
// Colours: theme variables only, as inline styles, so there is no stylesheet to clean up.
import { useEffect, useId, useRef } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { PET_SHEET } from './pet-sheet.js'

/* ---------- which pose ---------- */

// The petdex layout (Hermes's pets: 8 columns × 9 rows of 192 × 208 cells; 6 frames a row over
// 1.1 s unless the sheet says otherwise, as Hermes's own pet-sprite.tsx defaults).
export const SHEET = { cols: 8, rows: 9, cellW: 192, cellH: 208, frames: 6, loopMs: 1100 }
// Row of each pose in that layout (Hermes's DEFAULT_STATE_ROWS: 0 idle, 3 waving, 4 jumping,
// 5 failed, 8 review).
export const POSE_ROW = { idle: 0, waving: 3, jumping: 4, failed: 5, review: 8 }
// How long a one-off pose (waving, jumping) plays before going back to idle: two loops.
export const FLASH_MS = 2 * SHEET.loopMs

// The page's state as a pose, in this order: an error (the check failed) = failed; the model
// is answering = review; a one-off pose that is playing (waving when the helper opens, jumping
// when a step is finished); otherwise idle.
export function poseFor({ model, answering = false, flash = null } = {}) {
  if (model === 'error') return 'failed'
  if (answering) return 'review'
  if (flash === 'waving' || flash === 'jumping') return flash
  return 'idle'
}

/* ---------- the sprite (when a sheet is set) ---------- */

const frameCount = (sheet, row) => {
  const n = sheet && sheet.framesByRow ? sheet.framesByRow[row] : undefined
  return Number.isInteger(n) && n > 0 && n <= SHEET.cols ? n : SHEET.frames
}

// One layer's inline style: the whole sheet as a mask, scaled, moved to (frame, row).
export function spriteLayer(url, colour, { row, frame = 0, scale }) {
  const w = SHEET.cellW * scale
  const h = SHEET.cellH * scale
  const size = `${SHEET.cols * w}px ${SHEET.rows * h}px`
  const pos = `${-frame * w}px ${-row * h}px`
  return {
    position: 'absolute',
    inset: 0,
    background: colour,
    maskImage: `url("${url}")`,
    WebkitMaskImage: `url("${url}")`,
    maskSize: size,
    WebkitMaskSize: size,
    maskPosition: pos,
    WebkitMaskPosition: pos,
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat'
  }
}

// The two key frames for element.animate(): from the row's first frame to just past its last,
// played with steps(n), so each frame shows for an equal share of the loop.
export function spriteAnimation(sheet, row, scale) {
  const n = frameCount(sheet, row)
  const w = SHEET.cellW * scale
  const y = `${-row * SHEET.cellH * scale}px`
  return {
    keys: [
      { maskPosition: `0px ${y}`, WebkitMaskPosition: `0px ${y}` },
      { maskPosition: `${-n * w}px ${y}`, WebkitMaskPosition: `${-n * w}px ${y}` }
    ],
    options: { duration: Math.round((SHEET.loopMs * n) / SHEET.frames), iterations: Infinity, easing: `steps(${n}, end)` }
  }
}

const INK_COLOUR = 'var(--ui-accent)'
// hhtech: --ui-bg-elevated as the fill is almost invisible in both themes; the hand's own body
// tone (the accent mixed into the page surface) reads as a solid figure in light and dark.
const FILL_COLOUR = 'color-mix(in oklab, var(--ui-accent) 18%, var(--ui-editor-surface-background))'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/* ---------- the drawn hand (no sheet) ---------- */

const BODY =
  'M31 73c-5.5 0-9-3.4-9-9v-10.5c-4.6-1.1-9-5.3-9.6-10.4-.5-4.3 3.4-6.9 7.1-4.6 1 .6 1.8 1.4 2.5 2.4V29c0-11 8.6-19 20-19s20 8 20 19v35c0 5.6-3.5 9-9 9z'

const SURFACE = 'var(--ui-editor-surface-background)'
const mix = pct => `color-mix(in oklab, var(--ui-accent) ${pct}%, ${SURFACE})`
const INK = { fill: 'var(--ui-text-primary)' }
const INK_LINE = { fill: 'none', stroke: 'var(--ui-text-primary)', strokeWidth: 2, strokeLinecap: 'round' }

// size: the character's height in px. pose: one of POSE_ROW's names. sheet: a pet sheet, or null
// for the drawn hand (default: src/pet-sheet.js).
export function Character({ size = 48, pose = 'idle', sheet = PET_SHEET, shadow = true, label = 'Helping Hand' }) {
  const gid = 'hh-g' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const ink = useRef(null)
  const fill = useRef(null)
  const shown = pose in POSE_ROW ? pose : 'idle'
  const row = POSE_ROW[shown]
  const scale = size / SHEET.cellH

  useEffect(() => {
    if (!sheet || reducedMotion()) return
    const { keys, options } = spriteAnimation(sheet, row, scale)
    const running = [ink.current, fill.current].filter(el => el && typeof el.animate === 'function').map(el => el.animate(keys, options))
    return () => running.forEach(a => a.cancel())
  }, [sheet, row, scale])

  const a11y = {
    role: label ? 'img' : undefined,
    'aria-label': label || undefined,
    'aria-hidden': label ? undefined : true,
    'data-hh-character': sheet ? 'pet' : 'hand',
    'data-pose': shown
  }

  if (sheet) {
    return jsxs('div', {
      ...a11y,
      style: { position: 'relative', flex: 'none', width: Math.round(SHEET.cellW * scale), height: size },
      children: [
        sheet.fill ? jsx('div', { ref: fill, 'data-hh': 'pet-fill', style: spriteLayer(sheet.fill, FILL_COLOUR, { row, scale }) }, 'fill') : null,
        jsx('div', { ref: ink, 'data-hh': 'pet-ink', style: spriteLayer(sheet.ink, INK_COLOUR, { row, scale }) }, 'ink')
      ]
    })
  }

  const mouth = shown === 'failed' ? 'M39.5 45h8' : 'M39 43.5q4.5 4 9 0'
  return jsxs('svg', {
    ...a11y,
    viewBox: '0 0 80 80',
    width: size,
    height: size,
    style: { display: 'block', flex: 'none' },
    children: [
      jsx('defs', {
        children: jsxs('linearGradient', {
          id: gid,
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 1,
          children: [
            jsx('stop', { offset: 0, style: { stopColor: mix(62) } }),
            jsx('stop', { offset: 1, style: { stopColor: mix(80) } })
          ]
        })
      }),
      shadow ? jsx('ellipse', { cx: 42, cy: 76.5, rx: 19, ry: 2.4, style: { fill: 'var(--ui-text-primary)', opacity: 0.1 } }) : null,
      jsx('path', { d: BODY, fill: `url(#${gid})` }),
      jsx('path', { d: 'M22 50.5c1.6 1.3 2.6 1.9 4.4 2.4', style: { fill: 'none', stroke: 'var(--ui-accent)', strokeWidth: 1.6, strokeLinecap: 'round' } }),
      jsx('rect', { x: 22, y: 64, width: 40, height: 9, rx: 4.5, style: { fill: mix(30) } }),
      jsx('ellipse', { cx: 37, cy: 35, rx: 3.3, ry: 4.3, style: INK }),
      jsx('ellipse', { cx: 50, cy: 35, rx: 3.3, ry: 4.3, style: INK }),
      jsx('circle', { cx: 38.3, cy: 33.3, r: 1.1, style: { fill: SURFACE } }),
      jsx('circle', { cx: 51.3, cy: 33.3, r: 1.1, style: { fill: SURFACE } }),
      jsx('circle', { cx: 31, cy: 43.5, r: 3, style: { fill: mix(35), opacity: 0.9 } }),
      jsx('circle', { cx: 56, cy: 43.5, r: 3, style: { fill: mix(35), opacity: 0.9 } }),
      jsx('path', { d: mouth, style: INK_LINE })
    ]
  })
}
