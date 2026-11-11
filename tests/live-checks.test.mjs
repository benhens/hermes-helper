// talk-live row 4: reading the AI's replies, and the checks a written reply must pass. Every recorded written
// reply of hhtech's runs gets the flags hhcontent's check_live.py gives it (tests/fixtures/live-checks-oracle.json,
// made by dev/checks/talk-live/dump_live.py running check_live.py as it is on the pinned team copy). Named replies
// are pinned so a change shows. The <think> and fence cases are made-up strings: no recorded reply has them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { readWritten, replyFlags, judgeWritten, readPick, replyWord } from '../src/live-checks.js'

const O = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures', 'live-checks-oracle.json'), 'utf8'))
// talk-live-2: c24 (live-v2 changes-4) is newer than check_live.py; its own cases are in tests/talk-live-2.test.mjs and
// what it does to these recordings is pinned below
// setup-chat: c28 (offer-t1) and c29 (live changes-9) are not in check_live.py (hhcontent's check_offers.py and
// check_c9.py hold them; tests/setup-chat-checks.test.mjs has their cases), so they are left out of this comparison
const plain = flags => flags.filter(f => !/^c1[8]|^c23|^c24|^c28|^c29/.test(f)).map(f => (f.startsWith('c22') ? 'c22' : f))
const notC24 = flags => flags.filter(f => !/^c24|^c28|^c29/.test(f))
const find = part => {
  const c = O.cases.find(x => x.reply.includes(part))
  assert.ok(c, part)
  return c
}

test(`all ${O.cases.length} recorded written replies: the same text after the fixes, and the same flags as check_live.py`, () => {
  assert.equal(O.cases.length, 61)
  for (const c of O.cases) {
    const r = readWritten(c.raw)
    assert.equal(replyWord(r.text), c.word, c.key)
    if (c.word) continue
    assert.equal(r.text, c.reply, c.key)
    assert.deepEqual(r.used, c.used, c.key)
    // find-v1: the four allowances newer than check_live.py are switched off for this comparison (asCheckLive)
    assert.deepEqual(plain(replyFlags(r.text, c.rows, r.used, { asCheckLive: true })), plain(c.flags), c.key)
  }
})

test('the counts hhcontent reported for its checks are the plugin\'s too (free model way c: 16 good, none stopped; 2B way c: 7 of 12 bad stopped by c0 to c23, 2 good stopped)', () => {
  const tallyOf = talk => {
  const tally = {}
  for (const c of O.cases) {
    if (c.word) continue
    const way = c.key.split('|').slice(0, 2).join(' ')
    const t = (tally[way] = tally[way] || { written: 0, good: 0, goodStopped: 0, bad: 0, badStopped: 0 })
    const stopped = notC24(replyFlags(c.reply, c.rows, c.used, talk)).length > 0
    t.written++
    if (['G', 'R'].includes(c.judge)) {
      t.good++
      t.goodStopped += stopped
    } else {
      t.bad++
      t.badStopped += stopped
    }
  }
  return tally
  }
  const tally = tallyOf({ asCheckLive: true })
  assert.deepEqual(tally['free c'], { written: 17, good: 16, goodStopped: 0, bad: 1, badStopped: 0 })
  assert.deepEqual(tally['free b'], { written: 17, good: 17, goodStopped: 1, bad: 0, badStopped: 0 })
  assert.deepEqual(tally['2b c'], { written: 17, good: 5, goodStopped: 2, bad: 12, badStopped: 7 })
  // find-v1 (the four allowances for c12, c14, c22, c24, with the person's message as their only typed one): every bad
  // reply stopped before is still stopped (7 of 12, none on the free model before or after); one good reply of the 2B
  // that was stopped is now shown
  const after = tallyOf({})
  assert.deepEqual(after['free c'], tally['free c'])
  assert.deepEqual(after['free b'], tally['free b'])
  assert.deepEqual(after['2b c'], { written: 17, good: 5, goodStopped: 1, bad: 12, badStopped: 7 })
  for (const c of O.cases.filter(x => !x.word && !['G', 'R'].includes(x.judge))) {
    const was = notC24(replyFlags(c.reply, c.rows, c.used, { asCheckLive: true })).length > 0
    const now = notC24(replyFlags(c.reply, c.rows, c.used, { message: c.message, typed: [c.message] })).length > 0
    if (was) assert.ok(now, c.key + ': a bad reply that was stopped must still be stopped')
  }
})

// setup-chat: what c28 (a reply that ends on an invitation or a question) does to the same recordings, which were made
// with the old rule 5 ("... and invite a question about Hermes"): it stops good replies of the free model too. Told to
// Lead in the report; with rule 5b in the instructions the model is asked not to end so (not run on a model).
test('c28 on the recordings made under the old rule 5: how many good replies it stops (a count for the report)', () => {
  const stopped = O.cases.filter(c => !c.word && ['G', 'R'].includes(c.judge) && replyFlags(c.reply, c.rows, c.used).some(f => f.startsWith('c28'))).map(c => c.key)
  assert.deepEqual(stopped.filter(k => k.startsWith('free|c')).length, 5)
  assert.ok(stopped.length >= 5)
})

