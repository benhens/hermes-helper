// The character's numbers and rules (src/expressions.js): variation 2 of hhdesign's drawings, the
// four expressions from the "Variation 2" table (design/face-r2/numbers.md), which one shows when,
// and the busy value the page holds. Plain code, no React.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  FACE, EXPRESSIONS, EXPRESSION_NAMES, TALK, TALK_MS, DRUM_MS, BLINK_MS, BLINK_EVERY_MS, GLIDE_MS, RISE,
  fingerRect, eyeTransform, pupilScale, pupilHole, talkFrames, drumHeights, expressionFor, asksQuestion, makeBusy
} from '../src/expressions.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const DESIGN = path.join(ROOT, '..', 'design', 'face-r2')

// The "Variation 2" table, copied by hand from design/face-r2/numbers.md (10 Nov 2026).
const TABLE = {
  resting: { rise: 0, eyeHeight: 48, leftEyeUp: 0, pupilR: 9.5, pupil: [0, 0], mouth: 'M80 119C89 127 111 127 120 119C111 141 89 141 80 119Z', fingers: [22, 30, 33, 27] },
  busy: { rise: -3, eyeHeight: 24, leftEyeUp: 0, pupilR: 8.64, pupil: [0, 0.29], mouth: 'M84 119C84 114.5 116 114.5 116 119C116 123.5 84 123.5 84 119Z', fingers: [22, 16.5, 26.4, 17.55] },
  asking: { rise: 10, eyeHeight: 56.64, leftEyeUp: 7, pupilR: 9.5, pupil: [1.43, 3.96], mouth: 'M91 119C91 106 109 106 109 119C109 132 91 132 91 119Z', fingers: [22, 30, 33, 27] },
  talking: { rise: 6, eyeHeight: 48, leftEyeUp: 0, pupilR: 9.5, pupil: [5.23, 0], mouth: 'M80 119C82 116 118 116 120 119C118 149 82 149 80 119Z', fingers: [22, 30, 33, 27] }
}

test('four expressions, each with exactly the numbers of the "Variation 2" table', () => {
  assert.deepEqual(EXPRESSION_NAMES, ['resting', 'busy', 'asking', 'talking'])
  assert.deepEqual(Object.keys(EXPRESSIONS), EXPRESSION_NAMES)
  for (const name of EXPRESSION_NAMES) assert.deepEqual(EXPRESSIONS[name], TABLE[name], name)
})

test('the fixed numbers: edge at 140, eyes at 78 and 122 / 84, 22 by 24, pupil 9.5, four fingers 11.5 wide and 13 apart, hands at 34 and 166, ends 7 below the edge', () => {
  assert.deepEqual(FACE.eyes, [{ cx: 78, cy: 84 }, { cx: 122, cy: 84 }])
  assert.deepEqual([FACE.edge, FACE.rx, FACE.ry, FACE.pupil, FACE.fingerWide, FACE.fingerApart, FACE.fingerOver], [140, 22, 24, 9.5, 11.5, 13, 7])
  assert.deepEqual(FACE.hands, [34, 166])
  for (const name of EXPRESSION_NAMES) assert.equal(EXPRESSIONS[name].fingers.length, 4, name)
})

