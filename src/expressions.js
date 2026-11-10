// The character's numbers and rules, as plain code (no React): variation 2 of hhdesign's
// drawings (design/face-r2). Every number is from the "Variation 2" table in the team's
// design/face-r2/numbers.md, in drawing units (the drawing is 200 units wide; the message box's
// top edge is at y = 140). tests/expressions.test.mjs compares this file with that table.

// The fixed parts. `above` is the area the body may show in: everything over the edge.
// `view` is the part of the 200 x 200 drawing the page draws: from y 14 down to just under the
// finger ends at 147.
export const FACE = {
  edge: 140,
  eyes: [{ cx: 78, cy: 84 }, { cx: 122, cy: 84 }],
  rx: 22,
  ry: 24,
  pupil: 9.5,
  hands: [34, 166],
  fingerWide: 11.5,
  fingerApart: 13,
  fingerOver: 7,
  above: { x: -100, y: -200, width: 400, height: 340 },
  view: { x: 0, y: 14, width: 200, height: 134 }
}

// One row of the table per expression. rise: the body moves up by this much (minus = down).
// eyeHeight: 2 x ry. leftEyeUp: the left eye sits higher by this much. pupilR: the pupil's radius.
// pupil: the pupil's place from its eye's centre when nothing is followed. fingers: heights above
// the edge, outer finger first, the same for both hands.
export const EXPRESSIONS = {
  resting: { rise: 0, eyeHeight: 48, leftEyeUp: 0, pupilR: 9.5, pupil: [0, 0], mouth: 'M80 119C89 127 111 127 120 119C111 141 89 141 80 119Z', fingers: [22, 30, 33, 27] },
  busy: { rise: -3, eyeHeight: 24, leftEyeUp: 0, pupilR: 8.64, pupil: [0, 0.29], mouth: 'M84 119C84 114.5 116 114.5 116 119C116 123.5 84 123.5 84 119Z', fingers: [22, 16.5, 26.4, 17.55] },
  asking: { rise: 10, eyeHeight: 56.64, leftEyeUp: 7, pupilR: 9.5, pupil: [1.43, 3.96], mouth: 'M91 119C91 106 109 106 109 119C109 132 91 132 91 119Z', fingers: [22, 30, 33, 27] },
  talking: { rise: 6, eyeHeight: 48, leftEyeUp: 0, pupilR: 9.5, pupil: [5.23, 0], mouth: 'M80 119C82 116 118 116 120 119C118 149 82 149 80 119Z', fingers: [22, 30, 33, 27] }
}
export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS)

// Timing. Changes between expressions glide for GLIDE_MS; the blink's 4 s is the Builder's first
// number, the rest are hhdesign's (build.js).
export const GLIDE_MS = 300
export const BLINK_MS = 300
export const BLINK_EVERY_MS = 4000
export const TALK_MS = 1600
export const DRUM_MS = 400
// Rising from behind the message box when the helper opens: the fingers grow over the edge
// first, then the body comes up with a small overshoot (hhdesign's "back" curve, here as the CSS
// curve that draws the same shape). hidden: how far down the body starts, fully behind the edge.
// wordsWaitMs: how long Helper's words wait when the helper opens: the rising and 120 ms more.
// Seen in the real app: a change of expression that lands in the frame or two after the
// rising's last one is not glided (the body was in its talking place at once, 4 px up).
export const RISE = { ms: 700, wordsWaitMs: 820, fingersMs: 280, bodyDelayMs: 210, bodyMs: 490, hidden: 101.2, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }

const round2 = n => Math.round(n * 100) / 100

// Finger i (0 = the outer one) of a hand (0 = left, 1 = right), h units tall above the edge: a
// rounded bar that ends 7 units below the edge, so its bottom never moves.
export function fingerRect(hand, i, h) {
  const out = hand === 0 ? -1 : 1
  const centre = FACE.hands[hand] + out * (1.5 - i) * FACE.fingerApart
  return {
    x: round2(centre - FACE.fingerWide / 2),
    y: round2(FACE.edge - h),
    width: FACE.fingerWide,
    height: round2(h + FACE.fingerOver),
    rx: FACE.fingerWide / 2
  }
}

