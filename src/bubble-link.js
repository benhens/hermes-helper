// The piece between Helper's speech bubble and the character. One component, so another form
// replaces this file without touching the bubble or the answers.
// What it gets: a layout cell (.hh-linkcell in src/talk.css), 22 by 24 px, that starts 1 px inside
// the bubble's lower edge, in front of the bubble. The cell is placed by CSS alone; nothing is
// measured and nothing goes through React state, so it cannot lag behind the bubble.
// Drawn now: hhdesign's talk-r5 tail (option 4, his pick of 10 Nov 20:05): a short curved tail of
// one fixed size, 22 by 24 px, leaning toward the middle of the face and stopping. It is never
// stretched: when the bubble sits higher there is more air under the tail, the tail stays the same.
import { jsx, jsxs } from 'react/jsx-runtime'
import { T } from './look.js'

export const BUBBLE_LINK = { width: 22, height: 24 }
// design/talk-r5/talk.css, word for word: the fill, and a 1 px edge on the two curved sides only;
// the short side lies on the bubble's own edge and stays open, so bubble and tail read as one shape.
const SHAPE = 'M3,0 C6,9 4,17 0,24 C9,20 18,11 21,0'

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
