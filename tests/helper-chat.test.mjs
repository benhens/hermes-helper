// What the helper says in B3 (src/helper-chat.js): fixed lines chosen by code, no model.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { greetingEntry, answerEntry, doneEntry, typedEntries } from '../src/helper-chat.js'
import { KEY_LINE, LONG_LINE } from '../src/key-check.js'
import { stepById, LINES } from '../src/steps.js'

const s2 = stepById('s2')
const s4 = stepById('s4')
const all = entries => JSON.stringify(entries)

test('greeting: the helper says what it does and that it changes nothing', () => {
  assert.deepEqual(greetingEntry(), { who: 'helper', kind: 'greeting', lines: [LINES.greeting] })
  assert.match(LINES.greeting, /I don't change your settings/)
})

test('an answer: "Your answer: <label>" and the fact that answer points to, with its source', () => {
  const e = answerEntry(s2, 'o_local')
  assert.deepEqual(e.lines, ['Your answer: Run a model on this computer'])
  assert.equal(e.fact.id, 's2f4')
  assert.equal(e.fact.url, 'https://hermes-agent.nousresearch.com/docs/user-guide/local-models')
  assert.equal(answerEntry(s2, 'o_nope'), null)
})

test('after the last step: hhcontent\'s line and a way to Your setup', () => {
  assert.deepEqual(doneEntry(), { who: 'helper', kind: 'done', lines: [LINES.afterLast], action: 'yours' })
})

test('empty or spaces: nothing is said', () => {
  assert.deepEqual(typedEntries('   ', { step: s2, answers: {} }), [])
})

test('a pasted key: only the fixed line; the key is never shown back or kept', () => {
  const key = 'sk-' + 'a1B2'.repeat(10)
  const out = typedEntries(`here it is ${key} thanks`, { step: s2, answers: {} })
  assert.deepEqual(out, [{ who: 'helper', kind: 'key', lines: [KEY_LINE] }])
  assert.ok(!all(out).includes(key))
})

test('a key after character 500 is still caught (the check reads the whole text first)', () => {
  const key = 'ghp_' + 'Zx9'.repeat(10)
  const out = typedEntries('a'.repeat(495) + ' ' + key, { step: s2, answers: {} })
  assert.equal(out[0].kind, 'key')
})

test('build words: the person\'s words, then the hand-over text with the filled template to copy', () => {
  const out = typedEntries('Can you install the Gmail plugin?', { step: s4, answers: { s1: 'o_tasks' } })
  assert.equal(out.length, 2)
  assert.deepEqual(out[0], { who: 'you', kind: 'typed', lines: ['Can you install the Gmail plugin?'] })
  assert.equal(out[1].kind, 'handoff')
  assert.deepEqual(out[1].lines, LINES.handoffLead)
  assert.equal(out[1].after, LINES.handoffAfter)
  assert.match(out[1].paste, /^I'm setting up Hermes\. My goal: help me with tasks on my computer \(files, writing, research, code\)\. I'd like you to: "Can you install the Gmail plugin\?"\./)
  assert.match(out[1].paste, /whether this is a skill, a plugin or an MCP server/)
})

test('a question (no model call in B3): the fixed "no checked answer" line and the step\'s docs page', () => {
  const out = typedEntries('What is a provider?', { step: s2, answers: {} })
  assert.equal(out.length, 2)
  assert.equal(out[1].kind, 'no-answer')
  assert.deepEqual(out[1].lines, ["I don't have a checked answer for that yet. The closest official page is:"])
  assert.equal(out[1].link, s2.handoff.docs_url)
})

test('over 500 characters: the note about the cut, and only the first 500 are shown back', () => {
  const out = typedEntries('word '.repeat(150), { step: s2, answers: {} })
  assert.deepEqual(out.map(e => e.kind), ['typed', 'long', 'no-answer'])
  assert.deepEqual(out[1].lines, [LONG_LINE])
  assert.equal(Array.from(out[0].lines[0]).length, 501) // 500 and the "…"
})
