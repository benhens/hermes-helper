// find-v2 part 5 (2) (Lead, 11 Nov 11:40, answer 2 to find-v1's questions): the slow-AI line is said between the
// don't-know and its picks, and after a line with things to pick (the picks then stay under it), once per visit. In
// hhtech's ask-run 3 it was never said, also not on the small local AI, where the AI went off with no word.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pastOpening, send, settle, finish, allLines, count, labels, never, deferred, answerLine } from './lib/talk-page.mjs'

test('two messages in a row with no answer in 12 s, the fallback a don\'t-know with picks: N1, then the slow-AI line, then the picks, which can still be pressed; once', async () => {
  const d1 = deferred()
  const { view, timers } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? d1.promise : never()) } })
  send(view, 'what is the weather in riga')
  await settle()
  timers.fire(12000)
  await settle()
  d1.resolve('NONE')
  await settle()
  finish(view)
  assert.equal(count(view, 'SLOW_A'), 0, 'one slow try says nothing')
  send(view, 'can goats use it')
  await settle()
  timers.fire(12000)
  await settle()
  finish(view)
  const lines = allLines(view)
  assert.deepEqual(lines.slice(-3).map(l => (String(l).startsWith('N1') ? 'N1' : l)), ['N1', 'SLOW_A', 'offer-start_four'], lines.join(' '))
  assert.deepEqual(labels(view), ['What Hermes can do', 'Which AI to use', 'Phone and chat apps', 'What Hermes remembers'], 'the picks stay under the newest line')
  send(view, 'can sheep use it')
  await settle()
  finish(view)
  assert.equal(count(view, 'SLOW_A'), 1, 'once per visit')
})

test('the AI never answers, the fallback a line with things to pick (a topic\'s question): the line, then the slow-AI line carrying the same picks', async () => {
  const d1 = deferred()
  const { view, timers } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? d1.promise : never()) } })
  send(view, 'what is the weather in riga')
  await settle()
  timers.fire(12000)
  await settle()
  d1.resolve('NONE')
  await settle()
  finish(view)
  send(view, 'tell me about models')
  await settle()
  timers.fire(12000)
  await settle()
  finish(view)
  const lines = allLines(view)
  assert.equal(lines.at(-1), 'SLOW_A', lines.join(' '))
  assert.equal(lines.at(-2), 'mod-q')
  assert.ok(labels(view).length >= 2, 'the question\'s picks still show: ' + labels(view).join(' / '))
  void answerLine
})
