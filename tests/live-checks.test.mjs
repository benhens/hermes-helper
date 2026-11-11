// talk-live row 4: reading the AI's replies, and the checks a written reply must pass. Every recorded written
// reply of hhtech's runs gets the flags hhcontent's check_live.py gives it (tests/fixtures/live-checks-oracle.json,
// made by dev/checks/talk-live/dump_live.py running check_live.py as it is on the pinned team copy). Named replies
// are pinned so a change shows. The <think> and fence cases are made-up strings: no recorded reply has them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { readWritten, replyFlags, judgeWritten, readSubject, readPick, replyWord } from '../src/live-checks.js'

const O = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures', 'live-checks-oracle.json'), 'utf8'))
// talk-live-2: c24 (live-v2 changes-4) is newer than check_live.py; its own cases are in tests/talk-live-2.test.mjs and
// what it does to these recordings is pinned below
const plain = flags => flags.filter(f => !/^c1[8]|^c23|^c24/.test(f)).map(f => (f.startsWith('c22') ? 'c22' : f))
const notC24 = flags => flags.filter(f => !f.startsWith('c24'))
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
    assert.deepEqual(plain(replyFlags(r.text, c.rows, r.used)), plain(c.flags), c.key)
  }
})

test('the counts hhcontent reported for its checks are the plugin\'s too (free model way c: 16 good, none stopped; 2B way c: 7 of 12 bad stopped, 2 good stopped)', () => {
  const tally = {}
  for (const c of O.cases) {
    if (c.word) continue
    const way = c.key.split('|').slice(0, 2).join(' ')
    const t = (tally[way] = tally[way] || { written: 0, good: 0, goodStopped: 0, bad: 0, badStopped: 0 })
    const stopped = notC24(replyFlags(c.reply, c.rows, c.used)).length > 0
    t.written++
    if (['G', 'R'].includes(c.judge)) {
      t.good++
      t.goodStopped += stopped
    } else {
      t.bad++
      t.badStopped += stopped
    }
  }
  assert.deepEqual(tally['free c'], { written: 17, good: 16, goodStopped: 0, bad: 1, badStopped: 0 })
  assert.deepEqual(tally['free b'], { written: 17, good: 17, goodStopped: 1, bad: 0, badStopped: 0 })
  assert.deepEqual(tally['2b c'], { written: 17, good: 5, goodStopped: 2, bad: 12, badStopped: 7 })
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

test('the first call and the pick: the first subject id in the reply; a handed id, TALK, BUILD, anything else NONE', () => {
  assert.equal(readSubject('<think>hmm, msg or bot</think> Bot.'), 'bot')
  assert.equal(readSubject('The answer is: msg'), 'msg')
  assert.equal(readSubject('weather'), 'none')
  assert.equal(readSubject(''), 'none')
  assert.deepEqual(readPick(' [mem1]. ', ['mem1', 'mem2']), { id: 'mem1' })
  assert.deepEqual(readPick('`"mem2"`', ['mem1', 'mem2']), { id: 'mem2' })
  assert.deepEqual(readPick('mem3', ['mem1', 'mem2']), { word: 'NONE' })
  assert.deepEqual(readPick('talk', ['mem1']), { word: 'TALK' })
  assert.deepEqual(readPick('<think>x</think>BUILD', ['mem1']), { word: 'BUILD' })
})
