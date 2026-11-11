// The helper's character (src/character.js): variation 2 of hhdesign's drawings (design/face-r2),
// drawn by the page itself as shapes in the theme's accent colour. What each expression draws is
// checked here shape by shape; the numbers themselves are checked in tests/expressions.test.mjs.
// Rendered with the React stand-in; the drawn pieces are pretend elements that record what the
// component asks of them (animate, cancel).
// (The 9 Nov tests of the drawn hand, its poses and the pet sprite sheet went with that code;
// commit cff33f6 still has them.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mount, all, loadSrc } from './lib/render.mjs'
import { useState } from './fakes/react.mjs'
import { FACE, EXPRESSIONS, EXPRESSION_NAMES, RISE, eyeTransform, pupilScale, pupilHole, fingerRect, talkFrames, drumHeights } from '../src/expressions.js'

const { Character } = await loadSrc('character.js')
const { CHARACTER_PX } = await import('../src/layout.js')

const ACCENT = 'var(--ui-accent)'
const named = (tree, name) => all(tree, n => n.props['data-hh'] === name)[0] || null
const draw = props => mount(() => Character(props)).tree
const FINGERS = ['left', 'right'].flatMap(side => [1, 2, 3, 4].map(n => `finger-${side}-${n}`))
const PIECES = ['body', 'eye-left', 'eye-right', 'pupil-left', 'pupil-right', 'pupil-hole-left', 'pupil-hole-right', 'mouth', ...FINGERS]

// The component on a stage: every piece that takes a ref gets a pretend element before the
// effects run (as React attaches refs before effects), and the stage keeps a log of what happened.
function stage(initial) {
  const els = {}
  const log = []
  const el = name =>
    els[name] ||
    (els[name] = {
      name,
      style: {},
      started: [],
      animate(keys, options) {
        const a = { keys, options, cancelled: false, cancel: () => { a.cancelled = true; log.push(`cancel ${name}`) } }
        this.started.push(a)
        log.push(`animate ${name}`)
        return a
      },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 140, height: 93.8 })
    })
  let setProps
  const view = mount(() => {
    const [props, set] = useState(initial)
    setProps = set
    const out = Character(props)
    log.push(`render ${out.props.style.visibility === 'hidden' ? 'hidden' : 'shown'} ${out.props['data-expression']}`)
    all(out, n => typeof n.props.ref === 'function').forEach(n => n.props.ref(el(n.props['data-hh'] || 'svg')))
    return out
  })
  const live = name => els[name].started.filter(a => !a.cancelled)
  const loops = name => live(name).filter(a => a.options.iterations === Infinity)
  const animated = () => Object.values(els).filter(e => e.started.length).map(e => e.name)
  return { view, els, log, live, loops, animated, set: p => setProps(old => ({ ...old, ...p })), tree: () => view.tree }
}

