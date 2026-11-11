// talk-live-2 (Lead's job of 11 Nov 2026, 04:40 UTC): the Builder's own cases for what route2.py does not hold.
//   changes-3: the plugin's own kinds \"again\" brings back (a wants row, a skill line, a written reply); \"again\" and its
//              lines never go to the AI; STUCK as a follow-up; the who group's ai_line by mode. route2.py's 38 lc3
//              cases are replayed by tests/talk.test.mjs from tests/fixtures/route2-conversations.json.
//   changes-4: route2.py does not hold the keep rule (changes-4: \"route2.py and the plugin still keep nothing at What
//              do you do?\"), so these cases are written here from content/helper-talk-live-v2-changes-4.md and
//              apply_c4_check.py (its keep() cases and its 14 c24 replies, with their expected values as written there).
//   hhtech-weak-ai, For builder: thinking text is no reply.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import * as TALK from '../src/talk.js'
import { TALK_DATA } from '../src/talk-data.js'
import { LIVE_DATA } from '../src/live-data.js'
import { AI_MODE } from '../src/ai-mode.js'
import { cleanKept, keptToStore } from '../src/kept.js'
import { renderKept, readBox, saveBox } from '../src/settings-file.js'
import { writerText, pickText, firstCallText, workLine, sendable } from '../src/live-request.js'
import { c24Fails, replyFlags, isThinking } from '../src/live-checks.js'
import { askLive, goesToAi, liveWhyNot, liveApply } from '../src/live-turn.js'
import { isFollowUp } from '../src/live-rows.js'

const { freshVisit, laterVisit, turn, turnParts, lineFor, keptRows, forgetAnswer, pickWant } = TALK
const WK = TALK_DATA.keeps.work
const AI_LINE = LIVE_DATA.lines_by_mode.are_you_an_ai[AI_MODE]
const WORK_TOLD = LIVE_DATA.lines_by_mode.work_told[AI_MODE]

// a visit at \"What do you do?\" (the name already given), as F1 leaves it
const atWork = (kept = { name: 'Peter', told: true }) => Object.assign(freshVisit('work', { ...kept }, true), { name: kept.name || null })
const say = (st, ...msgs) => msgs.map(m => turn(m, st))

/* ---------- changes-3 ---------- */
test('changes-3 again: a wants row comes back exactly as it was, with its button; a second again gives AGAIN', () => {
  const st = freshVisit('open', {}, true)
  const first = pickWant('w_web', st)
  assert.equal(first.kind, 'want')
  const a1 = lineFor(first, st)
  turn('thanks', st)
  const back = turn('again', st)
  assert.equal(back.kind, 'want')
  assert.equal(back.row, 'w_web')
  assert.equal(back.by_again, true)
  const a2 = lineFor(back, st)
  assert.deepEqual([a2.line, a2.text, JSON.stringify(a2.next)], [a1.line, a1.text, JSON.stringify(a1.next)])
  assert.equal(a2.note, null, 'no grey Kept: line')
  assert.equal(turn('again', st).kind, 'AGAIN', '(2): the line just before was itself brought back by again')
})

test('changes-3 again: right after a brought-back line gives AGAIN; with nothing answered yet MEAN_NONE, then AGAIN', () => {
  const st = freshVisit('open', {}, true)
  assert.deepEqual(say(st, 'what is a skill', 'again', 'again').map(o => o.kind), ['term', 'term', 'AGAIN'])
  const st2 = freshVisit('open', {}, true)
  assert.deepEqual(say(st2, 'again', 'again').map(o => o.kind), ['MEAN_NONE', 'AGAIN'])
})

