// The character slot (B3 scope 2): today the drawn hand; given a petdex-layout sheet, the pet,
// drawn as hhtech's two masked layers in theme colours, with the row picked by the page's state.
// Tested with a dummy sheet drawn by tests/lib/dummy-sheet.mjs (no petdex sheet anywhere).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PET_SHEET } from '../src/pet-sheet.js'
import { mount, all, loadSrc } from './lib/render.mjs'
import { useState } from './fakes/react.mjs'
import { dummySheet, dummySheetPngs, pngSize, pngAlpha, CELL_W, CELL_H, DRAWN_ROWS } from './lib/dummy-sheet.mjs'

const { Character, poseFor, spriteLayer, spriteAnimation, SHEET, POSE_ROW, FLASH_MS } = await loadSrc('character.js')
const sheet = dummySheet()
const draw = props => mount(() => Character(props)).tree
const layers = tree => all(tree, n => /^pet-(ink|fill)$/.test(n.props['data-hh'] || ''))

test('no pet yet: src/pet-sheet.js is null, and the character is the drawn hand', () => {
  assert.equal(PET_SHEET, null)
  const tree = draw({ size: 48 })
  assert.equal(tree.type, 'svg')
  assert.equal(tree.props['data-hh-character'], 'hand')
  assert.equal(tree.props.height, 48)
})

test('the petdex layout and the rows the helper uses: 0 idle, 3 waving, 4 jumping, 5 failed, 8 review', () => {
  assert.deepEqual({ cols: SHEET.cols, rows: SHEET.rows, cellW: SHEET.cellW, cellH: SHEET.cellH }, { cols: 8, rows: 9, cellW: 192, cellH: 208 })
  assert.deepEqual(POSE_ROW, { idle: 0, waving: 3, jumping: 4, failed: 5, review: 8 })
})

test('page state to pose: idle by default; failed on an error; review while the model answers; waving or jumping while one plays', () => {
  assert.equal(poseFor({ model: 'ok' }), 'idle')
  assert.equal(poseFor({ model: 'checking' }), 'idle')
  assert.equal(poseFor({ model: 'none' }), 'idle')
  assert.equal(poseFor({ model: 'error' }), 'failed')
  assert.equal(poseFor({ model: 'ok', answering: true }), 'review')
  assert.equal(poseFor({ model: 'ok', flash: 'waving' }), 'waving')
  assert.equal(poseFor({ model: 'ok', flash: 'jumping' }), 'jumping')
  // an error wins over everything; the model answering wins over a one-off pose
  assert.equal(poseFor({ model: 'error', answering: true, flash: 'jumping' }), 'failed')
  assert.equal(poseFor({ model: 'ok', answering: true, flash: 'waving' }), 'review')
  assert.equal(FLASH_MS, 2200)
})

test('the dummy sheet is a petdex-size PNG with only the five used rows drawn', () => {
  const { ink, fill } = dummySheetPngs()
  for (const png of [ink, fill]) assert.deepEqual(pngSize(png), { width: 1536, height: 1872 })
  const a = pngAlpha(fill)
  for (let row = 0; row < 9; row++) {
    const centre = a(CELL_W / 2, row * CELL_H + CELL_H / 2)
    assert.equal(centre, DRAWN_ROWS.includes(row) ? 255 : 0, `row ${row}`)
  }
})

test('with a sheet: two stacked layers, fill below and ink on top, each a mask of the sheet in theme colours', () => {
  const tree = draw({ size: 52, sheet, pose: 'idle' })
  assert.equal(tree.props['data-hh-character'], 'pet')
  assert.equal(tree.props.role, 'img')
  assert.deepEqual([tree.props.style.width, tree.props.style.height], [48, 52])
  const [fill, ink] = layers(tree)
  assert.equal(fill.props['data-hh'], 'pet-fill')
  assert.equal(ink.props['data-hh'], 'pet-ink')
  assert.equal(ink.props.style.background, 'var(--ui-accent)')
  assert.match(fill.props.style.background, /^color-mix\(in oklab, var\(--ui-accent\) \d+%, var\(--ui-editor-surface-background\)\)$/)
  assert.equal(ink.props.style.maskImage, `url("${sheet.ink}")`)
  assert.equal(fill.props.style.maskImage, `url("${sheet.fill}")`)
  assert.equal(ink.props.style.WebkitMaskImage, ink.props.style.maskImage)
  // the whole sheet, scaled to 52 px cells: 8 × 48 by 9 × 52
  assert.equal(ink.props.style.maskSize, '384px 468px')
  assert.equal(ink.props.style.maskRepeat, 'no-repeat')
})

test('an ink-only sheet draws one layer', () => {
  const tree = draw({ size: 52, sheet: { ink: sheet.ink } })
  assert.deepEqual(layers(tree).map(l => l.props['data-hh']), ['pet-ink'])
})

test('each pose shows its own row of the sheet', () => {
  for (const [pose, row] of Object.entries(POSE_ROW)) {
    const tree = draw({ size: 52, sheet, pose })
    assert.equal(tree.props['data-pose'], pose)
    for (const l of layers(tree)) assert.equal(l.props.style.maskPosition, `0px ${-row * 52}px`, pose)
  }
  assert.equal(draw({ size: 52, sheet, pose: 'dancing' }).props['data-pose'], 'idle')
})

test('animation: steps through the row\'s frames, 6 by default or the sheet\'s own count, on both layers', () => {
  const a = spriteAnimation(sheet, 3, 0.25)
  assert.deepEqual(a.keys[0], { maskPosition: '0px -156px', WebkitMaskPosition: '0px -156px' })
  assert.deepEqual(a.keys[1], { maskPosition: '-288px -156px', WebkitMaskPosition: '-288px -156px' })
  assert.deepEqual(a.options, { duration: 1100, iterations: Infinity, easing: 'steps(6, end)' })
  const four = spriteAnimation({ ...sheet, framesByRow: { 3: 4 } }, 3, 0.25)
  assert.equal(four.options.easing, 'steps(4, end)')
  assert.equal(four.keys[1].maskPosition, '-192px -156px')
  assert.equal(spriteAnimation({ ...sheet, framesByRow: { 3: 99 } }, 3, 0.25).options.easing, 'steps(6, end)')

  // In a mounted character, the effect starts one animation per layer with the row's key frames.
  const started = []
  let setPose
  const view = mount(() => {
    const [pose, set] = useState('idle')
    setPose = set
    return Character({ size: 52, sheet, pose })
  })
  const [fill, ink] = layers(view.tree)
  let cancelled = 0
  ink.props.ref.current = { animate: (k, o) => (started.push(['ink', k, o]), { cancel: () => cancelled++ }) }
  fill.props.ref.current = { animate: (k, o) => (started.push(['fill', k, o]), { cancel: () => cancelled++ }) }
  setPose('waving')
  assert.deepEqual(started.map(s => s[0]).sort(), ['fill', 'ink'])
  assert.equal(cancelled, 0)
  // a new pose stops the old row's animations first; leaving the page stops the rest
  setPose('jumping')
  assert.equal(cancelled, 2)
  assert.equal(started.length, 4)
  view.unmount()
  assert.equal(cancelled, 4)
  for (const [, keys, options] of started.slice(0, 2)) {
    assert.deepEqual(keys, spriteAnimation(sheet, 3, 0.25).keys)
    assert.equal(options.easing, 'steps(6, end)')
  }
})

test('the frame number moves the mask sideways by whole cells', () => {
  assert.equal(spriteLayer('u', 'c', { row: 5, frame: 2, scale: 0.5 }).maskPosition, '-192px -520px')
})
