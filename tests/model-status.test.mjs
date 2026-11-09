// build-v1.md section 5: "Model connected?" from setup.runtime_check only, never setup.status.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkModel, NO_MODEL_LINE } from '../src/model-status.js'

// A fake host.request that records every method it was asked for.
function fakeRequest(answers) {
  const calls = []
  const request = async (method, params, timeout) => {
    calls.push({ method, params, timeout })
    if (!(method in answers)) throw new Error(`unexpected method ${method}`)
    const a = answers[method]
    if (a instanceof Error) throw a
    return typeof a === 'function' ? a() : a
  }
  return { request, calls }
}

test('ok true: connected, name from host.state.model first', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: true, provider: 'custom', model: 'mock-small' } })
  const r = await checkModel(f.request, () => 'claude-opus-5-5')
  assert.deepEqual(r, { state: 'ok', name: 'claude-opus-5-5' })
})

test('ok true, no state model: name from runtime_check.model', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: true, provider: 'custom', model: 'mock-small' } })
  assert.deepEqual(await checkModel(f.request, () => ''), { state: 'ok', name: 'mock-small' })
})

test('ok true on the free tier with no model name: name from free_tier.status label', async () => {
  const f = fakeRequest({
    'setup.runtime_check': { ok: true, provider: 'nous', model: null, free_tier_route: true },
    'free_tier.status': { label: 'Nous · free tier', model: '' }
  })
  assert.deepEqual(await checkModel(f.request, () => null), { state: 'ok', name: 'Nous · free tier' })
})

test('ok true, no name anywhere: still connected, name empty (never a guess)', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: true, provider: 'nous', model: null } })
  assert.deepEqual(await checkModel(f.request, () => null), { state: 'ok', name: '' })
})

test('free tier label read fails: still connected', async () => {
  const f = fakeRequest({
    'setup.runtime_check': { ok: true, model: null, free_tier_route: true },
    'free_tier.status': new Error('boom')
  })
  assert.deepEqual(await checkModel(f.request, () => null), { state: 'ok', name: '' })
})

test('ok false: no model connected', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: false, error: 'No provider' } })
  assert.deepEqual(await checkModel(f.request, () => 'stale-name'), { state: 'none' })
})

test('the call fails or times out: "can\'t check", never "no model"', async () => {
  const f = fakeRequest({ 'setup.runtime_check': new Error('request timed out') })
  assert.deepEqual(await checkModel(f.request, () => null), { state: 'error' })
})

test('a malformed answer counts as a failed check, not as no model', async () => {
  for (const bad of [null, {}, { ok: 'yes' }, 'ok']) {
    const f = fakeRequest({ 'setup.runtime_check': bad })
    assert.deepEqual(await checkModel(f.request, () => null), { state: 'error' }, JSON.stringify(bad))
  }
})

test('never asks setup.status, and gives runtime_check a timeout', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: false } })
  await checkModel(f.request, () => null)
  assert.deepEqual(f.calls.map(c => c.method), ['setup.runtime_check'])
  assert.ok(f.calls[0].timeout > 0 && f.calls[0].timeout <= 30000)
})

test('the no-model line is the fixed text from build-v1.md P7', () => {
  assert.equal(NO_MODEL_LINE, "Hermes has no model connected yet, so I can't answer typed questions. The steps still work with the buttons.")
})

test('reading Hermes\'s live model name throws: still connected, name from runtime_check', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: true, model: 'mock-small' } })
  const r = await checkModel(f.request, () => { throw new Error('store gone') })
  assert.deepEqual(r, { state: 'ok', name: 'mock-small' })
})

test('free_tier.status also gets a timeout', async () => {
  const f = fakeRequest({ 'setup.runtime_check': { ok: true, model: null, free_tier_route: true }, 'free_tier.status': { label: 'Nous · free tier' } })
  await checkModel(f.request, () => null)
  assert.ok(f.calls[1].timeout > 0 && f.calls[1].timeout <= 30000)
})
