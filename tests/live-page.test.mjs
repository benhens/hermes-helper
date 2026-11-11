// talk-live rows 3, 5, 6 and 7 on the page: the AI step with a fake Hermes (llm.oneshot answered by the test) and
// the 12 s timer held until the test fires it. The mode is set in the copy of the built file the test loads
// (tests/lib/mode-loader.mjs), so these run the same in every run of scripts/test-modes.mjs.
// talk-live-3: live-v2 changes-5 took "update" out of sch1's key words, so "how do I update hermes" finds no rows by
// words any more and goes to the first call. Where a test needs a message that code answers with N1 and that finds
// the schedule rows by words (as that one did), it now sends "send me a summary" (sch1 by words, N1 from code).
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
  return { view, timers, host: h, storage, Page }
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
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? 'sch1' : d.promise) } })
  send(view, 'send me a summary')
  assert.equal(line(view), null, 'no Helper line yet')
  assert.ok(dots(view), 'the three dots in the bubble')
  assert.equal(dots(view).props['aria-label'], 'Helper is working on an answer')
  // loom-fixes (hhtech-loom-n1 5): the dots' running class is their own; with hh-wait, the class of words not yet
  // shown (visibility hidden), the bubble was there and unseen, and only its tail showed (his Loom, 1:47 and 2:38)
  assert.match(dots(view).props.className, /\bhh-dots-run\b/)
  assert.doesNotMatch(dots(view).props.className, /\bhh-wait\b/)
  assert.equal(mine(view).at(-1), 'send me a summary')
  assert.equal(expression(view), 'busy')
  await settle()
  // find-v1 part 4: the list call named sch1 (max_tokens 30), then the writer
  assert.equal(host.asks.length, 2)
  assert.equal(host.asks[0].max_tokens, 30)
  const p = host.asks[1]
  assert.deepEqual([p.task, p.temperature, p.max_tokens, 'session_id' in p, 'profile' in p], ['helping_hand', 0.2, 200, false, false])
  assert.match(p.instructions, /\[sch1\] /)
  assert.match(p.input, /The person's newest message: send me a summary$/)
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
  send(view, 'send me a summary')
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
  // find-v1 part 3: that second message met the first call still in Hermes after its 12 s, so it was the second slow
  // try in a row: the AI step is off for the rest of this visit, also with Hermes free again
  send(view, 'do goats like it')
  await settle()
  assert.equal(host.asks.length, 1)
})

test('a second message while Helper waits: the waiting one gets its no-AI line at once, then the new one is answered (by code: the first call is still in Hermes)', async () => {
  const d = deferred()
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => d.promise } })
  send(view, 'send me a summary')
  await settle()
  send(view, 'what is a skill')
  assert.deepEqual(mine(view).slice(-2), ['send me a summary', 'what is a skill'])
  assert.equal(line(view), 'term-skill')
  const older = all(helper(view), n => n.props['data-hh'] === 'old').map(n => text(n))
  // offer-t1: the don't-know line, then its offer's question, are the two older lines before the new message's answer
  assert.ok(older.at(-2).includes(N1), 'the waiting message got the don\'t-know line')
  d.resolve(goodReply('sch1'))
  await settle()
  assert.equal(line(view), 'term-skill', 'the late reply never shows under a later message')
  assert.equal(host.asks.length, 1)
})

test('failures show the no-AI line and nothing else: a 5030 "Loading model", a thrown error, NONE, a failed check; never a failure line or "Try again"', async () => {
  const replies = [Object.assign(new Error('Error code: 503 - Loading model'), { code: 5030 }), new Error('Connection error.'), 'NONE\nUSED: none', 'See the docs (www.example.com) for that.\nUSED: sch1']
  for (const r of replies) {
    const { view } = await pastOpening('ai_writes', { host: { oneshot: () => r } })
    send(view, 'send me a summary')
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
    assert.equal(line(view), 'd_passwords') // find-v1: code's own fact line about passwords (it was N1), still no call
  }
  {
    const { view, host } = await pastOpening('ai_writes', { host: { runtime: { ok: false } } })
    send(view, 'send me a summary')
    assert.equal(line(view), 'N1', 'at once')
    await settle()
    assert.equal(host.asks.length, 0)
  }
  for (const mode of ['no_ai_step']) {
    const { view, host } = await pastOpening(mode)
    // dash-v1: what the page sent while it opened (the Dashboard's read-only reads); from here on nothing may be sent
    await settle()
    const opened = host.calls.length
    for (const m of ['send me a summary', 'tell me a joke', 'what do you mean?', 'ok and then?', 'is it safe']) {
      send(view, m)
      assert.ok(line(view), 'a line at once')
    }
    await settle()
    assert.deepEqual(host.calls.slice(opened).filter(m => m !== 'setup.runtime_check' && m !== 'setup.status'), [], 'nothing sent')
    // (dash-v1: while the page opened, only the Dashboard's read-only reads besides those two)
    assert.deepEqual(host.calls.slice(0, opened).filter(m => m !== 'setup.runtime_check' && m !== 'setup.status' && !['profiles.describe', 'cron.manage', 'plugins.manage'].includes(m)), [])
  }
})

