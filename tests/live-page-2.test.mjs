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
const line = view => (bubble(view) ? bubble(view).props['data-line'] : null)
const said = view => spoken(byData(bubble(view), 'said')).trim()
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
  send(view, 'what should I set up first')
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
  send(again.view, 'what should I set up first')
  await settle()
  assert.ok(again.host.asks[1].instructions.includes(WORK))
  for (const a of again.host.asks) assert.doesNotMatch(JSON.stringify(a), /peter/i)
})

test('thinking text from the first call: the no-AI line after the dots, and no more calls in this visit', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => THINKING } })
  send(view, 'what should I set up first')
  assert.ok(dots(view))
  await settle()
  assert.equal(host.asks.length, 1)
  assert.equal(dots(view), null)
  assert.equal(line(view), 'N1')
  assert.equal(said(view), N1)
  finish(view)
  send(view, 'can it fly a plane')
  assert.equal(dots(view), null, 'no dots: no call')
  await settle()
  assert.equal(host.asks.length, 1, 'no second call in this visit')
  assert.equal(line(view), 'N1_AGAIN')
})

test('no answer in 12 s: the no-AI line at 12 s, and no more calls in this visit, also once the call has ended', async () => {
  const d = deferred()
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: () => d.promise } })
  send(view, 'what should I set up first')
  await settle()
  assert.equal(host.asks.length, 1)
  timers.fire(12000)
  assert.equal(line(view), 'N1')
  d.resolve('mod')
  await settle()
  finish(view)
  send(view, 'can it fly a plane')
  await settle()
  assert.equal(host.asks.length, 1, 'off for the visit, though Hermes has no call of Helper\'s any more')
  assert.equal(dots(view), null)
})

test('review: a call with no answer 12 s after it started turns the AI step off, also when the person moved on before', async () => {
  const d = deferred()
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: () => d.promise } })
  send(view, 'what should I set up first')
  await settle()
  assert.equal(host.asks.length, 1)
  // a new message before the 12 s: the waiting one gets its line, the call still runs in Hermes
  send(view, 'thanks')
  timers.fire(12000)
  d.resolve('mod')
  await settle()
  finish(view)
  send(view, 'can it fly a plane')
  await settle()
  assert.equal(host.asks.length, 1, 'off for the visit')
})

test('the AI step off for a visit comes back when Hermes starts again (a new visit)', async () => {
  const storage = fakeStorage()
  const a = await pastOpening('ai_writes', { storage, host: { oneshot: () => THINKING } })
  send(a.view, 'what should I set up first')
  await settle()
  assert.equal(a.host.asks.length, 1)
  const b = await open('ai_writes', { storage, host: { oneshot: (p, n) => (n === 1 ? 'mod' : 'NONE') } })
  finish(b.view)
  send(b.view, 'what should I set up first')
  await settle()
  assert.ok(b.host.asks.length >= 1, 'a new visit calls again')
})

test('a reply that sits on the USED: line falls back to the no-AI line and is no such failure: the next message still asks the AI', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? 'msg' : 'USED: msg0, msg1. You can chat with Hermes from apps like Telegram.') } })
  send(view, 'what should I set up first')
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
  send(view, 'what should I set up first')
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
