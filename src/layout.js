// How the page fits its window (talk v1: rows 4 and 5 of docs/build/talk-v1-plan.md).
// Pure rules, no React: page.js measures our own page element (a ResizeObserver on our own
// markup, nothing of Hermes's) and asks layoutFor() what to show.
// Helper's conversation window is a column on the right, HELPER_PX wide; its left edge can be
// dragged between HELPER_MIN_PX and HELPER_MAX_PX and the width is remembered. The open step (or
// the Your setup column) must stay at least MIN_MAIN_PX wide. When the page gets narrow, in order:
//   1. the step list shrinks to its numbers;
//   2. Helper's window narrows, down to HELPER_MIN_PX;
//   3. under OVER_UNDER_PX of page Helper lies over the page, with the "Helper" strip at the
//      page's right edge; the strip folds it away and brings it back. It starts open.
// Folding Helper away is this one input, `folded`. Today only the strip sets it, and only in a
// narrow window; a way to put Helper away in a wide window would set the same input.
// The two-column facts (and the answer cards) stack into one column under TWO_COLUMNS_PX; the Your
// setup cards do the same under CARD_COLUMNS_PX.

export const RAIL_PX = 256
export const RAIL_NUMBERS_PX = 48
export const STRIP_PX = 28
export const MIN_MAIN_PX = 320
export const HELPER_PX = 460
export const HELPER_MIN_PX = 360
export const HELPER_MAX_PX = 600
// One threshold for both tabs, so changing the tab never moves Helper between its column and
// over the page: the numbers-only step list, Helper at its narrowest, the open step's least.
export const OVER_UNDER_PX = RAIL_NUMBERS_PX + HELPER_MIN_PX + MIN_MAIN_PX
// The character: 168 px wide; 132 px when Helper's window is under 420 px wide or the page is
// under 600 px high (design/talk-r3/notes.md, section 7).
export const CHARACTER_PX = 168
export const CHARACTER_SMALL_PX = 132
export const SMALL_UNDER_WIDE_PX = 420
export const SMALL_UNDER_HIGH_PX = 600
// The things to pick (src/talk-view.js Picks): how many columns a list takes (talk-r5): four are two rows
// of two, three or two one row, so no row is ever half empty; one column (stacked) when a label would wrap.
// talk v2 look (hhdesign's review of e86b410, section 3 point 1): four picks in a window 420 px or wider
// stay two by two when a label wraps to two lines inside its pick; only a label that would need three
// lines stacks them. Under 420 px, and for two or three, one line as before.
export const columnsFor = (count, stacked) => (stacked || count < 2 ? 1 : count === 4 ? 2 : count)
export const FOUR_TWO_LINES_PX = 420
export const linesAllowed = (count, width) => (count === 4 && width >= FOUR_TWO_LINES_PX ? 2 : 1)
// The open step's own padding is 24 px a side, so 520 leaves two facts of about 226 px each.
export const TWO_COLUMNS_PX = 520
// Two cards of about 270 px each, after the padding and the 12 px gap.
export const CARD_COLUMNS_PX = 600

// The width the person dragged Helper's window to, as remembered: a whole number of px inside
// the limits. Anything that is not a number gives the default.
export function clampHelperWidth(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return HELPER_PX
  return Math.min(HELPER_MAX_PX, Math.max(HELPER_MIN_PX, Math.round(value)))
}

// width, height: our page's measured size in px (0 or missing = not measured yet: lay out as wide
// and high). tab: 'setup' | 'yours'. helperWidth: the remembered width. folded: Helper is put away.
// Returns:
//   helper:   'column' | 'over' | 'strip'   beside the page, over the page, or folded to its strip
//   helperPx: the width Helper's window is drawn at
//   narrow:   the page is too narrow for both sides (Helper lies over the page, the strip shows)
//   grip:     the edge to drag is shown (only beside the page)
//   rail:     'full' | 'numbers' | 'none'   the step list (none on Your setup)
//   main:     the open step's (or Your setup's) width in px, Infinity when not measured
//   columns: 1 | 2   facts and choices side by side;   cardColumns: 1 | 2
//   characterPx, small (the 132 px character), tight (the 14 px side padding, under 420 px wide)
export function layoutFor({ width, height, tab, helperWidth, folded = false }) {
  const w = typeof width === 'number' && width > 0 ? width : Infinity
  const h = typeof height === 'number' && height > 0 ? height : Infinity
  const want = clampHelperWidth(helperWidth)
  const hasRail = tab === 'setup'
  const narrow = w < OVER_UNDER_PX
  const helper = folded ? 'strip' : narrow ? 'over' : 'column'

  let rail = hasRail ? 'full' : 'none'
  let railSpace = hasRail ? RAIL_PX : 0
  let helperPx = want
  if (helper === 'column') {
    if (hasRail && w - RAIL_PX - want < MIN_MAIN_PX) {
      rail = 'numbers'
      railSpace = RAIL_NUMBERS_PX
    }
    helperPx = Math.min(want, Math.max(HELPER_MIN_PX, w - railSpace - MIN_MAIN_PX))
  } else {
    if (hasRail && w - RAIL_PX - STRIP_PX < MIN_MAIN_PX) {
      rail = 'numbers'
      railSpace = RAIL_NUMBERS_PX
    }
    // Over the page it leaves the strip free, so the strip can always be pressed.
    helperPx = narrow ? Math.min(want, w - STRIP_PX) : want
  }

  const main = w - railSpace - (helper === 'column' ? helperPx : STRIP_PX)
  const tight = helperPx < SMALL_UNDER_WIDE_PX
  const small = tight || h < SMALL_UNDER_HIGH_PX
  return {
    helper,
    helperPx,
    narrow,
    grip: helper === 'column',
    rail,
    main,
    columns: main >= TWO_COLUMNS_PX ? 2 : 1,
    cardColumns: main >= CARD_COLUMNS_PX ? 2 : 1,
    characterPx: small ? CHARACTER_SMALL_PX : CHARACTER_PX,
    small,
    tight
  }
}