test('c24 on the 61 recordings (nothing was kept; the person\'s message given): it stops two, both marked wrong by the judge, one already stopped by c5 and c6', () => {
  const hit = O.cases.filter(c => !c.word).map(c => [c.key, c.judge, replyFlags(c.reply, c.rows, c.used, { message: c.message }).filter(f => f.startsWith('c24'))]).filter(x => x[2].length)
  assert.deepEqual(hit, [['2b|c|4', 'F', ['c24 about the person mind']], ['2b|c|17', 'X', ['c24 about the person account']]])
})

test('pinned by name: the made-up claims stopped and those that get through, the good ones wrongly stopped', () => {
  const stopped = part => {
    const c = find(part)
    return judgeWritten(c.raw, c.rows).fail !== undefined
  }
  // stopped
  assert.ok(stopped('does not have'), 'the PDF "does not have"')
  // get through (what no check catches: content/helper-talk-live-v2.json checks.what_no_check_catches)
  assert.ok(!stopped('like a recipe book'))
  // talk-live-2: c24 (live-v2 changes-4) now stops this one: "your Gmail account" says more about the person than they
  // said ("account"); the judge marked it X (dev/checks/talk-live-2/c24-recorded-out.txt)
  assert.ok(stopped('Hermes can read your Gmail messages through its'), 'Hermes can read your Gmail messages through its "Connectors" page')
  assert.ok(!stopped('You can update Hermes by asking it to do so.'))
  // good, but stopped (the fallback shows: for the Riga one that is the don't-know line, which was wanted anyway)
  assert.ok(stopped('Riga'))
})

test('c0 and c1: <think> blocks (closed, and unclosed to the end), USED:, a code fence and quote marks around the whole reply; "!", curly quotes, dashes and ";" (made-up strings)', () => {
  assert.deepEqual(readWritten('<think>the person wants memory</think>\nHermes keeps short notes.\nUSED: mem1'), { text: 'Hermes keeps short notes.', used: ['mem1'] })
  assert.deepEqual(readWritten('Hermes keeps short notes.\nUSED: mem1\n<think>and now I will think until the tokens run out'), { text: 'Hermes keeps short notes.', used: ['mem1'] })
  assert.deepEqual(readWritten('<think>only thinking, never done'), { text: '', used: null })
  assert.deepEqual(readWritten('```html\nHermes keeps short notes.\n```\nUSED: none'), { text: 'Hermes keeps short notes.', used: ['none'] })
  assert.deepEqual(readWritten('"Hermes keeps short notes."'), { text: 'Hermes keeps short notes.', used: null })
  assert.deepEqual(readWritten('\u201cGreat!\u201d Hermes \u2014 your app; nice'), { text: '"Great." Hermes, your app, nice', used: null })
  assert.equal(readWritten('Hermes keeps notes!').text, 'Hermes keeps notes.')
  assert.deepEqual(judgeWritten('<think>x</think>', []), { fail: 'c0 empty' })
  assert.deepEqual(judgeWritten('NONE', []), { word: 'NONE' })
  assert.deepEqual(judgeWritten('build\nUSED: none', []), { word: 'BUILD' })
  assert.deepEqual(judgeWritten('```\nNONE\n```', []), { word: 'NONE' })
})

test('c18 and c23, which need the conversation: a second question after Helper\'s question; Helper\'s last line again, unless asked again', () => {
  const rows = [{ id: 'mem1', text: 'Hermes keeps short notes about you and your work.' }]
  const last = 'Hermes keeps short notes about you and your work.'
  assert.ok(replyFlags('Is that what you meant?', rows, ['mem1'], { lastLine: 'Which chat app do you use?' }).some(f => f.startsWith('c18')))
  assert.ok(!replyFlags('Is that what you meant?', rows, ['mem1'], { lastLine: 'Hermes keeps notes.' }).some(f => f.startsWith('c18')))
  assert.ok(replyFlags('Hermes keeps short notes about you, and your work', rows, ['mem1'], { lastLine: last, message: 'what?' }).some(f => f.startsWith('c23')))
  assert.ok(!replyFlags('Hermes keeps short notes about you and your work.', rows, ['mem1'], { lastLine: last, message: 'say that again' }).some(f => f.startsWith('c23')))
})

// find-v2 part 5: readSubject (the first call's reader) is deleted as dead code with its four checks
test('the pick: a handed id, TALK, BUILD, anything else NONE', () => {
  assert.deepEqual(readPick(' [mem1]. ', ['mem1', 'mem2']), { id: 'mem1' })
  assert.deepEqual(readPick('`"mem2"`', ['mem1', 'mem2']), { id: 'mem2' })
  assert.deepEqual(readPick('mem3', ['mem1', 'mem2']), { word: 'NONE' })
  assert.deepEqual(readPick('talk', ['mem1']), { word: 'TALK' })
  assert.deepEqual(readPick('<think>x</think>BUILD', ['mem1']), { word: 'BUILD' })
})