// An eye in an expression: the same ellipse, lifted (the left one, when asking) and squashed or
// stretched around its own centre. eye: 0 = left, 1 = right.
export function eyeTransform(name, eye) {
  const x = EXPRESSIONS[name]
  const up = eye === 0 ? x.leftEyeUp : 0
  return `translateY(${-up}px) scaleY(${Math.round((x.eyeHeight / (2 * FACE.ry)) * 10000) / 10000})`
}

// A blink closes the eye to 8% of its height (hhdesign's blink) and the pupil's hole to nothing.
// It changes the ellipse's own ry and the hole's own path, never `transform`: see src/character.js.
export const BLINK_SHUT = 0.08
export const eyeRy = (shut = false) => `${round2(FACE.ry * (shut ? BLINK_SHUT : 1))}px`

export const pupilScale = name => Math.round((EXPRESSIONS[name].pupilR / FACE.pupil) * 10000) / 10000

// The pupil as a real hole: one path that fills a huge area and leaves a round gap of the pupil's
// size at the eye's centre (drawn with the even-odd rule, used as an alpha mask on the eye).
// size: 1 = the pupil, 0 = closed (a blink). The path has the same commands at every size, so
// it can glide from one to another.
export function pupilHole(eye, size = 1) {
  const r = round2(FACE.pupil * size)
  return `M-5000 -5000H5000V5000H-5000Z M${round2(eye.cx + r)} ${eye.cy}A${r} ${r} 0 1 0 ${round2(eye.cx - r)} ${eye.cy}A${r} ${r} 0 1 0 ${round2(eye.cx + r)} ${eye.cy}Z`
}

// The mouth is the same kind of path in every expression (M, two C curves, Z), so it can glide
// from one to the next. w: half its width; u and l: how far its upper and lower curve reach.
function mouthPath(w, u, l, k) {
  const m = 100
  const y = 119
  return `M${round2(m - w)} ${y}C${round2(m - w * k)} ${round2(y + u)} ${round2(m + w * k)} ${round2(y + u)} ${round2(m + w)} ${y}C${round2(m + w * k)} ${round2(y + l)} ${round2(m - w * k)} ${round2(y + l)} ${round2(m - w)} ${y}Z`
}

// Talking: how far the mouth is open at each tenth of a second of hhdesign's 1.6 s loop.
export const TALK = [0.2, 1, 0.5, 0.9, 0.15, 0.8, 1, 0.3, 0.7, 0.1, 0.9, 0.4, 1, 0.2, 0.8, 0.5]
// The loop's mouths, closed with its first one again so it repeats without a jump.
export function talkFrames() {
  return [...TALK, TALK[0]].map(open => mouthPath(17 + 3 * open, -1 - 2 * open, 7 + 23 * open, 0.9))
}

// Drumming: finger i's heights over one 0.4 s loop (nine frames, the last equal to the first).
// Each finger dips to 55% of its resting height, a third of a beat after the one before it.
export function drumHeights(i) {
  const rest = EXPRESSIONS.resting.fingers[i]
  const heights = []
  for (let j = 0; j < 8; j++) {
    const t = (j * DRUM_MS) / 8 / 1000
    heights.push(round2(rest * (0.55 + 0.45 * Math.abs(Math.sin(Math.PI * (t * 2.5 - i * 0.33))))))
  }
  return [...heights, heights[0]]
}

// Which expression shows; the first that is true wins. Talking is first so the mouth always
// moves while words appear.
//   revealing: one of Helper's lines is appearing word by word right now
//   busy:      a model call is running
//   question:  Helper's newest line ends with a question mark and is fully shown
export function expressionFor({ revealing = false, busy = false, question = false } = {}) {
  if (revealing) return 'talking'
  if (busy) return 'busy'
  if (question) return 'asking'
  return 'resting'
}

export function asksQuestion(text) {
  return typeof text === 'string' && text.trim().endsWith('?')
}

// The busy value the page holds: a count of model calls that are running. begin() raises it and
// returns the function that lowers it again (calling that twice lowers it once). Today the "The
// model answers" card raises it; the helper's own model call will use the same value.
export function makeBusy() {
  let running = 0
  const heard = new Set()
  const tell = () => heard.forEach(fn => fn(running))
  return {
    count: () => running,
    begin() {
      running++
      tell()
      let open = true
      return () => {
        if (!open) return
        open = false
        running--
        tell()
      }
    },
    subscribe(fn) {
      heard.add(fn)
      return () => heard.delete(fn)
    }
  }
}
