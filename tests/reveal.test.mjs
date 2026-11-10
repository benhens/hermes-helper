// Word by word (src/reveal.js): the small clock that lets Helper's lines appear one word after
// another, and the Said component that draws one line. The clock is plain code; Said is rendered
// with the React stand-in (tests/lib/render.mjs), where its own hooks run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mount, all, text, loadSrc } from './lib/render.mjs'
import { K, T } from '../src/look.js'

const { WORD_MS, wordsOf, makeRevealClock, Said } = await loadSrc('reveal.js')

// A pretend host timer: nothing fires by itself; tick() is one interval going off.
function host() {
  const live = new Set()
  const h = {
    started: [],
    setInterval(fn, ms) {
      h.started.push(ms)
      const entry = { fn }
      live.add(entry)
      return () => live.delete(entry)
    },
    running: () => live.size,
    tick(times = 1) {
      for (let i = 0; i < times; i++) for (const e of [...live]) e.fn()
    }
  }
  return h
}
function clockWith() {
  const h = host()
  const clock = makeRevealClock({ setInterval: h.setInterval })
  // busy: each time talking starts (true) or stops (false). changes.n: how often the page is told.
  const busy = []
  const changes = { n: 0 }
  let last = false
  clock.onChange(() => {
    changes.n++
    if (clock.talking() !== last) busy.push((last = clock.talking()))
  })
  return { h, clock, busy, changes }
}
const line = (key, n, fresh = true) => ({ key, words: n, fresh })

test('the pace is one constant: 120 ms a word', () => {
  assert.equal(WORD_MS, 120)
  const { h, clock } = clockWith()
  clock.show([line('a', 3)])
  assert.deepEqual(h.started, [120])
})

test('a line appears one word per tick: the first at once, the last after words - 1 ticks; then the timer stops', () => {
  const { h, clock, busy } = clockWith()
  assert.equal(h.running(), 0, 'no timer before any words')
  clock.show([line('a', 5)])
  assert.equal(clock.shown('a', 5, true), 1)
  assert.equal(clock.talking(), true)
  assert.equal(h.running(), 1)
  for (const want of [2, 3, 4]) {
    h.tick()
    assert.equal(clock.shown('a', 5, true), want)
    assert.equal(clock.whole('a'), false)
    assert.equal(clock.talking(), true)
  }
  h.tick()
  assert.equal(clock.shown('a', 5, true), 5)
  assert.equal(clock.whole('a'), true)
  assert.equal(clock.talking(), false, 'talking stops on the last word')
  assert.equal(h.running(), 0, 'the timer runs only while words are appearing')
  assert.deepEqual(busy, [true, false])
})

test('several texts appear in reading order, one after the other', () => {
  const { h, clock } = clockWith()
  clock.show([line('line', 3), line('note', 2)])
  assert.deepEqual([clock.shown('line', 3, true), clock.shown('note', 2, true)], [1, 0])
  h.tick(2)
  assert.deepEqual([clock.shown('line', 3, true), clock.shown('note', 2, true)], [3, 0])
  h.tick()
  assert.deepEqual([clock.shown('line', 3, true), clock.shown('note', 2, true)], [3, 1])
  assert.equal(clock.talking(), true)
  h.tick()
  assert.equal(clock.whole('note'), true)
  assert.equal(clock.talking(), false)
  assert.equal(h.running(), 0)
})

test('a key press or a mouse press: finishAll shows the rest at once and the talking stops', () => {
  const { h, clock, busy } = clockWith()
  clock.show([line('a', 40), line('b', 12)])
  h.tick(3)
  assert.equal(clock.shown('a', 40, true), 4)
  clock.finishAll()
  assert.equal(clock.shown('a', 40, true), 40)
  assert.equal(clock.shown('b', 12, true), 12)
  assert.equal(clock.talking(), false)
  assert.equal(h.running(), 0)
  assert.deepEqual(busy, [true, false])
  // words said after the press appear word by word again
  clock.show([line('a', 40), line('b', 12), line('c', 3)])
  assert.equal(clock.shown('c', 3, true), 1)
  assert.equal(clock.talking(), true)
})

test('a line is revealed once: shown again later (tab change, Chat log switch, helper hidden and back) it is whole', () => {
  const { h, clock } = clockWith()
  clock.show([line('a', 3)])
  h.tick(2)
  assert.equal(clock.whole('a'), true)
  clock.show([])
  clock.show([line('a', 3)])
  assert.equal(clock.shown('a', 3, true), 3)
  assert.equal(clock.talking(), false)
  assert.equal(h.running(), 0)
})

test('a line that leaves the screen half way is whole when it comes back, and does not hold up the next line', () => {
  const { h, clock } = clockWith()
  clock.show([line('greeting', 10)])
  h.tick(2)
  assert.equal(clock.shown('greeting', 10, true), 3)
  // the model-check line takes its place
  clock.show([line('status', 4)])
  assert.equal(clock.whole('greeting'), true)
  assert.equal(clock.shown('status', 4, true), 1, 'the new line starts at once')
  h.tick(3)
  assert.equal(clock.whole('status'), true)
})

