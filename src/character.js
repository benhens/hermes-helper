// The helper's character: variation 2 of hhdesign's drawings (design/face-r2), which Pēteris
// picked on 10 Nov 2026. Two eyes that touch, a mouth, and four fingers a side holding on to the
// top edge of the message box. The page draws it itself as inline SVG shapes, every one filled
// with the theme's accent colour: no picture file, no data URL, no colour of our own.
// Used by the page only through <Character>. The numbers live in src/expressions.js.
//   expression  resting | busy | asking | talking (src/expressions.js says which, and when)
//   rising      true while it comes up from behind the message box (once per opening of the helper)
//   reduced     the person's "reduce motion" setting: expressions snap, nothing loops, no rising,
//               and the eyes stay on the person
//   eyes        the page's eyes tracker (src/eyes.js), which places the pupils
// How it moves: a change of expression glides (CSS transitions written here as inline styles);
// what repeats (the blink, drumming fingers, the talking mouth) and the rising are run from script
// with element.animate(), which Hermes's own reduce-motion rule does not stop, so this file
// starts none of them when `reduced` is set.
// No script animation here changes `transform` or `opacity`, except the 0.7 s rising. Seen in the
// real app (dev/checks/character-v2-shots, probe): the app draws such an animation on a layer of
// its own for as long as it runs, also while it waits, and the whole drawing was then soft at its
// edges. So the blink changes the eye's own height (ry) and the hole's own path (d), the fingers
// their y and height, the mouth its path: with those the drawing stayed sharp.
// loom2 (his second Loom of 11 Nov, 2:28-2:50: "a bunch of dots ... this doesn't really fit the Hermes whole vibe"; his
// reference: a portrait made only of squares on one strict grid, big where it is dark, small toward the edges): the
// shapes are the same, but their accent fill is drawn as squares on one fixed grid by one SVG filter on the whole
// drawing (DOTS below). The filter reads how deep inside the shapes each point is (their outline, blurred), and on
// every cell of the grid draws a square that size: full inside, smaller toward the edges, none outside, so the edges
// dissolve. No outline. One colour, the theme's accent, in dark and light. The grid does not move with the drawing (it
// is fixed to the drawing's own space), and no square is an element of its own: a glide costs one filter pass a frame,
// not one element a square. The pupils stay real holes: around a hole the squares shrink as at any edge.
import { useEffect, useId, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { FACE, EXPRESSIONS, EXPRESSION_NAMES, GLIDE_MS, BLINK_MS, BLINK_EVERY_MS, TALK_MS, DRUM_MS, RISE, fingerRect, eyeTransform, eyeRy, pupilScale, pupilHole, talkFrames, drumHeights } from './expressions.js'
import { makeEyes } from './eyes.js'
import { CHARACTER_PX } from './layout.js'

const ACCENT = { fill: 'var(--ui-accent)' }
// The dots (loom2): cellPx: the grid's step on screen, a whole number of pixels (5 at 168 px wide and up, 4 below:
// with 6 units for both, 3.96 px at 132, the squares drifted across the pixels and were 3 px wide on the left of the
// face and 2 px on the right; cellOf turns it into the drawing's units for the size drawn); blur: how
// far in from an edge the squares are still shrinking (4 at first: the small mouth then kept only a few squares and the
// pupils' holes went ragged, so 2.5); gain: how soon inside a shape they reach full size; fill: a
// full square's side as a share of its cell (the rest is the gap between squares; at 0.75 the squares ran together at
// 132 px in the app, where a cell is 4 px: 0.62 keeps a gap of a pixel or more). area: the filter's region, all the
// body can reach (it rises 10 units and starts 101 units down when it comes up from behind the box).
export const DOTS = { cellPx: { large: 5, small: 4 }, smallUnder: 150, blur: 2.5, gain: 1.6, fill: 0.62, area: { x: -30, y: -40, width: 260, height: 240 } }
export const cellOf = size => Math.round(((size < DOTS.smallUnder ? DOTS.cellPx.small : DOTS.cellPx.large) * FACE.view.width * 10000) / size) / 10000
const SIDES = ['left', 'right']
const FINGER_COUNT = EXPRESSIONS.resting.fingers.length
// A blink, piece by piece: [piece, what changes, open, shut] (src/expressions.js).
const hole = (i, size) => `path("${pupilHole(FACE.eyes[i], size)}")`
const BLINK = SIDES.flatMap((side, i) => [
  [`eye-${side}`, 'ry', eyeRy(), eyeRy(true)],
  [`pupil-hole-${side}`, 'd', hole(i, 1), hole(i, 0)]
])

const play = (el, keys, options) => (el && typeof el.animate === 'function' ? el.animate(keys, options) : null)

// Where a piece is drawn right now, as the first frame of a glide. A glide has to name it: one
// that names only its last frame starts, in the real app, from the new expression's still
// picture and not from what is on screen (dev/checks/character-v2-shots, probe3).
function drawnNow(el, props) {
  if (!el || typeof getComputedStyle !== 'function') return null
  const now = getComputedStyle(el)
  const frame = { offset: 0 }
  for (const p of props) frame[p] = now[p]
  return frame
}

// Stops a loop without a jump: the piece glides from where the loop left it to where the
// expression now draws it.
function stopLoop(el, loop, props, glide) {
  const from = glide ? drawnNow(el, props) : null
  loop.cancel()
  if (from) play(el, [from], { duration: GLIDE_MS, easing: 'ease' })
}

// One blink: both eyes close and open again, and the pupils close with them.
function blinkOnce(nodes, { reduced }) {
  if (reduced) return
  for (const [name, what, open, shut] of BLINK) play(nodes[name], [{ [what]: open }, { [what]: shut }, { [what]: open }], { duration: BLINK_MS, easing: 'ease-in-out' })
}

// The drawn pieces by name, with one ref function per piece, made once.
function makePieces() {
  const nodes = {}
  const setters = {}
  const ref = name =>
    setters[name] ||
    (setters[name] = el => {
      if (el) nodes[name] = el
      else delete nodes[name]
    })
  return { nodes, ref }
}

export function Character({ size = CHARACTER_PX, expression = 'resting', rising = false, reduced = false, eyes = null, label = 'Helper' }) {
  const uid = 'hh-face-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const pieces = useRef(null)
  if (!pieces.current) pieces.current = makePieces()
  const { nodes, ref } = pieces.current
  // Without the page's tracker (a plain drawing) a tracker of its own keeps the pupils at the
  // expression's place; it has no timers, so it never follows anything.
  const own = useRef(null)
  if (!eyes && !own.current) own.current = makeEyes()
  const tracker = eyes || own.current
  // Rising: the drawing stays unseen until its rising has started, so it never shows whole first.
  const [armed, setArmed] = useState(false)
  const latest = useRef({})

  const shown = EXPRESSION_NAMES.includes(expression) ? expression : 'resting'
  const x = EXPRESSIONS[shown]
  // comesUp: this draw is part of a rising (the table's own `rise` is how high the body sits).
  const comesUp = rising && !reduced
  latest.current = { shown, reduced }
  const glide = what => (reduced ? 'none' : `${what} ${GLIDE_MS}ms ease`)

  useEffect(() => {
    tracker.attach({
      svg: nodes.svg,
      eyes: SIDES.map(side => nodes[`eye-${side}`]),
      pupils: SIDES.map(side => nodes[`pupil-${side}`]),
      blink: () => blinkOnce(nodes, latest.current)
    })
    return () => tracker.detach()
  }, [tracker])

  // Where the pupils sit when nothing is followed: the expression's own place. And whether they
  // follow at all: not while busy (narrowed eyes, almost no room), never under reduce motion.
  const follows = !reduced && shown !== 'busy'
  useEffect(() => {
    tracker.setGlide(!reduced)
    tracker.setFollowing(follows)
    tracker.setRest([x.pupil, x.pupil])
  }, [tracker, shown, reduced])

  // What repeats. Each loop starts GLIDE_MS after its expression. Drumming and the talking mouth
  // do not start at the expression's still picture, so for those 0.3 s the piece glides from
  // wherever it is to the loop's first frame (glideIn) and the loop takes over without a jump.
  useEffect(() => {
    if (reduced) return
    const running = []
    const loop = (name, keys, ms, props, glideIn = false) => {
      const el = nodes[name]
      let lead = null
      if (glideIn) {
        const from = drawnNow(el, props)
        const to = { ...Object.fromEntries(props.map(p => [p, keys[0][p]])), offset: 1 }
        lead = play(el, from ? [from, to] : [to], { duration: GLIDE_MS, easing: 'ease' })
      }
      const started = play(el, keys, { duration: ms, iterations: Infinity, delay: GLIDE_MS })
      if (started) running.push([el, started, props, lead])
    }
    if (shown === 'resting') {
      const at = [0, (BLINK_EVERY_MS - BLINK_MS) / BLINK_EVERY_MS, (BLINK_EVERY_MS - BLINK_MS / 2) / BLINK_EVERY_MS, 1]
      for (const [name, what, open, shut] of BLINK) loop(name, [open, open, shut, open].map((value, k) => ({ [what]: value, offset: at[k] })), BLINK_EVERY_MS, [what])
    }
    if (shown === 'busy') {
      SIDES.forEach((side, hand) => {
        for (let i = 0; i < FINGER_COUNT; i++) {
          const keys = drumHeights(i).map(h => {
            const r = fingerRect(hand, i, h)
            return { y: `${r.y}px`, height: `${r.height}px` }
          })
          loop(`finger-${side}-${i + 1}`, keys, DRUM_MS, ['y', 'height'], true)
        }
      })
    }
    if (shown === 'talking') loop('mouth', talkFrames().map(d => ({ d: `path("${d}")` })), TALK_MS, ['d'], true)
    return () =>
      running.forEach(([el, started, props, lead]) => {
        stopLoop(el, started, props, !latest.current.reduced)
        if (lead) lead.cancel()
      })
  }, [shown, reduced])

  // Rising, once each time `rising` turns on: the fingers grow over the edge first, then the body
  // comes up from behind it. Neither has an end frame of its own, so each lands on whatever the
  // expression draws. Kept as the last effect: it ends by showing the drawing.
  useEffect(() => {
    if (!comesUp) {
      if (armed) setArmed(false)
      return
    }
    const started = []
    SIDES.forEach(side => {
      for (let i = 0; i < FINGER_COUNT; i++) {
        started.push(play(nodes[`finger-${side}-${i + 1}`], [{ y: `${FACE.edge}px`, height: `${FACE.fingerOver}px`, opacity: 0, offset: 0 }, { opacity: 1, offset: 0.08 }], { duration: RISE.fingersMs, easing: 'linear' }))
      }
    })
    started.push(play(nodes.body, [{ transform: `translateY(${RISE.hidden}px)`, offset: 0 }], { delay: RISE.bodyDelayMs, duration: RISE.bodyMs, easing: RISE.easing, fill: 'backwards' }))
    setArmed(true)
    // Taken off when it is over, when reduce motion is switched on, and when the helper is left.
    return () => started.forEach(a => a && a.cancel())
  }, [comesUp])

  const view = FACE.view
  // The dots: two ramps across one cell (0 at its edges, 1 in its middle), sideways and downwards, laid over the whole
  // area as a pattern on the drawing's fixed grid; the filter adds each ramp to how deep the point is in the shapes
  // and keeps what passes half way: a square per cell whose side grows with the depth.
  const A = DOTS.area
  const cell = cellOf(size)
  const ramp = dir =>
    jsxs(
      'linearGradient',
      {
        id: `${uid}-ramp-${dir}`,
        x1: 0,
        y1: 0,
        x2: dir === 'x' ? 1 : 0,
        y2: dir === 'y' ? 1 : 0,
        children: [0, 0.5, 1].map(offset => jsx('stop', { offset, style: { stopColor: ACCENT.fill, stopOpacity: offset === 0.5 ? 1 : 0 } }, offset))
      },
      `ramp-${dir}`
    )
  const grid = dir => [
    jsx(
      'pattern',
      { id: `${uid}-cells-${dir}`, patternUnits: 'userSpaceOnUse', x: 0, y: 0, width: cell, height: cell, children: jsx('rect', { width: cell, height: cell, fill: `url(#${uid}-ramp-${dir})` }) },
      `cells-${dir}`
    ),
    jsx('rect', { id: `${uid}-grid-${dir}`, ...A, fill: `url(#${uid}-cells-${dir})` }, `grid-${dir}`)
  ]
  const half = dir => [
    jsx('feImage', { href: `#${uid}-grid-${dir}`, ...A, result: `ramp${dir}` }, `img-${dir}`),
    jsx('feComposite', { in: `ramp${dir}`, in2: 'deep', operator: 'arithmetic', k1: 0, k2: 0.5, k3: 0.5 * DOTS.fill, k4: 0, result: `sum${dir}` }, `sum-${dir}`),
    jsx('feComponentTransfer', { in: `sum${dir}`, result: `keep${dir}`, children: jsx('feFuncA', { type: 'discrete', tableValues: '0 1' }) }, `keep-${dir}`)
  ]
  const dots = jsxs(
    'filter',
    {
      id: `${uid}-dots`,
      'data-hh': 'dots',
      filterUnits: 'userSpaceOnUse',
      primitiveUnits: 'userSpaceOnUse',
      ...A,
      colorInterpolationFilters: 'sRGB',
      children: [
        jsx('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: DOTS.blur, result: 'soft' }, 'blur'),
        jsx('feComponentTransfer', { in: 'soft', result: 'deep', children: jsx('feFuncA', { type: 'linear', slope: DOTS.gain, intercept: 0 }) }, 'gain'),
        ...half('x'),
        ...half('y'),
        jsx('feComposite', { in: 'keepx', in2: 'keepy', operator: 'in', result: 'squares' }, 'squares'),
        jsx('feFlood', { style: { floodColor: ACCENT.fill }, result: 'ink' }, 'ink'),
        jsx('feComposite', { in: 'ink', in2: 'squares', operator: 'in' }, 'paint')
      ]
    },
    'dots'
  )
  const pupilMask = (side, i) => {
    const eye = FACE.eyes[i]
    return jsx(
      'mask',
      {
        id: `${uid}-pupil-${side}`,
        maskUnits: 'userSpaceOnUse',
        x: -100,
        y: -200,
        width: 400,
        height: 600,
        style: { maskType: 'alpha' },
        // lift: rides up with its eye (asking). pupil-<side>: moved by the eyes tracker only, so
        // React writes no style on it. pupil-hole-<side>: the hole itself, which can shrink.
        children: jsx('g', {
          'data-hh': `pupil-lift-${side}`,
          style: { transform: `translateY(${-(i === 0 ? x.leftEyeUp : 0)}px)`, transition: glide('transform') },
          children: jsx('g', {
            ref: ref(`pupil-${side}`),
            'data-hh': `pupil-${side}`,
            children: jsx('path', {
              ref: ref(`pupil-hole-${side}`),
              'data-hh': `pupil-hole-${side}`,
              d: pupilHole(eye),
              fillRule: 'evenodd',
              style: { ...ACCENT, transformOrigin: `${eye.cx}px ${eye.cy}px`, transform: `scale(${pupilScale(shown)})`, transition: glide('transform') }
            })
          })
        })
      },
      side
    )
  }
  const eyeShape = (side, i) =>
    jsx(
      'g',
      {
        mask: `url(#${uid}-pupil-${side})`,
        children: jsx('ellipse', {
          ref: ref(`eye-${side}`),
          'data-hh': `eye-${side}`,
          cx: FACE.eyes[i].cx,
          cy: FACE.eyes[i].cy,
          rx: FACE.rx,
          ry: FACE.ry,
          style: { ...ACCENT, transformBox: 'fill-box', transformOrigin: 'center', transform: eyeTransform(shown, i), transition: glide('transform') }
        })
      },
      side
    )
  const finger = (side, hand, i) => {
    const name = `finger-${side}-${i + 1}`
    const r = fingerRect(hand, i, x.fingers[i])
    return jsx(
      'rect',
      {
        ref: ref(name),
        'data-hh': name,
        x: r.x,
        width: r.width,
        rx: r.rx,
        style: { ...ACCENT, y: `${r.y}px`, height: `${r.height}px`, transition: reduced ? 'none' : `y ${GLIDE_MS}ms ease, height ${GLIDE_MS}ms ease` }
      },
      name
    )
  }

  return jsxs('svg', {
    ref: ref('svg'),
    role: label ? 'img' : undefined,
    'aria-label': label || undefined,
    'aria-hidden': label ? undefined : true,
    'data-hh-character': 'face',
    'data-expression': shown,
    'data-eyes': follows ? 'follow' : 'still',
    'data-rising': comesUp || undefined,
    viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`,
    width: size,
    height: Math.round(((size * view.height) / view.width) * 100) / 100,
    // Never wider than its column; nothing of it is cut (the body's small overshoot on rising);
    // mouse presses pass through it to the message box.
    style: { display: 'block', flex: 'none', width: size, maxWidth: '100%', height: 'auto', overflow: 'visible', pointerEvents: 'none', visibility: comesUp && !armed ? 'hidden' : undefined },
    children: [
      jsxs('defs', { children: [jsx('clipPath', { id: `${uid}-above`, children: jsx('rect', { ...FACE.above }) }, 'above'), ...SIDES.map(pupilMask), ramp('x'), ramp('y'), ...grid('x'), ...grid('y'), dots] }, 'defs'),
      // loom2: everything is drawn through the dots filter, as one picture
      jsxs(
        'g',
        {
          filter: `url(#${uid}-dots)`,
          'data-hh': 'dotted',
          children: [
            // The body shows only above the edge, so on rising it comes out from behind the message box.
            jsx(
              'g',
              {
                clipPath: `url(#${uid}-above)`,
                children: jsxs('g', {
                  ref: ref('body'),
                  'data-hh': 'body',
                  style: { transform: `translateY(${-x.rise}px)`, transition: glide('transform') },
                  children: [
                    ...SIDES.map(eyeShape),
                    jsx('path', { ref: ref('mouth'), 'data-hh': 'mouth', d: x.mouth, style: { ...ACCENT, d: `path("${x.mouth}")`, transition: glide('d') } }, 'mouth')
                  ]
                })
              },
              'body'
            ),
            // The fingers are drawn last, in front, and reach 7 units below the edge, over the message
            // box's top border.
            ...SIDES.flatMap((side, hand) => x.fingers.map((h, i) => finger(side, hand, i)))
          ]
        },
        'dotted'
      )
    ]
  })
}

