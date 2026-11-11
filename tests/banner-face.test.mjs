// The Dashboard banner's own figure (src/banner-face.js), drawn after design/dash-look-r8/after.html: two
// separate eyes, each with its pupil hole, the mouth centred under them, four fingers a side with round tops that
// end on the banner's bottom edge. And Helper's window keeps its character as it was: its markup for every
// expression is compared with tests/fixtures/character-markup.json, taken from main's src/character.js before the
// banner got a figure of its own (HH_WRITE_CHARACTER_SNAPSHOT=1 writes that file again).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount, all, loadSrc, registerPlugin, fakeStorage, fakeTimers, settle, byData } from './lib/render.mjs'
import { EXPRESSION_NAMES } from '../src/expressions.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SNAPSHOT = path.join(HERE, 'fixtures', 'character-markup.json')
const { Character } = await loadSrc('character.js')

const named = (tree, name) => all(tree, n => n.props && n.props['data-hh'] === name)[0] || null

// A drawn tree as plain data: element names, their props (no functions) and children.
function markup(node) {
  if (Array.isArray(node)) return node.map(markup)
  if (node === null || node === undefined || typeof node !== 'object') return node
  const props = {}
  for (const key of Object.keys(node.props || {}).sort()) {
    const v = node.props[key]
    if (key === 'children' || typeof v === 'function' || v === undefined) continue
    props[key] = v
  }
  return { type: typeof node.type === 'function' ? node.type.name : node.type, props, children: markup(node.props ? node.props.children : undefined) }
}

function characterMarkup() {
  const out = {}
  for (const size of [168, 132])
    for (const reduced of [false, true])
      for (const rising of [false, true])
        for (const expression of EXPRESSION_NAMES) {
          const tree = mount(() => Character({ size, expression, reduced, rising })).tree
          out[`${size} ${expression}${reduced ? ' reduced' : ''}${rising ? ' rising' : ''}`] = markup(tree)
        }
  return out
}

test("Helper's window: the character draws exactly what it drew before the banner got its own figure", () => {
  const now = JSON.parse(JSON.stringify(characterMarkup()))
  if (process.env.HH_WRITE_CHARACTER_SNAPSHOT === '1') fs.writeFileSync(SNAPSHOT, JSON.stringify(now, null, 1) + '\n')
  const before = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
  assert.deepEqual(Object.keys(now), Object.keys(before))
  for (const key of Object.keys(before)) assert.deepEqual(now[key], before[key], key)
})

const { BannerCharacter, BANNER_FACE } = await loadSrc('character.js')
const drawBanner = (props = {}) => mount(() => BannerCharacter({ size: 268, ...props })).tree

const box = el => {
  if (el.type === 'ellipse') return { left: el.props.cx - el.props.rx, right: el.props.cx + el.props.rx, top: el.props.cy - el.props.ry, bottom: el.props.cy + el.props.ry }
  throw new Error('not an ellipse')
}

test('the banner: two eye shapes that do not touch, each with its pupil hole inside it, and the mouth centred under them', () => {
  const tree = drawBanner()
  const eyes = ['left', 'right'].map(side => named(tree, `banner-eye-${side}`))
  eyes.forEach(e => assert.equal(e.type, 'ellipse'))
  const [l, r] = eyes.map(box)
  assert.ok(r.left - l.right > 0, `a gap between the eyes: ${r.left - l.right}`)
  assert.ok(r.left - l.right >= 10)
  ;['left', 'right'].forEach((side, i) => {
    const hole = named(tree, `banner-pupil-hole-${side}`)
    assert.ok(hole, side)
    assert.equal(hole.type, 'path')
    assert.equal(hole.props.fillRule, 'evenodd')
    // the hole: the second sub-path, a circle drawn as two arcs from its left end
    const m = hole.props.d.match(/ M(-?[\d.]+) (-?[\d.]+) a([\d.]+) /)
    assert.ok(m, `a round hole in ${hole.props.d}`)
    const hr = Number(m[3])
    const cx = Number(m[1]) + hr
    const cy = Number(m[2])
    const b = [l, r][i]
    assert.ok(hr > 0)
    assert.ok(cx - hr > b.left && cx + hr < b.right, 'inside its eye, sideways')
    assert.ok(cy - hr > b.top && cy + hr < b.bottom, 'inside its eye, up and down')
    // the eye is drawn through its own hole's mask
    const masked = all(tree, n => n.props && n.props.mask && n.props.mask.includes(`pupil-${side}`))
    assert.equal(masked.length, 1)
    assert.equal(named(masked[0], `banner-eye-${side}`), eyes[i])
  })
  const mouth = named(tree, 'banner-mouth')
  const xs = mouth.props.d.match(/-?\d+(\.\d+)?/g).map(Number).filter((n, k) => k % 2 === 0)
  const middle = (Math.min(...xs) + Math.max(...xs)) / 2
  const between = (BANNER_FACE.eyes[0].cx + BANNER_FACE.eyes[1].cx) / 2
  assert.equal(middle, between, 'the mouth is centred under the eyes')
  const ys = mouth.props.d.match(/-?\d+(\.\d+)?/g).map(Number).filter((n, k) => k % 2 === 1)
  assert.ok(Math.min(...ys) > l.bottom, 'under the eyes')
})