test('older lines that were never on screen (Chat log switched on later) are not fresh: they show whole, with no talking', () => {
  const { h, clock, busy } = clockWith()
  clock.show([line('old-1', 20, false), line('old-2', 9, false)])
  assert.equal(clock.shown('old-1', 20, false), 20)
  assert.equal(clock.whole('old-2'), true)
  assert.equal(clock.talking(), false)
  assert.equal(h.running(), 0)
  assert.deepEqual(busy, [])
})

test('before the clock has heard of a line: a fresh one shows no words yet (never a flash of the whole line), an old one shows whole', () => {
  const { clock } = clockWith()
  assert.equal(clock.shown('new', 7, true), 0)
  assert.equal(clock.shown('old', 7, false), 7)
  assert.equal(clock.whole('new'), false)
})

test('while the character is rising the words wait: nothing appears and nothing is "talking" for 0.7 s, then the first word', () => {
  const { h, clock, busy } = clockWith()
  clock.holdFor(700)
  clock.show([line('a', 4)])
  assert.equal(clock.shown('a', 4, true), 0)
  assert.equal(clock.talking(), false)
  assert.equal(h.running(), 1, 'the timer counts the wait')
  h.tick(5) // 600 ms
  assert.equal(clock.shown('a', 4, true), 0)
  assert.deepEqual(busy, [])
  h.tick() // 720 ms: the first tick at or after 700 ms
  assert.equal(clock.shown('a', 4, true), 1)
  assert.equal(clock.talking(), true)
  h.tick(3)
  assert.equal(clock.whole('a'), true)
  assert.equal(h.running(), 0)
})

test('a wait with nothing to say ends by itself and leaves no timer running', () => {
  const { h, clock } = clockWith()
  clock.holdFor(700)
  assert.equal(h.running(), 1)
  h.tick(6)
  assert.equal(h.running(), 0)
  // words that come later start at once
  clock.show([line('a', 2)])
  assert.equal(clock.shown('a', 2, true), 1)
})

test('a press during the wait shows the waiting words at once', () => {
  const { h, clock } = clockWith()
  clock.holdFor(700)
  clock.show([line('a', 4)])
  clock.finishAll()
  assert.equal(clock.shown('a', 4, true), 4)
  assert.equal(clock.talking(), false)
  h.tick(6)
  assert.equal(h.running(), 0)
})

test('reduce motion: every line appears whole, now and from then on; no timer, no talking, no wait', () => {
  const { h, clock, busy } = clockWith()
  clock.show([line('a', 9)])
  h.tick()
  clock.setWhole(true)
  assert.equal(clock.shown('a', 9, true), 9)
  assert.equal(clock.talking(), false)
  assert.equal(h.running(), 0)
  clock.holdFor(700)
  clock.show([line('a', 9), line('b', 5)])
  assert.equal(clock.shown('b', 5, true), 5)
  assert.equal(clock.shown('never-seen', 3, true), 3)
  assert.equal(h.running(), 0)
  assert.deepEqual(busy, [true, false])
  // switched off again: new lines are revealed again
  clock.setWhole(false)
  clock.show([line('a', 9), line('b', 5), line('c', 2)])
  assert.equal(clock.shown('c', 2, true), 1)
})

test('only the line that changed is told: a watcher hears its own words and nothing else', () => {
  const { h, clock } = clockWith()
  const heard = { a: 0, b: 0 }
  const offA = clock.watch('a', () => heard.a++)
  clock.watch('b', () => heard.b++)
  clock.show([line('a', 3), line('b', 2)])
  assert.deepEqual(heard, { a: 1, b: 0 })
  h.tick(2)
  assert.deepEqual(heard, { a: 3, b: 0 })
  h.tick()
  assert.deepEqual(heard, { a: 3, b: 1 })
  offA()
  clock.finishAll()
  assert.deepEqual(heard, { a: 3, b: 2 })
})

test('words are split at spaces; an empty line has none', () => {
  assert.deepEqual(wordsOf("Hi, I'm Helper.  What's your   name?"), ['Hi,', "I'm", 'Helper.', "What's", 'your', 'name?'])
  assert.deepEqual(wordsOf('  '), [])
  assert.deepEqual(wordsOf(undefined), [])
})

/* ---------- Said: one line on screen ---------- */

const GREETING = "Open a step and ask me about it here. I explain things; I don't change your settings."

function said(clock, props = {}) {
  const view = mount(() => Said({ clock, id: 'g', text: GREETING, className: T.line, fresh: true, ...props }))
  const p = () => view.tree
  const whole = () => all(p(), n => n.props['data-hh'] === 'said-whole')[0]
  const seen = () => all(p(), n => n.props['data-hh'] === 'said-seen')[0]
  const rest = () => all(p(), n => n.props['data-hh'] === 'said-rest')[0] || null
  return { view, p, whole, seen, rest }
}