test('nothing Helper keeps is ever sent, not even the name: a kept name, answers and "remember that ..."; the name typed again; "what do you know about me"', async () => {
  const storage = fakeStorage({ met: true, kept: { name: 'Peter', mod: 'mod1', msg: 'WhatsApp', svc: 'Gmail', asked: ['my club has six courts'], told: true } })
  const { view, host } = await open('ai_writes', { storage, host: { oneshot: () => 'NONE' } })
  finish(view)
  for (const m of ['Hi, I\'m Peter', 'what do you know about me', 'remember that my coach is called Zanda', 'I use WhatsApp now', 'send me a summary', 'tell me a joke', 'do goats like it', 'is it safe', 'ok and then?']) {
    send(view, m)
    await settle()
    finish(view)
  }
  assert.ok(host.asks.length >= 3, `${host.asks.length} calls`)
  // find-v1 part 4: the list call's instructions are Helper's own list of its lines by title, the same text for every
  // person (it names WhatsApp, Gmail and ChatGPT as every person's list does); nothing kept is in it or with it
  const LIST = host.asks.find(p => p.max_tokens === 30).instructions
  assert.match(LIST, /^MIG_APP = /m)
  for (const p of host.asks) {
    if (p.max_tokens === 30) assert.equal(p.instructions, LIST)
    const all = (p.max_tokens === 30 ? '' : p.instructions) + '\n' + p.input
    for (const v of [/peter/i, /whatsapp/i, /gmail/i, /six courts/i, /zanda/i, /chatgpt/i, /you pay/i]) assert.doesNotMatch(all, v, p.input)
  }
  for (const v of [/peter/i, /six courts/i, /zanda/i, /you pay/i]) assert.doesNotMatch(LIST, v)
  // Helper's own greeting is sent without the name, or not at all
  assert.ok(host.asks.some(p => /Helper: /.test(p.input)), 'some of Helper\'s lines are sent')
})

test('a name given with a question at "What\'s your name?": only the part after the name is sent', async () => {
  const { view, host } = await open('ai_writes', { host: { oneshot: () => 'NONE' } })
  finish(view)
  // setup-chat: "how do I update hermes" has a line of code's now (UPDATE, offer-t1); a question nobody has a line for
  send(view, 'Hi, I\'m Peter, can it fly a kite?')
  await settle()
  assert.equal(host.asks.length, 1)
  assert.match(host.asks[0].input, /(^|\n)The person's newest message: can it fly a kite\?$/)
  assert.doesNotMatch(host.asks[0].instructions + host.asks[0].input, /peter/i)
})

// find-v1 part 4: the list call (max_tokens 30, ids of fact lines) took the place of word matching and the first call
test('the list call when code is not sure; BUILD gives the hand-over line; an id gives its row; two calls, one after the other', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? 'mem0' : goodReply('mem0')) } })
  send(view, 'tell me a joke')
  await settle()
  assert.equal(host.asks.length, 2)
  assert.equal(host.asks[0].max_tokens, 30)
  assert.match(host.asks[0].instructions, /^mem0 = /m)
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
  send(view, 'send me a summary')
  await settle()
  // find-v1 part 4: the list call first (the stand-in's " [sch1]." is read as sch1), then the pick among those rows
  assert.equal(host.asks[0].max_tokens, 30)
  assert.equal(host.asks[1].max_tokens, 20)
  assert.match(host.asks[1].instructions, /^\[sch1\] /m)
  assert.equal(line(view), 'sch1')
  assert.equal(said(view), LIVE_ROW.sch1.text.replace(/"([^"]*)"/g, '\u201c$1\u201d'))
  // the same message again: the same row would be Helper's last line again, so the no-AI line instead
  send(view, 'send me a summary')
  await settle()
  assert.notEqual(line(view), 'sch1')
  // TALK: the no-AI line unless that is a don't-know line, then OK (pick_only.read); find-v2 part 1: NONE or anything
  // else after the list picked sch1: the sch1 line itself, not the don't-know
  for (const [r, want] of [['TALK', 'OK'], ['NONE', 'sch1'], ['zzz', 'sch1'], ['sch9', 'sch1']]) {
    const o = await pastOpening('ai_picks_line', { host: { oneshot: (p, n) => (n === 1 ? 'sch1' : r) } })
    send(o.view, 'send me a summary')
    await settle()
    assert.equal(line(o.view), want, r)
  }
})

