// The character on the page (the built plugin, rendered with the stand-ins): where it sits, which
// expression shows when, Helper's lines appearing word by word, the rising when the helper opens,
// and reduce motion. The drawing itself is tests/character.test.mjs, the reveal clock
// tests/reveal.test.mjs, the eyes tests/eyes.test.mjs; the real app run is dev/checks/character-v2-shots.
// How time passes here: the host's interval never fires by itself; timers.tick() is 120 ms.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, spoken, byData, byLabel, click } from './lib/render.mjs'
import { withPickedGreeting, PICKED_GREETING } from './lib/picked-greeting.mjs'
import { LINES } from '../src/steps.js'
import { NO_MODEL_LINE, NO_MODEL_SMALL } from '../src/model-status.js'
import { K } from '../src/look.js'

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

async function open({ storage = fakeStorage(), host = {}, change = null, settleFirst = true } = {}) {
  useHost(host)
  const timers = fakeTimers()
  const { Page } = await registerPlugin(storage, timers, {}, change)
  const view = mount(Page)
  if (settleFirst) await settle()
  return { view, timers, storage, Page }
}

const WORDS = n => n.trim().split(/\s+/).length
const GREETING_WORDS = WORDS(LINES.greeting)
const helper = view => byData(view.tree, 'helper')
const root = view => byData(view.tree, 'page')
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

beforeEach(() => {
  delete globalThis.__hhHost
  delete globalThis.matchMedia
})
afterEach(() => {
  delete globalThis.matchMedia
})

test('where it sits: its own row directly above the message box, at the box\'s left end, over the box\'s top border and in front of it; no thought dots', async () => {
  const { view } = await open()
  const kids = helper(view).props.children.filter(Boolean)
  assert.deepEqual(kids.slice(1).map(k => k.props['data-hh']), ['helper-body', 'character', 'composer'])
  const row = kids[2]
  assert.equal(row.props.className, K.characterRow)
  // left end: nothing pushes it to the right any more
  assert.doesNotMatch(K.characterRow, /justify-end|items-end|ml-auto/)
  assert.deepEqual(row.props.style, { position: 'relative', zIndex: 1, paddingLeft: 26, paddingRight: 12, marginBottom: -9.6, pointerEvents: 'none' })
  // 26 = the message box's own 12 px side padding + 14; -9.6 = the form's 4 px top padding + 5.6 over the border
  assert.match(K.composerForm, /(^|\s)px-3(\s|$)/)
  assert.match(K.composerForm, /(^|\s)pt-1(\s|$)/)
  const drawn = all(row, n => n.props['data-hh-character'])
  assert.equal(drawn.length, 1)
  assert.equal(drawn[0].props['data-hh-character'], 'face')
  assert.equal(drawn[0].props.width, 140)
  assert.equal(drawn[0].props.style.maxWidth, '100%')
  assert.equal(drawn[0].props.style.pointerEvents, 'none')
  // the 9 Nov dots and the old hand are gone
  assert.equal(byData(view.tree, 'thought-dots'), null)
  for (const key of ['thoughtDots', 'thoughtDot1', 'thoughtDot2', 'thoughtDot3']) assert.equal(K[key], undefined, key)
  assert.equal(all(view.tree, n => n.props['data-pose'] !== undefined).length, 0)
  // only in the open helper: not in the folded strip
  click(byLabel(view.tree, 'Hide the helper'))
  assert.equal(all(view.tree, n => n.props['data-hh-character']).length, 0)
})

test('the helper opens: the character rises and the words wait for it; then they appear one per 120 ms while it talks; on the last word it rests', async () => {
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
  for (let i = 0; i < GREETING_WORDS - 2; i++) timers.tick()
  assert.equal(expression(view), 'talking', 'one word to go: still talking')
  timers.tick()
  assert.equal(expression(view), 'resting', 'the last word is out: the mouth stops')
  assert.deepEqual(shownWords(view), [GREETING_WORDS])
  assert.equal(wordClock(timers).length, 0, 'the timer runs only while words are appearing')
  assert.equal(face(view).props['data-rising'], undefined)
})

test('a screen reader gets the whole line once, from the first moment; the copy that grows word by word is hidden from it', async () => {
  const { view, timers } = await open()
  for (let i = 0; i < RISE_TICKS + 2; i++) timers.tick()
  redraw(view)
  const [line] = lines(view)
  assert.equal(line.props['data-shown'], 3)
  assert.equal(spoken(byData(helper(view), 'say')).trim(), LINES.greeting)
  assert.equal(byData(helper(view), 'say').props['aria-live'], 'polite')
  assert.equal(byData(line, 'said-seen').props['aria-hidden'], true)
  assert.equal(line.props.className, K.say)
})

