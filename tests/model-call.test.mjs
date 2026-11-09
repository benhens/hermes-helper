// The one model-call path (build-v1.md section 7 with hhtech's fixes): the exact llm.oneshot call,
// and the fixed line for each way it can fail (docs/answers/hhtech-v1-strings-check.md point 1;
// content/v1-strings.md part 2). The error texts below are the ones hhtech saw (err5030_cases.py).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oneshotParams, failureKind, failLines, askModel, ONESHOT_TIMEOUT_MS, NOT_READY_WAIT_S } from '../src/model-call.js'
import { fakeRequest, rpcError } from './lib/fake-request.mjs'

const NO_PROVIDER = 'one-shot generation failed: No LLM provider configured for task=helping_hand provider=auto. Run: hermes setup'
const BAD_KEY = "one-shot generation failed: Error code: 401 - {'error': {'message': 'Incorrect API key provided'}}"
const FORBIDDEN = 'one-shot generation failed: Error code: 403 - forbidden'
const NO_SERVER = 'one-shot generation failed: Connection error.'
const CHALLENGE = 'Finish the quick check in your browser, then try again. (code: anon_challenge_required)'
const ok = { state: 'ok', name: 'm' }

test('the call: task helping_hand, no session id, 90000 ms, temperature and token cap', async () => {
  const f = fakeRequest({ 'llm.oneshot': { text: 'OK' } })
  await askModel({ request: f.request, call: { instructions: 'I', input: 'U' }, recheck: async () => ok, sleep: async () => {} })
  assert.equal(f.calls.length, 1)
  const c = f.calls[0]
  assert.equal(c.method, 'llm.oneshot')
  assert.deepEqual(c.params, { task: 'helping_hand', instructions: 'I', input: 'U', temperature: 0.2, max_tokens: 300 })
  assert.equal(c.timeout, 90000)
  assert.equal(ONESHOT_TIMEOUT_MS, 90000)
  assert.ok(!('session_id' in c.params))
})

test('another bot: its profile rides along; the running bot sends none', () => {
  assert.equal(oneshotParams({ input: 'x', profile: 'work' }).profile, 'work')
  assert.ok(!('profile' in oneshotParams({ input: 'x' })))
})

test('success: the text and how long it took', async () => {
  let t = 1000
  const f = fakeRequest({ 'llm.oneshot': () => ((t += 2500), { text: 'OK' }) })
  const r = await askModel({ request: f.request, call: {}, recheck: async () => ok, sleep: async () => {}, now: () => t })
  assert.deepEqual(r, { ok: true, text: 'OK', ms: 2500 })
})

test('failureKind: each cause gets its own line (by code, then runtime_check again, then the error text)', () => {
  const e = m => rpcError(5030, m)
  assert.equal(failureKind(e(NO_PROVIDER), ok), 'not_ready')
  assert.equal(failureKind(e(BAD_KEY), ok), 'key')
  assert.equal(failureKind(e(FORBIDDEN), ok), 'key')
  assert.equal(failureKind(e('Error code: 4013 nonsense'), ok), 'other') // \b: 401 must end there
  assert.equal(failureKind(e(NO_SERVER), ok), 'connection')
  assert.equal(failureKind(e(CHALLENGE), ok), 'other')
  assert.equal(failureKind(e(NO_PROVIDER), { state: 'none', configured: false }), 'no_model')
  assert.equal(failureKind(e(NO_PROVIDER), { state: 'none', configured: true }), 'model_broken')
  assert.equal(failureKind(e(NO_PROVIDER), { state: 'none', configured: null }), 'model_broken')
  assert.equal(failureKind(e(NO_PROVIDER), { state: 'error' }), 'other')
  assert.equal(failureKind(rpcError(4030, NO_PROVIDER), ok), 'other') // not 5030
  assert.equal(failureKind(new Error('request timed out after 90s: llm.oneshot'), ok), 'other')
  assert.equal(failureKind(new Error('Hermes gateway unavailable'), ok), 'other')
  assert.equal(failureKind(undefined, ok), 'other')
})

test('5030: runtime_check is asked again (no second model call) before a line is picked', async () => {
  for (const [msg, kind] of [[BAD_KEY, 'key'], [NO_SERVER, 'connection'], [CHALLENGE, 'other']]) {
    let rechecks = 0
    const f = fakeRequest({ 'llm.oneshot': rpcError(5030, msg) })
    const r = await askModel({ request: f.request, call: {}, recheck: async () => (rechecks++, ok), sleep: async () => assert.fail('no wait') })
    assert.deepEqual(r, { ok: false, kind }, msg)
    assert.equal(rechecks, 1)
    assert.equal(f.calls.length, 1)
  }
})

