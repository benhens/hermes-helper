// talk-live-3 on the page, with a fake Hermes and the 12 s timer held until the test fires it (as tests/live-page-2).
//   changes-5 point 4 (Lead's pick SLOW_A): when the visit's first AI call gives no answer in 12 s, or no_reply text,
//   Helper shows the written answer, then SLOW_A with its text to paste; once in the visit, never stored. Not after a
//   don't-know line (it waits for the next written answer that is not one).
//   look (hhtech-run-c18, Lead's call on question 5 of 02:45): a button that was pressed is plain faint text in the
//   older line; /usage and other text to type are drawn in the paste box's code style.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, spoken, byData, click } from './lib/render.mjs'
import { aiModeSource } from './lib/mode-loader.mjs'
import { LIVE_ROW } from '../src/live-rows.js'
import { LIVE_DATA } from '../src/live-data.js'
import { TALK_DATA } from '../src/talk-data.js'
import { curlyQuotes } from '../src/quotes.js'
import { K } from '../src/look.js'

function useHost({ oneshot = () => 'NONE' } = {}) {
  const host = {
    asks: [],
    request: async (method, params) => {
      if (method === 'llm.oneshot') {
        host.asks.push(params)
        const a = await oneshot(params, host.asks.length)
        if (a instanceof Error) throw a
        return { text: a }
      }
      const answer = { 'setup.runtime_check': { ok: true, model: 'mock-small' }, 'setup.status': { provider_configured: false } }[method]
      if (!answer) throw new Error('unexpected ' + method)
      return answer
    }
  }
  globalThis.__hhHost = host
  return host
}
const never = () => new Promise(() => {})
async function open(mode, { storage = fakeStorage(), host = {} } = {}) {
  const h = useHost(host)
  const timers = fakeTimers({ hold: [12000] })
  const { Page } = await registerPlugin(storage, timers, {}, src => aiModeSource(src, mode))
  const view = mount(Page)
  await settle()
  return { view, timers, host: h, storage }
}
const helper = view => byData(view.tree, 'helper')
const bubble = view => byData(helper(view), 'bubble')
// setup-chat (offer-t1, changes-8): a line that carries an offer is followed by a second bubble with the offer's
// question. line() and said() below still mean Helper's line for the message: when the bubble holds an offer, the
// line just above it. offerLine() and offerSaid() read the offer bubble itself (tests/offers-page.test.mjs has its cases).
const offerUp = view => !!bubble(view) && String(bubble(view).props['data-line']).startsWith('offer-')
const lastOld = view => all(helper(view), n => n.props['data-hh'] === 'old').at(-1)
const offerLine = view => (offerUp(view) ? bubble(view).props['data-line'] : null)
const offerSaid = view => (offerUp(view) ? spoken(byData(bubble(view), 'said')).trim() : null)
const line = view => (offerUp(view) ? lastOld(view).props['data-line'] : bubble(view) ? bubble(view).props['data-line'] : null)
const said = view => (offerUp(view) ? text(lastOld(view)).replace(/^Helper said: /, '').replace(/\s+/g, ' ').trim() : spoken(byData(bubble(view), 'said')).trim())
const dots = view => byData(helper(view), 'busy-dots')
const olds = view => all(helper(view), n => n.props['data-hh'] === 'old')
const oldLines = view => olds(view).map(n => n.props['data-line'])
// every Helper line in the conversation, older ones and the newest
const helperLines = view => [...oldLines(view), line(view)]
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const finish = view => byData(view.tree, 'page').props.onPointerDownCapture({})
function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  finish(view)
}
const TOKENS = "How can I make it so I use less usage? Whenever I ask a question it doesn't take as many tokens"
async function pastOpening(mode, options) {
  const o = await open(mode, options)
  finish(o.view)
  send(o.view, 'Peter')
  send(o.view, 'I run a tennis club')
  return o
}
const SLOW_TEXT = 'Your AI took too long to answer, so I answered from my own notes. To make it quicker for me, paste this into a new chat with your Hermes.'
const PASTE = LIVE_DATA.slow_ai.paste_text
const count = (view, id) => helperLines(view).filter(l => l === id).length
const THINKING = 'Thinking Process:\n\n1.  **Analyze the Request:**\n    *   **Task:**'

