// The eyes (src/eyes.js): where each pupil goes for a cursor or a focused field, and when the
// eyes look back at the person. Plain code, driven here with pretend timers, frames and elements.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EYE_TRAVEL, FOLLOW_MS, LEAVE_HOLD_MS, IDLE_MS, pupilOffset, makeEyes } from '../src/eyes.js'
import { FACE, GLIDE_MS } from '../src/expressions.js'

const SCALE = 0.7 // 140 px wide: one drawing unit is 0.7 px

test('travel: at most 9.5 units sideways and 10.5 up or down (6.7 and 7.4 px at 140 wide), straight toward the target', () => {
  assert.deepEqual(EYE_TRAVEL, { x: 9.5, y: 10.5, fullAt: 45 })
  const eye = { x: 500, y: 400 }
  const near = (a, b) => assert.ok(Math.abs(a - b) < 0.005, `${a} vs ${b}`)
  const right = pupilOffset(eye, { x: 900, y: 400 }, SCALE)
  near(right.x, 9.5); near(right.y, 0)
  const left = pupilOffset(eye, { x: 100, y: 400 }, SCALE)
  near(left.x, -9.5); near(left.y, 0)
  const down = pupilOffset(eye, { x: 500, y: 900 }, SCALE)
  near(down.x, 0); near(down.y, 10.5)
  const up = pupilOffset(eye, { x: 500, y: 0 }, SCALE)
  near(up.x, 0); near(up.y, -10.5)
  // on screen at 140 px wide
  near(right.x * SCALE, 6.65); near(down.y * SCALE, 7.35)
  // a corner: the direction is the cursor's, the reach is the cap of each axis
  const corner = pupilOffset(eye, { x: 800, y: 0 }, SCALE)
  near(corner.x, 9.5 * 0.6); near(corner.y, -10.5 * 0.8)
})

test('travel shrinks when the target is closer than 45 units (32 px at 140 wide): half way, half travel; on the eye, none', () => {
  const eye = { x: 500, y: 400 }
  const full = 45 * SCALE
  assert.ok(Math.abs(pupilOffset(eye, { x: 500 + full, y: 400 }, SCALE).x - 9.5) < 0.005)
  assert.ok(Math.abs(pupilOffset(eye, { x: 500 + full / 2, y: 400 }, SCALE).x - 4.75) < 0.005)
  assert.ok(Math.abs(pupilOffset(eye, { x: 500, y: 400 - full / 2 }, SCALE).y + 5.25) < 0.005)
  assert.deepEqual(pupilOffset(eye, { x: 500, y: 400 }, SCALE), { x: 0, y: 0 })
  // crossing the eye from left to right: no jump, each step moves the pupil a little
  let last = null
  for (let x = 440; x <= 560; x += 2) {
    const o = pupilOffset(eye, { x, y: 400 }, SCALE)
    if (last !== null) assert.ok(Math.abs(o.x - last) < 1.3, `jump at ${x}: ${last} to ${o.x}`)
    last = o.x
  }
})

test('a pupil never leaves its eye, wherever the target is (resting eye, 22 by 24)', () => {
  const eye = { x: 0, y: 0 }
  for (let deg = 0; deg < 360; deg += 5) {
    const t = { x: Math.cos((deg * Math.PI) / 180) * 2000, y: Math.sin((deg * Math.PI) / 180) * 2000 }
    const o = pupilOffset(eye, t, SCALE)
    assert.ok(Math.abs(o.x) <= EYE_TRAVEL.x + 1e-9 && Math.abs(o.y) <= EYE_TRAVEL.y + 1e-9)
    // every point of the pupil's rim stays inside the eye's ellipse
    for (let rim = 0; rim < 360; rim += 10) {
      const px = o.x + Math.cos((rim * Math.PI) / 180) * FACE.pupil
      const py = o.y + Math.sin((rim * Math.PI) / 180) * FACE.pupil
      assert.ok((px / FACE.rx) ** 2 + (py / FACE.ry) ** 2 <= 1, `deg ${deg} rim ${rim}`)
    }
  }
})

/* ---------- the tracker, with pretend timers, frames and elements ---------- */

