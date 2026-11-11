// find-v1, part 3 (Lead, 11 Nov; hhtech ask-run 2 "For builder" 1, find-run section 9): one slow or failed AI call no
// longer ends the AI for the visit. Two in a row do, and then the slow-AI line is said once, after the answer, never
// in its place. With no AI set up: no call, no dots. After a failed try the model is checked again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pastOpening, send, settle, finish, dots, bubbleLine, answerLine, allLines, count, never, deferred } from './lib/talk-page.mjs'
import { LIVE_ROW } from '../src/live-rows.js'

const TOKENS = "How can I make it so I use less usage? Whenever I ask a question it doesn't take as many tokens"
const FOLLOW = 'what do you mean?' // after the tokens answer: a follow-up, which goes to the AI; code's own line is the plain line use0
// one try at the AI: the tokens question in other words each time (code answers it: use1), then the follow-up
const ask = (view, n) => {
  send(view, TOKENS + ' ' + n)
  send(view, FOLLOW)
}
const good = id => `${LIVE_ROW[id].text}\nUSED: ${id}`
const NO_PROVIDER = () => new Error('No LLM provider configured for task=helping_hand provider=auto. Run: hermes setup')

test('one slow call (no answer in 12 s): the written line at 12 s, no slow-AI line, and the next message asks the AI again once Hermes is free', async () => {
  const d = deferred()
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? d.promise : good('use1')) } })
  send(view, TOKENS)
  send(view, FOLLOW)
  assert.ok(dots(view))
  await settle()
  assert.equal(host.asks.length, 1)
  timers.fire(12000)
  await settle()
  assert.equal(answerLine(view), 'use0', 'the written line')
  assert.equal(count(view, 'SLOW_A'), 0, 'one slow call says nothing')
  d.resolve('NONE') // the slow call ends late; its reply is dropped
  await settle()
  finish(view)
  ask(view, 2)
  assert.ok(dots(view), 'the AI is asked again')
  await settle()
  assert.equal(host.asks.length, 2)
  assert.equal(count(view, 'SLOW_A'), 0)
})

test('two slow messages in a row: the slow-AI line is said once, after the second answer, never in its place; the AI stays on (last-reset)', async () => {
  const d1 = deferred()
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? d1.promise : never()) } })
  send(view, TOKENS)
  send(view, FOLLOW)
  await settle()
  timers.fire(12000)
  await settle()
  d1.resolve('NONE')
  await settle()
  finish(view)
  assert.equal(count(view, 'SLOW_A'), 0)
  send(view, TOKENS + ' please')
  send(view, FOLLOW)
  await settle()
  assert.equal(host.asks.length, 2)
  timers.fire(12000)
  await settle()
  assert.deepEqual(allLines(view).slice(-2), ['use0', 'SLOW_A'], 'the answer first, then the slow-AI line')
  finish(view)
  // last-reset (Lead, 11 Nov 15:41): the AI is not off for the visit; the next question is asked again (the second
  // call, still in Hermes past its 12 s, does not hold it back); the slow-AI line stays once per visit
  send(view, TOKENS + ' 3')
  send(view, FOLLOW)
  assert.ok(dots(view), 'asked again, with the dots')
  await settle()
  assert.equal(host.asks.length, 3)
  timers.fire(12000)
  await settle()
  finish(view)
  assert.equal(count(view, 'SLOW_A'), 1, 'once')
})

test('an AI that never answers, twice in a row: the second message finds the first call still in Hermes after its 12 s and still makes its own call (last-reset); slow too, its answer, then the slow-AI line; a third waits for neither', async () => {
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: never } })
  send(view, TOKENS)
  send(view, FOLLOW)
  await settle()
  timers.fire(12000)
  await settle()
  assert.equal(answerLine(view), 'use0')
  assert.equal(count(view, 'SLOW_A'), 0)
  finish(view)
  send(view, TOKENS + ' 2')
  assert.equal(count(view, 'SLOW_A'), 0, 'a message code answers by itself is no try')
  send(view, FOLLOW)
  // last-reset (Lead, 11 Nov 15:41): one call still in Hermes past its 12 s no longer holds the next message back
  assert.ok(dots(view), 'its own call, with the dots')
  await settle()
  assert.equal(host.asks.length, 2)
  timers.fire(12000)
  await settle()
  assert.deepEqual(allLines(view).slice(-2), ['use0', 'SLOW_A'])
  finish(view)
  send(view, 'can it fly a kite')
  await settle()
  assert.equal(host.asks.length, 2, 'two calls still in Hermes past their 12 s: no third one (the pile-up stays bounded)')
  assert.equal(count(view, 'SLOW_A'), 1)
})