// The Dashboard banner's own figure (job banner-face), drawn after design/dash-look-r8/after.html, the picture
// Pēteris approved: two eyes apart from each other (a 14 unit gap), each with its pupil hole, the mouth centred
// under them, and four fingers a side whose round tops come up from the banner's bottom edge. Helper's window keeps
// <Character> above; this one is for the banner only. The same dots as <Character> (DOTS: one grid, 5 px a cell at
// the banner's 268 px), the same accent fill. Eyes: the page's tracker places the pupils, a blink every few seconds;
// under reduce motion nothing moves and the eyes stay still.
//   size     its width in px (268 on the Dashboard, about 175 px tall)
//   reduced  the person's "reduce motion" setting
//   eyes     the page's eyes tracker (src/eyes.js)
export const BANNER_FACE = {
  view: { x: 0, y: 0, width: 230, height: 150 },
  eyes: [{ cx: 78, cy: 56 }, { cx: 152, cy: 56 }],
  rx: 30,
  ry: 36,
  // ry while shut, in a blink
  shutRy: 3,
  holes: [{ cx: 86, cy: 62 }, { cx: 160, cy: 62 }],
  holeR: 11,
  mouth: 'M88 112 Q115 132 142 112',
  mouthWidth: 9,
  // each finger: its left x; all 11 wide, their round tops 16 units over the bottom edge
  fingers: [[6, 21, 36, 51], [168, 183, 198, 213]],
  fingerWidth: 11,
  fingerUp: 16,
  area: { x: -20, y: -20, width: 270, height: 190 }
}
const BANNER_SIDE_NAMES = ['left', 'right']
// A pupil hole as an even-odd path: the whole mask area with a round hole of radius r (0: no hole, a shut eye).
const bannerHole = (i, r) => {
  const A = BANNER_FACE.area
  const h = BANNER_FACE.holes[i]
  const outer = `M${A.x} ${A.y} H${A.x + A.width} V${A.y + A.height} H${A.x} Z`
  return r > 0 ? `${outer} M${h.cx - r} ${h.cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z` : outer
}
const bannerFingerPath = x => {
  const bottom = BANNER_FACE.view.y + BANNER_FACE.view.height
  const w = BANNER_FACE.fingerWidth
  const top = bottom - BANNER_FACE.fingerUp + w / 2
  return `M${x} ${bottom} V${top} A ${w / 2} ${w / 2} 0 0 1 ${x + w} ${top} V${bottom} Z`
}
const BANNER_BLINK = BANNER_SIDE_NAMES.flatMap((side, i) => [
  [`banner-eye-${side}`, 'ry', `${BANNER_FACE.ry}px`, `${BANNER_FACE.shutRy}px`],
  [`banner-pupil-hole-${side}`, 'd', `path("${bannerHole(i, BANNER_FACE.holeR)}")`, `path("${bannerHole(i, 0)}")`]
])
const bannerBlinkOnce = (nodes, reduced) => {
  if (reduced) return
  for (const [name, what, open, shut] of BANNER_BLINK) play(nodes[name], [{ [what]: open }, { [what]: shut }, { [what]: open }], { duration: BLINK_MS, easing: 'ease-in-out' })
}

