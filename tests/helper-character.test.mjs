// The character on the page (the built plugin, rendered with the stand-ins): where it sits in
// Helper's conversation window, which expression shows when, the newest sentence appearing word by
// word in the bubble, the rising when Helper comes on screen, and reduce motion. The drawing
// itself is tests/character.test.mjs, the reveal clock tests/reveal.test.mjs, the eyes
// tests/eyes.test.mjs; the conversation tests/talk-window.test.mjs; the real app run is
// dev/checks/talk-v1.
// How time passes here: the host's interval never fires by itself; timers.tick() is 120 ms.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, spoken, byData } from './lib/render.mjs'
import { openingLine } from '../src/talk.js'
import { curlyQuotes } from '../src/quotes.js'
import { T } from '../src/look.js'
import { TALK_CSS } from '../src/talk-css.js'
import { CHARACTER_PX, CHARACTER_SMALL_PX } from '../src/layout.js'

function useHost({ runtime = { ok: true, model: 'mock-small' } } = {}) {
  globalThis.__hhHost = {
    request: async method => {
      const answer = { 'setup.runtime_check': runtime, 'setup.status': { provider_configured: false } }[method]
      if (!answer) throw new Error('unexpected ' + method)
      if (answer instanceof Error) throw answer
      return answer
    }
  }
}

let observers = []
function fakeResizeObserver() {
  observers = []
  globalThis.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb
      this.watching = null
      observers.push(this)
    }
    observe(el) {
      this.watching = el
    }
    disconnect() {
      this.watching = null
    }
  }
}
const resize = (view, width, height = 822) => observers.filter(o => o.watching)[0].cb([{ contentRect: { width, height } }])

async function open({ storage = fakeStorage(), host = {}, settleFirst = true, measured = false } = {}) {
  useHost(host)
  if (measured) fakeResizeObserver()
  const timers = fakeTimers()
  const { Page } = await registerPlugin(storage, timers)
  const view = mount(Page)
  if (measured) byData(view.tree, 'page').props.ref({ id: 'our-page' })
  if (settleFirst) await settle()
  return { view, timers, storage, Page }
}

const WORDS = n => n.trim().split(/\s+/).length
// as drawn: curly apostrophes (d1ceddc review 3.3, src/quotes.js)
const OPENING = curlyQuotes(openingLine().text)
const OPENING_WORDS = WORDS(OPENING)
const helper = view => byData(view.tree, 'helper')
const root = view => byData(view.tree, 'page')
const strip = view => byData(view.tree, 'helper-strip')
const bubble = view => byData(helper(view), 'bubble')
const face = view => all(helper(view), n => n.props['data-hh-character'])[0]
const expression = view => face(view).props['data-expression']
// 'follow' or 'still': whether the eyes go after the cursor (the drawing tells the eyes code)
const eyesNow = view => face(view).props['data-eyes']
const lines = view => all(helper(view), n => n.props['data-hh'] === 'said')
const shownWords = view => lines(view).map(l => l.props['data-shown'])
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const tabs = view => all(byData(view.tree, 'tabs'), n => n.props.role === 'tab')
const wordClock = timers => [...timers.intervals].filter(e => e.ms === 120)
// The page itself is drawn again only when talking starts or stops, never for a single word (each
// line redraws itself: tests/reveal.test.mjs). To read a half-shown line here, the page is drawn
// again first, the way any change of its own state would.
const redraw = view => box(view).props.onChange({ target: { value: box(view).props.value } })
// The words wait until the character is up (0.7 s) and one tick more, so that its glide into
// talking starts after the rising has ended: 0.82 s = the first tick at or after it, the 7th.
const RISE_TICKS = 7

function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
}
const click = node => node.props.onClick({ preventDefault() {} })

beforeEach(() => {
  delete globalThis.__hhHost
  delete globalThis.matchMedia
  delete globalThis.ResizeObserver
})
afterEach(() => {
  delete globalThis.matchMedia
  delete globalThis.ResizeObserver
})

