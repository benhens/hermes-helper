// build-v1.md section 5 with hhtech's corrections (docs/answers/hhtech-default-model.md point 4):
// "model connected?" is decided by setup.runtime_check alone; setup.status is read only after
// ok false (card 2); the name is the free tier's label on the free tier, else runtime_check.model as Hermes's button shows it, else none.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkModel, modelLabel, NO_MODEL_LINE, CANT_CHECK_LINE, STILL_CHECKING_WAIT_MS } from '../src/model-status.js'

import { fakeRequest, rpcError } from './lib/fake-request.mjs'

test('ok true: connected, name from runtime_check.model as Hermes\'s model button shows it', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: true, provider: 'custom', model: 'mock-small' } })
  assert.deepEqual(await checkModel(f.request), { state: 'ok', name: 'Mock Small' })
})

test('ok true on the free tier with no model name: name from free_tier.status label', async () => {
  const f = fakeRequest({
    'setup.runtime_check': { ok: true, provider: 'nous', model: null, free_tier_route: true },
    'free_tier.status': { label: 'Nous · free tier', model: '' }
  })
  assert.deepEqual(await checkModel(f.request), { state: 'ok', name: 'Nous · free tier' })
})

// hhtech-model-display-name.md section 4 rule 2 (replaces B2's "model wins"): on the free tier the
// label wins, so "nous/welcome" never reads "Welcome".
test('free tier with a model id: the free tier label wins, the id is not run through the name rules', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: true, model: 'nous/welcome', free_tier_route: true }, 'free_tier.status': { label: 'Nous · free tier' } })
  assert.deepEqual(await checkModel(f.request), { state: 'ok', name: 'Nous · free tier' })
  assert.deepEqual(f.calls.map(c => c.method), ['setup.runtime_check', 'free_tier.status'])
})

test('free tier with a model id and the label read fails: "your model", never "Welcome"', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: true, model: 'nous/welcome', free_tier_route: true }, 'free_tier.status': new Error('boom') })
  assert.deepEqual(await checkModel(f.request), { state: 'ok', name: '' })
})

test('ok true, no name anywhere: still connected, name empty; the page then says "your model"', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: true, provider: 'nous', model: null } })
  assert.deepEqual(await checkModel(f.request), { state: 'ok', name: '' })
  assert.equal(modelLabel(''), 'your model')
  assert.equal(modelLabel('  m  '), 'm')
})

test('free tier label read fails: still connected', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: true, model: null, free_tier_route: true }, 'free_tier.status': new Error('boom') })
  assert.deepEqual(await checkModel(f.request), { state: 'ok', name: '' })
})

test('ok false + provider_configured false: none, nothing set up', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: false, error: 'No provider' }, 'setup.status': { provider_configured: false } })
  assert.deepEqual(await checkModel(f.request), { state: 'none', configured: false })
})

test('ok false + provider_configured true: none, chosen but broken', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: false }, 'setup.status': { provider_configured: true } })
  assert.deepEqual(await checkModel(f.request), { state: 'none', configured: true })
})

test('ok false + setup.status fails: still none (never "can\'t check"), configured unknown', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: false }, 'setup.status': new Error('down') })
  assert.deepEqual(await checkModel(f.request), { state: 'none', configured: null })
})

test('setup.status is asked only after ok false, never when ok true', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: true, model: 'm' }, 'setup.status': { provider_configured: false } })
  await checkModel(f.request)
  assert.deepEqual(f.calls.map(c => c.method), ['setup.runtime_check'])
})

test('setup.status saying "not configured" can never turn ok true into "no model" (free tier case)', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: true, model: null, free_tier_route: true }, 'free_tier.status': { label: 'Nous · free tier' }, 'setup.status': { provider_configured: false } })
  assert.equal((await checkModel(f.request)).state, 'ok')
})

test('the call fails or times out: "can\'t check", never "no model"', async () => {
  const f = fakeRequest({ 'setup.runtime_check': new Error('request timed out after 20s: setup.runtime_check') })
  assert.deepEqual(await checkModel(f.request), { state: 'error' })
})

test('a malformed answer counts as a failed check, not as no model', async () => {
  for (const bad of [null, {}, { ok: 'yes' }, 'ok']) {
    const f = fakeRequest({ 'setup.runtime_check': bad })
    assert.deepEqual(await checkModel(f.request), { state: 'error' }, JSON.stringify(bad))
  }
})

test('5097 "still checking": asks again after 5 s, and gets the answer', async () => {
  const waits = []
  const f = fakeRequest({ 'setup.runtime_check': [rpcError(5097, 'readiness check still in progress; retrying next tick'), rpcError(5097, 'x'), { ok: true, model: 'm' }] })
  const r = await checkModel(f.request, { sleep: async ms => waits.push(ms) })
  assert.deepEqual(r, { state: 'ok', name: 'M' })
  assert.deepEqual(waits, [STILL_CHECKING_WAIT_MS, STILL_CHECKING_WAIT_MS])
  assert.equal(STILL_CHECKING_WAIT_MS, 5000)
})

test('5097 four times in a row (first ask + 3 more): "can\'t check right now"', async () => {
  const waits = []
  const f = fakeRequest({ 'setup.runtime_check': rpcError(5097, 'still in progress') })
  assert.deepEqual(await checkModel(f.request, { sleep: async ms => waits.push(ms) }), { state: 'error' })
  assert.equal(f.calls.length, 4)
  assert.equal(waits.length, 3)
})

test('another error code is not retried', async () => {
  const f = fakeRequest({ 'setup.runtime_check': rpcError(5016, 'boom') })
  assert.deepEqual(await checkModel(f.request, { sleep: async () => assert.fail('no wait') }), { state: 'error' })
  assert.equal(f.calls.length, 1)
})

test('another bot: its profile goes to runtime_check and setup.status', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: false }, 'setup.status': { provider_configured: false } })
  await checkModel(f.request, { params: { profile: 'work' } })
  assert.deepEqual(f.calls.map(c => c.params), [{ profile: 'work' }, { profile: 'work' }])
})

test('every read gets a timeout of at most 30 s', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: false }, 'setup.status': { provider_configured: true } })
  await checkModel(f.request)
  const g = fakeRequest({ 'setup.runtime_check': { ok: true, model: null, free_tier_route: true }, 'free_tier.status': { label: 'x' } })
  await checkModel(g.request)
  for (const c of [...f.calls, ...g.calls]) assert.ok(c.timeout > 0 && c.timeout <= 30000, c.method)
})

test('the no-model and can\'t-check lines are hhcontent\'s final words (content/v1-strings.md part 1)', () => {
  assert.equal(NO_MODEL_LINE, "Your Hermes has no model connected yet, so I can't answer what you type. The steps still work: use the buttons on each step.")
  assert.equal(CANT_CHECK_LINE, "Can't check right now. Couldn't read this from your Hermes. Press Check again in a moment.")
})