function world() {
  let now = 0
  const timers = []
  const frames = []
  const w = {
    blinks: 0,
    setTimeout(fn, ms) {
      const t = { fn, at: now + ms, live: true }
      timers.push(t)
      return () => (t.live = false)
    },
    // lets `ms` pass, running every timer that comes due, in order
    pass(ms) {
      const end = now + ms
      for (;;) {
        const next = timers.filter(t => t.live && t.at <= end).sort((a, b) => a.at - b.at)[0]
        if (!next) break
        now = next.at
        next.live = false
        next.fn()
      }
      now = end
    },
    liveTimers: () => timers.filter(t => t.live).length,
    frame(fn) {
      const f = { fn, live: true }
      frames.push(f)
      return f
    },
    cancelFrame(f) {
      f.live = false
    },
    // the screen draws one frame
    draw() {
      const due = frames.splice(0).filter(f => f.live)
      due.forEach(f => f.fn())
      return due.length
    },
    pendingFrames: () => frames.filter(f => f.live).length
  }
  // A 140 px wide drawing whose left top corner is at (1000, 700): the eyes' centres on screen.
  const at = e => ({ x: 1000 + e.cx * SCALE, y: 700 + (e.cy - 14) * SCALE })
  w.eyeAt = FACE.eyes.map(at)
  const box = (x, y, width, height) => ({ left: x, top: y, width, height, right: x + width, bottom: y + height })
  w.els = {
    svg: { getBoundingClientRect: () => box(1000, 700, 140, 93.8) },
    eyes: w.eyeAt.map(c => ({ getBoundingClientRect: () => box(c.x - 15.4, c.y - 16.8, 30.8, 33.6) })),
    pupils: [{ style: {} }, { style: {} }],
    blink: () => w.blinks++
  }
  w.timersMade = () => timers.length
  w.eyes = makeEyes({ setTimeout: w.setTimeout, frame: w.frame, cancelFrame: w.cancelFrame, now: () => now })
  w.eyes.attach(w.els)
  w.where = i => {
    const m = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\)$/.exec(w.els.pupils[i].style.transform)
    assert.ok(m, `pupil ${i} transform: ${w.els.pupils[i].style.transform}`)
    return { x: Number(m[1]), y: Number(m[2]) }
  }
  return w
}
const close = (got, want, msg) => assert.ok(Math.abs(got.x - want.x) < 0.011 && Math.abs(got.y - want.y) < 0.011, `${msg || ''} got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)

test('attached: the pupils sit where the expression puts them, looking at the person', () => {
  const w = world()
  close(w.where(0), { x: 0, y: 0 })
  close(w.where(1), { x: 0, y: 0 })
  assert.equal(w.eyes.aimed(), false)
})

test('cursor moves only store the position; the pupils are placed at most once per drawn frame, each toward the cursor from its own eye', () => {
  const w = world()
  w.eyes.pointerMove(300, 74)
  w.eyes.pointerMove(310, 80)
  w.eyes.pointerMove(1400, 816)
  assert.equal(w.pendingFrames(), 1, 'three moves, one frame asked for')
  close(w.where(0), { x: 0, y: 0 }, 'nothing placed before the frame')
  assert.equal(w.draw(), 1)
  // the last position wins; each pupil gets its own direction
  for (const i of [0, 1]) close(w.where(i), pupilOffset(w.eyeAt[i], { x: 1400, y: 816 }, SCALE), `pupil ${i}`)
  assert.notDeepEqual(w.where(0), w.where(1))
  assert.equal(w.els.pupils[0].style.transition, `transform ${FOLLOW_MS}ms linear`)
  assert.equal(FOLLOW_MS, 90)
  assert.equal(w.eyes.aimed(), true)
  // top left corner of the page: both pupils up and to the left
  w.eyes.pointerMove(300, 74)
  w.draw()
  assert.ok(w.where(0).x < -6 && w.where(0).y < -6 && w.where(1).x < -6 && w.where(1).y < -6)
  // no move, no frame
  assert.equal(w.pendingFrames(), 0)
})

test('the cursor leaves the page: hold a third of a second, glide back in 0.3 s, then one blink', () => {
  const w = world()
  w.eyes.pointerMove(300, 74)
  w.draw()
  const held = w.where(0)
  w.eyes.pointerLeave()
  w.pass(LEAVE_HOLD_MS - 1)
  close(w.where(0), held, 'still held')
  w.pass(1)
  close(w.where(0), { x: 0, y: 0 }, 'back at the centre')
  close(w.where(1), { x: 0, y: 0 })
  assert.equal(w.els.pupils[0].style.transition, `transform ${GLIDE_MS}ms ease`)
  assert.equal(w.eyes.aimed(), false)
  assert.equal(w.blinks, 0, 'the blink comes after the glide')
  w.pass(GLIDE_MS)
  assert.equal(w.blinks, 1)
  w.pass(10000)
  assert.equal(w.blinks, 1, 'one blink only')
  assert.deepEqual([LEAVE_HOLD_MS, IDLE_MS], [330, 3000])
})

test('coming back within the hold: the eyes keep following and never return', () => {
  const w = world()
  w.eyes.pointerMove(300, 74)
  w.draw()
  w.eyes.pointerLeave()
  w.pass(200)
  w.eyes.pointerMove(1400, 816)
  w.draw()
  w.pass(400)
  assert.ok(w.where(0).x > 8, 'still on the cursor')
  assert.equal(w.blinks, 0)
})

test('no movement for 3 seconds: the same return and one blink; a move in between starts the 3 seconds again', () => {
  const w = world()
  w.eyes.pointerMove(300, 74)
  w.draw()
  w.pass(2000)
  w.eyes.pointerMove(302, 74)
  w.draw()
  w.pass(2999)
  assert.ok(w.where(0).x < -6, 'still following 2.999 s after the last move')
  w.pass(1)
  close(w.where(0), { x: 0, y: 0 })
  w.pass(GLIDE_MS)
  assert.equal(w.blinks, 1)
})

test('keyboard: the eyes look at the focused field or button, and back at the person when focus leaves the page', () => {
  const w = world()
  const field = { isConnected: true, matches: s => s === ':focus-visible', getBoundingClientRect: () => ({ left: 1131, top: 800, width: 296, height: 43 }) }
  w.eyes.focus(field)
  w.draw()
  const centre = { x: 1131 + 148, y: 800 + 21.5 }
  for (const i of [0, 1]) close(w.where(i), pupilOffset(w.eyeAt[i], centre, SCALE), `pupil ${i}`)
  assert.ok(w.where(0).x > 5 && w.where(0).y > 2, 'the message box is below and to the right: the eyes look there')
  w.eyes.blur()
  close(w.where(0), { x: 0, y: 0 })
  assert.equal(w.eyes.aimed(), false)
  // a press with the mouse on something that shows no keyboard focus ring is not followed
  w.eyes.focus({ isConnected: true, matches: () => false, getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) })
  assert.equal(w.pendingFrames(), 0)
  assert.equal(w.eyes.aimed(), false)
})

test('the page scrolls: the eyes re-aim at the focused field\'s new place', () => {
  const w = world()
  let top = 100
  const button = { isConnected: true, matches: () => true, getBoundingClientRect: () => ({ left: 1000, top, width: 100, height: 30 }) }
  w.eyes.focus(button)
  w.draw()
  assert.ok(w.where(0).y < -5, 'the button is above')
  top = 880
  assert.equal(w.pendingFrames(), 0)
  w.eyes.scroll()
  assert.equal(w.pendingFrames(), 1)
  w.draw()
  assert.ok(w.where(0).y > 5, 'now it is below')
  // nothing followed: a scroll asks for nothing
  w.eyes.blur()
  w.eyes.scroll()
  assert.equal(w.pendingFrames(), 0)
})

test('not while busy: with following off, cursor and focus are ignored and the pupils sit at the expression\'s own place', () => {
  const w = world()
  w.eyes.pointerMove(300, 74)
  w.draw()
  assert.ok(w.where(0).x < -6)
  w.eyes.setRest([[0, 0.29], [0, 0.29]])
  assert.ok(w.where(0).x < -6, 'while following, the cursor replaces the table\'s place')
  w.eyes.setFollowing(false)
  close(w.where(0), { x: 0, y: 0.29 }, 'busy: the table\'s place')
  assert.equal(w.eyes.aimed(), false)
  w.eyes.pointerMove(1400, 816)
  w.eyes.focus({ isConnected: true, matches: () => true, getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) })
  assert.equal(w.pendingFrames(), 0)
  w.pass(5000)
  close(w.where(0), { x: 0, y: 0.29 })
  assert.equal(w.blinks, 0)
  // following again: the next move is followed
  w.eyes.setFollowing(true)
  w.eyes.pointerMove(1400, 816)
  w.draw()
  assert.ok(w.where(0).x > 8)
})

test('with nothing to follow the pupils sit where the table says (asking: 1.43, 3.96), gliding there', () => {
  const w = world()
  w.eyes.setRest([[1.43, 3.96], [1.43, 3.96]])
  close(w.where(0), { x: 1.43, y: 3.96 })
  close(w.where(1), { x: 1.43, y: 3.96 })
  assert.equal(w.els.pupils[1].style.transition, `transform ${GLIDE_MS}ms ease`)
})

test('reduce motion: no glide on anything the tracker sets', () => {
  const w = world()
  w.eyes.setGlide(false)
  w.eyes.setFollowing(false)
  w.eyes.setRest([[5.23, 0], [5.23, 0]])
  close(w.where(0), { x: 5.23, y: 0 })
  assert.equal(w.els.pupils[0].style.transition, 'none')
})

test('leaving the page: stop cancels the waiting timers and the waiting frame; nothing moves afterwards', () => {
  const w = world()
  w.eyes.pointerMove(300, 74)
  assert.equal(w.pendingFrames(), 1)
  assert.ok(w.liveTimers() >= 1)
  w.eyes.stop()
  assert.equal(w.pendingFrames(), 0)
  assert.equal(w.liveTimers(), 0)
  w.eyes.pointerMove(1400, 816)
  w.eyes.pointerLeave()
  assert.equal(w.pendingFrames(), 0)
  assert.equal(w.liveTimers(), 0)
})

test('detached (the helper is hidden): cursor moves and focus do nothing at all, no timer and no frame; attaching again starts at the person', () => {
  const w = world()
  w.eyes.pointerMove(1400, 816)
  assert.equal(w.liveTimers(), 1)
  w.eyes.detach()
  assert.equal(w.liveTimers(), 0, 'hiding the helper drops what was waiting')
  assert.equal(w.pendingFrames(), 0)
  const made = w.timersMade()
  w.eyes.pointerMove(300, 74)
  w.eyes.focus({ matches: () => true, getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) })
  w.eyes.scroll()
  assert.equal(w.timersMade(), made, 'no timer')
  assert.equal(w.pendingFrames(), 0, 'no frame')
  assert.equal(w.eyes.aimed(), false)
  w.pass(5000)
  assert.equal(w.blinks, 0)
  const fresh = [{ style: {} }, { style: {} }]
  w.eyes.attach({ ...w.els, pupils: fresh })
  assert.equal(fresh[0].style.transform, 'translate(0px, 0px)')
})

test('a stream of cursor moves starts one timer, not one per move: the 3 s check is armed once and asks again only when it comes due', () => {
  const w = world()
  for (let i = 0; i < 100; i++) {
    w.eyes.pointerMove(300 + i, 74)
    w.pass(10)
  }
  // one second of moving
  assert.equal(w.timersMade(), 1)
  assert.equal(w.liveTimers(), 1)
  w.pass(2100) // 3.1 s after the first move, 2.1 s after the last: the check came due and waits for the rest
  assert.equal(w.timersMade(), 2)
  assert.equal(w.eyes.aimed(), true, 'not idle yet')
  w.pass(1000) // 3.1 s after the last move
  assert.equal(w.eyes.aimed(), false, 'back at the person')
})

test('a page that comes back after stop (React replaying a mount) follows again', () => {
  const w = world()
  w.eyes.stop()
  w.eyes.attach(w.els)
  w.eyes.setFollowing(true)
  w.eyes.pointerMove(300, 74)
  w.draw()
  assert.ok(w.where(0).x < -6 && w.where(0).y < -6)
})

test('the focused field is taken off the page: the eyes go back to the person', () => {
  const w = world()
  const field = { matches: () => true, isConnected: true, getBoundingClientRect: () => ({ left: 1012, top: 800, width: 296, height: 47 }) }
  w.eyes.focus(field)
  w.draw()
  assert.ok(w.where(0).y > 2, 'looking down at the field')
  field.isConnected = false
  w.eyes.scroll()
  w.draw()
  close(w.where(0), { x: 0, y: 0 })
  assert.equal(w.eyes.aimed(), false)
})