test('changes-3 again: a skill line (skill by name) comes back; a written reply comes back word for word with no call', () => {
  const st = freshVisit('open', {}, true)
  const sk = turn('is there a github skill', st)
  assert.ok(['skill', 'want'].includes(sk.kind), sk.kind)
  turn('ok', st)
  const back = turn('repeat that', st)
  assert.equal(back.kind, sk.kind)
  assert.equal(lineFor(back, st).text, lineFor(sk, st).text)
  // a written reply, noted as the page notes it (src/live-turn.js liveApply)
  const st2 = freshVisit('open', {}, true)
  TALK.noteLast(st2, { kind: 'written', text: 'Long chats use the most tokens. Start a fresh one.', used: ['use1'] })
  turn('thanks', st2)
  const parts = turnParts('once more', st2)
  assert.equal(parts.out.kind, 'written')
  assert.equal(parts.out.text, 'Long chats use the most tokens. Start a fresh one.')
  assert.equal(goesToAi(parts.pre), false, 'again is code\'s, never the AI\'s')
})

test('changes-3: nothing from kind again reaches the AI, not even MEAN_NONE or AGAIN; STUCK does, as a follow-up after rows', () => {
  for (const msgs of [['again'], ['again', 'again'], ['what is a skill', 'what is a skill', 'again', 'again']]) {
    const st = freshVisit('open', {}, true)
    let parts
    for (const m of msgs) parts = turnParts(m, st)
    assert.equal(parts.pre.by_again, true)
    assert.equal(goesToAi(parts.pre), false, msgs.join(' / '))
    assert.equal(liveWhyNot({ mode: 'ai_writes', pre: parts.pre, text: msgs.at(-1), status: { state: 'ok' } }), 'code answered')
  }
  const st = freshVisit('open', {}, true)
  turn('how does memory work?', st)
  turn('things about me', st)
  const before = { last: st.last, lastKey: st.lastKey, liveRows: null }
  const parts = turnParts("that didn't work", st)
  assert.equal(parts.out.kind, 'STUCK')
  assert.equal(goesToAi(parts.pre), true)
  assert.equal(isFollowUp("that didn't work", parts.pre, before), true)
  const st2 = freshVisit('open', {}, true)
  turn('thanks', st2)
  const b2 = { last: st2.last, lastKey: st2.lastKey, liveRows: null }
  assert.equal(isFollowUp("that didn't work", turnParts("that didn't work", st2).pre, b2), false, 'after small talk: no follow-up')
})

test('changes-3: who are you twice gives the line of this build (no_repeat group who, ai_line)', () => {
  const st = freshVisit('open', {}, true)
  const [a, b] = say(st, 'who are you', 'who are you?')
  assert.equal(a.kind, 'WHO')
  assert.equal(b.kind, AI_LINE)
  assert.equal(lineFor(b, st).text, TALK_DATA.fixed[AI_LINE].text)
})

test('changes-3: phone as a verb is not the chat apps; an amount of money is COST', () => {
  assert.equal(turn('can hermes phone my dentist for me', freshVisit('open', {}, true)).kind, 'N1')
  assert.equal(turn('can I use hermes on my phone?', freshVisit('open', {}, true)).kind, 'question')
  assert.equal(turn('how much money will the AI cost me per month', freshVisit('open', {}, true)).kind, 'COST')
  assert.equal(turn('it costs me too much, how do I spend less', freshVisit('open', {}, true)).need, 'use2')
})

/* ---------- changes-4: the keep rule (keeps.work steps 1 to 7) ---------- */
// apply_c4_check.py keep()'s nine cases, as the person's reply to \"What do you do?\"
const KEEP_CASES = [
  ['I run a tennis club', 'kept: I run a tennis club'],
  ["I'm a nurse.", "kept: I'm a nurse"],
  ['nothing', 'F3'],
  ['rather not say', 'F3'],
  ['what is a skill?', 'question'],
  ['my password is hunter2', 'WORK_SECRET'],
  // apply_c4_check.py's key case: a key is step 1 (K1) here, before the secret step; nothing kept either way
  ['sk-ant-abcdefghijklmnop1234567890', 'K1'],
  ['I am a primary school teacher and I also coach the under twelve football team on weekends', 'WORK_LONG'],
  ['4111 1111 1111 1111', 'WORK_SECRET']
]
for (const [text, want] of KEEP_CASES) {
  test(`changes-4 keep rule: \"${text}\" at What do you do? -> ${want}`, () => {
    const st = atWork()
    const o = turn(text, st)
    if (want.startsWith('kept: ')) {
      assert.equal(o.kind, 'F2')
      assert.equal(st.kept.work, want.slice(6))
      assert.deepEqual(o.kept, ['work'])
      assert.equal(st.stage, 'open')
    } else {
      assert.equal(st.kept.work, undefined, 'nothing kept')
      if (want === 'question') {
        assert.notEqual(o.kind, 'F2')
        assert.equal(st.stage, 'open')
      } else assert.equal(o.kind, want)
    }
  })
}

