// last-reset 3 (Lead, 11 Nov 15:41; docs/answers/hhtech-final-run.md "For builder" 1): a slow reply costs only that
// one message. After a message whose AI call gave no answer in 12 s, the next typed question makes its AI call again,
// also while that slow call is still in Hermes; and a slow or failed call never switches the AI step off for the visit
// (Lead's answer to the Builder's earlier question 2). Over the built page with a stand-in AI, in each AI mode that
// has an AI step.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pastOpening, send, settle, finish, deferred, never } from './lib/talk-page.mjs'

const mode = process.env.HELPER_AI_MODE || 'ai_writes'
const opt = { skip: mode === 'no_ai_step' && 'no AI step in this mode' }
// the person's own questions sent to the AI (the set-up look's fixed check call is not one)
const asked = host => host.asks.filter(p => !(p && p.instructions === 'Reply with exactly: OK')).length


test('3. two slow replies in a row (each call ended after its 12 s), then a third question: the AI is still called (never off for the visit)', opt, async () => {
  const d = [deferred(), deferred()]
  const { view, timers, host } = await pastOpening(mode, { host: { oneshot: (p, n) => (n <= 2 ? d[n - 1].promise : 'NONE') } })
  for (const [i, q] of ['what is the weather in riga', 'can goats use it'].entries()) {
    send(view, q)
    await settle()
    timers.fire(12000)
    await settle()
    d[i].resolve('NONE')
    await settle()
    finish(view)
  }
  const before = asked(host)
  send(view, 'what is a cron job really')
  await settle()
  assert.ok(asked(host) > before, `the third question makes its AI call (calls ${before} then ${asked(host)})`)
})

test('3. two failed calls in a row (the call gave an error), then a third question: the AI is still called', opt, async () => {
  const { view, host } = await pastOpening(mode, { host: { oneshot: (p, n) => (n <= 2 ? new Error('No LLM provider configured') : 'NONE') } })
  send(view, 'what is the weather in riga')
  await settle()
  finish(view)
  send(view, 'can goats use it')
  await settle()
  finish(view)
  const before = asked(host)
  assert.ok(before >= 2, 'both went to the AI (control)')
  send(view, 'what is a cron job really')
  await settle()
  assert.ok(asked(host) > before, `the third question makes its AI call (calls ${before} then ${asked(host)})`)
})

