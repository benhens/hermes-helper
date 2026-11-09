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
// peek: the person opened the helper from a strip the page folded by itself (shown over the page).
// Returns:
//   helper: 'open' | 'strip' | 'over' | 'none'   what the helper column shows
//   folded: true when the page folded the helper by itself
//   rail:   'full' | 'numbers' | 'none'          the step list (none on Your setup)
//   main:   the open step's (or Your setup's) width in px, Infinity when not measured
//   columns: 1 | 2   facts and choices;   cardColumns: 1 | 2   Your setup cards
export function layoutFor({ width, tab, helper, peek = false }) {
  const w = typeof width === 'number' && width > 0 ? width : Infinity
  const railFull = tab === 'setup' ? RAIL_PX : 0
  const helperSpace = helper === 'open' ? HELPER_PX : helper === 'hidden' ? STRIP_PX : 0

  let shown = helper === 'open' ? 'open' : helper === 'hidden' ? 'strip' : 'none'
  let folded = false
  let side = helperSpace
  if (helper === 'open' && w - railFull - HELPER_PX < MIN_MAIN_PX) {
    folded = true
    side = STRIP_PX
    shown = peek ? 'over' : 'strip'
  }

  let rail = tab === 'setup' ? 'full' : 'none'
  let railSpace = railFull
  if (rail === 'full' && w - RAIL_PX - side < MIN_MAIN_PX) {
    rail = 'numbers'
    railSpace = RAIL_NUMBERS_PX
  }

  const main = w - railSpace - side
  return {
    helper: shown,
    folded,
    rail,
    main,
    columns: main >= TWO_COLUMNS_PX ? 2 : 1,
    cardColumns: main >= CARD_COLUMNS_PX ? 2 : 1
  }
}