test('the banner: eight fingers, four a side, with round tops, ending on the bottom edge', () => {
  const tree = drawBanner()
  const fingers = all(tree, n => n.props && /^banner-finger-(left|right)-\d$/.test(n.props['data-hh'] || ''))
  assert.equal(fingers.length, 8)
  assert.equal(fingers.filter(f => f.props['data-hh'].includes('left')).length, 4)
  assert.equal(fingers.filter(f => f.props['data-hh'].includes('right')).length, 4)
  const bottom = BANNER_FACE.view.y + BANNER_FACE.view.height
  for (const f of fingers) {
    // a path: up from the edge, a half circle over the top, down to the edge again
    const d = f.props.d
    assert.match(d, / A /, 'a round top')
    assert.ok(d.includes(`V${bottom}`) || d.includes(` ${bottom}`), `${f.props['data-hh']} ends on the edge: ${d}`)
  }
  // left hand left of the eyes, right hand right of them
  const x0 = f => Number(f.props.d.match(/M(-?\d+(\.\d+)?)/)[1])
  const lefts = fingers.filter(f => f.props['data-hh'].includes('left')).map(x0)
  const rights = fingers.filter(f => f.props['data-hh'].includes('right')).map(x0)
  assert.ok(Math.max(...lefts) < BANNER_FACE.eyes[0].cx)
  assert.ok(Math.min(...rights) > BANNER_FACE.eyes[1].cx)
})

test('the banner: drawn in the same dots on a 5 px cell, about 180 px tall at 268 px wide, hidden from screen readers', () => {
  const tree = drawBanner()
  assert.equal(tree.type, 'svg')
  assert.equal(tree.props.width, 268)
  assert.ok(Math.abs(tree.props.height - 180) <= 8, `height ${tree.props.height}`)
  assert.equal(tree.props['aria-hidden'], true)
  assert.ok(named(tree, 'dots'), 'the dots filter')
  const dotted = named(tree, 'banner-dotted')
  assert.match(dotted.props.filter, /^url\(#.+-dots\)$/)
  const cells = all(tree, n => n.type === 'pattern')
  assert.equal(cells.length, 2)
  // one cell is 5 px on screen
  assert.ok(Math.abs((cells[0].props.width * 268) / BANNER_FACE.view.width - 5) < 0.001)
  assert.equal(tree.props['data-eyes'], 'follow')
  assert.equal(drawBanner({ reduced: true }).props['data-eyes'], 'still')
})

test('the Dashboard banner draws the banner figure; Helper\'s window still draws the character', async () => {
  globalThis.__hhHost = { request: async () => ({ ok: true, model: 'mock-small' }) }
  const { Page } = await registerPlugin(fakeStorage(), fakeTimers())
  const view = mount(Page)
  await settle()
  const fig = byData(view.tree, 'banner-character')
  assert.ok(fig, "the Dashboard banner is on the page")
  {
    const drawn = all(fig, n => n.props && n.props['data-hh-character'])
    assert.equal(drawn.length, 1)
    assert.equal(drawn[0].props['data-hh-character'], 'banner-face')
    assert.ok(named(fig, 'banner-eye-left'))
  }
  const helper = byData(view.tree, 'helper')
  assert.ok(helper, "Helper's window is on the page")
  assert.equal(all(helper, n => n.props && n.props['data-hh-character'] === 'face').length, 1)
  view.unmount()
  delete globalThis.__hhHost
})