test('changes-4 keep rule: too long twice: WORK_LONG (the question stays open), then WORK_LONG_2 and nothing kept', () => {
  const st = atWork()
  const long = 'I am a primary school teacher and I also coach the under twelve football team on weekends'
  assert.equal(turn(long, st).kind, 'WORK_LONG')
  assert.equal(st.stage, 'work')
  assert.equal(lineFor({ kind: 'WORK_LONG' }, st).text, WK.lines.WORK_LONG)
  assert.equal(turn(long + ' too', st).kind, 'WORK_LONG_2')
  assert.equal(st.stage, 'open')
  assert.equal(st.kept.work, undefined)
  // 81 characters in fewer words is too long as well
  const st2 = atWork()
  assert.equal(turn('I build extraordinarily complicated multidisciplinary infrastructure optimisation', st2).kind, 'WORK_LONG')
})

test('changes-4 keep rule: a topic word is an ordinary message unless it starts like \"I run\"; a non-answer is F3', () => {
  const st = atWork()
  const o = turn('telegram', st)
  assert.notEqual(o.kind, 'F2')
  assert.equal(st.kept.work, undefined)
  const st2 = atWork()
  assert.equal(turn('I run a tennis club and use telegram', st2).kind, 'F2')
  assert.equal(st2.kept.work, 'I run a tennis club and use telegram')
  for (const w of ['idk', 'not sure', 'skip', 'ok']) {
    const s = atWork()
    assert.equal(turn(w, s).kind, 'F3', w)
    assert.equal(s.kept.work, undefined)
  }
})

test('changes-4: F2 says Kept: under it; the first time, the line that the AI is told (AI builds only)', () => {
  const st = atWork()
  const o = turn('I run a tennis club', st)
  const said = lineFor(o, st)
  assert.equal(said.text, 'Thanks, Peter. Ask me anything about Hermes.')
  assert.equal(said.note.text, 'Kept: I run a tennis club.')
  assert.equal(said.note.workTold || null, WORK_TOLD)
  if (AI_MODE === 'no_ai_step') assert.equal('workTold' in said.note, false)
  else assert.equal(said.note.workTold, 'I also tell your AI what you do when I ask it for help.')
  // the mark only where the line shows (review): a record carried into an AI build still gets the line once
  assert.equal(st.kept.told_work, WORK_TOLD ? true : undefined)
  // kept anew after a change: no second told line
  const o2 = turn("I'm a teacher now", st)
  assert.equal(o2.kind, 'F2')
  assert.equal(lineFor(o2, st).note.workTold, undefined)
})

test('changes-4 typed change: the six examples of keeps.work.typed_change', () => {
  const cases = [
    ["I'm a teacher now", "I'm a teacher"],
    ['actually I run a bakery now', 'I run a bakery'],
    ["I'm a bit lost now", null],
    ["I don't run the club anymore", null],
    ["I'm a teacher now, can Hermes mark homework?", null],
    ["I'm a teacher", null]
  ]
  for (const [text, want] of cases) {
    const st = laterVisit({ name: 'Peter', work: 'I run a tennis club', told: true, told_work: true }, true)
    const o = turn(text, st)
    if (want) {
      assert.equal(o.kind, 'F2', text)
      assert.equal(st.kept.work, want, text)
      assert.equal(lineFor(o, st).note.text, `Kept: ${want}.`)
    } else {
      assert.notEqual(o.kind, 'F2', text)
      assert.equal(st.kept.work, 'I run a tennis club', text)
    }
  }
  // nothing kept yet: kept now
  const st = laterVisit({ name: 'Peter', told: true }, true)
  assert.equal(turn("I'm a nurse these days", st).kind, 'F2')
  assert.equal(st.kept.work, "I'm a nurse")
})