test('where it sits: under the bubble, on the message box, 168 px wide; the piece between bubble and character in its own cell; the answers\' room beside it', async () => {
  const { view } = await open({ measured: true })
  resize(view, 1180)
  const kids = helper(view).props.children.filter(Boolean)
  // loom-fixes: the strip with Hide Helper and Clear chat at the top (Lead's point 17)
  assert.deepEqual(kids.map(k => k.props['data-hh']), ['grip', 'win-bar', 'conversation', 'bubble', 'under', 'composer'])
  const under = kids[4]
  assert.equal(under.props.className, T.under)
  const parts = under.props.children.filter(Boolean)
  assert.deepEqual(parts.map(p => p.props.className), [T.linkCell, T.charSpace, T.character])
  // the piece between bubble and character: one drawing, in its cell, hidden from screen readers
  assert.equal(parts[0].props['aria-hidden'], true)
  assert.equal(all(parts[0], n => n.props['data-hh'] === 'bubble-link').length, 1)
  const drawn = all(under, n => n.props['data-hh-character'])
  assert.equal(drawn.length, 1)
  assert.equal(drawn[0].props['data-hh-character'], 'face')
  assert.equal(drawn[0].props.width, CHARACTER_PX)
  assert.equal(CHARACTER_PX, 168)
  assert.equal(drawn[0].props.style.pointerEvents, 'none')
  // on the box's top edge, in front of it, by the style sheet alone: 8 of the drawing's 200 units hang below
  const { FACE } = await import('../src/expressions.js')
  assert.equal(FACE.view.y + FACE.view.height - FACE.edge, 8)
  assert.match(TALK_CSS, /\.hh-char\{position:absolute;left:var\(--hh-inset\);bottom:calc\(-8px\*var\(--hh-k\)\);z-index:1;pointer-events:none\}/)
  assert.equal(under.props.style, undefined, 'nothing about its place is set by the page')
  // only one character on the page, and none in the folded strip
  assert.equal(all(view.tree, n => n.props['data-hh-character']).length, 1)
  resize(view, 540)
  click(strip(view))
  assert.equal(helper(view), null)
  assert.equal(all(view.tree, n => n.props['data-hh-character']).length, 0)
})

test('132 px when Helper\'s window is under 420 px wide or the page is under 600 px high; the style sheet is told the same', async () => {
  const { view } = await open({ measured: true })
  resize(view, 1180, 822)
  assert.equal(face(view).props.width, 168)
  assert.equal(helper(view).props.className, T.win)
  resize(view, 1180, 590)
  assert.equal(face(view).props.width, CHARACTER_SMALL_PX)
  assert.equal(CHARACTER_SMALL_PX, 132)
  assert.equal(helper(view).props.className, `${T.win} ${T.winSmall}`)
  // 730 px of page: Helper's window is 410 px (dash-v1: no tab has a step list now, so the 760 px page this used,
  // where the numbers-only step list made Helper 392 px, leaves Helper 440 px; 730 px gives the same case, under 420)
  resize(view, 730, 822)
  assert.equal(helper(view).props.style.width, '410px')
  assert.equal(face(view).props.width, 132)
  assert.equal(helper(view).props.className, `${T.win} ${T.winTight} ${T.winSmall}`)
  resize(view, 1180, 822)
  assert.equal(face(view).props.width, 168)
})