export function BannerCharacter({ size = 268, reduced = false, eyes = null }) {
  const uid = 'hh-face-banner-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const pieces = useRef(null)
  if (!pieces.current) pieces.current = makePieces()
  const { nodes, ref } = pieces.current
  const own = useRef(null)
  if (!eyes && !own.current) own.current = makeEyes()
  const tracker = eyes || own.current
  const still = useRef(reduced)
  still.current = reduced

  useEffect(() => {
    tracker.attach({
      svg: nodes.svg,
      eyes: BANNER_SIDE_NAMES.map(side => nodes[`banner-eye-${side}`]),
      pupils: BANNER_SIDE_NAMES.map(side => nodes[`banner-pupil-${side}`]),
      blink: () => bannerBlinkOnce(nodes, still.current)
    })
    return () => tracker.detach()
  }, [tracker])
  useEffect(() => {
    tracker.setGlide(!reduced)
    tracker.setFollowing(!reduced)
    tracker.setRest([[0, 0], [0, 0]])
  }, [tracker, reduced])
  // the blink every few seconds, as <Character> resting; none under reduce motion
  useEffect(() => {
    if (reduced) return
    const at = [0, (BLINK_EVERY_MS - BLINK_MS) / BLINK_EVERY_MS, (BLINK_EVERY_MS - BLINK_MS / 2) / BLINK_EVERY_MS, 1]
    const running = BANNER_BLINK.map(([name, what, open, shut]) => play(nodes[name], [open, open, shut, open].map((value, k) => ({ [what]: value, offset: at[k] })), { duration: BLINK_EVERY_MS, iterations: Infinity }))
    return () => running.forEach(a => a && a.cancel())
  }, [reduced])

  const F = BANNER_FACE
  const view = F.view
  const A = F.area
  const cell = Math.round((DOTS.cellPx.large * view.width * 10000) / size) / 10000
  const ramp = dir =>
    jsx(
      'linearGradient',
      {
        id: `${uid}-ramp-${dir}`,
        x1: 0,
        y1: 0,
        x2: dir === 'x' ? 1 : 0,
        y2: dir === 'y' ? 1 : 0,
        children: [0, 0.5, 1].map(offset => jsx('stop', { offset, style: { stopColor: ACCENT.fill, stopOpacity: offset === 0.5 ? 1 : 0 } }, offset))
      },
      `ramp-${dir}`
    )
  const grid = dir => [
    jsx('pattern', { id: `${uid}-cells-${dir}`, patternUnits: 'userSpaceOnUse', x: 0, y: 0, width: cell, height: cell, children: jsx('rect', { width: cell, height: cell, fill: `url(#${uid}-ramp-${dir})` }) }, `cells-${dir}`),
    jsx('rect', { id: `${uid}-grid-${dir}`, ...A, fill: `url(#${uid}-cells-${dir})` }, `grid-${dir}`)
  ]
  const half = dir => [
    jsx('feImage', { href: `#${uid}-grid-${dir}`, ...A, result: `ramp${dir}` }, `img-${dir}`),
    jsx('feComposite', { in: `ramp${dir}`, in2: 'deep', operator: 'arithmetic', k1: 0, k2: 0.5, k3: 0.5 * DOTS.fill, k4: 0, result: `sum${dir}` }, `sum-${dir}`),
    jsx('feComponentTransfer', { in: `sum${dir}`, result: `keep${dir}`, children: jsx('feFuncA', { type: 'discrete', tableValues: '0 1' }) }, `keep-${dir}`)
  ]
  const dots = jsxs(
    'filter',
    {
      id: `${uid}-dots`,
      'data-hh': 'dots',
      filterUnits: 'userSpaceOnUse',
      primitiveUnits: 'userSpaceOnUse',
      ...A,
      colorInterpolationFilters: 'sRGB',
      children: [
        jsx('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: DOTS.blur, result: 'soft' }, 'blur'),
        jsx('feComponentTransfer', { in: 'soft', result: 'deep', children: jsx('feFuncA', { type: 'linear', slope: DOTS.gain, intercept: 0 }) }, 'gain'),
        ...half('x'),
        ...half('y'),
        jsx('feComposite', { in: 'keepx', in2: 'keepy', operator: 'in', result: 'squares' }, 'squares'),
        jsx('feFlood', { style: { floodColor: ACCENT.fill }, result: 'ink' }, 'ink'),
        jsx('feComposite', { in: 'ink', in2: 'squares', operator: 'in' }, 'paint')
      ]
    },
    'dots'
  )
  const mask = (side, i) =>
    jsx(
      'mask',
      {
        id: `${uid}-pupil-${side}`,
        maskUnits: 'userSpaceOnUse',
        ...A,
        style: { maskType: 'alpha' },
        children: jsx('g', {
          ref: ref(`banner-pupil-${side}`),
          'data-hh': `banner-pupil-${side}`,
          children: jsx('path', { ref: ref(`banner-pupil-hole-${side}`), 'data-hh': `banner-pupil-hole-${side}`, d: bannerHole(i, F.holeR), fillRule: 'evenodd', style: { ...ACCENT } })
        })
      },
      side
    )
  const eye = (side, i) =>
    jsx(
      'g',
      {
        mask: `url(#${uid}-pupil-${side})`,
        children: jsx('ellipse', { ref: ref(`banner-eye-${side}`), 'data-hh': `banner-eye-${side}`, cx: F.eyes[i].cx, cy: F.eyes[i].cy, rx: F.rx, ry: F.ry, style: { ...ACCENT } })
      },
      side
    )
  const fingers = BANNER_SIDE_NAMES.flatMap((side, hand) => F.fingers[hand].map((x, i) => jsx('path', { 'data-hh': `banner-finger-${side}-${i + 1}`, d: bannerFingerPath(x), style: { ...ACCENT } }, `${side}-${i}`)))

  return jsxs('svg', {
    ref: ref('svg'),
    'aria-hidden': true,
    'data-hh-character': 'banner-face',
    'data-expression': 'resting',
    'data-eyes': reduced ? 'still' : 'follow',
    viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`,
    width: size,
    height: Math.round(((size * view.height) / view.width) * 100) / 100,
    style: { display: 'block', flex: 'none', width: size, maxWidth: '100%', height: 'auto', overflow: 'visible', pointerEvents: 'none' },
    children: [
      jsxs('defs', { children: [...BANNER_SIDE_NAMES.map(mask), ramp('x'), ramp('y'), ...grid('x'), ...grid('y'), dots] }, 'defs'),
      jsxs(
        'g',
        {
          filter: `url(#${uid}-dots)`,
          'data-hh': 'banner-dotted',
          children: [
            ...BANNER_SIDE_NAMES.map(eye),
            jsx('path', { 'data-hh': 'banner-mouth', d: F.mouth, fill: 'none', strokeWidth: F.mouthWidth, strokeLinecap: 'round', style: { stroke: ACCENT.fill } }, 'mouth'),
            ...fingers
          ]
        },
        'dotted'
      )
    ]
  })
}
