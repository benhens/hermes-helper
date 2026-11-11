// How the page fits its window (src/layout.js; talk v1, rows 4 and 5 of docs/build/talk-v1-plan.md).
// Widths are our own page's width, which is the window minus Hermes's left sidebar (about 260 px
// when shown): window 1440 -> 1180, 1200 -> 940, 1000 -> 740, 800 -> 540; 400 with the sidebar hidden.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as L from '../src/layout.js'

const { layoutFor, clampHelperWidth } = L
const SIDEBAR = 260
const setup = (window, extra = {}) => layoutFor({ width: window - SIDEBAR, height: 822, tab: 'setup', helperWidth: 460, ...extra })
const yours = (window, extra = {}) => layoutFor({ width: window - SIDEBAR, height: 822, tab: 'yours', helperWidth: 460, ...extra })

test('the numbers: Helper\'s window 460 wide, dragged between 360 and 600; character 168, or 132 when small', () => {
  assert.deepEqual([L.HELPER_PX, L.HELPER_MIN_PX, L.HELPER_MAX_PX], [460, 360, 600])
  assert.deepEqual([L.CHARACTER_PX, L.CHARACTER_SMALL_PX, L.SMALL_UNDER_WIDE_PX, L.SMALL_UNDER_HIGH_PX], [168, 132, 420, 600])
  assert.deepEqual([L.RAIL_PX, L.RAIL_NUMBERS_PX, L.STRIP_PX, L.MIN_MAIN_PX], [256, 48, 28, 320])
  // under this page width Helper lies over the page: numbers-only step list + Helper at its narrowest + the open step's least
  assert.equal(L.OVER_UNDER_PX, 48 + 360 + 320)
})

test('a remembered width is kept inside 360 to 600; junk gives 460', () => {
  assert.equal(clampHelperWidth(460), 460)
  assert.equal(clampHelperWidth(200), 360)
  assert.equal(clampHelperWidth(9000), 600)
  assert.equal(clampHelperWidth(412.6), 413)
  for (const junk of [undefined, null, 'wide', NaN, {}, true]) assert.equal(clampHelperWidth(junk), 460)
})

test('not measured yet (0): laid out as wide, Helper a 460 px column, character 168', () => {
  for (const width of [0, undefined, -5]) {
    const l = layoutFor({ width, height: 0, tab: 'setup', helperWidth: 460 })
    assert.deepEqual([l.helper, l.helperPx, l.rail, l.columns, l.cardColumns, l.characterPx, l.small, l.tight, l.grip], ['column', 460, 'full', 2, 2, 168, false, false, true])
  }
})

test('Setup at 1440 px: Helper a 460 px column on the right, the full step list, the open step 464 px', () => {
  const l = setup(1440)
  assert.deepEqual([l.helper, l.helperPx, l.rail, l.main, l.narrow, l.grip], ['column', 460, 'full', 464, false, true])
})

test('row 5, first: the step list shrinks to its numbers (1200 px window)', () => {
  const l = setup(1200)
  assert.deepEqual([l.helper, l.helperPx, l.rail, l.main], ['column', 460, 'numbers', 432])
})

test('row 5, second: Helper\'s window narrows, down to 360 (1050 px window: 790 px page)', () => {
  const l = setup(1050)
  assert.deepEqual([l.helper, l.rail, l.helperPx, l.main], ['column', 'numbers', 422, 320])
  const m = setup(1000)
  assert.deepEqual([m.helper, m.rail, m.helperPx, m.main], ['column', 'numbers', 372, 320])
  // under 420 the character is the small one and the side padding the tight one
  assert.deepEqual([m.characterPx, m.small, m.tight], [132, true, true])
  assert.deepEqual([l.characterPx, l.small, l.tight], [168, false, false])
})

test('row 5, third: under 728 px of page Helper lies over the page, with the strip at the edge; it starts open', () => {
  const l = setup(800) // 540 px page
  assert.deepEqual([l.helper, l.narrow, l.helperPx, l.grip], ['over', true, 460, false])
  // the page under it keeps its own room beside the strip
  assert.deepEqual([l.rail, l.main], ['numbers', 540 - 48 - 28])
  const edge = layoutFor({ width: 728, height: 822, tab: 'setup', helperWidth: 460 })
  assert.deepEqual([edge.helper, edge.helperPx, edge.main], ['column', 360, 320])
  assert.equal(layoutFor({ width: 727, height: 822, tab: 'setup', helperWidth: 460 }).helper, 'over')
})

test('the smallest window Hermes allows (400 x 620, its sidebar hidden): Helper 372 px wide plus the strip, small character', () => {
  const l = layoutFor({ width: 400, height: 542, tab: 'setup', helperWidth: 460 })
  assert.deepEqual([l.helper, l.helperPx, l.characterPx, l.small, l.tight], ['over', 372, 132, true, true])
})

