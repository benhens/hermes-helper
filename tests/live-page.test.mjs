// talk-live rows 3, 5, 6 and 7 on the page: the AI step with a fake Hermes (llm.oneshot answered by the test) and
// the 12 s timer held until the test fires it. The mode is set in the copy of the built file the test loads
// (tests/lib/mode-loader.mjs), so these run the same in every run of scripts/test-modes.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, spoken, byData } from './lib/render.mjs'
import { aiModeSource } from './lib/mode-loader.mjs'
import { LIVE_ROW } from '../src/live-rows.js'
import { TALK_DATA } from '../src/talk-data.js'
import { curlyQuotes } from '../src/quotes.js'

// A fake Hermes. oneshot(params) answers llm.oneshot: a string, an Error to throw, or a promise (a test's
// deferred). Every llm.oneshot's params are kept in host.asks.
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
  let reject
  const promise = new Promise((y, n) => {
    resolve = y
    reject = n
  })
  return { promise, resolve, reject }
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
const mine = view => all(helper(view), n => n.props['data-hh'] === 'me').map(n => text(n).replace(/^You said: /, '').trim())
const expression = view => (all(view.tree, n => n.props['data-expression'])[0] || { props: {} }).props['data-expression']
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
// A reply that passes every check: the row's own words (rule 7 aside), with its USED line
const goodReply = id => `${LIVE_ROW[id].text}\nUSED: ${id}`
const N1 = curlyQuotes(TALK_DATA.fixed.N1.text) // as drawn

test('ai_writes: a message code is not sure of shows at once, with the three dots and the busy face; the written reply replaces the dots', async () => {
  const d = deferred()
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => d.promise } })
  send(view, 'how do I update hermes')
  assert.equal(line(view), null, 'no Helper line yet')
  assert.ok(dots(view), 'the three dots in the bubble')
  assert.equal(dots(view).props['aria-label'], 'Helper is working on an answer')
  assert.match(dots(view).props.className, /hh-wait/)
  assert.equal(mine(view).at(-1), 'how do I update hermes')
  assert.equal(expression(view), 'busy')
  await settle()
  // word matching found sch1, so the writer is the first and only call
  assert.equal(host.asks.length, 1)
  const p = host.asks[0]
  assert.deepEqual([p.task, p.temperature, p.max_tokens, 'session_id' in p, 'profile' in p], ['helping_hand', 0.2, 200, false, false])
  assert.match(p.instructions, /\[sch1\] /)
  assert.match(p.input, /The person's newest message: how do I update hermes$/)
  d.resolve(goodReply('sch1'))
  await settle()
  assert.equal(dots(view), null)
  assert.equal(line(view), 'written')
  assert.equal(said(view), LIVE_ROW.sch1.text.replace(/"([^"]*)"/g, '\u201c$1\u201d'))
  assert.equal(byData(bubble(view), 'source'), null, 'no docs source under a written reply')
})

test('12 seconds: the no-AI line comes at 12 s and nothing later; while Hermes still works on that call, the next message gets its no-AI line with no new call', async () => {
  const d = deferred()
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: () => d.promise } })
  send(view, 'how do I update hermes')
  await settle()
  assert.equal(host.asks.length, 1)
  timers.fire(12000)
  assert.equal(line(view), 'N1')
  assert.equal(said(view), N1)
  // the next message, while Hermes still has the dropped call: no request, its own line at once
  send(view, 'tell me a joke')
  assert.equal(line(view), 'N1_AGAIN')
  await settle()
  assert.equal(host.asks.length, 1, 'no second call while the first is still in Hermes')
  // the late reply is dropped: nothing changes
  const before = JSON.stringify(view.tree)
  d.resolve(goodReply('sch1'))
  await settle()
  assert.equal(JSON.stringify(view.tree), before)
  // Hermes is free again: the next message may call
  send(view, 'is it safe')
  await settle()
  assert.equal(host.asks.length, 2)
})

test('a second message while Helper waits: the waiting one gets its no-AI line at once, then the new one is answered (by code: the first call is still in Hermes)', async () => {
  const d = deferred()
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => d.promise } })
  send(view, 'how do I update hermes')
  await settle()
  send(view, 'what is a skill')
  assert.deepEqual(mine(view).slice(-2), ['how do I update hermes', 'what is a skill'])
  assert.equal(line(view), 'term-skill')
  const older = all(helper(view), n => n.props['data-hh'] === 'old').map(n => text(n))
  assert.ok(older.at(-1).includes(N1), 'the waiting message got the don\'t-know line')
  d.resolve(goodReply('sch1'))
  await settle()
  assert.equal(line(view), 'term-skill', 'the late reply never shows under a later message')
  assert.equal(host.asks.length, 1)
})

test('failures show the no-AI line and nothing else: a 5030 "Loading model", a thrown error, NONE, a failed check; never a failure line or "Try again"', async () => {
  const replies = [Object.assign(new Error('Error code: 503 - Loading model'), { code: 5030 }), new Error('Connection error.'), 'NONE\nUSED: none', 'See the docs (www.example.com) for that.\nUSED: sch1']
  for (const r of replies) {
    const { view } = await pastOpening('ai_writes', { host: { oneshot: () => r } })
    send(view, 'how do I update hermes')
    await settle()
    assert.equal(line(view), 'N1', String(r))
    assert.doesNotMatch(text(helper(view)), /Try again|didn.t answer|isn.t ready|couldn.t reach/)
  }
})