test('5030 and runtime_check now says no model: no countdown, the no-model line', async () => {
  const f = fakeRequest({ 'llm.oneshot': rpcError(5030, NO_PROVIDER) })
  const r = await askModel({ request: f.request, call: {}, recheck: async () => ({ state: 'none', configured: false }), sleep: async () => assert.fail('no wait') })
  assert.deepEqual(r, { ok: false, kind: 'no_model' })
})

test('a timeout or an error without a code: (e), and runtime_check is not asked', async () => {
  const f = fakeRequest({ 'llm.oneshot': new Error('request timed out after 90s: llm.oneshot') })
  const r = await askModel({ request: f.request, call: {}, recheck: async () => assert.fail('no recheck'), sleep: async () => {} })
  assert.deepEqual(r, { ok: false, kind: 'other' })
})

test('an answer without text counts as no answer', async () => {
  const f = fakeRequest({ 'llm.oneshot': { nope: 1 } })
  assert.deepEqual(await askModel({ request: f.request, call: {}, recheck: async () => ok, sleep: async () => {} }), { ok: false, kind: 'other' })
})

test('"not ready" (5030 while runtime_check says ok): a 60 s countdown, then exactly one more try, which works', async () => {
  const states = []
  const waits = []
  const f = fakeRequest({ 'llm.oneshot': [rpcError(5030, NO_PROVIDER), { text: 'OK' }] })
  const r = await askModel({ request: f.request, call: {}, recheck: async () => ok, sleep: async ms => waits.push(ms), onState: s => states.push(s) })
  assert.equal(r.ok, true)
  assert.equal(f.calls.length, 2)
  assert.equal(NOT_READY_WAIT_S, 60)
  assert.equal(waits.length, 60)
  assert.ok(waits.every(ms => ms === 1000))
  const countdown = states.filter(s => s.phase === 'countdown').map(s => s.left)
  assert.deepEqual(countdown, Array.from({ length: 60 }, (_, i) => 60 - i))
  assert.deepEqual(states.filter(s => s.phase === 'calling').map(s => s.attempt), [1, 2])
})

test('"not ready", and the one retry fails the same way: (e), no third call', async () => {
  const f = fakeRequest({ 'llm.oneshot': rpcError(5030, NO_PROVIDER) })
  const r = await askModel({ request: f.request, call: {}, recheck: async () => ok, sleep: async () => {} })
  assert.deepEqual(r, { ok: false, kind: 'other' })
  assert.equal(f.calls.length, 2)
})

test('"not ready", and on the retry the model is gone: the no-model line, not (e)', async () => {
  const f = fakeRequest({ 'llm.oneshot': rpcError(5030, NO_PROVIDER) })
  const answers = [ok, { state: 'none', configured: false }]
  const r = await askModel({ request: f.request, call: {}, recheck: async () => answers.shift(), sleep: async () => {} })
  assert.deepEqual(r, { ok: false, kind: 'no_model' })
})

test('leaving the page during the countdown stops it: no second call', async () => {
  let gone = false
  let ticks = 0
  const f = fakeRequest({ 'llm.oneshot': rpcError(5030, NO_PROVIDER) })
  const r = await askModel({
    request: f.request,
    call: {},
    recheck: async () => ok,
    sleep: async () => {
      if (++ticks === 3) gone = true
    },
    cancelled: () => gone
  })
  assert.equal(r, null)
  assert.equal(f.calls.length, 1)
})

test('the fixed lines: hhcontent\'s words, no restart hint anywhere', () => {
  assert.deepEqual(failLines('not_ready', 'helper', 42), ["Your model isn't ready to answer yet. I'll try again in 42 seconds.", 'Meanwhile, you can pick an answer below.'])
  assert.deepEqual(failLines('key'), [
    "The service that runs your model didn't accept your key or sign-in.",
    'Open Settings, then Providers, and sign in or paste the key again.',
    'Then press Try again.'
  ])
  assert.deepEqual(failLines('connection'), [
    "Hermes couldn't reach your model.",
    "If the model runs on this computer, check that it's running.",
    'If it runs online, check your internet.',
    'Then press Try again.'
  ])
  assert.deepEqual(failLines('other'), ["Your model didn't answer this time. Press Try again, or pick an answer below."])
  assert.deepEqual(failLines('other', 'card'), ["Your model didn't answer this time. Press Try again."])
  assert.deepEqual(failLines('not_ready', 'card', 7), ["Your model isn't ready to answer yet. I'll try again in 7 seconds."])
  for (const k of ['not_ready', 'key', 'connection', 'other']) {
    for (const where of ['helper', 'card']) assert.doesNotMatch(failLines(k, where).join(' '), /restart|quit/i)
  }
})
