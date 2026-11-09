// Helper panel and page state kept in ctx.storage (build-v1.md P5, P11).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readState, otherSide, STEP_COUNT } from '../src/state.js'

const store = obj => (k, d) => (k in obj ? obj[k] : d)

test('first open: helper open on the right, Setup tab, step 1, chat log off, no answers yet', () => {
  assert.deepEqual(readState(store({})), { side: 'right', helper: 'open', tab: 'setup', step: 1, chatlog: false, answers: {} })
})

test('remembered values come back', () => {
  const s = readState(store({ side: 'left', helper: 'hidden', tab: 'yours', step: 3, chatlog: true, answers: { s1: 'o_phone', s2: 'o_key' } }))
  assert.deepEqual(s, { side: 'left', helper: 'hidden', tab: 'yours', step: 3, chatlog: true, answers: { s1: 'o_phone', s2: 'o_key' } })
})

test('closed is remembered too (the plugin stays on; only the panel is gone)', () => {
  assert.equal(readState(store({ helper: 'closed' })).helper, 'closed')
})

test('junk in storage falls back to the defaults', () => {
  const s = readState(store({ side: 'top', helper: 'off', tab: 'x', step: 99, chatlog: 'yes', answers: 'o_phone' }))
  assert.deepEqual(s, { side: 'right', helper: 'open', tab: 'setup', step: 1, chatlog: false, answers: {} })
  assert.equal(readState(store({ step: 0 })).step, 1)
  assert.equal(readState(store({ step: STEP_COUNT })).step, STEP_COUNT)
})

test('answers keep only real options of real steps (an old or made-up id is dropped)', () => {
  const s = readState(store({ answers: { s1: 'o_tasks', s2: 'o_tasks', s9: 'o_keep', s3: 42, s4: 'o_enough' } }))
  assert.deepEqual(s.answers, { s1: 'o_tasks', s4: 'o_enough' })
  assert.deepEqual(readState(store({ answers: ['o_tasks'] })).answers, {})
})

test('four steps, from the step data', () => {
  assert.equal(STEP_COUNT, 4)
})

test('Move flips the side both ways', () => {
  assert.equal(otherSide('right'), 'left')
  assert.equal(otherSide('left'), 'right')
})