test('asking: when the last thing Helper said ends with a question mark and all of it is on screen (shown with the picked greeting in a test copy)', async () => {
  const { view, timers } = await open({ change: withPickedGreeting, settleFirst: false })
  assert.match(text(helper(view)), /What's your name\?/)
  assert.equal(expression(view), 'resting', 'the question is not on screen yet: not asking')
  await settle()
  for (let i = 0; i < RISE_TICKS; i++) timers.tick()
  assert.equal(expression(view), 'talking')
  for (let i = 0; i < WORDS(PICKED_GREETING) - 2; i++) timers.tick()
  assert.equal(expression(view), 'talking', 'the question mark is not out yet')
  timers.tick()
  assert.equal(expression(view), 'asking')
  // today's greeting ends with a full stop: the committed build never shows asking for it
  const today = await open()
  for (let i = 0; i < RISE_TICKS + GREETING_WORDS; i++) today.timers.tick()
  assert.equal(expression(today.view), 'resting')
  assert.doesNotMatch(text(helper(today.view)), /What's your name\?/)
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
    assert.deepEqual(shownWords(view), [GREETING_WORDS])
    assert.equal(expression(view), 'resting')
    assert.equal(wordClock(timers).length, 0)
  }
})

test('the person\'s own words appear at once; Helper\'s reply appears word by word; what was said before is not replayed', async () => {
  const { view, timers } = await open({ storage: fakeStorage({ step: 2, chatlog: true }) })
  for (let i = 0; i < RISE_TICKS + GREETING_WORDS; i++) timers.tick()
  assert.equal(expression(view), 'resting')
  send(view, 'What is a provider?')
  const items = all(byData(helper(view), 'chatlog'), n => n.type === 'li')
  assert.deepEqual(items.map(i => i.props['data-who']), ['helper', 'you', 'helper'])
  // the person's line: a plain paragraph, whole
  assert.equal(all(items[1], n => n.props['data-hh'] === 'said').length, 0)
  assert.match(text(items[1]), /What is a provider\?/)
  assert.equal(all(items[1], n => n.type === 'p')[0].props.className, K.logYou)
  // Helper's reply: one word at once (nothing to wait for), the rest to come; the greeting stays whole
  assert.deepEqual(shownWords(view), [GREETING_WORDS, 1])
  assert.equal(expression(view), 'talking')
  timers.tick()
  timers.tick()
  assert.equal(expression(view), 'talking')
  const reply = lines(view)[1].props['data-words']
  for (let i = 0; i < reply; i++) timers.tick()
  assert.deepEqual(shownWords(view), [GREETING_WORDS, reply])
  assert.equal(expression(view), 'resting')
})

test('a line and its small note: the line first, then the note, word by word (the fact under "Your answer")', async () => {
  const { view, timers } = await open({ storage: fakeStorage({ step: 2 }) })
  for (let i = 0; i < RISE_TICKS + GREETING_WORDS; i++) timers.tick()
  click(all(byData(view.tree, 'detail'), n => n.props['data-option'] === 'o_key')[0])
  const [line, note] = lines(view)
  assert.equal(line.props.className, K.say)
  assert.equal(note.props.className, K.caption)
  assert.match(spoken(line), /^\s*Your answer: /)
  assert.deepEqual(shownWords(view), [1, 0])
  for (let i = 0; i < line.props['data-words'] - 1; i++) timers.tick()
  assert.equal(expression(view), 'talking', 'the note is still to come')
  timers.tick()
  for (let i = 0; i < note.props['data-words'] - 1; i++) timers.tick()
  assert.equal(expression(view), 'resting')
  assert.deepEqual(shownWords(view), [line.props['data-words'], note.props['data-words']])
  // the source tag under the note is there from the start (links and buttons are never held back)
  assert.equal(all(byData(helper(view), 'say'), n => n.props['data-hh'] === 'source').length, 1)
})

test('no model: the model-check line and its small note are revealed too, and "Check again" is there from the start', async () => {
  const { view, timers } = await open({ host: { runtime: { ok: false } } })
  assert.ok(byLabel(helper(view), 'Check again'), 'the button does not wait for the words')
  const [line, note] = lines(view)
  assert.equal(spoken(line).trim(), NO_MODEL_LINE)
  assert.equal(spoken(note).trim(), NO_MODEL_SMALL)
  for (let i = 0; i < RISE_TICKS + WORDS(NO_MODEL_LINE) + WORDS(NO_MODEL_SMALL); i++) timers.tick()
  assert.deepEqual(shownWords(view), [WORDS(NO_MODEL_LINE), WORDS(NO_MODEL_SMALL)])
  assert.equal(expression(view), 'resting')
  assert.equal(wordClock(timers).length, 0)
})

test('a line is revealed once: a tab change, the Chat log switch, and hiding and showing the helper do not replay it', async () => {
  const { view, timers } = await open()
  for (let i = 0; i < RISE_TICKS + GREETING_WORDS; i++) timers.tick()
  assert.deepEqual(shownWords(view), [GREETING_WORDS])
  click(tabs(view)[1])
  await settle()
  assert.deepEqual(shownWords(view), [GREETING_WORDS])
  click(tabs(view)[0])
  all(helper(view), n => n.type === 'sdk:Switch')[0].props.onCheckedChange(true)
  assert.deepEqual(shownWords(view), [GREETING_WORDS])
  all(helper(view), n => n.type === 'sdk:Switch')[0].props.onCheckedChange(false)
  click(byLabel(helper(view), 'Hide the helper'))
  click(byData(view.tree, 'helper-hidden'))
  assert.deepEqual(shownWords(view), [GREETING_WORDS])
  for (let i = 0; i < RISE_TICKS + 2; i++) timers.tick()
  assert.equal(expression(view), 'resting', 'nothing is said again, so it never talks')
  assert.equal(wordClock(timers).length, 0)
})

test('hidden half way through a line: the line is whole when the helper comes back', async () => {
  const { view, timers } = await open()
  for (let i = 0; i < RISE_TICKS + 3; i++) timers.tick()
  redraw(view)
  assert.deepEqual(shownWords(view), [4])
  click(byLabel(helper(view), 'Hide the helper'))
  click(byData(view.tree, 'helper-hidden'))
  assert.deepEqual(shownWords(view), [GREETING_WORDS])
  assert.equal(expression(view), 'resting')
})

test('rising happens once per opening of the helper: not on a tab change or a new line; again after Hide and Show, and after Close and Show helper', async () => {
  const { view, timers } = await open({ settleFirst: false })
  assert.equal(face(view).props['data-rising'], true)
  await settle() // 0.7 s have passed (the host's timer)
  click(tabs(view)[1])
  await settle()
  assert.equal(face(view).props['data-rising'], undefined, 'a tab change: no rising')
  click(tabs(view)[0])
  assert.equal(face(view).props['data-rising'], undefined)
  for (let i = 0; i < RISE_TICKS + GREETING_WORDS; i++) timers.tick()
  send(view, 'hello')
  assert.equal(face(view).props['data-rising'], undefined, 'a new line: no rising')
  // hide and show: a new opening
  click(byLabel(helper(view), 'Hide the helper'))
  click(byData(view.tree, 'helper-hidden'))
  assert.equal(face(view).props['data-rising'], true)
  assert.equal(wordClock(timers).length, 1, 'the words wait again while it comes up')
  await settle()
  click(tabs(view)[1])
  assert.equal(face(view).props['data-rising'], undefined)
  // close and "Show helper": a new opening too
  click(byLabel(view.tree, 'Close the helper'))
  click(byLabel(view.tree, 'Show helper'))
  assert.equal(face(view).props['data-rising'], true)
})

test('leaving the page and coming back: the helper opens again, so it rises again; the greeting is not said again', async () => {
  const first = await open()
  for (let i = 0; i < RISE_TICKS + GREETING_WORDS; i++) first.timers.tick()
  first.view.unmount()
  const second = mount(first.Page)
  assert.equal(face(second).props['data-rising'], true)
  assert.deepEqual(shownWords(second), [GREETING_WORDS])
  await settle()
  for (let i = 0; i < RISE_TICKS + 2; i++) first.timers.tick()
  assert.equal(expression(second), 'resting')
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

test('reduce motion: the character is simply there (no rising), each line appears whole, it never talks, and no timer runs', async () => {
  const motion = fakeReduceMotion(true)
  const { view, timers } = await open({ settleFirst: false })
  assert.ok(motion.asked.includes('(prefers-reduced-motion: reduce)'))
  assert.equal(face(view).props['data-rising'], undefined)
  assert.equal(face(view).props.style.visibility, undefined)
  assert.deepEqual(shownWords(view), [GREETING_WORDS])
  assert.equal(expression(view), 'resting')
  assert.equal(wordClock(timers).length, 0)
  assert.equal(eyesNow(view), 'still', 'the eyes stay on the person')
  // the drawing is told, so it snaps and starts no loop (tests/character.test.mjs)
  assert.equal(all(face(view), n => n.props['data-hh'] === 'mouth')[0].props.style.transition, 'none')
  await settle()
  send(view, 'What is a provider?')
  assert.equal(expression(view), 'resting', 'a new line: whole at once, no talking')
  assert.ok(shownWords(view).every((n, i) => n === lines(view)[i].props['data-words']))
  assert.equal(wordClock(timers).length, 0)
  click(byLabel(helper(view), 'Hide the helper'))
  click(byData(view.tree, 'helper-hidden'))
  assert.equal(face(view).props['data-rising'], undefined, 'opened again: still no rising')
})

test('reduce motion with a question: straight to asking (shown with the picked greeting in a test copy)', async () => {
  fakeReduceMotion(true)
  const { view } = await open({ change: withPickedGreeting })
  assert.equal(expression(view), 'asking')
})

test('reduce motion is watched: switched on while a line appears, the rest shows at once; switched off, new lines are revealed again', async () => {
  const motion = fakeReduceMotion(false)
  const { view, timers } = await open()
  assert.equal(motion.listeners(), 1)
  for (let i = 0; i < RISE_TICKS + 2; i++) timers.tick()
  assert.equal(expression(view), 'talking')
  assert.equal(eyesNow(view), 'follow')
  motion.set(true)
  assert.deepEqual(shownWords(view), [GREETING_WORDS])
  assert.equal(expression(view), 'resting')
  assert.equal(eyesNow(view), 'still')
  assert.equal(wordClock(timers).length, 0)
  assert.equal(all(face(view), n => n.props['data-hh'] === 'mouth')[0].props.style.transition, 'none')
  motion.set(false)
  assert.equal(eyesNow(view), 'follow')
  send(view, 'hello')
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

test('reduce motion switched off later: the helper rises again on its next opening, not in the middle of things', async () => {
  const motion = fakeReduceMotion(true)
  const { view, timers } = await open()
  assert.equal(face(view).props['data-rising'], undefined)
  motion.set(false)
  assert.equal(face(view).props['data-rising'], undefined, 'switching the setting does not make it rise there and then')
  click(byLabel(helper(view), 'Hide the helper'))
  click(byData(view.tree, 'helper-hidden'))
  assert.equal(face(view).props['data-rising'], true)
  await settle()
  for (let i = 0; i < RISE_TICKS; i++) timers.tick()
  click(tabs(view)[1])
  assert.equal(face(view).props['data-rising'], undefined)
})

test('asking shows also when a press during the rising brought the question out at once (picked greeting, test copy)', async () => {
  const { view } = await open({ change: withPickedGreeting, settleFirst: false })
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
  for (let i = 0; i < GREETING_WORDS - 2; i++) timers.tick()
  assert.equal(draws, talking, `${GREETING_WORDS - 2} words appeared and the page was not drawn again`)
  timers.tick() // the last word
  assert.equal(expression(view), 'resting')
  assert.ok(draws > talking)
})

// The page's very first draw, before any effect has run: the lines as the page hands them over.
async function firstDrawLines() {
  useHost()
  const { Page } = await registerPlugin(fakeStorage(), fakeTimers())
  let first = null
  mount((...args) => {
    const drawn = Page(...args)
    if (!first) first = drawn
    return drawn
  })
  return all(first, n => typeof n.type === 'function' && n.type.name === 'Said')
}

test('reduce motion: the line is whole in the very first draw, with no empty moment before it appears', async () => {
  fakeReduceMotion(true)
  const still = await firstDrawLines()
  assert.ok(still.length >= 1, 'the greeting is in the first draw')
  for (const line of still) assert.equal(line.props.fresh, false, 'not fresh: drawn whole at once')
  // without reduce motion the same first draw holds the words back, to reveal them
  delete globalThis.matchMedia
  const moving = await firstDrawLines()
  assert.ok(moving.length >= 1)
  for (const line of moving) assert.equal(line.props.fresh, true)
})

test('its width is one constant: the row is pulled down by the drawing\'s own part below the edge, worked out from CHARACTER_PX', async () => {
  const { FACE } = await import('../src/expressions.js')
  const belowEdge = FACE.view.y + FACE.view.height - FACE.edge // 8 units of the drawing hang below the box's top edge
  assert.equal(belowEdge, 8)
  const { view } = await open()
  const row = byData(helper(view), 'character')
  // 4 = the message box form's own top padding (pt-1)
  assert.equal(row.props.style.marginBottom, -(4 + (belowEdge * 140) / 200))
  const page = (await import('node:fs')).readFileSync(new URL('../src/page.js', import.meta.url), 'utf8')
  const lineOf = name => page.slice(page.indexOf(`const ${name} =`), page.indexOf('\n', page.indexOf(`const ${name} =`)))
  assert.match(lineOf('CHARACTER_ROW'), /marginBottom: -\(4 \+ BELOW_EDGE_PX\)/)
  assert.match(lineOf('BELOW_EDGE_PX'), /CHARACTER_PX/, 'worked out from the one constant')
  assert.doesNotMatch(lineOf('CHARACTER_ROW') + lineOf('BELOW_EDGE_PX'), /9\.6|5\.6/, 'not typed in for 140 px')
})
