// What the conversation keeps can always be read back by Helper's settings page: for every message
// in hhtech's set 2 and the Builder's extra ones, said at the name question and later, the stored
// record, drawn into the box (renderKept) and read back by the settings page's rules (readBox,
// the port of settings_read.py), gives the same record, never "Nothing was saved". A record the
// settings page refuses would leave the person unable to save their own page.
// Builder, 10 Nov 2026 (talk v2, after review: two ways in were found and closed in src/talk.js,
// a name holding a refused word and the same "remember" thing in other capitals).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { laterVisit, turn } from '../src/talk.js'
import { keptToStore } from '../src/kept.js'
import { renderKept, readBox } from '../src/settings-file.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const SET2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/route2-set2.json'), 'utf8')).messages.map(m => m.text)
const EXTRA = [
  'password: swordfish',
  'my name is PIN',
  "I'm Login",
  'Peter',
  'Anna-Marie',
  "O'Brien",
  'remember that My club has six courts',
  'remember that my club has six courts',
  'remember that MY CLUB HAS SIX COURTS',
  'remember that my pin is the usual one',
  'remember that my passwords are all tulip',
  'remember: the courts open at nine',
  'remember that I like tea',
  'remember that I like coffee',
  'remember that I like cake',
  'I pay for ChatGPT',
  'I use WhatsApp',
  'connect my Notion'
]
const without = (rec, k) => Object.fromEntries(Object.entries(rec).filter(([key]) => key !== k))

function roundTrip(st, label) {
  const rec = keptToStore(st.kept)
  if (!rec) return 0
  const back = readBox(renderKept(rec))
  assert.equal(back.result, 'read', `${label}: ${JSON.stringify(rec)} → ${JSON.stringify(back)}`)
  // talk-live-2: told_work (live-v2 changes-4) is a mark like told, not a line of the box
  assert.deepEqual(back.record, without(without(rec, 'told'), 'told_work'), label)
  return 1
}

test('every record the conversation keeps reads back the same on the settings page', () => {
  let records = 0
  const all = [...SET2, ...EXTRA]
  for (const m of all) {
    // at the name question
    const a = laterVisit({})
    turn(m, a)
    turn('I run a tennis club', a)
    records += roundTrip(a, `name: ${m}`)
    // later, after a name
    const b = laterVisit({})
    turn('Peter', b)
    turn('I run a tennis club', b)
    turn(m, b)
    records += roundTrip(b, `later: ${m}`)
  }
  // and everything at once, one after the other
  const c = laterVisit({})
  for (const m of ['Peter', 'I run a tennis club', ...all]) turn(m, c)
  records += roundTrip(c, 'all in one visit')
  assert.ok(records >= all.length, `${records} records read back`)
})

test('the two ways in that review found are closed: a refused word is no name; the same thing in other capitals is kept once', () => {
  const a = laterVisit({})
  turn('password: swordfish', a)
  turn('I run a tennis club', a)
  assert.equal(a.kept.name, undefined)
  const b = laterVisit({})
  turn('Peter', b)
  turn('x', b)
  turn('remember that My club has six courts', b)
  const again = turn('remember that my club has six courts', b)
  assert.equal(again.kind, 'RM1')
  assert.deepEqual(b.kept.asked, ['My club has six courts'])
})