for (const mode of ['ai_writes', 'ai_picks_line']) {
  test(`${mode}: the visit's first call never answers: the written answer at 12 s, then SLOW_A with its text to paste; a second message makes no call and gets no second SLOW_A`, async () => {
    const { view, host, timers } = await pastOpening(mode, { host: { oneshot: never } })
    send(view, TOKENS)
    assert.equal(line(view), 'use1')
    assert.equal(host.asks.length, 0, 'code answered')
    send(view, 'what do you mean?')
    assert.ok(dots(view))
    await settle()
    assert.equal(host.asks.length, 1)
    timers.fire(12000)
    await settle()
    assert.equal(dots(view), null)
    assert.equal(oldLines(view).at(-1), 'use0', 'the written answer first, as the older line')
    assert.equal(line(view), 'SLOW_A')
    assert.equal(said(view), curlyQuotes(SLOW_TEXT))
    assert.equal(text(byData(bubble(view), 'paste-text')), PASTE)
    assert.equal(byData(bubble(view), 'bubble-button'), null, 'the box is open at once, as H1\'s')
    send(view, 'what do you mean?')
    await settle()
    assert.equal(dots(view), null, 'no dots: no call')
    assert.equal(host.asks.length, 1, 'no call for the rest of the visit')
    assert.notEqual(line(view), 'SLOW_A')
    send(view, 'what is a skill')
    send(view, 'thanks')
    await settle()
    assert.equal(count(view, 'SLOW_A'), 1, 'once in the visit')
    // the older SLOW_A line keeps its text to paste (as H1's)
    const old = olds(view).find(n => n.props['data-line'] === 'SLOW_A')
    assert.equal(text(byData(old, 'paste-text')), PASTE)
  })
}

test('the visit\'s first call sends thinking text: the written answer, then SLOW_A, at once (no 12 s wait)', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => THINKING } })
  send(view, TOKENS)
  send(view, 'what do you mean?')
  await settle()
  assert.equal(host.asks.length, 1)
  assert.deepEqual([oldLines(view).at(-1), line(view)], ['use0', 'SLOW_A'])
})

// setup-chat (hhtech-live-run2, For builder 2; Lead's points 15 and 16): SLOW_A is owed to the written answer that
// replaced the slow one. When it may not follow that answer (a don't-know line, a question, things to pick or an offer,
// a paste box) it is dropped for the visit; it never waits for a later, unrelated line (talk-live-3 had it wait).
test('a don\'t-know line is not followed by SLOW_A, and SLOW_A is then dropped for the visit: never under a later line', async () => {
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: never } })
  send(view, 'can it fly a kite')
  await settle()
  timers.fire(12000)
  await settle()
  assert.equal(line(view), 'N1')
  assert.equal(count(view, 'SLOW_A'), 0)
  send(view, 'can it fly a plane')
  await settle()
  assert.equal(line(view), 'N1_AGAIN')
  assert.equal(count(view, 'SLOW_A'), 0)
  send(view, 'what is a skill')
  assert.equal(line(view), 'term-skill', 'the next answer is the answer, with no SLOW_A after it')
  send(view, 'what is a model')
  assert.equal(count(view, 'SLOW_A'), 0, 'dropped for the visit')
  assert.equal(host.asks.length, 1)
})

test('a written answer that asks a question with things to pick is not followed by SLOW_A (a weak hit\'s fallback, the model question); it is dropped for the visit', async () => {
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: never } })
  send(view, 'is chatgpt any good') // ask-fix-t1: a weak hit goes to the AI; its fallback is the model question
  await settle()
  assert.equal(host.asks.length, 1)
  timers.fire(12000)
  await settle()
  assert.equal(line(view), 'mod-q')
  assert.ok(byData(view.tree, 'answers'), 'its things to pick are there')
  assert.equal(count(view, 'SLOW_A'), 0)
  send(view, 'what is a skill')
  assert.equal(line(view), 'term-skill')
  assert.equal(count(view, 'SLOW_A'), 0)
})

test('a later call of the visit (not the first) with no answer in 12 s: the AI step is off, and no SLOW_A (changes-5: "the first AI call of a visit")', async () => {
  const good = `${LIVE_ROW.mod1.text}\nUSED: mod1`
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? 'mod' : n === 2 ? good : never()) } })
  send(view, 'can it fly a kite')
  await settle()
  assert.equal(line(view), 'written')
  send(view, 'what do you mean?')
  await settle()
  assert.equal(host.asks.length, 3)
  timers.fire(12000)
  await settle()
  send(view, 'what is a skill')
  send(view, 'what do you mean?')
  await settle()
  assert.equal(host.asks.length, 3, 'off for the visit')
  assert.equal(count(view, 'SLOW_A'), 0)
})

test('the person moved on before the 12 s, and that first call never answers: the AI step is off and SLOW_A is dropped, never under a later line', async () => {
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: never } })
  send(view, TOKENS)
  send(view, 'what do you mean?')
  await settle()
  send(view, 'what is a skill') // the waiting message gets its written line at once
  assert.deepEqual(oldLines(view).slice(-1), ['use0'])
  assert.equal(line(view), 'term-skill')
  timers.fire(12000) // the call is still in Hermes 12 s after it started
  await settle()
  assert.equal(count(view, 'SLOW_A'), 0, 'nothing is said by itself')
  send(view, 'what is a plugin')
  assert.equal(line(view), 'term-plugin', 'the message that follows gets its own answer')
  send(view, 'what do you mean?')
  await settle()
  assert.equal(count(view, 'SLOW_A'), 0)
  assert.equal(host.asks.length, 1, 'and the AI step is off for the visit')
})

