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
  assert.deepEqual(KEY_PATTERNS.map(r => r.source), data.key_patterns.patterns)
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

// changes-10: hhcontent's 57 refusal cases (refuse_tests.py, run in Python by
// dev/checks/talk-v2-wants/dump_refuse.py), through the conversation's own "remember that ...":
// a key shape gets K1, a refused word or a long number RM6, anything else is not refused.
test('hhcontent\'s 57 refusal cases: "remember that ..." refuses exactly what the Python refuses, and a key shape is K1', () => {
  const R = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'refuse-cases.json'), 'utf8'))
  assert.equal(R.cases.length, 57)
  for (const c of R.cases) {
    const o = turn('remember that ' + c.text, freshVisit())
    const want = c.python === null ? 'kept or too short' : c.python.startsWith('key pattern') ? 'K1' : 'RM6'
    const got = o.kind === 'K1' ? 'K1' : o.kind === 'RM6' ? 'RM6' : 'kept or too short'
    assert.equal(got, want, `${c.text} (Python: ${c.python})`)
    assert.equal(c.python !== null, c.want, `hhcontent's own expectation: ${c.text}`)
  }
})
