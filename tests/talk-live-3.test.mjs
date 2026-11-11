// talk-live-3 (Lead, 11 Nov 05:08): live-v2 changes-5, its For builder lines, at the data's checksums
// (content/helper-talk-live-v2-changes-5.md), and two look points from hhtech-run-c18 and Lead's look at the pictures.
//   1. checks_c5.no_reply runs before c0 on every call; a hit is no answer (thinking)
//   2. c26 and c27 run after c24, the same fallback; c25 (adopted: false) never runs. The expected flags are
//      hhcontent's check_c5.py's own, run as it is on the pinned copy (tests/fixtures/c5-oracle.json,
//      dev/checks/talk-live-3/dump_c5.py)
//   3. the work line's label is "About them: {work}" (tests/talk-live-2.test.mjs checks it in the requests)
//   5. sch1 lost "update": "how do I update hermes" is N1 from code
//   6. text the person is to type (a /command, or a quoted phrase in a line that says "type") is one piece in the
//      paste box's code style; a phrase keeps its quote marks, outside it (review). (On the page: tests/live-page-3.test.mjs.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { noReply, c26Fails, c27Fails, replyFlags, judgeWritten } from '../src/live-checks.js'
import { LIVE_DATA } from '../src/live-data.js'
import { LIVE_ROW } from '../src/live-rows.js'
import { freshVisit, turnParts, lineFor } from '../src/talk.js'
import { askLive, goesToAi, slowFollows, SLOW_LINE as SLOW } from '../src/live-turn.js'
import { typedParts } from '../src/quotes.js'
import { loadSrc } from './lib/render.mjs'
import { liveProblems } from '../scripts/live-data.mjs'

const { wordsOf } = await loadSrc('reveal.js')
const FIX = path.resolve(import.meta.dirname, 'fixtures')
const C5 = JSON.parse(fs.readFileSync(path.join(FIX, 'c5-oracle.json'), 'utf8'))
const CONTENT = path.resolve(import.meta.dirname, '..', 'content')
const LIVE_JSON = JSON.parse(fs.readFileSync(path.join(CONTENT, 'helper-talk-live-v2.json'), 'utf8'))
const TALK_JSON = JSON.parse(fs.readFileSync(path.join(CONTENT, 'helper-talk-v2.json'), 'utf8'))
const WANTS_JSON = JSON.parse(fs.readFileSync(path.join(CONTENT, 'helper-wants-v1.json'), 'utf8'))

/* ---------- 1. no_reply ---------- */
test('changes-5 no_reply: the same answer as check_c5.py for every text its run read and for the Builder\'s own edge cases', () => {
  const all = [...C5.recorded_raw, ...C5.own_raw]
  assert.ok(C5.recorded_raw.length >= 80, `${C5.recorded_raw.length} recorded texts`)
  for (const c of all) assert.equal(noReply(c.raw), c.no_reply, JSON.stringify(c.raw))
  // the oracle holds both answers, so the comparison can fail either way
  assert.ok(all.filter(c => c.no_reply).length >= 10 && all.filter(c => !c.no_reply).length >= 10)
})

test('changes-5 no_reply: the lists are the data\'s (checks_c5.no_reply), read as it says: starts any case, holds exact', () => {
  assert.deepEqual(LIVE_DATA.no_reply, { starts: LIVE_JSON.checks_c5.no_reply.starts, holds: LIVE_JSON.checks_c5.no_reply.holds })
  assert.equal(noReply('  THOUGHT PROCESS: x'), true)
  assert.equal(noReply('x **analysis y'), false, 'holds is exact')
  // changed by changes-5: a reply that starts with a closed <think> block is no reply too (talk-live-2 cut it first)
  assert.equal(noReply('<think>hmm</think>mem'), true)
  assert.equal(noReply('a <think>b</think> c'), false)
})

test('changes-5 no_reply runs on every call before anything else: a first call, a pick call or a writer that sends it ends the turn as thinking', async () => {
  for (const [mode, answers] of [['ai_writes', ['Thought process: the person']], ['ai_writes', ['sch1', 'x **Request:** y']], ['ai_picks_line', ['sch1', '<think>sch1</think>sch1']], ['ai_writes', ['sch1', '**Analysis** USED: sch1']]]) {
    let n = 0
    const request = async () => ({ text: answers[n++] })
    const st = freshVisit('open', {}, true)
    const { pre, out } = turnParts('can it fly a kite', st)
    const got = await askLive({ mode, text: 'can it fly a kite', pre, out, before: { last: null, lastKey: null }, request })
    assert.equal(got.thinking, true, answers.join(' / '))
    assert.equal(n, answers.length, 'no call after it')
  }
})