test('the same table in the team\'s design/face-r2/numbers.md, when the folder is next to the plugin', t => {
  const file = path.join(DESIGN, 'numbers.md')
  if (!fs.existsSync(file)) return t.skip('the team\'s design folder is not next to the plugin here')
  const part = fs.readFileSync(file, 'utf8').split('### Variation 2')[1].split('### Variation 3')[0]
  assert.match(part, /Eye centres x = 78 and 122, y = 84; eye rx 22, ry 24; pupil r 9\.5\./)
  assert.match(part, /4 fingers a hand, 11\.5 wide, 13 apart, hand centres x = 34 and 166; fingers end 7 below the edge/)
  for (const name of EXPRESSION_NAMES) {
    const row = part.split('\n').find(l => l.startsWith(`| ${name} |`))
    assert.ok(row, `row ${name}`)
    const cells = row.split('|').map(c => c.trim())
    const x = EXPRESSIONS[name]
    assert.equal(Number(cells[2]), x.rise, `${name} body moves up by`)
    assert.equal(Number(cells[3]), x.eyeHeight, `${name} eye height`)
    assert.equal(Number(cells[4]), x.leftEyeUp, `${name} left eye higher by`)
    assert.equal(Number(cells[5]), x.pupilR, `${name} pupil r`)
    assert.deepEqual(cells[6].split(',').map(Number), x.pupil, `${name} pupil from eye centre`)
    assert.equal(cells[7].replace(/`/g, ''), x.mouth, `${name} mouth`)
    assert.deepEqual(cells[8].split(',').map(Number), x.fingers, `${name} left hand`)
    assert.deepEqual(cells[9].split(',').map(c => Number(c.split('/')[0])), x.fingers, `${name} right hand`)
    for (const c of cells[9].split(',')) assert.equal(Number(c.split('/')[1]), 0, `${name}: no finger is turned`)
  }
})

const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]))

test('the resting drawing is hhdesign\'s svg/2.svg, shape for shape, when the folder is next to the plugin', t => {
  const file = path.join(DESIGN, 'svg', '2.svg')
  if (!fs.existsSync(file)) return t.skip('the team\'s design folder is not next to the plugin here')
  const svg = fs.readFileSync(file, 'utf8')
  const piece = id => attrs(svg.match(new RegExp(`<\\w+ id="${id}"[^>]*>`))[0])
  for (const [hand, side] of [[0, 'left'], [1, 'right']]) {
    for (let i = 0; i < 4; i++) {
      const theirs = piece(`finger-${side}-${i + 1}`)
      const ours = fingerRect(hand, i, EXPRESSIONS.resting.fingers[i])
      assert.deepEqual(
        [ours.x, ours.y, ours.width, ours.height, ours.rx],
        [theirs.x, theirs.y, theirs.width, theirs.height, theirs.rx].map(Number),
        `finger-${side}-${i + 1}`
      )
    }
  }
  ;['eye-left', 'eye-right'].forEach((id, i) => {
    const e = piece(id)
    assert.deepEqual([Number(e.cx), Number(e.cy), Number(e.rx), Number(e.ry)], [FACE.eyes[i].cx, FACE.eyes[i].cy, FACE.rx, FACE.ry], id)
  })
  ;['pupil-left', 'pupil-right'].forEach((id, i) => {
    const p = piece(id)
    assert.deepEqual([Number(p.cx), Number(p.cy), Number(p.r)], [FACE.eyes[i].cx, FACE.eyes[i].cy, FACE.pupil], id)
  })
  assert.equal(piece('mouth').d, EXPRESSIONS.resting.mouth)
  // their clip: everything of the body below the edge is cut (the box's top edge hides it)
  assert.match(svg, /<clipPath id="v2-above"><rect x="-100" y="-200" width="400" height="340"\/>/)
  assert.deepEqual(FACE.above, { x: -100, y: -200, width: 400, height: 340 })
})

test('fingers: a rounded bar from its height above the edge to 7 below it; the bottom never moves', () => {
  assert.deepEqual(fingerRect(0, 0, 22), { x: 8.75, y: 118, width: 11.5, height: 29, rx: 5.75 })
  assert.deepEqual(fingerRect(0, 3, 27), { x: 47.75, y: 113, width: 11.5, height: 34, rx: 5.75 })
  assert.deepEqual(fingerRect(1, 0, 22), { x: 179.75, y: 118, width: 11.5, height: 29, rx: 5.75 })
  assert.deepEqual(fingerRect(1, 3, 27), { x: 140.75, y: 113, width: 11.5, height: 34, rx: 5.75 })
  for (const name of EXPRESSION_NAMES) {
    EXPRESSIONS[name].fingers.forEach((h, i) => {
      const r = fingerRect(0, i, h)
      assert.equal(Math.round((r.y + r.height) * 100) / 100, 147, `${name} finger ${i}: bottom at 147`)
    })
  }
})

test('eyes: the same ellipse squashed or stretched to the table\'s height; asking lifts the left eye by 7', () => {
  assert.equal(eyeTransform('resting', 0), 'translateY(0px) scaleY(1)')
  assert.equal(eyeTransform('busy', 0), 'translateY(0px) scaleY(0.5)')
  assert.equal(eyeTransform('asking', 0), 'translateY(-7px) scaleY(1.18)')
  assert.equal(eyeTransform('asking', 1), 'translateY(0px) scaleY(1.18)')
  assert.equal(eyeTransform('talking', 1), 'translateY(0px) scaleY(1)')
  // 2 x ry x scale = the table's eye height
  for (const name of EXPRESSION_NAMES) {
    const k = Number(eyeTransform(name, 1).match(/scaleY\(([\d.]+)\)/)[1])
    assert.ok(Math.abs(2 * FACE.ry * k - EXPRESSIONS[name].eyeHeight) < 0.01, name)
  }
})

test('pupils: a round hole, smaller only while busy (8.64 of 9.5); the hole is a gap in a filled area, with no colour of our own', () => {
  assert.equal(pupilScale('resting'), 1)
  assert.equal(pupilScale('asking'), 1)
  assert.ok(Math.abs(pupilScale('busy') * 9.5 - 8.64) < 0.001)
  const d = pupilHole(FACE.eyes[0])
  // a huge filled rectangle, and inside it one circle of r 9.5 around the eye's centre
  assert.match(d, /^M-5000 -5000H5000V5000H-5000Z M87\.5 84A9\.5 9\.5 0 1 0 68\.5 84A9\.5 9\.5 0 1 0 87\.5 84Z$/)
})

const MOUTH = /^M-?[\d.]+ -?[\d.]+C(-?[\d.]+ ){5}-?[\d.]+C(-?[\d.]+ ){5}-?[\d.]+Z$/

test('the mouth is the same kind of path in every expression and every frame of the talking loop: M, two C curves, Z', () => {
  for (const name of EXPRESSION_NAMES) assert.match(EXPRESSIONS[name].mouth, MOUTH, name)
  for (const d of talkFrames()) assert.match(d, MOUTH)
})

test('talking: hhdesign\'s 1.6 s mouth loop of 16 steps, closed back to its first step so it repeats without a jump', () => {
  assert.equal(TALK_MS, 1600)
  assert.deepEqual(TALK, [0.2, 1, 0.5, 0.9, 0.15, 0.8, 1, 0.3, 0.7, 0.1, 0.9, 0.4, 1, 0.2, 0.8, 0.5])
  const frames = talkFrames()
  assert.equal(frames.length, 17)
  assert.equal(frames[16], frames[0])
  // fully open (step 2) is the table's talking mouth
  assert.equal(frames[1], EXPRESSIONS.talking.mouth)
  assert.equal(frames[0], 'M82.4 119C84.16 117.6 115.84 117.6 117.6 119C115.84 130.6 84.16 130.6 82.4 119Z')
})

test('drumming: each finger moves between 55% and 100% of its resting height, one after the other, in a loop that closes', () => {
  assert.equal(DRUM_MS, 400)
  const rest = EXPRESSIONS.resting.fingers
  const all = [0, 1, 2, 3].map(drumHeights)
  all.forEach((hs, i) => {
    assert.equal(hs.length, 9)
    assert.equal(hs[8], hs[0], `finger ${i} closes`)
    for (const h of hs) assert.ok(h >= rest[i] * 0.55 - 0.01 && h <= rest[i] + 0.01, `finger ${i}: ${h}`)
    assert.ok(Math.max(...hs) - Math.min(...hs) > rest[i] * 0.3, `finger ${i} really moves`)
    // the still picture (reduce motion, and the table's busy row) lies inside the drummed range
    const still = EXPRESSIONS.busy.fingers[i]
    assert.ok(still >= rest[i] * 0.55 - 0.01 && still <= rest[i] + 0.01, `finger ${i} still height`)
  })
  // out of step: the fingers are not all at their top in the same frame
  const tops = all.map(hs => hs.indexOf(Math.max(...hs)))
  assert.ok(new Set(tops).size >= 3, tops.join(' '))
})

test('the hole can close (a blink): the same path at any size, down to nothing, so it can glide', () => {
  const eye = FACE.eyes[1]
  const shape = d => d.replace(/-?[\d.]+/g, '#')
  assert.equal(pupilHole(eye, 1), pupilHole(eye))
  for (const size of [0, 0.08, 0.5]) assert.equal(shape(pupilHole(eye, size)), shape(pupilHole(eye)), 'size ' + size)
  assert.match(pupilHole(eye, 0.5), /M126\.75 84A4\.75 4\.75 0 1 0 117\.25 84A4\.75 4\.75 0 1 0 126\.75 84Z$/)
  assert.match(pupilHole(eye, 0), /M122 84A0 0 0 1 0 122 84A0 0 0 1 0 122 84Z$/)
})

test('the words wait for the rising and 120 ms more', () => {
  assert.equal(RISE.wordsWaitMs, RISE.ms + 120)
  assert.equal(RISE.ms, 700)
})

test('timing constants: a 0.3 s glide, a 0.3 s blink every 4 s', () => {
  assert.deepEqual([GLIDE_MS, BLINK_MS, BLINK_EVERY_MS], [300, 300, 4000])
})

test('rising: 0.7 s in all, the fingers come first and are up before the eyes start to show; the body starts fully behind the edge', () => {
  assert.equal(RISE.ms, 700)
  assert.equal(RISE.bodyDelayMs + RISE.bodyMs, RISE.ms)
  assert.ok(RISE.fingersMs < RISE.ms / 2)
  // The body waits behind the edge, 101.2 units down, until the fingers are most of the way up
  // (hhdesign's build.js: fingers over the first 40% of the time, the body from 30%).
  assert.equal(RISE.hidden, 101.2)
  const topOfEyes = FACE.eyes[0].cy - FACE.ry
  assert.ok(topOfEyes + RISE.hidden > FACE.edge + 20, 'hidden: the eyes are well below the edge')
  const mouthBottom = 141
  assert.ok(mouthBottom + RISE.hidden > FACE.edge, 'hidden: so is the mouth')
  assert.deepEqual([RISE.fingersMs, RISE.bodyDelayMs, RISE.bodyMs], [280, 210, 490])
  assert.ok(RISE.bodyDelayMs >= RISE.fingersMs * 0.7, 'the eyes wait for the fingers')
  assert.match(RISE.easing, /^cubic-bezier\(/)
})

test('which expression shows: talking while a line is being revealed, else busy while a model call runs, else asking after a question, else resting', () => {
  const cases = [
    [{ revealing: false, busy: false, question: false }, 'resting'],
    [{ revealing: false, busy: false, question: true }, 'asking'],
    [{ revealing: false, busy: true, question: false }, 'busy'],
    [{ revealing: false, busy: true, question: true }, 'busy'],
    [{ revealing: true, busy: false, question: false }, 'talking'],
    [{ revealing: true, busy: false, question: true }, 'talking'],
    [{ revealing: true, busy: true, question: false }, 'talking'],
    [{ revealing: true, busy: true, question: true }, 'talking']
  ]
  for (const [input, want] of cases) assert.equal(expressionFor(input), want, JSON.stringify(input))
  assert.equal(expressionFor(), 'resting')
  assert.equal(expressionFor({}), 'resting')
})

test('a question is a line that ends with a question mark', () => {
  assert.equal(asksQuestion("Hi, I'm Helper. I can help you learn about Hermes and set it up. What's your name?"), true)
  assert.equal(asksQuestion('Which one do you mean?  '), true)
  assert.equal(asksQuestion("Open a step and ask me about it here. I explain things; I don't change your settings."), false)
  assert.equal(asksQuestion('Is it ready? Yes.'), false)
  assert.equal(asksQuestion(''), false)
  assert.equal(asksQuestion(undefined), false)
})

test('busy is a count of running model calls: up at the start, down at the end, once each; the page hears every change', () => {
  const busy = makeBusy()
  const heard = []
  const off = busy.subscribe(n => heard.push(n))
  assert.equal(busy.count(), 0)
  const endA = busy.begin()
  const endB = busy.begin()
  assert.equal(busy.count(), 2)
  endA()
  endA() // a second call of the same end does nothing
  assert.equal(busy.count(), 1)
  endB()
  assert.equal(busy.count(), 0)
  assert.deepEqual(heard, [1, 2, 1, 0])
  off()
  busy.begin()()
  assert.deepEqual(heard, [1, 2, 1, 0])
})
