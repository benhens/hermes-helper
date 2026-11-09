// How the page fits a narrow window (Lead's decision for B3a; hhtech's b1-verify.md section 2C).
// Pure rules, no React: page.js measures our own page element (a ResizeObserver on our own
// markup, nothing of Hermes's) and asks layoutFor() what to show. In order:
//   1. the open step (or the Your setup column) must stay at least MIN_MAIN_PX wide. If an open
//      helper would push it under that, the helper folds into its edge strip by itself. Nothing is
//      saved: the helper comes back when the window is wider again.
//   2. if the open step is still under MIN_MAIN_PX, the step list shrinks to its numbers.
//   3. the two-column facts (and the three answer choices) stack into one column under
//      TWO_COLUMNS_PX; the Your setup cards do the same under CARD_COLUMNS_PX.
// The widths match the inline column widths page.js sets (16rem, 3rem, 20rem) and the strip's w-7.

export const RAIL_PX = 256
export const RAIL_NUMBERS_PX = 48
export const HELPER_PX = 320
export const STRIP_PX = 28
export const MIN_MAIN_PX = 320
// The open step's own padding is 24 px a side, so 520 leaves two facts of about 226 px each.
export const TWO_COLUMNS_PX = 520
// Two cards of about 270 px each, after the padding and the 12 px gap.
export const CARD_COLUMNS_PX = 600

// width: our page's measured width in px (0 or missing = not measured yet: lay out as wide).
// tab: 'setup' | 'yours'. helper: the person's choice, 'open' | 'hidden' | 'closed'.
// peek: the person opened the helper from its strip while the window is too narrow for the
// column (shown over the page; nothing saved).
// Returns:
//   helper: 'open' | 'strip' | 'over' | 'none'   what the helper column shows
//   folded: true when the page folded the helper by itself
//   narrow: true when an open helper would not fit as a column on this tab
//   rail:   'full' | 'numbers' | 'none'          the step list (none on Your setup)
//   main:   the open step's (or Your setup's) width in px, Infinity when not measured
//   columns: 1 | 2   facts (two) and choices (three) side by side;   cardColumns: 1 | 2
export function layoutFor({ width, tab, helper, peek = false }) {
  const w = typeof width === 'number' && width > 0 ? width : Infinity
  const railFull = tab === 'setup' ? RAIL_PX : 0
  const narrow = w - railFull - HELPER_PX < MIN_MAIN_PX

  let shown = helper === 'open' ? 'open' : helper === 'hidden' ? 'strip' : 'none'
  const folded = helper === 'open' && narrow
  if (folded) shown = 'strip'
  if (narrow && peek && shown === 'strip') shown = 'over'
  // The width the helper takes beside the page: the column, the strip, or nothing.
  const edgePx = shown === 'open' ? HELPER_PX : shown === 'none' ? 0 : STRIP_PX

  let rail = tab === 'setup' ? 'full' : 'none'
  let railSpace = railFull
  if (rail === 'full' && w - RAIL_PX - edgePx < MIN_MAIN_PX) {
    rail = 'numbers'
    railSpace = RAIL_NUMBERS_PX
  }

  const main = w - railSpace - edgePx
  return {
    helper: shown,
    folded,
    narrow,
    rail,
    main,
    columns: main >= TWO_COLUMNS_PX ? 2 : 1,
    cardColumns: main >= CARD_COLUMNS_PX ? 2 : 1
  }
}
