// talk-live-2 on the page, with a fake Hermes (llm.oneshot answered by the test) and the 12 s timer held until the
// test fires it, as tests/live-page.test.mjs. The mode is set in the copy of the built file the test loads.
//   live-v2 changes-4: the request holds the work line and never the name, also after Hermes starts again
//   hhtech-weak-ai: thinking text, or no answer in 12 s, ends the AI step for the rest of the visit; a reply that
//   sits on the USED: line falls back and is no such failure
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, spoken, byData } from './lib/render.mjs'
import { aiModeSource } from './lib/mode-loader.mjs'
import { LIVE_ROW } from '../src/live-rows.js'
import { TALK_DATA } from '../src/talk-data.js'
import { curlyQuotes } from '../src/quotes.js'

function useHost({ oneshot = () => 'NONE', runtime = { ok: true, model: 'mock-small' } } = {}) {
  const host = {
    calls: [],
    asks: [],
    request: async (method, params) => {
      host.calls.push(method)
      if (method === 'llm.oneshot') {
        host.asks.push(params)
        const a = await oneshot(params, host.asks.length)
        if (a instanceof Error) throw a
        return { text: a }
      }
      const answer = { 'setup.runtime_check': runtime, 'setup.status': { provider_configured: false } }[method]
      if (!answer) throw new Error('unexpected ' + method)
      return answer
    }
  }
  globalThis.__hhHost = host
  return host
}
const deferred = () => {
  let resolve
  const promise = new Promise(y => {
    resolve = y
  })
  return { promise, resolve }
}
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
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const finish = view => byData(view.tree, 'page').props.onPointerDownCapture({})
function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
}
async function pastOpening(mode, options) {
  const o = await open(mode, options)
  finish(o.view)
  send(o.view, 'Peter')
  finish(o.view)
  send(o.view, 'I run a tennis club')
  finish(o.view)
  return o
}
const N1 = curlyQuotes(TALK_DATA.fixed.N1.text)
const WORK = 'About them: I run a tennis club'
const THINKING = 'Thinking Process:\n\n1.  **Analyze the Request:**\n    *   **Task:**'

test('the work line: kept at What do you do?, sent in the writer\'s instructions only, never the name; after Hermes starts again too', async () => {
  const storage = fakeStorage()
  const { view, host } = await pastOpening('ai_writes', { storage, host: { oneshot: (p, n) => (n === 1 ? 'mod' : 'NONE') } })
  assert.equal(storage.data.get('kept').work, 'I run a tennis club')
  send(view, 'can it fly a kite')
  await settle()
  assert.equal(host.asks.length, 2)
  assert.doesNotMatch(host.asks[0].instructions + host.asks[0].input, /tennis/, 'never in the first call')
  assert.ok(host.asks[1].instructions.includes(WORK + '\nChecked facts:'))
  assert.doesNotMatch(host.asks[1].input, /tennis/)
  for (const a of host.asks) assert.doesNotMatch(JSON.stringify(a), /peter/i)
  // Hermes starts again with the same storage: the list and the next request still have it
  const again = await open('ai_writes', { storage, host: { oneshot: (p, n) => (n === 1 ? 'mod' : 'NONE') } })
  finish(again.view)
  send(again.view, 'what do you know about me')
  assert.deepEqual(all(byData(bubble(again.view), 'kept-rows'), n => n.type === 'li').map(n => text(n)), ['Your name: Peter', 'What you do: I run a tennis club'])
  send(again.view, 'can it fly a kite')
  await settle()
  assert.ok(again.host.asks[1].instructions.includes(WORK))
  for (const a of again.host.asks) assert.doesNotMatch(JSON.stringify(a), /peter/i)
})

// find-v1 part 3 (Lead, 11 Nov): one slow or failed try no longer ends the AI for the visit; two in a row do, and SLOW_A
// follows the second one's answer (tests/find-ai-rule.test.mjs). The tests below are brought to that rule.
test('thinking text: the no-AI line after the dots; after two such messages in a row no more calls in this visit', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => THINKING } })
  send(view, 'can it fly a kite')
  assert.ok(dots(view))
  await settle()
  assert.equal(host.asks.length, 1)
  assert.equal(dots(view), null)
  assert.equal(line(view), 'N1')
  assert.equal(said(view), N1)
  finish(view)
  send(view, 'can it fly a plane')
  assert.ok(dots(view), 'one failed try: the next message is asked')
  await settle()
  assert.equal(host.asks.length, 2)
  assert.equal(line(view), 'N1_AGAIN')
  finish(view)
  send(view, 'do goats like it')
  assert.equal(dots(view), null, 'no dots: no call')
  await settle()
  assert.equal(host.asks.length, 2, 'two in a row: no further call in this visit')
})