test('Said: a paragraph in the class it is given (the bubble\'s line), holding the whole line once for screen readers and the word-by-word copy hidden from them', () => {
  const { h, clock } = clockWith()
  const s = said(clock)
  clock.show([line('g', wordsOf(GREETING).length)])
  assert.equal(s.p().type, 'p')
  assert.equal(s.p().props.className, T.line)
  assert.equal(T.line, 'hh-line')
  // the screen reader's copy: Hermes's own sr-only class, the whole line, never part of a selection
  assert.equal(s.whole().props.className, K.srOnly)
  assert.match(K.srOnly, /(^|\s)sr-only(\s|$)/)
  assert.equal(text(s.whole()), GREETING)
  assert.equal(s.whole().props['aria-hidden'], undefined)
  assert.equal(s.whole().props.style.userSelect, 'none')
  // the copy the eye sees: hidden from screen readers
  assert.equal(s.seen().props['aria-hidden'], true)
  h.tick(4)
  assert.equal(text(s.whole()), GREETING, 'the whole line stays the same while words appear')
  assert.equal(all(s.p(), n => n.props['data-hh'] === 'said-whole').length, 1, 'once')
})

test('Said: shows the words so far; the rest holds its place unseen, so the text keeps its final size', () => {
  const { h, clock } = clockWith()
  const s = said(clock)
  const words = wordsOf(GREETING)
  assert.equal(s.p().props['data-shown'], 0, 'nothing before the clock has started the line')
  clock.show([line('g', words.length)])
  assert.equal(s.p().props['data-shown'], 1, 'Said redraws itself when its line gets a word')
  h.tick(4)
  assert.equal(s.p().props['data-shown'], 5)
  assert.equal(s.p().props['data-words'], words.length)
  assert.equal(s.rest().props.style.visibility, 'hidden')
  // seen + unseen together are the whole line, in order
  assert.equal(text(s.seen()).replace(/\s+/g, ' ').trim(), GREETING)
  const visible = text(s.seen()).replace(text(s.rest()), '').trim()
  assert.equal(visible, words.slice(0, 5).join(' '))
  h.tick(words.length)
  assert.equal(s.p().props['data-shown'], words.length)
  assert.equal(s.rest(), null, 'nothing unseen is left')
  assert.equal(text(s.seen()).trim(), GREETING)
})

test('Said: a press shows the rest at once; a line already revealed is whole when drawn again', () => {
  const { h, clock } = clockWith()
  const s = said(clock)
  const n = wordsOf(GREETING).length
  clock.show([line('g', n)])
  h.tick(2)
  clock.finishAll()
  assert.equal(s.p().props['data-shown'], n)
  s.view.unmount()
  const again = said(clock)
  assert.equal(again.p().props['data-shown'], n)
  assert.equal(again.rest(), null)
})

test('Said: leaving the page stops its listening', () => {
  const { h, clock } = clockWith()
  const s = said(clock)
  clock.show([line('g', 16)])
  s.view.unmount()
  const before = s.p().props['data-shown']
  h.tick(3)
  assert.equal(s.p().props['data-shown'], before, 'no redraw after unmount')
})

test('Said: an old line (not fresh) is whole from the first draw', () => {
  const { clock } = clockWith()
  const s = said(clock, { fresh: false })
  assert.equal(s.p().props['data-shown'], wordsOf(GREETING).length)
  assert.equal(s.rest(), null)
})

test('the page is told when talking starts or stops and when a line becomes whole, never for a word in between', () => {
  const { h, clock, changes } = clockWith()
  clock.show([line('a', 5), line('b', 3)])
  assert.equal(changes.n, 1, 'talking starts')
  h.tick(3)
  assert.equal(changes.n, 1, 'three more words: nothing for the page')
  h.tick()
  assert.equal(changes.n, 2, 'line a is whole (talking goes on with b)')
  assert.equal(clock.talking(), true)
  h.tick(2)
  assert.equal(changes.n, 2)
  h.tick()
  assert.equal(changes.n, 3, 'line b is whole and talking stops: told once')
  assert.equal(clock.talking(), false)
})

test('a press during the wait: the page is told the line is whole, though talking never started', () => {
  const { clock, changes } = clockWith()
  clock.holdFor(700)
  clock.show([line('q', 4)])
  assert.equal(changes.n, 0)
  clock.finishAll()
  assert.equal(clock.whole('q'), true)
  assert.equal(clock.talking(), false)
  assert.equal(changes.n, 1)
})

test('a one-word line is whole at once: the page is told, no timer is left running', () => {
  const { h, clock, changes } = clockWith()
  clock.show([line('one', 1)])
  assert.equal(clock.whole('one'), true)
  assert.equal(clock.talking(), false)
  assert.equal(changes.n, 1)
  assert.equal(h.running(), 0)
})