test('changes-4: "change what I do" asks WORK_ASK, and the reply goes through steps 1 to 7', () => {
  const st = laterVisit({ name: 'Peter', work: 'I run a tennis club', told: true, told_work: true }, true)
  const q = turn('change what I do', st)
  assert.equal(q.kind, 'WORK_ASK')
  assert.equal(lineFor(q, st).text, 'What do you do now?')
  assert.equal(st.stage, 'work')
  const f2 = turn('I teach piano', st)
  assert.equal(f2.kind, 'F2')
  assert.equal(st.kept.work, 'I teach piano')
  // review: on a later visit F2 greets by the kept name
  assert.equal(lineFor(f2, st).text, 'Thanks, Peter. Ask me anything about Hermes.')
  // review: the ask-again words typed again at that question are no answer, never kept as the job
  const st2 = laterVisit({ name: 'Peter', work: 'I run a tennis club', told: true }, true)
  turn('change what I do', st2)
  assert.equal(turn('change what I do', st2).kind, 'F3')
  assert.equal(st2.kept.work, 'I run a tennis club')
})

test('review: a typed change with a word of keeps.typed_change.not_words is not taken', () => {
  const st = laterVisit({ name: 'Peter', work: 'I run a tennis club', told: true }, true)
  turn("I'm a teacher now, I stopped nursing", st)
  assert.equal(st.kept.work, 'I run a tennis club')
})

test('review: a work value that holds the kept name is not sent; the c23 flag comes before the c24 flag', () => {
  assert.equal(workLine("Peter's bakery, I run it", ['Peter']), null)
  assert.equal(workLine("Peter's bakery, I run it", ['peter']), null)
  assert.equal(workLine('I run a bakery', ['Peter']), 'What the person does (they told Helper): I run a bakery')
  assert.doesNotMatch(writerText(['use1'], "Peter's bakery, I run it", ['Peter']), /bakery|Peter/)
  const rows = [{ id: 'use1', text: HAND_USE.slice(7) }]
  const f = replyFlags('As a coach, start a new chat.', rows, ['use1'], { message: 'x', lastLine: 'As a coach, start a new chat.' })
  assert.deepEqual(f.filter(x => /^c2[34]/.test(x)).map(x => x.slice(0, 3)), ['c23', 'c24'])
})

test('review: an answer to What do you do? that was not kept (too long, looking secret) is not sent later', () => {
  for (const kind of ['WORK_LONG', 'WORK_LONG_2', 'WORK_SECRET']) assert.equal(sendable({ kind }).you, false, kind)
  assert.equal(sendable({ kind: 'N1' }).you, true)
})

test('changes-4: the list shows What you do second; forget what I do asks, then deletes it (and its told mark)', () => {
  const kept = { name: 'Peter', work: 'I run a tennis club', mod: 'mod1', told: true, told_work: true }
  assert.deepEqual(keptRows(kept).slice(0, 3), ['Your name: Peter', 'What you do: I run a tennis club', 'Paying for an AI: you pay for ChatGPT'])
  const st = laterVisit(kept, true)
  const q = turn('forget what I do', st)
  assert.deepEqual([q.kind, q.what], ['A2', 'work'])
  assert.equal(lineFor(q, st).text, 'Delete what you told me you do?')
  forgetAnswer('work', true, st)
  assert.equal(st.kept.work, undefined)
  assert.equal(st.kept.told_work, undefined)
  assert.equal(st.kept.name, 'Peter')
})