test('the waiting dots: still and all alike under reduce motion; the label is said once (the style sheet moves the lit dot, the page is not drawn again)', async () => {
  const d = deferred()
  const { view } = await pastOpening('ai_writes', { host: { oneshot: () => d.promise } })
  send(view, 'send me a summary')
  const node = dots(view)
  assert.equal(node.props.role, 'status')
  assert.deepEqual(all(node, n => n.type === 'i').map(n => n.props.className), [undefined, undefined, undefined])
  d.resolve('NONE')
  await settle()
})

/* ---------- review fixes (the reviewer's findings 1 to 4 and 12, each reproduced first) ---------- */
const answers = view => all(view.tree, n => n.props['data-hh'] === 'answer')
const pickLabel = (view, label) => {
  finish(view)
  const a = answers(view).find(x => text(x).trim() === label)
  if (!a) throw new Error(`no pick ${label}: ${answers(view).map(x => text(x).trim())}`)
  a.props.onClick({ preventDefault() {} })
}

test('a kept answer is never sent: the picked "Claude" and Helper\'s line for it stay out of every later request', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => 'NONE' } })
  send(view, 'what can I ask')
  pickLabel(view, 'Which AI to use')
  const labels = answers(view).map(x => text(x).trim())
  const paid = labels.find(l => /claude/i.test(l)) || labels[0]
  pickLabel(view, paid)
  finish(view)
  const answerLine = said(view).replace(/[\u201c\u201d]/g, '"').replace(/\u2019/g, "'")
  for (const m of ['tell me a joke', 'can it fly a kite']) { // setup-chat: "is it safe" has code's line SAFE now
    send(view, m)
    await settle()
    finish(view)
  }
  assert.ok(host.asks.length >= 2)
  // the person's pick and Helper's line that answers it (which shows the kept answer) are never sent; Helper's own
  // question before it ("Do you already pay for ChatGPT or Claude?") is no kept value and may be
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const p of host.asks) {
    assert.doesNotMatch(p.input, new RegExp('Person: ' + esc(paid) + '$', 'm'), p.input)
    assert.ok(!p.input.includes(answerLine.slice(0, 40)), p.input)
  }
})

test('a message that looked secret is never sent later as one of the last lines', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => 'NONE' } })
  send(view, 'my password is hunter2, now what')
  await settle()
  assert.equal(host.asks.length, 0)
  send(view, 'tell me a joke')
  await settle()
  assert.equal(host.asks.length, 1)
  // find-v1: Helper's own answer is now its fact line about passwords, which may be sent; the person's message never
  assert.doesNotMatch(host.asks[0].input, /hunter2|my password|now what/i)
})

test('a turn closed by the next message starts no second call when its first call comes back', async () => {
  const d = deferred()
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? d.promise : goodReply('mem0')) } })
  send(view, 'tell me a joke')
  await settle()
  assert.equal(host.asks.length, 1)
  send(view, 'what is a skill')
  d.resolve('mem')
  await settle()
  assert.equal(host.asks.length, 1, 'no writer call for a turn that is closed')
  assert.equal(line(view), 'term-skill')
})

test('the page off screen and back during the wait: the line still lands, also when the new page was drawn before the old one let go', async () => {
  const d = deferred()
  // find-v1: the list call names the line at once; the writer's answer is the one waited for
  const o = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? 'sch1' : d.promise) } })
  send(o.view, 'send me a summary')
  await settle()
  // a second page drawn first, then the first one leaves (React may do it in this order)
  const second = mount(o.Page)
  o.view.unmount()
  d.resolve(goodReply('sch1'))
  await settle()
  assert.equal(line(second), 'written')
  assert.equal(dots(second), null)
})

test('the waiting dots under reduce motion: all three still and alike (hh-still), no moving dot', async () => {
  const setting = { matches: true, addEventListener() {}, removeEventListener() {} }
  globalThis.matchMedia = () => setting
  try {
    const d = deferred()
    const { view } = await pastOpening('ai_writes', { host: { oneshot: () => d.promise } })
    send(view, 'send me a summary')
    assert.match(dots(view).props.className, /hh-still/)
    assert.doesNotMatch(dots(view).props.className, /hh-wait|hh-dots-run/)
    d.resolve('NONE')
    await settle()
  } finally {
    delete globalThis.matchMedia
  }
})