test('Helper comes on screen: the character rises and the words wait for it; then they appear one per 120 ms while it talks; the opening ends with a question, so it then asks', async () => {
  const { view, timers } = await open({ settleFirst: false })
  assert.equal(face(view).props['data-rising'], true)
  assert.deepEqual(shownWords(view), [0], 'no word before it is up')
  assert.equal(expression(view), 'resting', 'not talking while it rises')
  assert.equal(wordClock(timers).length, 1, 'one host timer, at the word pace')
  await settle()
  for (let i = 0; i < RISE_TICKS - 1; i++) timers.tick()
  assert.equal(expression(view), 'resting', '0.72 s in: the character is up, the words wait one tick more')
  assert.deepEqual(shownWords(view), [0])
  timers.tick()
  assert.equal(expression(view), 'talking', 'the first word is out: it talks')
  assert.deepEqual(shownWords(view), [1])
  for (let i = 0; i < OPENING_WORDS - 2; i++) timers.tick()
  assert.equal(expression(view), 'talking', 'one word to go: still talking, the question mark is not out yet')
  timers.tick()
  assert.equal(expression(view), 'asking', 'the last word is out: the mouth stops, the asking face shows')
  assert.deepEqual(shownWords(view), [OPENING_WORDS])
  assert.equal(wordClock(timers).length, 0, 'the timer runs only while words are appearing')
  assert.equal(face(view).props['data-rising'], undefined)
})

test('a screen reader gets the whole line once, from the first moment; the copy that grows word by word is hidden from it', async () => {
  const { view, timers } = await open()
  for (let i = 0; i < RISE_TICKS + 2; i++) timers.tick()
  redraw(view)
  const [line] = lines(view)
  assert.equal(line.props['data-shown'], 3)
  assert.equal(spoken(bubble(view)).trim(), OPENING)
  assert.equal(bubble(view).props['aria-live'], 'polite')
  assert.equal(byData(line, 'said-seen').props['aria-hidden'], true)
  assert.equal(line.props.className, T.line)
})

test('the bubble has its final size from the first word: the words not said yet hold their room, unseen', async () => {
  const { view, timers } = await open({ settleFirst: false })
  const whole = t => text(byData(lines(t)[0], 'said-seen')).replace(/\s+/g, ' ').trim()
  assert.equal(whole(view), OPENING, 'before the first word: every word is in the bubble already')
  assert.equal(byData(lines(view)[0], 'said-rest').props.style.visibility, 'hidden')
  await settle()
  for (let i = 0; i < RISE_TICKS + 4; i++) timers.tick()
  redraw(view)
  assert.equal(lines(view)[0].props['data-shown'], 5)
  assert.equal(whole(view), OPENING, 'half way: the same words, so the same size')
  assert.equal(text(byData(lines(view)[0], 'said-rest')).trim(), OPENING.split(' ').slice(5).join(' '))
  root(view).props.onPointerDownCapture({})
  assert.equal(byData(lines(view)[0], 'said-rest'), null, 'all said: nothing is held back')
  assert.equal(whole(view), OPENING)
})


test('typing or pressing the mouse while words appear shows the rest at once and the mouth stops; a lone Shift does not', async () => {
  for (const press of [v => root(v).props.onKeyDownCapture({ key: 'a' }), v => root(v).props.onPointerDownCapture({})]) {
    const { view, timers } = await open()
    for (let i = 0; i < RISE_TICKS + 3; i++) timers.tick()
    redraw(view)
    assert.deepEqual(shownWords(view), [4])
    assert.equal(expression(view), 'talking')
    root(view).props.onKeyDownCapture({ key: 'Shift' })
    assert.equal(expression(view), 'talking', 'Shift alone is not typing')
    press(view)
    assert.deepEqual(shownWords(view), [OPENING_WORDS])
    assert.equal(expression(view), 'asking')
    assert.equal(wordClock(timers).length, 0)
  }
})


test('a line is revealed once: a tab change, and folding Helper away and bringing it back, do not replay it', async () => {
  const { view, timers } = await open({ measured: true })
  resize(view, 540)
  for (let i = 0; i < RISE_TICKS + OPENING_WORDS; i++) timers.tick()
  assert.deepEqual(shownWords(view), [OPENING_WORDS])
  click(tabs(view)[1])
  await settle()
  assert.deepEqual(shownWords(view), [OPENING_WORDS])
  click(tabs(view)[0])
  click(strip(view))
  assert.equal(helper(view), null)
  click(strip(view))
  assert.deepEqual(shownWords(view), [OPENING_WORDS])
  for (let i = 0; i < RISE_TICKS + 2; i++) timers.tick()
  assert.equal(expression(view), 'asking', 'nothing is said again, so it never talks')
  assert.equal(wordClock(timers).length, 0)
})