/* ---------- 2. c26, c27; never c25 ---------- */
const mine = c => [c26Fails(c.reply) ? 'c26' : null, ...c27Fails(c.reply, c.message).map(id => 'c27-' + id)].filter(Boolean)
const theirs = c => c.flags.filter(f => f === 'c26' || f.startsWith('c27-'))

test('changes-5 c26 and c27: check_c5.py\'s flags on every recorded reply its run judged, and on the Builder\'s own cases', () => {
  const all = [...C5.recorded_checks, ...C5.own_checks]
  assert.ok(C5.recorded_checks.length >= 70, `${C5.recorded_checks.length} recorded replies`)
  for (const c of all) assert.deepEqual(mine(c), theirs(c), `${c.message} -> ${c.reply}`)
  const flagged = all.filter(c => theirs(c).length)
  assert.ok(flagged.some(c => theirs(c).includes('c26')) && ['money', 'choice', 'next'].every(k => flagged.some(c => theirs(c).includes('c27-' + k))), 'every check and class bites at least once')
})

test('changes-5: c25 is not built: the replies check_c5.py drops only by c25 pass every check of the plugin', () => {
  const rows = ['msg0', 'msg1', 'msg2', 'mem0', 'mem1', 'web0'].filter(id => LIVE_ROW[id]).map(id => ({ id, text: LIVE_ROW[id].text }))
  const onlyC25 = C5.own_checks.filter(c => c.flags.length === 1 && c.flags[0] === 'c25(not adopted)')
  assert.ok(onlyC25.length >= 6)
  for (const c of onlyC25) assert.deepEqual(mine(c), [], c.reply)
  // hhcontent's three \"all right, all dropped\" examples, through the whole check list with rows that hold their words
  const msg = rows.filter(r => /^msg/.test(r.id))
  const flags = replyFlags('You can chat with Hermes from apps like Telegram, WhatsApp or Slack.', msg, ['msg0'], { message: 'can I talk to my hermes from my phone?' })
  assert.ok(!flags.some(f => /^c2[5-7]/.test(f)), flags.join(', '))
  assert.equal(LIVE_JSON.checks_c5.list.find(c => c.id === 'c25').adopted, false)
})

test('changes-5: c26 and c27 come after c24 in the list of failed checks, and either gives the fallback', () => {
  const rows = [{ id: 'COST', text: LIVE_ROW.COST.text }]
  const flags = replyFlags('You run a bakery, and the person asks about Hermes.', rows, ['COST'], { message: 'how much does it cost', work: 'I teach' })
  const at = p => flags.findIndex(f => f.startsWith(p))
  assert.ok(at('c24') >= 0 && at('c26') > at('c24') && at('c27') > at('c26'), flags.join(', '))
  assert.equal(at('c27'), flags.length - 1)
  const j = judgeWritten('A model is the AI that does the thinking.\nUSED: mod0', [{ id: 'mod0', text: LIVE_ROW.mod0.text }], { message: "what's the best AI model for a total beginner" })
  assert.deepEqual(j.fail, 'c27 choice')
  const k = judgeWritten('Checked facts say a model is the AI that does the thinking.\nUSED: mod0', [{ id: 'mod0', text: LIVE_ROW.mod0.text }], { message: 'what is a model' })
  assert.match(k.fail, /^c26 /)
})

test('changes-5 c27 reads only the newest message: a follow-up "how?" is never judged by it', () => {
  assert.deepEqual(c27Fails('Open Settings, then Keys.', 'how?'), [])
  assert.deepEqual(c27Fails('Hermes can do jobs on a schedule.', 'ok and then?'), ['next'])
})

test('changes-5: the build stops when checks_c5 or slow_ai is missing, or c26/c27 is not adopted', () => {
  assert.deepEqual(liveProblems(LIVE_JSON, TALK_JSON, WANTS_JSON, 'ai_writes'), [])
  const drop = f => {
    const copy = JSON.parse(JSON.stringify(LIVE_JSON))
    f(copy)
    return liveProblems(copy, TALK_JSON, WANTS_JSON, 'ai_writes')
  }
  assert.ok(drop(x => delete x.checks_c5).length)
  assert.ok(drop(x => delete x.slow_ai).length)
  assert.ok(drop(x => (x.checks_c5.list = x.checks_c5.list.filter(c => c.id !== 'c27'))).length)
  assert.ok(drop(x => (x.checks_c5.list.find(c => c.id === 'c26').adopted = false)).length)
  assert.ok(drop(x => (x.slow_ai.variants = x.slow_ai.variants.filter(v => v.id !== 'SLOW_A'))).length)
})