test('no call when: code is sure, the model check is not ok, the message looks like a secret; and none at all with no AI step', async () => {
  {
    const { view, host } = await pastOpening('ai_writes')
    for (const m of ['what is a skill', 'can I use it on telegram', 'hey', 'thanks', 'build me a website for my bakery']) send(view, m)
    send(view, 'my password is hunter2, now what')
    await settle()
    assert.equal(host.asks.length, 0)
    assert.equal(line(view), 'N1')
  }
  {
    const { view, host } = await pastOpening('ai_writes', { host: { runtime: { ok: false } } })
    send(view, 'how do I update hermes')
    assert.equal(line(view), 'N1', 'at once')
    await settle()
    assert.equal(host.asks.length, 0)
  }
  for (const mode of ['no_ai_step']) {
    const { view, host } = await pastOpening(mode)
    for (const m of ['how do I update hermes', 'tell me a joke', 'what do you mean?', 'ok and then?', 'is it safe']) {
      send(view, m)
      assert.ok(line(view), 'a line at once')
    }
    await settle()
    assert.deepEqual(host.calls.filter(m => m !== 'setup.runtime_check' && m !== 'setup.status'), [], 'nothing sent')
  }
})

test('nothing Helper keeps is ever sent, not even the name: a kept name, answers and "remember that ..."; the name typed again; "what do you know about me"', async () => {
  const storage = fakeStorage({ met: true, kept: { name: 'Peter', mod: 'mod1', msg: 'WhatsApp', svc: 'Gmail', asked: ['my club has six courts'], told: true } })
  const { view, host } = await open('ai_writes', { storage, host: { oneshot: () => 'NONE' } })
  finish(view)
  for (const m of ['Hi, I\'m Peter', 'what do you know about me', 'remember that my coach is called Zanda', 'I use WhatsApp now', 'how do I update hermes', 'tell me a joke', 'is it safe', 'ok and then?']) {
    send(view, m)
    await settle()
    finish(view)
  }
  assert.ok(host.asks.length >= 3, `${host.asks.length} calls`)
  for (const p of host.asks) {
    const all = p.instructions + '\n' + p.input
    for (const v of [/peter/i, /whatsapp/i, /gmail/i, /six courts/i, /zanda/i, /chatgpt/i, /you pay/i]) assert.doesNotMatch(all, v, p.input)
  }
  // Helper's own greeting is sent without the name, or not at all
  assert.ok(host.asks.some(p => /Helper: /.test(p.input)), 'some of Helper\'s lines are sent')
})

test('a name given with a question at "What\'s your name?": only the part after the name is sent', async () => {
  const { view, host } = await open('ai_writes', { host: { oneshot: () => 'NONE' } })
  finish(view)
  send(view, 'Hi, I\'m Peter, how do I update hermes')
  await settle()
  assert.equal(host.asks.length, 1)
  assert.match(host.asks[0].input, /\nThe person's newest message: how do I update hermes$/)
  assert.doesNotMatch(host.asks[0].instructions + host.asks[0].input, /peter/i)
})

test('the first call when word matching finds nothing; build gives the hand-over line; a subject gives its rows; two calls, one after the other', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? 'mem' : goodReply('mem0')) } })
  send(view, 'tell me a joke')
  await settle()
  assert.equal(host.asks.length, 2)
  assert.equal(host.asks[0].max_tokens, 20)
  assert.match(host.asks[0].instructions, /^mem = Memory$/m)
  assert.match(host.asks[1].instructions, /\[mem0\] /)
  assert.equal(line(view), 'written')
  const b = await pastOpening('ai_writes', { host: { oneshot: () => 'build' } })
  send(b.view, 'tell me a joke')
  await settle()
  assert.equal(line(b.view), 'H1')
  assert.equal(b.host.asks.length, 1)
})

test('ai_picks_line: a handed id shows that row as code shows it; TALK and NONE the no-AI line; a pick is never Helper\'s last line again', async () => {
  const { view, host } = await pastOpening('ai_picks_line', { host: { oneshot: () => ' [sch1].' } })
  send(view, 'how do I update hermes')
  await settle()
  assert.equal(host.asks[0].max_tokens, 20)
  assert.match(host.asks[0].instructions, /^\[sch1\] /m)
  assert.equal(line(view), 'sch1')
  assert.equal(said(view), LIVE_ROW.sch1.text.replace(/"([^"]*)"/g, '\u201c$1\u201d'))
  // the same message again: the same row would be Helper's last line again, so the no-AI line instead
  send(view, 'how do I update hermes')
  await settle()
  assert.notEqual(line(view), 'sch1')
  // TALK: the no-AI line unless that is a don't-know line, then OK (pick_only.read); NONE or anything else: the no-AI line
  for (const [r, want] of [['TALK', 'OK'], ['NONE', 'N1'], ['zzz', 'N1'], ['sch9', 'N1']]) {
    const o = await pastOpening('ai_picks_line', { host: { oneshot: () => r } })
    send(o.view, 'how do I update hermes')
    await settle()
    assert.equal(line(o.view), want, r)
  }
})

test('the waiting dots: still and all alike under reduce motion; the label is said once (the style sheet moves the lit dot, the page is not drawn again)', async () => {
  const d = deferred()
  const { view } = await pastOpening('ai_writes', { host: { oneshot: () => d.promise } })
  send(view, 'how do I update hermes')
  const node = dots(view)
  assert.equal(node.props.role, 'status')
  assert.deepEqual(all(node, n => n.type === 'i').map(n => n.props.className), [undefined, undefined, undefined])
  d.resolve('NONE')
  await settle()
})
