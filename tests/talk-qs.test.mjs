// builder-qs (changes-14 to -17): the sets hhcontent graded in changes-16 and -17, put to the plugin. hhtech's 30
// wants questions (run30.py's start: stage open, name Sam, met set), hhtech's 48 blind messages and hhcontent's
// own 20 (run17.py's starts: a fresh visit with met set; "wrong" after "what's a skill?"; names at "What's your
// name?"), and Lead's list of short names. dev/checks/builder-qs/dump_qs_sets.py ran each through the Python
// reference twice and wrote tests/fixtures/qs-sets.json: route2 (route2.py alone, as run17.py) and oracle (with
// the three wants layers on top, as run30.py). Nothing here is typed in by hand.
// The expected result, as tests/talk-wants.test.mjs takes it: the oracle's where it is a wants result (a row, a
// skill by name, a near miss), route2.py's everywhere else, because the wants layers' own turn() is older than
// changes-14 (it has no ordinary talk: "hiya" is N1 there).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TALK_DATA } from '../src/talk-data.js'
import fs from 'node:fs'
import path from 'node:path'
import { freshVisit, turn, lineFor, sayLine } from '../src/talk.js'
import { PINS } from './lib/team-pins.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const Q = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/qs-sets.json'), 'utf8'))

// route2.py's show(), with the wants layers' kinds
function show(o) {
  if (o.name_taken) return show({ ...o, name_taken: null }) + ' +name=' + o.name_taken
  if (o.kept && o.kept.length) return show({ ...o, kept: null, first: null }) + ' +kept=' + o.kept.join(',') + (o.first ? ' +first' : '')
  if (o.used) return show({ ...o, used: null }) + ' +from-kept'
  if (o.by_again) return show({ ...o, by_again: null }) + ' +again' // live-v2 changes-3
  if (o.repeat_of) return show({ ...o, repeat_of: null }) + ' +norepeat'
  const py = v => (v === null || v === undefined ? 'None' : v)
  const by = {
    row: () => 'line ' + o.need,
    question: () => 'question ' + o.topic,
    plain: () => 'plain line ' + o.topic + '0',
    H1: () => `H1 (${o.why})`,
    H2: () => `H2 (${o.why})`,
    BACK: () => `BACK name=${py(o.name)}`,
    HELLO: () => `HELLO name=${py(o.name)}`,
    term: () => 'term line ' + o.term,
    fact: () => 'fact ' + o.need, // find-v1 (breadth-t1): a fact line
    W1: () => 'W1 buttons ' + o.buttons.slice(0, 4).join('+'),
    W2: () => 'W2 buttons ' + o.buttons.join('+'),
    NAME_AGAIN: () => 'NAME_AGAIN name=' + o.name,
    NAME_NEW: () => 'NAME_NEW name=' + o.name,
    F1: () => `F1 name=${py(o.name)}`,
    F2: () => `F2 name=${py(o.name)} work=${py(o.work)}`,
    want: () => 'ROW ' + o.row,
    skill: () => 'SKILL ' + o.skill,
    N2: () => 'N2 group ' + o.group,
    G1: () => 'G1 group ' + o.group,
    // loom-fixes (route2.py show)
    NAME: () => 'NAME ' + o.id,
    // loom-fixes-2 (route2.py show): ordinary talk at the opening's two questions
    OPEN_TALK: () => `OPEN_TALK ${TALK_DATA.opening_talk.line_by_kind[o.talk]} then ${TALK_DATA.opening_talk.ask[o.ask]}`
  }
  return (by[o.kind] || (() => o.kind))()
}
const WANTS_SHOWN = /^(ROW |SKILL |N2 group |G1 group )/
const isWants = r => WANTS_SHOWN.test(r.shown) || (r.kind === 'W1' && /^W1 buttons w_/.test(r.shown))
const expected = c => (isWants(c.oracle) ? c.oracle.shown : c.route2.shown)

function ours(c) {
  const st = c.start === 'name' ? freshVisit('name') : freshVisit('open', {}, true)
  if (c.start === 'open-sam') st.name = 'Sam'
  let o = null
  for (const t of c.texts) o = turn(t, st)
  return show(o)
}

test('the sets file was made from the team\'s scripts at the pins: route2.py, the talk data, the wants data, wants_fixes_step.py', () => {
  assert.equal(Q.route2_sha256, PINS['dev/checks/hhcontent-talk-v2/route2.py'][0])
  assert.equal(Q.json_sha256, PINS['content/helper-talk-v2.json'][0])
  assert.equal(Q.wants_json_sha256, PINS['content/helper-wants-v1.json'][0])
  assert.equal(Q.wants_fixes_step_sha256, PINS['dev/checks/hhcontent-wants-fixes/wants_fixes_step.py'][0])
  const count = s => Q.cases.filter(c => c.set === s).length
  assert.deepEqual(['hhtech30', 'hhtech48', 'own20', 'lead-names', 'ty-later'].map(count), [30, 48, 28, 14, 4])
})

test('every case: the plugin gives the reference\'s result (the wants layers\' where it is a wants result, route2.py\'s elsewhere)', () => {
  const off = Q.cases.map(c => [c.set, c.texts.join(' / '), ours(c), expected(c)]).filter(([, , got, want]) => got !== want)
  // find-v1, the one difference, on purpose: live changes-11 (near.first_step): a full hit by a phrase of a fact line comes first, before the topics and the plugin's wants step, as in route2.py; the wants layers of the reference are older than that step (route2.py alone gives fact d_siri too)
  assert.deepEqual(off, [['hhtech30', 'can it talk out loud to me like siri', 'fact d_siri', 'ROW w_voice']], off.map(x => x.join(' | ')).join('\n'))
  assert.ok(Q.cases.filter(c => isWants(c.oracle)).length >= 15, 'the wants layers decide some of them')
})

test('his own messages of 11 Nov: the tokens question, "hey" and "he" get real lines, never the don\'t-know line', () => {
  const st = freshVisit('open', {}, true)
  const tok = turn('How can I make it so I use less usage? Whenever I ask a question it doesn\'t take as many tokens', st)
  assert.deepEqual([tok.kind, tok.topic, tok.need], ['row', 'use', 'use1'])
  // changes-18: the answer names "New session"; its button "See what uses them" gives the /usage line
  const said = lineFor(tok, st)
  assert.equal(said.text, 'Long chats use the most tokens, small pieces of words. For a fresh chat, click "New session" at the top left.')
  assert.deepEqual([said.next.kind, said.next.label], ['line', 'See what uses them'])
  const more = lineFor(sayLine(said.next.line, st), st)
  assert.equal(more.text, 'In a Hermes chat, not here, type /usage and send it. It shows what each message carries, like the list of actions Hermes can take.')
  assert.equal(more.next, null, 'no button under it')
  assert.equal(turn('hey', st).kind, 'HELLO')
  assert.equal(turn('he', st).kind, 'CUT')
  // Lead's short names at "What's your name?" are names (changes-17)
  for (const n of ['Ty', 'Will', 'May', 'Hope', 'Art', 'Bill', 'Mark', 'Sue', 'Rob']) {
    const v = freshVisit('name')
    assert.deepEqual([turn(n, v).kind, v.kept.name], ['F1', n], n)
  }
})