test('folded away half way through a line: the line is whole when Helper comes back', async () => {
  const { view, timers } = await open({ measured: true })
  resize(view, 540)
  for (let i = 0; i < RISE_TICKS + 3; i++) timers.tick()
  redraw(view)
  assert.deepEqual(shownWords(view), [4])
  click(strip(view))
  click(strip(view))
  assert.deepEqual(shownWords(view), [OPENING_WORDS])
  assert.notEqual(expression(view), 'talking')
})

test('rising happens once each time Helper comes on screen: not on a tab change or a new line; again after it was folded away', async () => {
  const { view, timers } = await open({ settleFirst: false, measured: true })
  resize(view, 540)
  assert.equal(face(view).props['data-rising'], true)
  await settle() // 0.7 s have passed (the host's timer)
  click(tabs(view)[1])
  await settle()
  assert.equal(face(view).props['data-rising'], undefined, 'a tab change: no rising')
  click(tabs(view)[0])
  assert.equal(face(view).props['data-rising'], undefined)
  for (let i = 0; i < RISE_TICKS + OPENING_WORDS; i++) timers.tick()
  send(view, 'Peter')
  assert.equal(face(view).props['data-rising'], undefined, 'a new line: no rising')
  // folded away and brought back: it comes on screen anew
  click(strip(view))
  click(strip(view))
  assert.equal(face(view).props['data-rising'], true)
  assert.equal(wordClock(timers).length, 1, 'the words wait again while it comes up')
  await settle()
  click(tabs(view)[1])
  assert.equal(face(view).props['data-rising'], undefined)
})

test('leaving the page and coming back: Helper comes on screen again, so it rises again; the opening is not said again', async () => {
  const first = await open()
  for (let i = 0; i < RISE_TICKS + OPENING_WORDS; i++) first.timers.tick()
  first.view.unmount()
  const second = mount(first.Page)
  assert.equal(face(second).props['data-rising'], true)
  assert.deepEqual(shownWords(second), [OPENING_WORDS])
  await settle()
  for (let i = 0; i < RISE_TICKS + 2; i++) first.timers.tick()
  assert.notEqual(expression(second), 'talking')
  assert.equal(wordClock(first.timers).length, 0)
})

// The person's "reduce motion" setting, as the page reads it.
function fakeReduceMotion(on) {
  const heard = new Set()
  const setting = { matches: on, addEventListener: (type, fn) => type === 'change' && heard.add(fn), removeEventListener: (type, fn) => heard.delete(fn) }
  const asked = []
  globalThis.matchMedia = query => (asked.push(query), setting)
  return { asked, listeners: () => heard.size, set(next) { setting.matches = next; [...heard].forEach(fn => fn({ matches: next })) } }
}


test('reduce motion is watched: switched on while a line appears, the rest shows at once; switched off, new lines are revealed again', async () => {
  const motion = fakeReduceMotion(false)
  const { view, timers } = await open()
  assert.equal(motion.listeners(), 1)
  for (let i = 0; i < RISE_TICKS + 2; i++) timers.tick()
  assert.equal(expression(view), 'talking')
  assert.equal(eyesNow(view), 'follow')
  motion.set(true)
  assert.deepEqual(shownWords(view), [OPENING_WORDS])
  assert.equal(expression(view), 'asking')
  assert.equal(eyesNow(view), 'still')
  assert.equal(wordClock(timers).length, 0)
  assert.equal(all(face(view), n => n.props['data-hh'] === 'mouth')[0].props.style.transition, 'none')
  motion.set(false)
  assert.equal(eyesNow(view), 'follow')
  send(view, 'Peter')
  assert.equal(expression(view), 'talking')
  assert.notEqual(all(face(view), n => n.props['data-hh'] === 'mouth')[0].props.style.transition, 'none')
  view.unmount()
  assert.equal(motion.listeners(), 0, 'leaving the page stops the watching')
})

