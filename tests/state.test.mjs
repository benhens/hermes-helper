// What the page keeps in ctx.storage on the person's computer (src/state.js; talk v1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { readState, STEP_COUNT, STORED_KEYS } from '../src/state.js'

const store = obj => (k, d) => (k in obj ? obj[k] : d)

test('first open: Setup tab, step 1, no answers yet, Helper\'s window 460 px wide', () => {
  assert.deepEqual(readState(store({})), { tab: 'setup', step: 1, answers: {}, helperWidth: 460 })
})

test('remembered values come back, the dragged width too', () => {
  const s = readState(store({ tab: 'yours', step: 3, answers: { s1: 'o_phone', s2: 'o_key' }, helperWidth: 512 }))
  assert.deepEqual(s, { tab: 'yours', step: 3, answers: { s1: 'o_phone', s2: 'o_key' }, helperWidth: 512 })
})

test('junk in storage falls back to the defaults; a width outside 360 to 600 is brought inside', () => {
  const s = readState(store({ tab: 'x', step: 99, answers: 'o_phone', helperWidth: 'wide' }))
  assert.deepEqual(s, { tab: 'setup', step: 1, answers: {}, helperWidth: 460 })
  assert.equal(readState(store({ step: 0 })).step, 1)
  assert.equal(readState(store({ step: STEP_COUNT })).step, STEP_COUNT)
  assert.equal(readState(store({ helperWidth: 90 })).helperWidth, 360)
  assert.equal(readState(store({ helperWidth: 4000 })).helperWidth, 600)
  assert.equal(readState(store({ helperWidth: 400.6 })).helperWidth, 401)
})

test('what the old helper header stored (side, hidden or closed, chat log) is no longer read', () => {
  const s = readState(store({ side: 'left', helper: 'closed', chatlog: true }))
  assert.deepEqual(Object.keys(s).sort(), ['answers', 'helperWidth', 'step', 'tab'])
})

test('every key the plugin stores is on the allowed list: nothing about the person is written', () => {
  // The allowed list: the page's own state and the answer to the memory test on Your setup.
  assert.deepEqual([...STORED_KEYS].sort(), ['answers', 'helperWidth', 'remember', 'step', 'tab'])
  const dir = path.resolve(import.meta.dirname, '..', 'src')
  const found = new Set()
  let calls = 0
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8')
    for (const m of src.matchAll(/storage\s*\.\s*(\w+)\s*\(\s*([^,)]*)/g)) {
      calls++
      const arg = m[2].trim()
      // page.js's keep(key, setter) writes under the key it is given: its two callers are read below
      if (arg === 'key' || arg === 'k') continue
      const literal = arg.match(/^'([\w-]+)'$/)
      assert.ok(literal, `${f}: a storage call whose key is not a plain text: ${m[0]}`)
      assert.ok(['get', 'set'].includes(m[1]), `${f}: storage.${m[1]}`)
      found.add(literal[1])
    }
    for (const m of src.matchAll(/\bkeep\(\s*'([\w-]+)'/g)) found.add(m[1])
    // storage is reached in no other way (handed on whole, or under another name)
    const code = src.split('\n').filter(line => !line.trim().startsWith('//')).join('\n')
    assert.doesNotMatch(code, /\bstorage\b(?!\.(?:get|set)\()/, `${f}: storage reached another way`)
  }
  assert.ok(calls >= 5, `${calls} storage calls read`)
  for (const key of found) assert.ok(STORED_KEYS.includes(key), `a stored key that is not on the allowed list: ${key}`)
  for (const key of STORED_KEYS) assert.ok(found.has(key), `on the list but never stored: ${key}`)
})

test('answers keep only real options of real steps (an old or made-up id is dropped)', () => {
  const s = readState(store({ answers: { s1: 'o_tasks', s2: 'o_tasks', s9: 'o_keep', s3: 42, s4: 'o_enough' } }))
  assert.deepEqual(s.answers, { s1: 'o_tasks', s4: 'o_enough' })
  assert.deepEqual(readState(store({ answers: ['o_tasks'] })).answers, {})
})

test('four steps, from the step data', () => {
  assert.equal(STEP_COUNT, 4)
})
