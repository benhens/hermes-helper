// Pasted-key check (content/v1-strings.md K1; docs/answers/hhtech-v1-strings-check.md point 2), with
// hhtech's own cases from dev/checks/hhtech/check-key-pattern.mjs (copied into tests/fixtures/).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { looksLikeKey, prepareInput, KEY_PATTERNS, KEY_LINE, LONG_LINE, MAX_INPUT_CHARS } from '../src/key-check.js'
import { KEYS, SENTENCES, orKey } from './fixtures/hhtech-key-cases.mjs'
import { turn, freshVisit } from '../src/talk.js'

test('the patterns are hhcontent\'s key_patterns, exactly, with no flags (changes-10: one list for route2.py, settings_read.py and the plugin)', () => {
  const data = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'content', 'helper-talk-v2.json'), 'utf8'))
  // RegExp.source writes a slash as \/ (pattern 5 has one since wants fixes v1): compare with the same
  // strings put through RegExp, which changes nothing else
  assert.deepEqual(KEY_PATTERNS.map(r => r.source), data.key_patterns.patterns.map(p => new RegExp(p).source))
  assert.ok(data.key_patterns.patterns.every(p => !/\\\//.test(p)), 'the data writes no \\/ of its own')
  assert.equal(KEY_PATTERNS.length, 7)
  assert.ok(KEY_PATTERNS.every(r => r.flags === ''))
})

test('changes-10: AWS keys, bot tokens and private key files are caught; web addresses, file paths, "AKIA" alone and times are not', () => {
  for (const k of ['AKIA' + 'IOSFODNN7EXAMPLE', 'my secret is wJalrXUtnFEMI/K7MDENG/bPxRfiCY' + 'EXAMPLEKEY', 'here it is 123456789:AAH' + 'dqTcvCH1vGWJxfSeofSAs0K5PALDsaw', '-----BEGIN OPENSSH PRIVATE KEY-----', 'glpat-' + 'abcdefghij0123456789', 'xoxb-' + '1234567890abcdefghij', 'rk_live_' + 'abcdefghij0123456789']) assert.ok(looksLikeKey(k), k)
  for (const s of ['see https://example.com/shop/autumn-sale-2026/boots/and-more-of-it', '/Users/peter/Documents/Club/2026/schedule-autumn.xlsx', 'C:/Users/peter/Documents/schedule.xlsx', 'AKIA', 'we meet at 12:30', 'the key point is speed']) assert.ok(!looksLikeKey(s), s)
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

// changes-10's 57 refusal cases (refuse-cases.json) are gone with the changes-10 rule: refuse_tests.py now holds
// changes-12/13's 144 cases, run through "remember that ..." (K1 or RM6) and the settings page in
// tests/secret-rule.test.mjs.
