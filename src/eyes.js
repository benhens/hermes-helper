// The eyes: where each pupil goes, and when the eyes look back at the person. Plain code, no
// React. hhtech's recommended way (docs/answers/hhtech-face-cursor.md): the page's own outer box
// hands over the cursor's position, which is only stored (with the time); the pupils are then
// placed at most once per drawn frame, and the "3 seconds without a move" check is one timer that
// is armed once and looks at the stored time when it comes due, not a timer per move. Nothing here listens on the Hermes window, so the eyes follow only while the
// cursor is over our own page.
import { GLIDE_MS } from './expressions.js'

// How far a pupil travels from its eye's centre, in drawing units (hhdesign's lookAt, variation
// 2): at most 9.5 sideways and 10.5 up or down, which is 6.7 and 7.4 px at 140 px wide. Full
// travel from 45 units away (32 px); closer than that it shrinks, so the pupil does not jump when
// the cursor crosses the eye.
export const EYE_TRAVEL = { x: 9.5, y: 10.5, fullAt: 45 }
export const FOLLOW_MS = 90
export const LEAVE_HOLD_MS = 330
export const IDLE_MS = 3000

// eye and target: points on screen in px. scale: px per drawing unit. Returns drawing units.
export function pupilOffset(eye, target, scale) {
  const vx = target.x - eye.x
  const vy = target.y - eye.y
  const d = Math.hypot(vx, vy)
  if (!d) return { x: 0, y: 0 }
  const reach = Math.min(1, d / (EYE_TRAVEL.fullAt * scale))
  return { x: (vx / d) * reach * EYE_TRAVEL.x, y: (vy / d) * reach * EYE_TRAVEL.y }
}

const px = n => `${Math.round(n * 100) / 100}px`
const nextFrame = fn => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : null)
const dropFrame = id => {
  if (id !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id)
}

// One tracker per open page. setTimeout is the host's (ctx.setTimeout: it returns the function
// that cancels it). Without one the eyes never follow: they only sit where the expression puts
// them (a plain drawing).
//   attach({ svg, eyes: [left, right], pupils: [left, right], blink })   the drawn pieces
//   setRest([[x, y], [x, y]])   where the pupils sit with nothing to follow (the table's place)
//   setFollowing(on)            off while busy and under reduce motion
//   setGlide(on)                off under reduce motion: everything lands at once
//   pointerMove(x, y) / pointerLeave() / focus(element) / blur() / scroll()   from the page's box
export function makeEyes({ setTimeout: later = null, frame = nextFrame, cancelFrame = dropFrame, now = () => Date.now() } = {}) {
  let parts = null
  let rest = [[0, 0], [0, 0]]
  let following = !!later
  let glide = true
  let aim = null // null: looking at the person; { x, y }: a point; { el }: a focused element
  let waiting = null // the frame that will place the pupils
  let framed = false
  let stopLeave = null
  let stopIdle = null
  let stopBlink = null
  let stopped = false
  let aimedAt = 0 // when the eyes last got something to look at

  const cancel = stop => {
    if (stop) stop()
    return null
  }
  const clearTimers = () => {
    stopLeave = cancel(stopLeave)
    stopIdle = cancel(stopIdle)
    stopBlink = cancel(stopBlink)
  }
  const clearFrame = () => {
    if (framed) cancelFrame(waiting)
    framed = false
    waiting = null
  }

  function put(i, x, y, ms, curve) {
    const el = parts && parts.pupils[i]
    if (!el) return
    el.style.transition = glide ? `transform ${ms}ms ${curve}` : 'none'
    el.style.transform = `translate(${px(x)}, ${px(y)})`
  }
  const sitAtRest = () => rest.forEach(([x, y], i) => put(i, x, y, GLIDE_MS, 'ease'))

  // Back to the person: glide to the resting place, then one blink.
  function home({ blink = true } = {}) {
    aim = null
    clearTimers()
    clearFrame()
    sitAtRest()
    if (blink && later && parts && glide) {
      stopBlink = later(() => {
        stopBlink = null
        if (parts && typeof parts.blink === 'function') parts.blink()
      }, GLIDE_MS)
    }
  }

  function place() {
    framed = false
    waiting = null
    if (!parts || !following || !aim) return
    let target = aim
    if (aim.el) {
      if (aim.el.isConnected === false) return home({ blink: false })
      const b = aim.el.getBoundingClientRect()
      target = { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    }
    const scale = parts.svg.getBoundingClientRect().width / 200
    if (!scale) return
    parts.eyes.forEach((eye, i) => {
      const b = eye.getBoundingClientRect()
      const o = pupilOffset({ x: b.left + b.width / 2, y: b.top + b.height / 2 }, target, scale)
      put(i, o.x, o.y, FOLLOW_MS, 'linear')
    })
  }
  function askForFrame() {
    if (framed || !parts) return
    framed = true
    waiting = frame(place)
  }
  // Nothing new to look at for IDLE_MS: back to the person. Armed once; when it comes due and
  // there was a move in between, it waits for the rest of that move's 3 seconds.
  function checkIdle() {
    stopIdle = null
    if (!aim) return
    const left = IDLE_MS - (now() - aimedAt)
    if (left <= 0) home()
    else stopIdle = later(checkIdle, left)
  }
  function follow(next) {
    aim = next
    aimedAt = now()
    stopLeave = cancel(stopLeave)
    stopBlink = cancel(stopBlink)
    if (!stopIdle) stopIdle = later(checkIdle, IDLE_MS)
    askForFrame()
  }

  return {
    attach(next) {
      // A page that comes back after stop() (React replaying a mount) follows again.
      stopped = false
      parts = next
      if (aim) askForFrame()
      else sitAtRest()
    },
    // The character is not drawn (the helper is hidden): nothing is stored, timed or placed.
    detach() {
      parts = null
      aim = null
      clearTimers()
      clearFrame()
    },
    setRest(next) {
      rest = next
      if (!aim || !following) sitAtRest()
    },
    setFollowing(on) {
      following = !!on && !!later && !stopped
      if (!following) home({ blink: false })
    },
    setGlide(on) {
      glide = !!on
    },
    aimed: () => !!aim,
    pointerMove(x, y) {
      if (!following || !parts) return
      follow({ x, y })
    },
    // The cursor left our page (Hermes's sidebar, top strip, bottom bar, or off the window): hold,
    // then look back at the person.
    pointerLeave() {
      if (!following || !aim || aim.el) return
      stopLeave = cancel(stopLeave)
      stopLeave = later(() => {
        stopLeave = null
        home()
      }, LEAVE_HOLD_MS)
    },
    // Keyboard: look at the field or button that shows the keyboard's focus ring.
    focus(el) {
      if (!following || !parts || !el || typeof el.matches !== 'function') return
      let ring = false
      try {
        ring = el.matches(':focus-visible')
      } catch {}
      if (ring) follow({ el })
    },
    // Focus left our page.
    blur() {
      if (aim && aim.el) home()
    },
    // Something of ours scrolled: what the eyes look at may have moved.
    scroll() {
      if (following && aim) askForFrame()
    },
    stop() {
      stopped = true
      following = false
      aim = null
      clearTimers()
      clearFrame()
    }
  }
}