test('changes-4: the stored record keeps work only within the rule (an older build or a hand-edited store)', () => {
  assert.deepEqual(cleanKept({ work: 'I run a tennis club', told_work: true }), { work: 'I run a tennis club', told_work: true })
  for (const bad of ['what do you do?', 'one two three four five six seven eight nine ten eleven twelve thirteen', 'x'.repeat(81), 'my password is hunter2', 'sk-abcdefghijklmnopqrstuvwxyz123456', '', 5])
    assert.equal(cleanKept({ work: bad, told_work: true }).work, undefined, String(bad))
  assert.equal(cleanKept({ name: 'Peter', told_work: true }).told_work, undefined, 'told_work only with work')
  assert.deepEqual(keptToStore({ work: 'I teach' }), { work: 'I teach' })
})

test('changes-4 settings page: the What you do line, its reason by mode; read back by its labels and value rule', () => {
  const reason = AI_MODE === 'no_ai_step' ? 'you told Helper this' : 'Helper tells your AI this when it asks for help'
  assert.equal(renderKept({ name: 'Peter', work: 'I run a tennis club', mod: 'mod1' }), `Name: Peter (Helper greets you with it)\nWhat you do: I run a tennis club (${reason})\nPaying for an AI: ChatGPT (so Helper does not ask again)`)
  for (const label of ['What you do', 'what i do', 'Work', 'my job', 'job']) assert.deepEqual(readBox(`${label}: I teach piano`), { result: 'read', record: { work: 'I teach piano' } }, label)
  for (const v of ['do I teach?', 'I teach piano and violin to kids, at the music school, in Riga, on most weekdays', 'I build extraordinarily complicated multidisciplinary infrastructure optimisation']) {
    const r = readBox(`What you do: ${v}`)
    assert.equal(r.result, 'refused', v)
    assert.equal(r.why, 'work_value')
    assert.equal(r.message[2], TALK_DATA.keeps.settings_file.why.work_value)
  }
  assert.equal(readBox('What you do: a\nJob: b').why, 'twice')
  // dropping the line is forgetting one thing
  const s = saveBox({ name: 'Peter', work: 'I teach', told: true }, 'Name: Peter')
  assert.equal(s.result, 'ask')
  assert.equal(s.count, 1)
  // the box written back reads back the same
  assert.deepEqual(readBox(renderKept({ work: 'I run a tennis club' })).record, { work: 'I run a tennis club' })
})

