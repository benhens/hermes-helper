// last-words 2 (Lead, 11 Nov 16:48; hhtech-last-reset-run fault 2, the Builder's last-reset review finding 1): a reply
// whose line showed while one of its calls is still in Hermes, but not yet 12 s after that call started (ai_writes: a
// quick list call, then a slow writer call), does not hold the next question back. hhtech: the Latvian reply showed
// after 14.1 s, its calls took 7.8 s and 8.9 s, and the Pi question typed about 2 s later made no AI call. Here only the
// message's own 12 s runs out (the first held 12 s timer, set when the message was sent); the call's own 12 s watch
// does not, so the call is not counted as stuck. Over the built page with a stand-in AI, in each mode with an AI step.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pastOpening, send, settle, finish, deferred } from './lib/talk-page.mjs'

const mode = process.env.HELPER_AI_MODE || 'ai_writes'
const opt = { skip: mode === 'no_ai_step' && 'no AI step in this mode' }
const asked = host => host.asks.filter(p => !(p && p.instructions === 'Reply with exactly: OK')).length
// only the message's own 12 s: the first 12 s timer still held
const messageTimeUp = timers => {
  const first = [...timers.held].find(e => e.ms === 12000)
  timers.held.delete(first)
  first.run()
}

test('2. the line shows while its last call is still in Hermes (under that call\'s own 12 s), the next question typed 2 s later makes its own AI call', opt, async () => {
  const slow = deferred()
  // ai_writes: call 1 (the list) answers at once with a row, call 2 (the writer) is slow; ai_picks_line: its one call is slow
  const slowAt = mode === 'ai_writes' ? 2 : 1
  const { view, timers, host } = await pastOpening(mode, { host: { oneshot: (p, n) => (n === slowAt ? slow.promise : n < slowAt ? 'tool' : 'NONE') } })
  send(view, 'how do i make it talk to me in latvian')
  await settle()
  assert.equal(asked(host), slowAt, `the slow call is in Hermes (control: ${asked(host)} calls)`)
  messageTimeUp(timers)
  await settle()
  finish(view)
  const before = asked(host)
  send(view, 'can i run it on a raspbery pi')
  await settle()
  assert.ok(asked(host) > before, `the second question makes its own AI call (calls ${before} then ${asked(host)})`)
  slow.resolve('NONE')
  await settle()
})

test('2. control: while a message still waits for its own line, a call of Helper\'s still holds the page (no second call for the same message)', opt, async () => {
  const slow = deferred()
  const { view, host } = await pastOpening(mode, { host: { oneshot: (p, n) => (n === 1 ? slow.promise : 'NONE') } })
  send(view, 'how do i make it talk to me in latvian')
  await settle()
  assert.equal(asked(host), 1)
  slow.resolve('NONE')
  await settle()
})