test('a slow call, then a good one, then a slow one: never two in a row, so the AI stays on and nothing is said', async () => {
  const d = [deferred(), null, deferred()]
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 2 ? good('use1') : n <= 3 ? d[n - 1].promise : good('use1')) } })
  for (const n of [1, 2, 3]) {
    send(view, TOKENS + (n > 1 ? ' ' + n : ''))
    send(view, FOLLOW)
    await settle()
    if (d[n - 1]) {
      timers.fire(12000)
      await settle()
      d[n - 1].resolve('NONE')
      await settle()
    }
    finish(view)
  }
  assert.equal(host.asks.length, 3)
  send(view, TOKENS + ' 4')
  send(view, FOLLOW)
  assert.ok(dots(view), 'still asked')
  await settle()
  assert.equal(host.asks.length, 4)
  assert.equal(count(view, 'SLOW_A'), 0)
})

test('one failed call (no provider) does not end the AI: the model is checked again, and the next message is tried; since last-reset neither does a second failure in a row; no line about slowness (it was not slow)', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: NO_PROVIDER } })
  const checksAtStart = host.checks
  send(view, 'can it fly a kite')
  await settle()
  assert.equal(host.asks.length, 1)
  assert.equal(answerLine(view), 'N1')
  assert.ok(host.checks > checksAtStart, 'the model is checked again after the failed try')
  finish(view)
  send(view, 'tell me about goats')
  await settle()
  assert.equal(host.asks.length, 2, 'tried again at the next message')
  finish(view)
  // last-reset (Lead, 11 Nov 15:41: a failed call does not switch the AI step off for the visit): still tried
  for (const m of ['does it juggle', 'do goats like it']) {
    send(view, m)
    await settle()
    finish(view)
  }
  assert.equal(host.asks.length, 4, 'every message is still tried')
  assert.equal(count(view, 'SLOW_A'), 0)
})

test('ask-run 2, run D: the first try fails with no model, Hermes switches its free model on, and the next message gets the AI\'s answer', async () => {
  let on = false
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => (on ? good('use1-next') : NO_PROVIDER()) } })
  send(view, TOKENS)
  send(view, FOLLOW)
  await settle()
  assert.equal(host.asks.length, 1)
  assert.equal(answerLine(view), 'use0', 'the failed try shows the written line')
  on = true
  finish(view)
  ask(view, 2)
  await settle()
  assert.equal(host.asks.length, 2)
  assert.equal(bubbleLine(view), 'written', 'the AI answers now')
})

test('no AI set up (the model check says no): no call and no dots; the model is looked for again, and once it is there a later message is asked', async () => {
  let ok = false
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => good('use1'), check: () => (ok ? { ok: true, model: 'mock-small' } : { ok: false, error: 'No usable credentials found' }) } })
  for (const m of ['can it fly a kite', 'tell me about goats']) {
    send(view, m)
    assert.equal(dots(view), null, m)
    await settle()
    finish(view)
  }
  assert.equal(host.asks.length, 0)
  ok = true
  send(view, TOKENS)
  send(view, FOLLOW) // this one starts the new look (no call yet: the page still knows "no model")
  await settle()
  finish(view)
  ask(view, 2)
  await settle()
  assert.equal(host.asks.length, 1, 'asked once the model is there')
})

test('thinking text twice in a row: the answer, then the slow-AI line after the second; once is nothing', async () => {
  const THINKING = 'Thinking Process:\n\n1.  **Analyze the Request:**\n    *   **Task:**'
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => THINKING } })
  send(view, TOKENS)
  send(view, FOLLOW)
  await settle()
  assert.equal(count(view, 'SLOW_A'), 0)
  finish(view)
  ask(view, 2)
  await settle()
  assert.deepEqual(allLines(view).slice(-2), ['use0', 'SLOW_A'])
  assert.equal(host.asks.length, 2)
})

// Builder (review): the list call came back, but so late that the writer is not started (under 4 s of the 12 left).
// The person waited and got code's line: that is a slow try too, or an AI that always takes 9 s on the list would
// show the dots for 9 s at every message of the visit
test('a list call that leaves no time for the writer is a slow try: two in a row owe the slow-AI line but (last-reset) do not end the AI for the visit', async () => {
  const real = Date.now
  let skew = 0
  Date.now = () => real() + skew
  try {
    const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => { skew += 9000; return 'use1' } } })
    send(view, 'can it file my taxes')
    await settle()
    finish(view)
    assert.equal(host.asks.length, 1, 'the list call only')
    // find-v2 part 1: the list picked use1, so that line shows (not the don't-know)
    assert.equal(answerLine(view), 'use1')
    send(view, 'what is the weather in Riga')
    await settle()
    finish(view)
    assert.equal(host.asks.length, 2)
    send(view, 'do goats like it')
    await settle()
    assert.equal(host.asks.length, 3, 'a third call: the AI is not off for the visit (last-reset)')
  } finally {
    Date.now = real
  }
})
