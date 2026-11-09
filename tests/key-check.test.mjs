// Pasted-key check (content/v1-strings.md K1; docs/answers/hhtech-v1-strings-check.md point 2), with
// hhtech's own cases from dev/checks/hhtech/check-key-pattern.mjs (copied into tests/fixtures/).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeKey, prepareInput, KEY_PATTERNS, KEY_LINE, LONG_LINE, MAX_INPUT_CHARS } from '../src/key-check.js'
import { KEYS, SENTENCES, orKey } from './fixtures/hhtech-key-cases.mjs'

test('the three patterns are hhtech\'s, exactly', () => {
  assert.deepEqual(KEY_PATTERNS.map(r => r.source), [
    '(?<![A-Za-z0-9])(?:sk-|sk_|xai-|AIza|ghp_|gho_|github_pat_|hf_|gsk_|pplx-|r8_|fw_)[A-Za-z0-9_-]{16,}',
    '(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}',
    '(?<![A-Za-z0-9])(?=[A-Za-z]*[0-9])(?=[0-9]*[A-Za-z])[A-Za-z0-9]{32,}(?![A-Za-z0-9])'
  ])
  assert.ok(KEY_PATTERNS.every(r => r.flags === ''))
})

test(`all ${KEYS.length} of hhtech's key shapes are caught`, () => {
  assert.equal(KEYS.length, 22)
  const missed = KEYS.filter(([, k]) => !looksLikeKey(k)).map(([n]) => n)
  assert.deepEqual(missed, [])
})

test(`none of hhtech's ${SENTENCES.length} ordinary sentences is flagged`, () => {
  assert.equal(SENTENCES.length, 25)
  assert.deepEqual(SENTENCES.filter(s => looksLikeKey(s)), [])
})

test('a key is caught on the full text, before the 500-character cut (starts at character 491)', () => {
  const long = 'a'.repeat(490) + ' ' + orKey
  assert.equal(looksLikeKey(long.slice(0, MAX_INPUT_CHARS)), false) // the cut alone would miss it
  assert.deepEqual(prepareInput(long), { kind: 'key' })
})

test('the key check comes before the build-word check', () => {
  let asked = false
  const r = prepareInput('please install this for me ' + orKey, () => {
    asked = true
    return true
  })
  assert.deepEqual(r, { kind: 'key' })
  assert.equal(asked, false)
})

test('build words: matched on the full text, before the cut, no model call', () => {
  const seen = []
  const text = 'x'.repeat(600) + ' install it'
  assert.deepEqual(prepareInput(text, t => (seen.push(t), /install/.test(t))), { kind: 'build' })
  assert.equal(seen[0], text)
})

test('over 500 characters: cut to 500 and flagged so the page shows the note', () => {
  const r = prepareInput('é'.repeat(700))
  assert.equal(r.kind, 'send')
  assert.equal(r.cut, true)
  assert.equal(Array.from(r.input).length, 500)
  assert.deepEqual(prepareInput('What is a skill?'), { kind: 'send', input: 'What is a skill?', cut: false })
})

test('empty text sends nothing', () => {
  assert.deepEqual(prepareInput('   '), { kind: 'empty' })
  assert.deepEqual(prepareInput(undefined), { kind: 'empty' })
})

test('the fixed lines are hhcontent\'s words', () => {
  assert.equal(KEY_LINE, "That looks like a secret key, so I didn't send it to your model. Keys go in Settings, then Providers, then API keys, never in a chat.")
  assert.equal(LONG_LINE, 'Your message was long, so I read only the first 500 characters.')
})
