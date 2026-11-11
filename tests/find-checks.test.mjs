// find-v1, part 2 (Lead, 11 Nov; docs/answers/hhtech-find-run.md section 4, last paragraph): the checks dropped replies
// that were true to the handed lines. Each raw reply is hhtech's own recording (tests/fixtures/find-run-dropped.json,
// made by dev/checks/find-v1/make-fixture.py from dev/checks/hhtech-find-run/out-*.jsonl), judged with the lines of
// today's data for the ids that were handed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { judgeWritten, replyFlags, readWritten, c12Typed, c24Fails } from '../src/live-checks.js'
import { LIVE_ROW } from '../src/live-rows.js'
import { TALK_DATA } from '../src/talk-data.js'

const F = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures', 'find-run-dropped.json'), 'utf8'))
const textOf = id => (LIVE_ROW[id] || TALK_DATA.fixed[id]).text
const rowsOf = c => c.rows.map(id => ({ id, text: textOf(id) }))
const judge = (c, more = {}) => judgeWritten(c.raw, rowsOf(c), { lastLine: '', message: c.message, typed: c.typed, work: null, ...more })
const the = (run, n) => {
  const c = F.cases.find(x => x.run === run && x.n === n)
  assert.ok(c, run + ' ' + n)
  return c
}

test('the fixture holds hhtech\'s 12 dropped replies, each with the check that dropped it at build 2115106', () => {
  assert.equal(F.cases.length, 12)
  assert.deepEqual(F.cases.map(c => c.dropped_by.split(' ')[0]).sort(), ['c12', 'c12', 'c12', 'c12', 'c12', 'c12', 'c14', 'c19', 'c20', 'c20', 'c22', 'c24'])
})

test('c12: a name the person typed themselves in this visit passes (Mac twice, Siri, Signal twice): the five replies are shown', () => {
  for (const [run, n, name] of [['free-W1-new', '10', 'Mac'], ['free-W1x-new', '10', 'Mac'], ['free-W2-new', '3', 'Siri'], ['free-W1x-new', '11f', 'Signal'], ['free-W2-new', '11f', 'Signal']]) {
    const c = the(run, n)
    assert.equal(c.dropped_by, 'c12 name ' + name)
    const j = judge(c)
    assert.equal(j.fail, undefined, `${run} ${n}: ${j.fail}`)
    assert.ok(j.text.includes(name), j.text)
    // without the person's own messages (as before this job) the name still stops it
    assert.equal(judge(c, { typed: [] }).fail, 'c12 name ' + name)
  }
})

test('c12: Signal passes at "i dont understand" because the person typed it two messages earlier, not in the newest message', () => {
  const c = the('free-W1x-new', '11f')
  assert.equal(c.message, 'i dont understand')
  assert.ok(c.typed.includes('does it work with signal'))
  assert.equal(judge(c, { typed: [c.message] }).fail, 'c12 name Signal')
})

test('c12 still stops a name the person did not type (the 2B\'s false "not open source ... Nous Research") and a name they typed that Helper\'s data does not know', () => {
  const nous = the('2b-W1-fresh', '5')
  assert.equal(judge(nous).fail, 'c12 name Nous')
  assert.equal(c12Typed('Mac', ['got a new mac how do i take hermes with me']), true)
  assert.equal(c12Typed('Zorbo', ['does it work with zorbo']), false)
  assert.equal(c12Typed('Mac', ['what about my macros']), false, 'a whole word only')
  const rows = [{ id: 'msg2', text: textOf('msg2') }]
  const made = judgeWritten('Hermes works with Zorbo. Open Messaging in the Hermes app to set it up.\nUSED: [msg2]', rows, { message: 'does it work with zorbo', typed: ['does it work with zorbo'] })
  assert.equal(made.fail, 'c12 name Zorbo')
})

test('c24: "asks for your approval first" is the handed line\'s own word (approve), not a guess about the person: the reply is shown', () => {
  const c = the('free-W1x-new', '13')
  assert.equal(c.dropped_by, 'c24 about the person approval')
  const j = judge(c)
  assert.equal(j.fail, undefined, j.fail)
  assert.equal(j.text, 'For risky commands, such as deleting files, Hermes asks for your approval first.')
  // a guess about the person is still stopped, with the same line handed
  const hand = textOf('SAFE').toLowerCase()
  assert.equal(c24Fails('As a teacher, you get asked for your approval first.', null, c.message, hand, true), 'teacher')
  assert.equal(c24Fails('Hermes protects your restaurant by asking first.', null, c.message, hand, true), 'restaurant')
  assert.equal(c24Fails('Hermes asks for your approval first.', null, c.message, hand, false), 'approval', 'as before this job without the allowance')
})

test('c22: "tools" needs no plain word beside it when the handed line about tools explains it: the reply is shown; with that line not handed it is still dropped', () => {
  const c = the('free-W2-new', '2')
  assert.match(c.dropped_by, /^c22 term unexplained/)
  const j = judge(c)
  assert.equal(j.fail, undefined, j.fail)
  assert.match(j.text, /It can use tools such as searching the web/)
  // (the web row says "a built-in tool, an action it can take" too: with only the line about Hermes handed, c22 stops it)
  const only = rowsOf(c).filter(r => r.id === 'HERMES')
  assert.ok(replyFlags(readWritten(c.raw).text, only, ['HERMES'], { message: c.message }).some(f => f.startsWith('c22 term unexplained')))
})

test('c14: an honest "the checked information doesn\'t specifically mention rules" passes: the reply is shown; a claim about Hermes with a not is still dropped', () => {
  const c = the('free-W2-new', '9')
  assert.equal(c.dropped_by, 'c14 no-claim does_not')
  const j = judge(c)
  assert.equal(j.fail, undefined, j.fail)
  assert.match(j.text, /the checked information doesn't specifically mention rules/)
  const rows = rowsOf(c)
  for (const bad of ['Hermes does not have a built-in language setting to change.', 'Hermes can bring over notes from Cursor, but it does not bring over rules.', 'Hermes is not open source.', "The checked information says Hermes doesn't work with Cursor."]) {
    assert.match(String(judgeWritten(bad + '\nUSED: MIG_APP', rows, { message: c.message, typed: c.typed }).fail), /^c14 no-claim/, bad)
  }
})

test('the other three of the 12 are not this job\'s: the 2B\'s made-up "the standard voice is free" is still dropped; c20 still drops its two', () => {
  assert.ok(judge(the('2b-W1-fresh', '15')).fail)
  for (const [run, n] of [['free-W1x-fresh', '6'], ['free-W1x-old', '12']]) assert.ok(judge(the(run, n)).fail, run)
})