test('no answer in 12 s: the no-AI line at 12 s; after two such messages in a row no more calls in this visit, also once the calls have ended', async () => {
  const ds = [deferred(), deferred()]
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => ds[n - 1].promise } })
  send(view, 'can it fly a kite')
  await settle()
  assert.equal(host.asks.length, 1)
  timers.fire(12000)
  assert.equal(line(view), 'N1')
  ds[0].resolve('mod')
  await settle()
  finish(view)
  send(view, 'can it fly a plane')
  await settle()
  assert.equal(host.asks.length, 2, 'one slow try: asked again')
  timers.fire(12000)
  ds[1].resolve('mod')
  await settle()
  finish(view)
  send(view, 'do goats like it')
  await settle()
  assert.equal(host.asks.length, 2, 'off for the visit, though Hermes has no call of Helper\'s any more')
  assert.equal(dots(view), null)
})

test('review: a call with no answer 12 s after it started is a failed try, also when the person moved on before; two such in a row turn the AI step off', async () => {
  const ds = [deferred(), deferred()]
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => ds[n - 1].promise } })
  for (const [n, typed] of [[1, 'can it fly a kite'], [2, 'can it fly a plane']]) {
    send(view, typed)
    await settle()
    assert.equal(host.asks.length, n)
    // a new message before the 12 s: the waiting one gets its line, the call still runs in Hermes
    send(view, 'thanks')
    timers.fire(12000)
    ds[n - 1].resolve('mod')
    await settle()
    finish(view)
  }
  send(view, 'do goats like it')
  await settle()
  assert.equal(host.asks.length, 2, 'off for the visit')
})

test('the AI step off for a visit comes back when Hermes starts again (a new visit)', async () => {
  const storage = fakeStorage()
  const a = await pastOpening('ai_writes', { storage, host: { oneshot: () => THINKING } })
  send(a.view, 'can it fly a kite')
  await settle()
  assert.equal(a.host.asks.length, 1)
  const b = await open('ai_writes', { storage, host: { oneshot: (p, n) => (n === 1 ? 'mod' : 'NONE') } })
  finish(b.view)
  send(b.view, 'can it fly a kite')
  await settle()
  assert.ok(b.host.asks.length >= 1, 'a new visit calls again')
})

test('a reply that sits on the USED: line falls back to the no-AI line and is no such failure: the next message still asks the AI', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? 'msg' : 'USED: msg0, msg1. You can chat with Hermes from apps like Telegram.') } })
  send(view, 'can it fly a kite')
  await settle()
  assert.equal(host.asks.length, 2)
  assert.equal(line(view), 'N1')
  finish(view)
  send(view, 'can it fly a plane')
  await settle()
  assert.ok(host.asks.length > 2, 'still calls')
})

test('the first-time line and the line under Kept: of what the person does, by mode', async () => {
  for (const mode of ['no_ai_step', 'ai_writes']) {
    const { view } = await open(mode)
    finish(view)
    send(view, 'Peter')
    finish(view)
    const first = text(byData(view.tree, 'kept-first'))
    assert.equal(first, mode === 'no_ai_step' ? TALK_DATA.keeps.tell.first_time_if_no_model_call : 'I keep this in the Hermes app on this computer. Your messages can go to your AI, but not your name. Never tell me passwords.')
    send(view, 'I run a tennis club')
    finish(view)
    const told = byData(view.tree, 'kept-work-told')
    if (mode === 'no_ai_step') assert.equal(told, null)
    else assert.equal(text(told), 'I also tell your AI what you do when I ask it for help.')
  }
})

test('\"again\" after a written reply: the same words, with no call', async () => {
  const good = `${LIVE_ROW.mod1.text}\nUSED: mod1`
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? 'mod' : good) } })
  send(view, 'can it fly a kite')
  await settle()
  assert.equal(line(view), 'written')
  const words = said(view)
  finish(view)
  send(view, 'thanks')
  finish(view)
  const n = host.asks.length
  send(view, 'again')
  await settle()
  assert.equal(line(view), 'written')
  assert.equal(said(view), words)
  assert.equal(host.asks.length, n, 'no call')
})