/* ---------- changes-4: what is sent ---------- */
test('changes-4 request: the work line sits right before Checked facts (writer) and before the lines (pick); none with nothing kept; never in the first call', () => {
  const W = 'What the person does (they told Helper): I run a tennis club'
  const w = writerText(['use1'], 'I run a tennis club')
  assert.ok(w.includes(W + '\nChecked facts:'), w)
  const p = pickText(['use1'], 'I run a tennis club')
  assert.ok(p.includes('\n' + W + '\n'), p)
  for (const t of [writerText(['use1']), pickText(['use1']), writerText(['use1'], null)]) {
    assert.doesNotMatch(t, /work_line|What the person does \(|\n\n/)
  }
  assert.doesNotMatch(firstCallText(), /What the person does|tennis/)
  // the guard: a value that fails the rule is left out
  for (const bad of ['my password is hunter2', 'sk-abcdefghijklmnopqrstuvwxyz123456', 'one two three four five six seven eight nine ten eleven twelve thirteen', 'x'.repeat(81)]) assert.equal(workLine(bad), null, bad)
  assert.equal(workLine('I run a tennis club'), W)
})

test('changes-4 request: with a kept name and work, the writer gets the work line, the first call does not, and no request holds the name', async () => {
  const asks = []
  const request = async (m, params) => {
    asks.push(params)
    return { text: asks.length === 1 ? 'sch' : 'NONE' }
  }
  const st = laterVisit({ name: 'Peter', work: 'I run a tennis club', told: true }, true)
  const { pre, out } = turnParts('what should I set up first', st)
  await askLive({ mode: 'ai_writes', text: 'what should I set up first', pre, out, before: { last: 'BACK', lastKey: null }, lines: ['Helper: Hi again. What would you like Hermes to help you with?'], request, work: st.kept.work })
  assert.equal(asks.length, 2)
  assert.doesNotMatch(asks[0].instructions, /tennis/)
  assert.match(asks[1].instructions, /What the person does \(they told Helper\): I run a tennis club\nChecked facts:/)
  for (const a of asks) assert.doesNotMatch(JSON.stringify(a), /peter/i)
  assert.doesNotMatch(asks[1].input, /tennis/, 'the work value goes in the instructions only')
})

/* ---------- changes-4: c24 (apply_c4_check.py's 14 replies) ---------- */
const HAND_USE = '[use1] Start a new chat for each new task, so Hermes reads less of the old one and uses fewer tokens, the pieces of words AI counts.'
const HAND_FIRST = '[mod1] First Hermes needs an AI to think with. [msg1] Telegram lets you message your Hermes from your phone.'
const C24 = [
  ['Start a new chat for each new task. Hermes then reads less and uses fewer tokens, the pieces of words AI counts.', 'how can I use less tokens', HAND_USE, false],
  ['As a tennis club owner, start a new chat for each task to use fewer tokens, the pieces of words AI counts.', 'how can I use less tokens', HAND_USE, true],
  ['For your club members, start a new chat for each task.', 'how can I use less tokens', HAND_USE, true],
  ['You run a busy club, so start a new chat for each task.', 'how can I use less tokens', HAND_USE, true],
  ['For your tennis club, start a new chat for each task to use fewer tokens, the pieces of words AI counts.', 'how can I use less tokens', HAND_USE, false],
  ['First Hermes needs an AI to think with. Then you can message it from your phone with Telegram.', 'what should I set up first', HAND_FIRST, false],
  ['For your coaching schedule, first Hermes needs an AI to think with.', 'what should I set up first', HAND_FIRST, true],
  ['Since you manage bookings, first Hermes needs an AI to think with.', 'what should I set up first', HAND_FIRST, true],
  ["You're welcome. Ask me anything about Hermes.", 'thanks', '', false],
  ['Your players could message your Hermes from your phone.', 'what should I set up first', HAND_FIRST, true],
  ['As a coach, first Hermes needs an AI to think with.', 'what should I set up first', HAND_FIRST, true],
  ['Your own Hermes needs an AI to think with first.', 'what should I set up first', HAND_FIRST, false],
  ['You are new here, so first Hermes needs an AI to think with.', 'what should I set up first', HAND_FIRST, false],
  ['In your tennis club, Telegram lets you message your Hermes from your phone.', 'what should I set up first', HAND_FIRST, false]
]
test('changes-4 c24: apply_c4_check.py\'s 14 written replies, kept \"I run a tennis club\": 14 of 14 as hhcontent expects', () => {
  for (const [reply, msg, hand, fails] of C24) assert.equal(!!c24Fails(reply, 'I run a tennis club', msg, hand), fails, reply)
})
test('changes-4 c24 runs after c23, with or without a kept value', () => {
  const rows = [{ id: 'use1', text: HAND_USE.slice(7) }]
  const f = replyFlags('As a coach, start a new chat for each task.', rows, ['use1'], { message: 'how can I use less tokens', work: null })
  assert.match(f.at(-1), /^c24 /)
  assert.deepEqual(replyFlags('For your tennis club, start a new chat for each task.', rows, ['use1'], { message: 'how can I use less tokens', work: 'I run a tennis club' }), [])
})

/* ---------- hhtech-weak-ai: thinking text is no reply ---------- */
test('review: when the AI\'s line replaces a fallback that was an answer line, "again" finds the answer before, never the fallback that was not shown', () => {
  const st = freshVisit('open', {}, true)
  turn('how does memory work?', st)
  assert.equal(turn('things about me', st).need, 'mem1') // a row: the last answer
  const before = { last: st.last, lastKey: st.lastKey, liveRows: null, lastAnswer: st.lastAnswer, lastAnswerKey: st.lastAnswerKey }
  const { pre, out } = turnParts('what do you mean?', st)
  assert.deepEqual([pre.kind, pre.why], ['plain', 'what do you mean']) // code's fallback, an answer line, goes to the AI
  // the AI answered instead with the hand-over line (H1), which again never brings back
  const shown = liveApply(st, { result: { kind: 'H1', why: 'ai' }, rows: [] }, out, before, 'what do you mean?')
  assert.equal(shown.kind, 'H1')
  const back = turn('again', st)
  assert.deepEqual([back.kind, back.need], ['row', 'mem1'], 'the row shown before, not the plain line that never showed')
})

test('weak AI: an unclosed <think>, text starting \"Thinking Process\", or holding \"**Analyze\" is thinking; a closed block and a plain reply are not', () => {
  for (const s of ['<think>Okay, the user', 'ok <think> hmm', 'Thinking Process:\n\n1.  **Analyze the Request:**\n    *   **Task:**', '  Thinking Process: 1.', 'Sure. 1. **Analyze the request', 'mem\n**Analyze**'])
    assert.equal(isThinking(s), true, s)
  // a closed block is cut first, whatever it holds (review)
  for (const s of ['<think>hmm</think>mem', '<think>Thinking Process: 1. **Analyze**</think>Real answer.', 'mem', 'Long chats use the most tokens.\nUSED: use1', 'I was thinking process steps', ''])
    assert.equal(isThinking(s), false, s)
})

test('weak AI: a first call or a writer that sends thinking text gives the fallback and says so (thinking)', async () => {
  for (const answers of [['Thinking Process:\n\n1.  **Analyze the Request:**'], ['sch', '<think>The person asks about']]) {
    let n = 0
    const request = async () => ({ text: answers[n++] })
    const st = freshVisit('open', {}, true)
    const { pre, out } = turnParts('what should I set up first', st)
    const got = await askLive({ mode: 'ai_writes', text: 'what should I set up first', pre, out, before: { last: null, lastKey: null }, request })
    assert.equal(got.thinking, true, answers.join(' / '))
    assert.ok(got.fallback)
    assert.equal(n, answers.length, 'no call after the thinking text')
  }
})

test('weak AI: a reply that sits on the USED: line falls back, and is not thinking', async () => {
  const request = async () => ({ text: 'USED: msg0, msg1. You can chat with Hermes from apps like Telegram.' })
  const st = freshVisit('open', {}, true)
  turn('can I use it on telegram', st)
  const before = { last: st.last, lastKey: st.lastKey, liveRows: null }
  const { pre, out } = turnParts('ok and then?', st)
  const got = await askLive({ mode: 'ai_writes', text: 'ok and then?', pre, out, before, request })
  assert.ok(got.fallback)
  assert.notEqual(got.thinking, true)
})

test('weak AI: the AI step is off for the rest of the visit once marked (liveWhyNot)', () => {
  const st = freshVisit('open', {}, true)
  const { pre } = turnParts('what should I set up first', st)
  assert.equal(liveWhyNot({ mode: 'ai_writes', pre, text: 'x', status: { state: 'ok' } }), null)
  assert.equal(liveWhyNot({ mode: 'ai_writes', pre, text: 'x', status: { state: 'ok' }, off: true }), 'AI off for this visit')
})

test('weak AI: the page never reads config.get "full" (it returns the whole config.yaml, keys included)', () => {
  const src = path.resolve(import.meta.dirname, '..', 'src')
  const files = [...fs.readdirSync(src).map(f => path.join(src, f)), path.resolve(import.meta.dirname, '..', 'desktop', 'plugin.js')]
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8')
    assert.doesNotMatch(t, /config\.get\s*['"(,]?\s*\{?\s*key:\s*['"]full/, f)
    assert.doesNotMatch(t, /key\s*:\s*['"]full['"]/, f)
  }
})