test('folded (the strip was pressed in a narrow window): only the strip shows', () => {
  const l = setup(800, { folded: true })
  assert.deepEqual([l.helper, l.narrow, l.main], ['strip', true, 540 - 48 - 28])
})

test('the one place that folds Helper away also works in a wide window (no control uses it today)', () => {
  const l = setup(1440, { folded: true })
  assert.deepEqual([l.helper, l.narrow, l.rail, l.main, l.grip], ['strip', false, 'full', 1180 - 256 - 28, false])
})

test('the same threshold on both tabs, so changing the tab never moves Helper between column and over the page', () => {
  for (const width of [600, 700, 727, 728, 760, 900, 1180]) {
    assert.equal(layoutFor({ width, height: 822, tab: 'setup', helperWidth: 460 }).helper, layoutFor({ width, height: 822, tab: 'yours', helperWidth: 460 }).helper, `at ${width}`)
  }
})

test('Your setup has no step list: Helper keeps its width longer, the cards go to one column under 600', () => {
  const l = yours(1440)
  assert.deepEqual([l.helper, l.helperPx, l.rail, l.main, l.cardColumns], ['column', 460, 'none', 720, 2])
  const m = yours(1200)
  assert.deepEqual([m.helperPx, m.main, m.cardColumns], [460, 480, 1])
  const n = yours(1000)
  assert.deepEqual([n.helper, n.helperPx, n.main], ['column', 420, 320])
})

test('a dragged width is used as long as the open step keeps 320 px', () => {
  assert.deepEqual([setup(1440, { helperWidth: 600 }).helperPx, setup(1440, { helperWidth: 600 }).rail, setup(1440, { helperWidth: 600 }).main], [600, 'full', 324])
  assert.deepEqual([setup(1440, { helperWidth: 360 }).helperPx, setup(1440, { helperWidth: 360 }).main], [360, 564])
  // 1300 px window: 600 would leave the step 184 px beside the full list, so the list shows numbers
  const l = setup(1300, { helperWidth: 600 })
  assert.deepEqual([l.rail, l.helperPx, l.main], ['numbers', 600, 392])
})

test('the 132 px character: Helper under 420 px wide, or the page under 600 px high (any width)', () => {
  assert.deepEqual([setup(1440, { helperWidth: 419 }).characterPx, setup(1440, { helperWidth: 419 }).tight], [132, true])
  assert.deepEqual([setup(1440, { helperWidth: 420 }).characterPx, setup(1440, { helperWidth: 420 }).tight], [168, false])
  const low = setup(1440, { height: 599 })
  assert.deepEqual([low.characterPx, low.small, low.tight], [132, true, false])
  assert.equal(setup(1440, { height: 600 }).characterPx, 168)
})

test('two-column facts and choices need 520 px of open step', () => {
  assert.equal(setup(1440).columns, 1) // 464
  assert.equal(setup(1440, { helperWidth: 360 }).columns, 2) // 564
})

test('the open step never goes under 320 px on a page 400 px or wider, whatever width Helper was dragged to', () => {
  for (let width = 400; width <= 1600; width += 4) {
    for (const tab of ['setup', 'yours']) {
      for (const helperWidth of [360, 460, 600]) {
        for (const folded of [false, true]) {
          const l = layoutFor({ width, height: 822, tab, helperWidth, folded })
          // From 400 px of page (Hermes's 400 px minimum window with its sidebar hidden) upwards.
          assert.ok(l.main >= L.MIN_MAIN_PX, `width ${width} ${tab} ${helperWidth} folded=${folded}: main ${l.main}`)
        }
      }
    }
  }
})

test('the columns we draw add up to the page width: nothing of ours runs past its edge', () => {
  for (let width = 380; width <= 1600; width += 10) {
    for (const tab of ['setup', 'yours']) {
      for (const helperWidth of [360, 460, 600]) {
        for (const folded of [false, true]) {
          const l = layoutFor({ width, height: 822, tab, helperWidth, folded })
          const rail = l.rail === 'full' ? L.RAIL_PX : l.rail === 'numbers' ? L.RAIL_NUMBERS_PX : 0
          const side = l.helper === 'column' ? l.helperPx : L.STRIP_PX
          assert.equal(rail + side + l.main, width, `${width} ${tab} ${helperWidth} folded=${folded}`)
          // over the page, Helper and the strip together are never wider than the page
          if (l.helper === 'over') assert.ok(l.helperPx + L.STRIP_PX <= width, `${width}: over ${l.helperPx}`)
          assert.ok(l.helperPx <= L.HELPER_MAX_PX)
        }
      }
    }
  }
})

test('Helper comes back as a column by itself when the window is wide enough again', () => {
  assert.equal(setup(800).helper, 'over')
  assert.equal(setup(1440).helper, 'column')
})