/* ---------- 4. the slow-AI line's words ---------- */
test('changes-5 slow_ai: Lead\'s pick SLOW_A, word for word, with the data\'s text to paste', () => {
  const a = LIVE_JSON.slow_ai.variants.find(v => v.id === 'SLOW_A')
  assert.equal(SLOW.line, 'SLOW_A')
  assert.equal(SLOW.text, 'Your AI took too long to answer, so I answered from my own notes. To make it quicker for me, paste this into a new chat with your Hermes.')
  assert.equal(SLOW.text, a.text)
  assert.equal(SLOW.paste, LIVE_JSON.slow_ai.paste_text)
})

test('review: SLOW_A waits after every don\'t-know line (N1-skill and MEAN_NONE too), a stuck or goodbye line, and a line with its own text to paste; it follows an answer', () => {
  const due = { slow: 'due' }
  const said = (kind, extra = {}) => lineFor({ kind, ...extra }, freshVisit('open', {}, true), 'build me a website', {})
  for (const k of ['N1', 'N1a', 'N1_AGAIN', 'AGAIN', 'MEAN_NONE', 'skill by name', 'STUCK', 'STUCK_SAME', 'BYE', 'H1', 'H2']) assert.equal(slowFollows(due, said(k)), false, k)
  assert.equal(said('skill by name').line, 'N1-skill')
  for (const k of ['THANKS', 'OK', 'CUT']) assert.equal(slowFollows(due, said(k)), true, k)
  assert.equal(slowFollows({ slow: 'said' }, said('THANKS')), false)
  assert.equal(slowFollows({ slow: null }, said('THANKS')), false)
})

/* ---------- 5. "update" ---------- */
test('changes-5 sch1: "how do I update hermes" is N1 from code (no row by key words); the schedule still has every/daily/morning updates', () => {
  for (const t of ['how do I update hermes', 'how do I update hermes to the newest version']) {
    const st = freshVisit('open', {}, true)
    st.stage = 'done'
    const { pre, out } = turnParts(t, st)
    assert.equal(out.kind, 'N1', t)
    // N1 is in code_answers.go_to_ai: with an AI step the first call picks a subject (changes-5 point 5); no AI step: no call
    assert.equal(goesToAi(pre), true)
  }
  for (const t of ['send me an update every morning', 'can hermes give me a daily update on the news']) {
    const st = freshVisit('open', {}, true)
    st.stage = 'done'
    const { out } = turnParts(t, st)
    assert.deepEqual([out.kind, out.topic, out.need], ['row', 'sch', 'sch1'], t)
  }
})

/* ---------- 6. text to type ---------- */
test('look: text to type is a /command, or a quoted phrase in a line that says "type"; a quoted button name is not', () => {
  assert.deepEqual(typedParts('In a Hermes chat, not here, type /usage and send it.'), ['In a Hermes chat, not here, type ', { typed: '/usage' }, ' and send it.'])
  assert.deepEqual(typedParts('To see what I can help with, type \u201cwhat can I ask you\u201d.'), ['To see what I can help with, type \u201c', { typed: 'what can I ask you' }, '\u201d.'])
  assert.deepEqual(typedParts('Sorry, I was not clear. Type the word you want explained, like "what is a skill".'), ['Sorry, I was not clear. Type the word you want explained, like "', { typed: 'what is a skill' }, '".'])
  assert.equal(typedParts('For a fresh chat, click \u201cNew session\u201d at the top left.'), null)
  assert.equal(typedParts('Pick one, or type your own question.'), null)
  assert.equal(typedParts('Files live in /home or C:/Users.'), null, 'a path is not a command')
  // the word-by-word pace takes a quoted phrase to type as one word, so it appears whole
  assert.deepEqual(wordsOf('To see what I can help with, type "what can I ask you".').slice(-2), ['type', '"what can I ask you".'])
  assert.deepEqual(wordsOf('click "New session" at the top').slice(1, 3), ['"New', 'session"'])
})
