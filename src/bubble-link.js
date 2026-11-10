// The piece between Helper's speech bubble and the character. One component, so another form (a
// curve from the mouth, small bubbles) replaces this file without touching the bubble or the
// answers: hhdesign is drawing the options Pēteris picks from (design/talk-r4/).
// What it gets: a layout cell (.hh-linkcell in src/talk.css), 24 px wide, that starts 1 px inside
// the bubble's lower edge, in front of the bubble, and ends at the character's top. The cell is
// placed by CSS alone; nothing is measured and nothing goes through React state, so it cannot
// lag behind the bubble. What is drawn inside the cell is this file's own business.
// Drawn now (row 2 of docs/build/talk-v1-plan.md): version 1's tail in its shortest drawn size,
// 24 by 17 px, hanging from the bubble with its tip at the lower left. When the answers under the
// bubble are tall, the cell is taller than the tail and there is a gap below the tip.
import { jsx, jsxs } from 'react/jsx-runtime'
import { T } from './look.js'

export const BUBBLE_LINK = { width: 24, height: 17 }
// The bubble's fill between the two long sides, and a 1 px edge on those two sides only: the
// short side lies on the bubble's own edge and stays open, so bubble and tail read as one shape.
const SHAPE = `M6,0 L0,${BUBBLE_LINK.height} L${BUBBLE_LINK.width},0`

export function BubbleLink() {
  return jsxs('svg', {
    className: T.tail,
    'data-hh': 'bubble-link',
    'aria-hidden': true,
    viewBox: `0 0 ${BUBBLE_LINK.width} ${BUBBLE_LINK.height}`,
    width: BUBBLE_LINK.width,
    height: BUBBLE_LINK.height,
    children: [jsx('path', { className: T.tailFill, d: SHAPE + 'Z' }, 'fill'), jsx('path', { className: T.tailEdge, d: SHAPE }, 'edge')]
  })
}