test('the eyes hear the cursor, the keyboard focus and scrolling from our own outer box only', async () => {
  const { view } = await open()
  const page = root(view)
  for (const name of ['onPointerMove', 'onPointerLeave', 'onFocus', 'onBlur', 'onScrollCapture']) assert.equal(typeof page.props[name], 'function', name)
  // safe to call at any time, also before the drawing is there
  page.props.onPointerMove({ clientX: 300, clientY: 74 })
  page.props.onPointerLeave({})
  page.props.onFocus({ target: { matches: () => true, getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) } })
  page.props.onBlur({ relatedTarget: null, currentTarget: { contains: () => false } })
  page.props.onScrollCapture({})
  await settle()
  view.unmount()
})

test('reduce motion switched off later: Helper rises again the next time it comes on screen, not in the middle of things', async () => {
  const motion = fakeReduceMotion(true)
  const { view, timers } = await open({ measured: true })
  resize(view, 540)
  assert.equal(face(view).props['data-rising'], undefined)
  motion.set(false)
  assert.equal(face(view).props['data-rising'], undefined, 'switching the setting does not make it rise there and then')
  click(strip(view))
  click(strip(view))
  assert.equal(face(view).props['data-rising'], true)
  await settle()
  for (let i = 0; i < RISE_TICKS; i++) timers.tick()
  click(tabs(view)[1])
  assert.equal(face(view).props['data-rising'], undefined)
})

test('asking shows also when a press during the rising brought the question out at once', async () => {
  const { view } = await open({ settleFirst: false })
  assert.equal(expression(view), 'resting')
  assert.deepEqual(shownWords(view), [0])
  root(view).props.onPointerDownCapture({})
  assert.equal(expression(view), 'asking')
})

test('the page is not drawn again for a word: only when talking starts or stops, or a line becomes whole', async () => {
  useHost()
  const timers = fakeTimers()
  const { Page } = await registerPlugin(fakeStorage(), timers)
  let draws = 0
  const view = mount((...args) => {
    draws++
    return Page(...args)
  })
  await settle()
  for (let i = 0; i < RISE_TICKS - 1; i++) timers.tick()
  const waiting = draws
  timers.tick() // the first word
  assert.equal(expression(view), 'talking')
  assert.ok(draws > waiting, 'talking starts: the page is drawn')
  const talking = draws
  for (let i = 0; i < OPENING_WORDS - 2; i++) timers.tick()
  assert.equal(draws, talking, `${OPENING_WORDS - 2} words appeared and the page was not drawn again`)
  timers.tick() // the last word
  assert.equal(expression(view), 'asking')
  assert.ok(draws > talking)
})

// The page's very first draw, before any effect has run: the bubble as the page hands it over.
async function firstDrawBubbles() {
  useHost()
  const { Page } = await registerPlugin(fakeStorage(), fakeTimers())
  let first = null
  mount((...args) => {
    const drawn = Page(...args)
    if (!first) first = drawn
    return drawn
  })
  return all(first, n => typeof n.type === 'function' && n.type.name === 'Bubble')
}

test('reduce motion: the line is whole in the very first draw, with no empty moment before it appears', async () => {
  fakeReduceMotion(true)
  const still = await firstDrawBubbles()
  assert.equal(still.length, 1, 'the opening is in the first draw')
  assert.equal(still[0].props.fresh, false, 'not fresh: drawn whole at once')
  assert.equal(still[0].props.said, true)
  // without reduce motion the same first draw holds the words back, to reveal them
  delete globalThis.matchMedia
  const moving = await firstDrawBubbles()
  assert.equal(moving.length, 1)
  assert.equal(moving[0].props.fresh, true)
  assert.equal(moving[0].props.said, false)
})
