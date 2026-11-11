// talk-live row 2: which rows the person's AI is handed. The ids equal hhtech's live.py's (score, by_words,
// rank_in) on the same data: tests/fixtures/live-rows-oracle.json, made by dev/checks/talk-live/dump_live.py,
// which runs live.py as it is on the pinned team copy. Plus the next lines, the follow-up rule and the cap of 5.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { LIVE_ROWS, LIVE_ROW, byWords, rankIn, withNext, isFollowUp, isFollowPhrase, followRows, rowOfKey, resultOfRow, MAX_HANDED } from '../src/live-rows.js'
import { freshVisit, turnParts, lineKey } from '../src/talk.js'
import { LIVE_DATA } from '../src/live-data.js'

const O = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures', 'live-rows-oracle.json'), 'utf8'))

test('the rows are live.py\'s FACTS, in its order, plus the four next lines of the data (handed only with their row)', () => {
  assert.deepEqual(LIVE_ROWS.filter(r => !r.next_of).map(r => r.id), O.facts)
  assert.deepEqual(LIVE_ROWS.filter(r => r.next_of).map(r => r.id).sort(), ['bot1-next', 'use-more', 'use1-next', 'use3-next'])
  assert.deepEqual([...new Set(LIVE_ROWS.filter(r => !r.next_of).map(r => r.subject))].sort(), O.subjects)
  assert.equal(O.subjects.length, 13)
  // every subject the first call can name is a group of rows, or talk, build or none
  assert.deepEqual(LIVE_DATA.subjects.map(s => s.id).filter(s => !O.subjects.includes(s)).sort(), ['build', 'none', 'talk'])
})

test(`word matching and ranking give live.py's ids for all ${O.cases.length} messages (hhtech's 24, route2.py's conversations, follow-ups)`, () => {
  let words = 0
  for (const c of O.cases) {
    assert.deepEqual(byWords(c.text), c.by_words, c.text)
    if (c.by_words.length) words++
    for (const [g, ids] of Object.entries(c.rank_in)) assert.deepEqual(rankIn(c.text, g), ids, `${c.text} / ${g}`)
  }
  assert.ok(words > 50, `${words} messages found rows by words`)
})

test('never more than 5 rows; a next line comes right after its row; never a whole list', () => {
  assert.equal(MAX_HANDED, 5)
  const bot1 = LIVE_ROW['bot1-next'].next_of
  assert.deepEqual(withNext([bot1]), [bot1, 'bot1-next'])
  const five = rankIn('bots', 'bot')
  assert.ok(withNext([...five, bot1]).length <= 5)
  for (const c of O.cases) for (const ids of Object.values(c.rank_in)) assert.ok(withNext(ids).length <= 5)
  for (const g of O.subjects) assert.ok(LIVE_ROWS.filter(r => r.subject === g && !r.next_of).length > 0)
})

test('the follow-up phrases: the whole message, after ok, so, and, cool, right and end marks', () => {
  for (const t of ['ok and then?', 'and then', 'So what next?', 'what do you mean?', 'how?', 'Okay, tell me more', 'cool, go on', 'and', 'next!']) assert.ok(isFollowPhrase(t), t)
  for (const t of ['and then what about telegram', 'how do I do that', 'ok', 'thanks', 'what is next week']) assert.ok(!isFollowPhrase(t), t)
})

test('a follow-up needs Helper\'s last line to come from rows; it gets that line\'s row and its next, or the rows the AI was handed', () => {
  const st = freshVisit()
  turnParts('can I use it on telegram', st)
  const before = { last: st.last, lastKey: st.lastKey, liveRows: null }
  assert.ok(['row', 'question', 'plain', 'want'].includes(st.last), st.last)
  const { pre } = turnParts('ok and then?', st)
  if (['row', 'plain', 'want'].includes(before.last)) {
    assert.ok(isFollowUp('ok and then?', pre, before))
    const id = rowOfKey(before.lastKey)
    assert.ok(id)
    assert.deepEqual(followRows(before), withNext([id]))
  }
  // after a code line that came from no row (hello), nothing is a follow-up
  const st2 = freshVisit()
  turnParts('hello', st2)
  assert.ok(!isFollowUp('and then?', { kind: 'N1' }, { last: st2.last, lastKey: st2.lastKey }))
  // the rows the AI was handed for the previous message win while that line is the last
  assert.deepEqual(followRows({ last: 'written', lastKey: 'k', liveRows: { key: 'k', ids: ['mem1', 'mem2'] } }), ['mem1', 'mem2'])
  assert.deepEqual(followRows({ last: 'written', lastKey: 'other', liveRows: { key: 'k', ids: ['mem1'] } }), [])
  assert.ok(isFollowUp('and then?', { kind: 'N1' }, { last: 'written', lastKey: 'k', liveRows: { key: 'k', ids: ['mem1'] } }))
  assert.ok(!isFollowUp('and then?', { kind: 'N1' }, { last: 'written', lastKey: 'k', liveRows: null }))
})

test('a picked row shows what code shows for it: a plain line, a need\'s row, a term, a want, COST, WHERE, CN1, a next line', () => {
  for (const r of LIVE_ROWS) {
    const res = resultOfRow(r.id)
    assert.ok(res && res.kind, r.id)
    // the row a line's key points back to is the row itself (for a follow-up after it)
    if (['plain', 'row', 'term', 'want', 'COST', 'WHERE', 'CN1'].includes(res.kind)) assert.equal(rowOfKey(lineKey(res)), r.id, r.id)
  }
  assert.equal(resultOfRow('nope'), null)
})
