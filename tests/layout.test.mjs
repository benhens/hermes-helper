// Narrow windows (src/layout.js; Lead's decision for B3a, hhtech's b1-verify.md section 2C).
// Widths are our own page's width, which is the window minus Hermes's left sidebar (about 260 px
// when shown): window 1440 -> 1180, 1100 -> 840, 1000 -> 740, 800 -> 540.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutFor, MIN_MAIN_PX, RAIL_PX, RAIL_NUMBERS_PX, HELPER_PX, STRIP_PX } from '../src/layout.js'

const SIDEBAR = 260
const setup = (window, helper = 'open', extra = {}) => layoutFor({ width: window - SIDEBAR, tab: 'setup', helper, ...extra })
const yours = (window, helper = 'open') => layoutFor({ width: window - SIDEBAR, tab: 'yours', helper })

test('the widths match the columns page.js draws', () => {
  assert.deepEqual([RAIL_PX, RAIL_NUMBERS_PX, HELPER_PX, STRIP_PX, MIN_MAIN_PX], [256, 48, 320, 28, 320])
})

test('not measured yet (0): laid out as wide, nothing folds', () => {
  for (const width of [0, undefined, -5]) {
    const l = layoutFor({ width, tab: 'setup', helper: 'open' })
    assert.deepEqual([l.helper, l.folded, l.rail, l.columns, l.cardColumns], ['open', false, 'full', 2, 2])
  }
})

test('Setup at 1440 px with Hermes\'s sidebar: everything open, two-column facts', () => {
  const l = setup(1440)
  assert.deepEqual([l.helper, l.folded, l.rail, l.main, l.columns], ['open', false, 'full', 604, 2])
})

test('Setup at 1100 px: the open step would be 264 px, so the helper folds to its strip by itself', () => {
  const l = setup(1100)
  assert.deepEqual([l.helper, l.folded, l.rail, l.main, l.columns], ['strip', true, 'full', 556, 2])
})

test('Setup at 1000 px: folded helper, full step list, one-column facts', () => {
  const l = setup(1000)
  assert.deepEqual([l.helper, l.folded, l.rail, l.main, l.columns], ['strip', true, 'full', 456, 1])
})

test('Setup at 800 px: folded helper, step list as numbers only, the open step stays over 320 px', () => {
  const l = setup(800)
  assert.deepEqual([l.helper, l.folded, l.rail, l.main, l.columns], ['strip', true, 'numbers', 464, 1])
})

test('the open step never goes under 320 px on a page 400 px or wider, whatever the helper state', () => {
  for (let width = 400; width <= 1600; width += 4) {
    for (const helper of ['open', 'hidden', 'closed']) {
      for (const peek of [false, true]) {
        const l = layoutFor({ width, tab: 'setup', helper, peek })
        // From 400 px of page (Hermes's 400 px minimum window with its sidebar hidden) upwards.
        assert.ok(l.main >= MIN_MAIN_PX, `width ${width} ${helper} peek=${peek}: main ${l.main}`)
      }
    }
  }
})

test('the columns we draw add up to the page width: nothing of ours runs past its edge', () => {
  for (let width = 380; width <= 1600; width += 10) {
    for (const tab of ['setup', 'yours']) {
      for (const helper of ['open', 'hidden', 'closed']) {
        const l = layoutFor({ width, tab, helper })
        const rail = l.rail === 'full' ? RAIL_PX : l.rail === 'numbers' ? RAIL_NUMBERS_PX : 0
        const side = l.helper === 'open' ? HELPER_PX : l.helper === 'strip' ? STRIP_PX : 0
        assert.equal(rail + side + l.main, width, `${width} ${tab} ${helper}`)
      }
    }
  }
})

test('the helper comes back by itself when the window is wider again (nothing is saved)', () => {
  assert.equal(setup(1000).helper, 'strip')
  assert.equal(setup(1440).helper, 'open')
  assert.equal(setup(1000).helper, 'strip')
})

test('the person\'s own choice wins: hidden stays a strip, closed stays closed, at any width', () => {
  for (const window of [1440, 1100, 800]) {
    assert.equal(setup(window, 'hidden').helper, 'strip')
    assert.equal(setup(window, 'hidden').folded, false)
    assert.equal(setup(window, 'closed').helper, 'none')
  }
})

test('opened from the folded strip: it lies over the page, and the open step keeps its width', () => {
  const l = setup(800, 'open', { peek: true })
  assert.deepEqual([l.helper, l.folded, l.rail, l.main], ['over', true, 'numbers', 464])
  // peek means nothing when there is room for the column
  assert.equal(setup(1440, 'open', { peek: true }).helper, 'open')
})

test('a helper the person hid, opened from its strip in a narrow window: over the page; wide: still a strip', () => {
  assert.deepEqual([setup(800, 'hidden', { peek: true }).helper, setup(800, 'hidden', { peek: true }).narrow], ['over', true])
  assert.equal(setup(1440, 'hidden', { peek: true }).helper, 'strip')
  assert.equal(setup(800, 'closed', { peek: true }).helper, 'none')
  assert.equal(setup(1440).narrow, false)
})

test('Your setup: the cards go to one column when narrow; the helper folds only under 320 px', () => {
  assert.deepEqual([yours(1440).helper, yours(1440).cardColumns], ['open', 2])
  assert.deepEqual([yours(1100).helper, yours(1100).main, yours(1100).cardColumns], ['open', 520, 1])
  assert.deepEqual([yours(1000).helper, yours(1000).main, yours(1000).cardColumns], ['open', 420, 1])
  assert.deepEqual([yours(800).helper, yours(800).main, yours(800).cardColumns], ['strip', 512, 1])
  assert.equal(yours(1440).rail, 'none')
  // helper closed at 1100: the whole 840 px, two columns
  assert.equal(yours(1100, 'closed').cardColumns, 2)
})