test('the drawing: an inline SVG of variation 2, 168 px wide, every shape filled with the accent colour, no picture and no data URL', () => {
  assert.equal(CHARACTER_PX, 168)
  const tree = draw({})
  assert.equal(tree.type, 'svg')
  assert.equal(tree.props['data-hh-character'], 'face')
  assert.equal(tree.props.role, 'img')
  assert.equal(tree.props['aria-label'], 'Helper')
  assert.equal(tree.props.viewBox, '0 14 200 134')
  assert.deepEqual([tree.props.width, tree.props.height], [168, 112.56])
  // and at the small size the page asks for in a narrow or low window
  const small = draw({ size: 132 })
  assert.deepEqual([small.props.width, small.props.height], [132, 88.44])
  const shapes = all(tree, n => ['ellipse', 'rect', 'path', 'circle'].includes(n.type) && n.props['data-hh'])
  assert.equal(shapes.length, 2 + 2 + 1 + 8, 'two eyes, two pupil holes, a mouth, eight fingers')
  for (const s of shapes) assert.equal(s.props.style.fill, ACCENT, s.props['data-hh'])
  // no other colour, picture, link or sheet anywhere in it
  const flat = JSON.stringify(tree)
  assert.equal(flat.split(ACCENT).length - 1, shapes.length)
  assert.doesNotMatch(flat, /data:|url\((?!#)|href|<img|"image"|#[0-9a-fA-F]{3,8}\b|currentColor/)
  assert.equal(all(tree, n => ['image', 'img', 'use', 'style', 'linearGradient'].includes(n.type)).length, 0)
  assert.equal(draw({ size: 96 }).props.width, 96)
  assert.equal(draw({ size: 96 }).props.height, 64.32)
})

test('each moving piece is its own named shape: body, two eyes, two pupils, mouth, eight fingers', () => {
  const tree = draw({})
  for (const name of PIECES) assert.ok(named(tree, name), name)
  assert.equal(named(tree, 'eye-left').type, 'ellipse')
  assert.equal(named(tree, 'mouth').type, 'path')
  for (const f of FINGERS) assert.equal(named(tree, f).type, 'rect', f)
  // eyes and mouth move together inside the body; the fingers are not part of it
  const body = named(tree, 'body')
  for (const name of ['eye-left', 'eye-right', 'mouth']) assert.ok(named(body, name), `${name} in body`)
  for (const f of FINGERS) assert.equal(named(body, f), null, `${f} outside body`)
})

for (const name of EXPRESSION_NAMES) {
  test(`${name}: the body, eyes, pupils, mouth and fingers are the table's`, () => {
    const x = EXPRESSIONS[name]
    const tree = draw({ expression: name })
    assert.equal(tree.props['data-expression'], name)
    assert.equal(named(tree, 'body').props.style.transform, `translateY(${-x.rise}px)`)
    ;['eye-left', 'eye-right'].forEach((id, i) => {
      const eye = named(tree, id)
      assert.deepEqual([eye.props.cx, eye.props.cy, eye.props.rx, eye.props.ry], [FACE.eyes[i].cx, FACE.eyes[i].cy, 22, 24])
      assert.equal(eye.props.style.transform, eyeTransform(name, i), id)
      assert.equal(eye.props.style.transformBox, 'fill-box')
      assert.equal(eye.props.style.transformOrigin, 'center')
    })
    ;['pupil-hole-left', 'pupil-hole-right'].forEach((id, i) => {
      const hole = named(tree, id)
      assert.equal(hole.props.d, pupilHole(FACE.eyes[i]))
      assert.equal(hole.props.style.transform, `scale(${pupilScale(name)})`, id)
      assert.equal(hole.props.style.transformOrigin, `${FACE.eyes[i].cx}px ${FACE.eyes[i].cy}px`)
    })
    // the left pupil rides up with the left eye (asking: 7), the right one stays
    assert.equal(named(tree, 'pupil-lift-left').props.style.transform, `translateY(${-x.leftEyeUp}px)`)
    assert.equal(named(tree, 'pupil-lift-right').props.style.transform, 'translateY(0px)')
    const mouth = named(tree, 'mouth')
    assert.equal(mouth.props.d, x.mouth)
    assert.equal(mouth.props.style.d, `path("${x.mouth}")`)
    ;['left', 'right'].forEach((side, hand) => {
      x.fingers.forEach((h, i) => {
        const finger = named(tree, `finger-${side}-${i + 1}`)
        const want = fingerRect(hand, i, h)
        assert.deepEqual([finger.props.x, finger.props.width, finger.props.rx], [want.x, 11.5, 5.75], `${name} ${side} ${i}`)
        assert.equal(finger.props.style.y, `${want.y}px`)
        assert.equal(finger.props.style.height, `${want.height}px`)
      })
    })
  })
}

test('the four expressions are four different drawings; a name it does not know is drawn resting', () => {
  const pictures = EXPRESSION_NAMES.map(name => {
    const tree = draw({ expression: name })
    return JSON.stringify(PIECES.map(p => [named(tree, p).props.style, named(tree, p).props.d]))
  })
  assert.equal(new Set(pictures).size, 4)
  assert.equal(draw({ expression: 'waving' }).props['data-expression'], 'resting')
})

test('pupils are real holes: one alpha mask per eye holding a filled area with a round gap; nothing is painted in a surface colour', () => {
  const tree = draw({})
  const masks = all(tree, n => n.type === 'mask')
  assert.equal(masks.length, 2)
  ;['left', 'right'].forEach((side, i) => {
    const mask = masks[i]
    assert.equal(mask.props.style.maskType, 'alpha')
    assert.equal(mask.props.maskUnits, 'userSpaceOnUse')
    const hole = named(mask, `pupil-hole-${side}`)
    assert.equal(hole.props.fillRule, 'evenodd')
    assert.ok(named(mask, `pupil-${side}`), 'the group the eyes code moves')
    // the eye is drawn through its own mask
    const wearer = all(tree, n => n.type === 'g' && n.props.mask === `url(#${mask.props.id})`)
    assert.equal(wearer.length, 1)
    assert.ok(named(wearer[0], `eye-${side}`))
  })
  assert.notEqual(masks[0].props.id, masks[1].props.id)
  assert.doesNotMatch(JSON.stringify(tree), /surface|background|--ui-bg/)
})

test('the body is cut at the message box\'s top edge (it comes from behind the box); the fingers lie in front of it, 7 units over the edge', () => {
  const tree = draw({})
  const clip = all(tree, n => n.type === 'clipPath')[0]
  const rect = all(clip, n => n.type === 'rect')[0]
  assert.deepEqual([rect.props.x, rect.props.y, rect.props.width, rect.props.height], [-100, -200, 400, 340]) // down to y = 140
  const clipped = all(tree, n => n.type === 'g' && n.props.clipPath === `url(#${clip.props.id})`)
  assert.equal(clipped.length, 1)
  assert.ok(named(clipped[0], 'body'))
  for (const f of FINGERS) assert.equal(named(clipped[0], f), null)
  // drawn after the body, so on top of it; each ends at y = 147
  const order = all(tree, n => PIECES.includes(n.props['data-hh'])).map(n => n.props['data-hh'])
  assert.ok(order.indexOf('finger-left-1') > order.indexOf('mouth'))
  const f = named(tree, 'finger-left-3').props.style
  assert.equal(parseFloat(f.y) + parseFloat(f.height), 147)
})

test('in the way of nothing: mouse presses pass through it, it is never wider than its column, and nothing cuts its top', () => {
  const s = draw({}).props.style
  assert.equal(s.pointerEvents, 'none')
  assert.equal(s.maxWidth, '100%')
  assert.equal(s.width, 168)
  assert.equal(s.height, 'auto')
  assert.equal(s.overflow, 'visible')
})

test('changes glide in 0.3 s: every piece that changes carries its own transition; with reduce motion they snap', () => {
  const tree = draw({ expression: 'asking' })
  assert.equal(named(tree, 'body').props.style.transition, 'transform 300ms ease')
  assert.equal(named(tree, 'eye-left').props.style.transition, 'transform 300ms ease')
  assert.equal(named(tree, 'pupil-hole-right').props.style.transition, 'transform 300ms ease')
  assert.equal(named(tree, 'pupil-lift-left').props.style.transition, 'transform 300ms ease')
  assert.equal(named(tree, 'mouth').props.style.transition, 'd 300ms ease')
  assert.equal(named(tree, 'finger-right-2').props.style.transition, 'y 300ms ease, height 300ms ease')
  const still = draw({ expression: 'asking', reduced: true })
  for (const name of ['body', 'eye-left', 'pupil-hole-right', 'pupil-lift-left', 'mouth', 'finger-right-2']) {
    assert.equal(named(still, name).props.style.transition, 'none', name)
  }
  // the still picture is the same drawing
  assert.equal(named(still, 'mouth').props.d, EXPRESSIONS.asking.mouth)
})

// What a blink changes: the eye's own height (ry, to 8%) and the hole's own path (d, to nothing).
const hole = (i, size) => `path("${pupilHole(FACE.eyes[i], size)}")`
const BLINK = [
  ['eye-left', 'ry', '24px', '1.92px'],
  ['eye-right', 'ry', '24px', '1.92px'],
  ['pupil-hole-left', 'd', hole(0, 1), hole(0, 0)],
  ['pupil-hole-right', 'd', hole(1, 1), hole(1, 0)]
]

test('resting: a 0.3 s blink every 4 s, on both eyes and both pupils, and nothing else moves', () => {
  const s = stage({ expression: 'resting' })
  assert.deepEqual(s.animated().sort(), ['eye-left', 'eye-right', 'pupil-hole-left', 'pupil-hole-right'])
  for (const [name, prop, open, closed] of BLINK) {
    const [loop] = s.loops(name)
    assert.ok(loop, name)
    assert.equal(loop.options.duration, 4000)
    assert.equal(loop.options.delay, 300, 'the glide into resting comes first')
    assert.deepEqual(loop.keys.map(k => k.offset), [0, 0.925, 0.9625, 1])
    assert.deepEqual(loop.keys.map(k => k[prop]), [open, open, closed, open], name + ': open for 3.7 s, closed half way through the last 0.3 s')
    assert.notEqual(open, closed)
  }
})

// Seen in the real app (dev/checks/character-v2-shots/probe-report.txt): a script animation of
// transform that keeps running is drawn on a layer of its own, and the whole drawing went soft at
// its edges for as long as it ran. Animating the eye's height, the hole's path, the fingers'
// height and the mouth's path stayed sharp.
test('nothing that repeats, and no blink, is a script animation of transform or opacity: only the 0.7 s rising is', () => {
  const layered = keys => keys.some(k => 'transform' in k || 'opacity' in k || 'filter' in k || 'translate' in k || 'scale' in k)
  for (const name of EXPRESSION_NAMES) {
    const eyes = tracker()
    const s = stage({ expression: name, eyes })
    eyes.attached.blink()
    for (const el of Object.values(s.els)) for (const a of el.started) assert.equal(layered(a.keys), false, `${name}: ${el.name} ${JSON.stringify(a.keys[0])}`)
    // changing to every other expression and back starts nothing of that kind either
    for (const next of EXPRESSION_NAMES) s.set({ expression: next })
    for (const el of Object.values(s.els)) for (const a of el.started) assert.equal(layered(a.keys), false, `${name} then others: ${el.name}`)
  }
  // the rising is the one exception, and it ends
  const s = stage({ expression: 'resting', rising: true })
  const rising = Object.values(s.els).flatMap(el => el.started.filter(a => layered(a.keys)))
  assert.equal(rising.length, 9, 'eight fingers and the body')
  assert.ok(rising.every(a => a.options.iterations !== Infinity && a.options.duration <= RISE.ms))
})

test('busy: the eight fingers drum in a 0.4 s loop with their bottoms fixed; no blink', () => {
  const s = stage({ expression: 'busy' })
  assert.deepEqual(s.animated().sort(), [...FINGERS].sort())
  ;['left', 'right'].forEach(side => {
    for (let i = 0; i < 4; i++) {
      const [loop] = s.loops(`finger-${side}-${i + 1}`)
      assert.deepEqual([loop.options.duration, loop.options.iterations, loop.options.delay], [400, Infinity, 300])
      const heights = drumHeights(i)
      assert.equal(loop.keys.length, heights.length)
      loop.keys.forEach((k, j) => {
        assert.ok(Math.abs(parseFloat(k.y) - (140 - heights[j])) < 0.006, `${side} ${i} frame ${j} y ${k.y}`)
        assert.ok(Math.abs(parseFloat(k.y) + parseFloat(k.height) - 147) < 0.011, `${side} ${i} frame ${j}: bottom fixed`)
        assert.match(k.y, /px$/)
      })
    }
  })
})

test('talking: the 1.6 s mouth loop, and only the mouth', () => {
  const s = stage({ expression: 'talking' })
  assert.deepEqual(s.animated(), ['mouth'])
  const [loop] = s.loops('mouth')
  assert.deepEqual([loop.options.duration, loop.options.iterations, loop.options.delay], [1600, Infinity, 300])
  assert.deepEqual(loop.keys.map(k => k.d), talkFrames().map(d => `path("${d}")`))
})

test('asking: nothing loops', () => {
  const s = stage({ expression: 'asking' })
  assert.deepEqual(s.animated(), [])
})

test('a new expression stops the old one\'s loop first: the mouth stops when the last word is out', () => {
  const s = stage({ expression: 'talking' })
  const [talk] = s.loops('mouth')
  s.set({ expression: 'asking' })
  assert.equal(talk.cancelled, true)
  assert.equal(s.loops('mouth').length, 0)
  assert.equal(s.tree().props['data-expression'], 'asking')
  assert.equal(s.els.mouth.started.filter(a => a.options.iterations === Infinity).length, 1, 'no new loop')
  s.set({ expression: 'busy' })
  assert.equal(s.loops('finger-left-2').length, 1)
  s.set({ expression: 'resting' })
  assert.equal(s.loops('finger-left-2').length, 0)
  assert.equal(s.loops('eye-left').length, 1)
  // drawing it again with nothing changed starts nothing new
  const before = s.log.filter(l => l.startsWith('animate')).length
  s.set({ expression: 'resting' })
  assert.equal(s.log.filter(l => l.startsWith('animate')).length, before)
  // leaving the page stops what still runs
  const [blink] = s.loops('eye-left')
  s.view.unmount()
  assert.equal(blink.cancelled, true)
})

test('reduce motion: nothing is ever animated from script, in any expression: no blink, no drumming, no mouth loop, no rising', () => {
  for (const name of EXPRESSION_NAMES) {
    const s = stage({ expression: name, reduced: true, rising: true })
    assert.deepEqual(s.animated(), [], name)
    assert.equal(s.tree().props.style.visibility, undefined, 'simply there')
    assert.equal(s.tree().props['data-rising'], undefined)
    assert.ok(!s.log.some(l => l.startsWith('render hidden')), name)
  }
  // switched on while it talks: the loop stops and nothing replaces it
  const s = stage({ expression: 'talking' })
  const [talk] = s.loops('mouth')
  const startedBefore = s.els.mouth.started.length
  s.set({ reduced: true })
  assert.equal(talk.cancelled, true)
  assert.ok(s.els.mouth.started.every(a => a.cancelled), 'the glide into the loop is taken off with it')
  assert.equal(s.els.mouth.started.length, startedBefore, 'nothing new is started')
  assert.equal(named(s.tree(), 'mouth').props.style.transition, 'none')
})

const rises = (s, name) => s.els[name].started.filter(a => a.options.iterations !== Infinity)

test('rising: fingers first (0.28 s, from nothing), then the body comes up from 101.2 units behind the edge (from 0.21 s to 0.7 s)', () => {
  const s = stage({ expression: 'resting', rising: true })
  assert.equal(s.tree().props['data-rising'], true)
  for (const f of FINGERS) {
    const [up] = rises(s, f)
    assert.ok(up, f)
    assert.equal(up.options.duration, RISE.fingersMs)
    assert.equal(up.options.delay, undefined, 'the fingers start at once')
    assert.deepEqual(up.keys[0], { y: '140px', height: '7px', opacity: 0, offset: 0 }, 'from nothing above the edge')
    // no end frame of its own: it lands on whatever the expression draws
    assert.ok(up.keys.every(k => k.offset < 1), f)
  }
  const [body] = rises(s, 'body')
  assert.deepEqual(body.keys, [{ transform: 'translateY(101.2px)', offset: 0 }])
  assert.equal(body.options.delay, RISE.bodyDelayMs)
  assert.equal(body.options.duration, RISE.bodyMs)
  assert.equal(body.options.easing, RISE.easing)
  assert.equal(body.options.fill, 'backwards', 'hidden behind the edge while it waits for the fingers')
  assert.ok(RISE.fingersMs <= body.options.delay + body.options.duration / 2)
})

test('rising: never one frame of the whole character first: it is kept unseen until the rising has started', () => {
  const s = stage({ expression: 'resting', rising: true })
  const firstAnimate = s.log.findIndex(l => l.startsWith('animate'))
  const firstShown = s.log.findIndex(l => l.startsWith('render shown'))
  assert.equal(s.log[0], 'render hidden resting')
  assert.ok(firstAnimate > 0 && firstShown > firstAnimate, s.log.slice(0, 6).join(' | '))
  assert.equal(s.tree().props.style.visibility, undefined)
})

test('rising happens once per opening: drawing again (a tab change, a new expression) does not play it again; without rising it never plays', () => {
  const s = stage({ expression: 'resting', rising: true })
  assert.equal(rises(s, 'body').length, 1)
  s.set({ expression: 'talking' })
  s.set({ expression: 'resting' })
  s.set({ rising: true })
  assert.equal(rises(s, 'body').length, 1)
  assert.equal(rises(s, 'finger-left-1').length, 1)
  // the page says the rising is over
  s.set({ rising: false })
  assert.equal(s.tree().props['data-rising'], undefined)
  assert.equal(rises(s, 'body').length, 1)
  const plain = stage({ expression: 'resting' })
  assert.equal(rises(plain, 'body').length, 0)
  assert.ok(!plain.log.some(l => l.startsWith('render hidden')))
})

// A pretend eyes tracker (the real one is tested in tests/eyes.test.mjs).
function tracker() {
  const t = { calls: [], attached: null }
  t.attach = parts => { t.attached = parts; t.calls.push('attach') }
  t.detach = () => { t.attached = null; t.calls.push('detach') }
  t.setRest = rest => t.calls.push(['rest', rest])
  t.setGlide = on => t.calls.push(['glide', on])
  t.setFollowing = on => t.calls.push(['follow', on])
  return t
}

test('the eyes follow in resting, asking and talking; they stay still while busy and, in every expression, under reduce motion', () => {
  const eyes = tracker()
  const s = stage({ expression: 'resting', eyes })
  const follows = () => eyes.calls.filter(c => c[0] === 'follow').at(-1)[1]
  for (const [expression, expected] of [['resting', true], ['busy', false], ['asking', true], ['talking', true], ['busy', false]]) {
    s.set({ expression })
    assert.equal(follows(), expected, expression)
    assert.equal(s.tree().props['data-eyes'], expected ? 'follow' : 'still', expression)
  }
  s.set({ reduced: true })
  for (const expression of ['resting', 'busy', 'asking', 'talking']) {
    s.set({ expression })
    assert.equal(follows(), false, expression + ', reduce motion')
    assert.equal(s.tree().props['data-eyes'], 'still', expression + ', reduce motion')
  }
  s.set({ reduced: false })
  assert.equal(follows(), true, 'reduce motion switched off: they follow again')
})

test('the eyes code gets the drawing\'s own pieces (the drawing, both eyes, both pupil groups) and each expression\'s pupil place', () => {
  const eyes = tracker()
  const s = stage({ expression: 'resting', eyes })
  assert.equal(eyes.attached.svg, s.els.svg)
  assert.deepEqual(eyes.attached.eyes, [s.els['eye-left'], s.els['eye-right']])
  assert.deepEqual(eyes.attached.pupils, [s.els['pupil-left'], s.els['pupil-right']])
  assert.deepEqual(eyes.calls.filter(c => c[0] === 'rest').at(-1), ['rest', [[0, 0], [0, 0]]])
  s.set({ expression: 'asking' })
  assert.deepEqual(eyes.calls.filter(c => c[0] === 'rest').at(-1), ['rest', [[1.43, 3.96], [1.43, 3.96]]])
  s.set({ expression: 'talking' })
  assert.deepEqual(eyes.calls.filter(c => c[0] === 'rest').at(-1), ['rest', [[5.23, 0], [5.23, 0]]])
  assert.deepEqual(eyes.calls.filter(c => c[0] === 'glide').at(-1), ['glide', true])
  s.set({ reduced: true })
  assert.deepEqual(eyes.calls.filter(c => c[0] === 'glide').at(-1), ['glide', false])
  // React never writes the pupil groups' place itself: the eyes code owns it
  assert.equal(named(s.tree(), 'pupil-left').props.style, undefined)
  s.view.unmount()
  assert.equal(eyes.attached, null)
})

test('one blink when the eyes code asks for it (the look back at the person): 0.3 s on both eyes and pupils; none with reduce motion', () => {
  const eyes = tracker()
  const s = stage({ expression: 'asking', eyes })
  eyes.attached.blink()
  for (const [name, prop, open, closed] of BLINK) {
    const [once] = s.els[name].started
    assert.ok(once, name)
    assert.equal(once.options.duration, 300)
    assert.notEqual(once.options.iterations, Infinity)
    assert.deepEqual(once.keys.map(k => k[prop]), [open, closed, open], name + ': closed half way, open again')
  }
  // the asking eye keeps its own lift and height meanwhile: the blink does not touch its transform
  assert.equal(named(s.tree(), 'eye-left').props.style.transform, eyeTransform('asking', 0))
  const stillEyes = tracker()
  const still = stage({ expression: 'asking', eyes: stillEyes, reduced: true })
  stillEyes.attached.blink()
  assert.deepEqual(still.animated(), [])
})

test('without an eyes tracker (a plain drawing) the pupils still sit at the table\'s place', () => {
  const s = stage({ expression: 'talking' })
  assert.equal(s.els['pupil-left'].style.transform, 'translate(5.23px, 0px)')
  assert.equal(s.els['pupil-right'].style.transform, 'translate(5.23px, 0px)')
})

test('busy and talking glide into their loop: 0.3 s from wherever the piece is to the loop\'s first frame, so the loop starts without a jump; the blink needs none', () => {
  const lead = (s, name) => s.els[name].started.filter(a => a.options.iterations !== Infinity)
  const busy = stage({ expression: 'busy' })
  for (const f of FINGERS) {
    const [glide] = lead(busy, f)
    const [loop] = busy.loops(f)
    assert.ok(glide, f)
    assert.deepEqual([glide.options.duration, glide.options.delay], [300, undefined], f)
    assert.deepEqual(glide.keys, [{ y: loop.keys[0].y, height: loop.keys[0].height, offset: 1 }], f)
    assert.equal(loop.options.delay, 300, 'the loop takes over when the glide ends')
  }
  const talking = stage({ expression: 'talking' })
  const [glide] = lead(talking, 'mouth')
  assert.deepEqual(glide.keys, [{ d: talking.loops('mouth')[0].keys[0].d, offset: 1 }])
  assert.equal(glide.options.duration, 300)
  // the blink loop starts with the eyes open, which is how resting draws them: no glide needed
  const resting = stage({ expression: 'resting' })
  for (const name of ['eye-left', 'pupil-hole-left']) assert.equal(lead(resting, name).length, 0, name)
  // a change of expression within the 0.3 s takes the glide off too
  talking.set({ expression: 'resting' })
  assert.equal(glide.cancelled, true)
})

test('the rising is taken off when it is over, and at once when reduce motion is switched on or the helper is left', () => {
  const rising = s => [...FINGERS, 'body'].map(name => rises(s, name)[0])
  const over = stage({ expression: 'resting', rising: true })
  const first = rising(over)
  assert.equal(first.length, 9)
  assert.ok(first.every(a => a && !a.cancelled))
  over.set({ rising: false })
  assert.ok(first.every(a => a.cancelled), 'over')
  const still = stage({ expression: 'resting', rising: true })
  const second = rising(still)
  still.set({ reduced: true })
  assert.ok(second.every(a => a.cancelled), 'reduce motion switched on')
  const left = stage({ expression: 'resting', rising: true })
  const third = rising(left)
  left.view.unmount()
  assert.ok(third.every(a => a.cancelled), 'the helper is left')
})

test('leaving a loop: the piece glides for 0.3 s from where the loop left it to the new expression; under reduce motion it does not', () => {
  // the app's own answer to "where is this piece drawn right now"
  globalThis.getComputedStyle = () => ({ d: 'path("M1 1")', y: '111px', height: '22px', ry: '5px' })
  try {
    const s = stage({ expression: 'talking' })
    const [talk] = s.loops('mouth')
    s.set({ expression: 'asking' })
    assert.equal(talk.cancelled, true)
    const out = s.els.mouth.started.at(-1)
    assert.deepEqual(out.keys, [{ offset: 0, d: 'path("M1 1")' }])
    assert.deepEqual([out.options.duration, out.options.iterations], [300, undefined])
    const r = stage({ expression: 'busy' })
    const before = r.els['finger-left-1'].started.length
    r.set({ reduced: true })
    assert.equal(r.els['finger-left-1'].started.length, before, 'reduce motion: it snaps')
  } finally {
    delete globalThis.getComputedStyle
  }
})

// Seen in the real app (dev/checks/character-v2-shots/probe3-report.txt): a glide that names only
// its last frame starts from the new expression's still picture, not from what is on screen, so
// the mouth jumped 5.8 px in one frame when talking began. The glide now names its first frame too.
test('the glide into a loop starts from what is drawn at that moment, read from the app', () => {
  globalThis.getComputedStyle = el => ({ d: `path("drawn-${el.name}")`, y: '100px', height: '47px' })
  try {
    const talking = stage({ expression: 'talking' })
    const [glide] = talking.els.mouth.started.filter(a => a.options.iterations !== Infinity)
    const [loop] = talking.loops('mouth')
    assert.deepEqual(glide.keys, [{ offset: 0, d: 'path("drawn-mouth")' }, { d: loop.keys[0].d, offset: 1 }])
    const busy = stage({ expression: 'busy' })
    const [finger] = busy.els['finger-right-3'].started.filter(a => a.options.iterations !== Infinity)
    const [drum] = busy.loops('finger-right-3')
    assert.deepEqual(finger.keys, [{ offset: 0, y: '100px', height: '47px' }, { y: drum.keys[0].y, height: drum.keys[0].height, offset: 1 }])
  } finally {
    delete globalThis.getComputedStyle
  }
})