test('"said this visit" is kept for the visit only: nothing is stored, and after Hermes starts again a slow first call gets SLOW_A again', async () => {
  const storage = fakeStorage()
  const a = await pastOpening('ai_writes', { storage, host: { oneshot: () => THINKING } })
  send(a.view, TOKENS)
  send(a.view, 'what do you mean?')
  await settle()
  assert.equal(line(a.view), 'SLOW_A')
  assert.deepEqual([...storage.data.keys()].sort(), ['kept', 'met'])
  assert.doesNotMatch(JSON.stringify([...storage.data.values()]), /slow/i)
  const b = await open('ai_writes', { storage, host: { oneshot: () => THINKING } })
  finish(b.view)
  send(b.view, TOKENS)
  send(b.view, 'what do you mean?')
  await settle()
  assert.equal(line(b.view), 'SLOW_A')
})

test('no_ai_step: no call, so never SLOW_A', async () => {
  const { view, host } = await pastOpening('no_ai_step', { host: { oneshot: never } })
  send(view, TOKENS)
  send(view, 'what do you mean?')
  send(view, 'can it fly a kite')
  await settle()
  assert.equal(host.asks.length, 0)
  assert.equal(count(view, 'SLOW_A'), 0)
})

/* ---------- look: a pressed button, text to type ---------- */
test('a button that was pressed is plain faint text in the older line, not a link; one never pressed, and one that opens text to paste, stay links', async () => {
  const { view } = await pastOpening('no_ai_step')
  send(view, TOKENS)
  const b = byData(bubble(view), 'bubble-button')
  assert.equal(text(b).trim(), 'See what uses them')
  click(b)
  finish(view)
  assert.equal(line(view), 'use1-next')
  const use1 = olds(view).find(n => n.props['data-line'] === 'use1')
  assert.equal(byData(use1, 'old-link'), null, 'no button any more')
  const pressed = byData(use1, 'old-pressed')
  assert.equal(pressed.type, 'p')
  assert.equal(text(pressed), 'See what uses them')
  assert.equal(all(pressed, n => n.type === 'sdk:Codicon').length, 0, 'no arrow')
  assert.equal(pressed.props.onClick, undefined)
  // never pressed: still a link
  send(view, 'what is a skill')
  send(view, 'thanks')
  const term = olds(view).find(n => n.props['data-line'] === 'term-skill')
  assert.ok(byData(term, 'old-link'))
  assert.equal(byData(term, 'old-pressed'), null)
  // text to paste: pressed, it opens and closes, so it stays a link
  send(view, 'send me an update every morning')
  assert.equal(line(view), 'sch1')
  click(byData(bubble(view), 'bubble-button'))
  send(view, 'thanks')
  const sch = olds(view).find(n => n.props['data-line'] === 'sch1')
  assert.ok(byData(sch, 'old-link'))
  assert.equal(byData(sch, 'old-pressed'), null)
})

test('/usage is drawn in the paste box\'s code style, in the bubble and in the older line; a screen reader still gets the line as written', async () => {
  const { view } = await pastOpening('no_ai_step')
  send(view, TOKENS)
  click(byData(bubble(view), 'bubble-button'))
  finish(view)
  const typed = all(byData(bubble(view), 'said-seen'), n => n.props['data-hh'] === 'typed')
  assert.deepEqual(typed.map(n => text(n)), ['/usage'])
  assert.equal(typed[0].type, 'code')
  assert.equal(typed[0].props.className, K.typed)
  assert.match(spoken(byData(bubble(view), 'said')), /type \/usage and send it\./)
  send(view, 'thanks')
  const old = olds(view).find(n => n.props['data-line'] === 'use1-next')
  assert.deepEqual(all(old, n => n.props['data-hh'] === 'typed').map(n => text(n)), ['/usage'])
  assert.match(text(old), /type \/usage and send it/)
})

// offer-t1 (changes-8): the hint under a don't-know line (type "what can I ask you") is no longer shown; the offer
// dont_know takes its place (tests/offers-page.test.mjs)
test('a don\'t-know line has no hint under it any more; a button name in marks is not text to type', async () => {
  const { view } = await pastOpening('no_ai_step')
  send(view, 'can it fly a plane')
  assert.equal(line(view), 'N1')
  assert.equal(byData(lastOld(view), 'hint'), null)
  assert.doesNotMatch(text(helper(view)), /what can I ask you/)
  send(view, TOKENS)
  assert.equal(all(bubble(view), n => n.props['data-hh'] === 'typed').length, 0, '“New session” is a button\'s name, not text to type')
})
