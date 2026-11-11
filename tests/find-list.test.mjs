// find-v1, part 4 (Lead, 11 Nov; hhtech find-run "W1x", dev/checks/hhtech-find-run/find.mjs LIST_CALL, readList,
// askList): when code's own words are not sure of a line, ONE call hands the person's AI the list of all fact lines as
// id = title and takes up to three ids, NONE or BUILD (max_tokens 30). The writer then gets those lines, each with its
// next line, at most five, and its reply goes through every check. Code's line, or the don't-know with its offer, is
// the fallback. This replaces the first call that picked a subject word.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askLive, goesToAi, liveApply } from '../src/live-turn.js'
import { listCallText, writerText, LIST_MAX_TOKENS } from '../src/live-request.js'
import { readList } from '../src/live-checks.js'
import { LIVE_ROW, LIST_LINES, followRows } from '../src/live-rows.js'
import { LIVE_DATA } from '../src/live-data.js'
import { TALK_DATA } from '../src/talk-data.js'
import { turnParts, freshVisit, lineFor, TITLED, pick, pressNear, pressOffer } from '../src/talk.js'
import { pastOpening, send, press, settle, finish, dots, bubbleLine, bubbleSaid, answerLine, allLines, labels, never } from './lib/talk-page.mjs'

const visit = () => freshVisit('open', {}, true)
const beforeOf = st => ({ last: st.last, lastKey: st.lastKey, liveRows: st.liveRows || null, lastAnswer: st.lastAnswer || null, lastAnswerKey: st.lastAnswerKey || null, lastOffer: st.lastOffer || null, lastTopic: st.lastTopic || null })
// one typed message through code and the AI step, with a stand-in that answers each call in turn
async function ask(st, text, replies, mode = 'ai_writes') {
  const before = beforeOf(st)
  const { pre, out } = turnParts(text, st)
  const calls = []
  const request = async (method, params) => {
    calls.push(params)
    const r = replies[calls.length - 1]
    if (r instanceof Error) throw r
    return { text: r === undefined ? 'NONE' : r }
  }
  const got = goesToAi(pre) ? await askLive({ mode, text, pre, out, before, request }) : null
  const shown = liveApply(st, got, out, before, text) || out
  return { pre, out, got, calls, shown, line: lineFor(shown, st, text) }
}
const good = id => `${LIVE_ROW[id].text}\nUSED: ${id}`

test('the list: every fact line once, as id = title with hhcontent\'s titles (182), and each of them is a row the writer can be handed', () => {
  assert.equal(LIST_LINES.length, 182)
  assert.equal(new Set(LIST_LINES.map(l => l.id)).size, 182)
  assert.deepEqual(LIST_LINES.map(l => l.title).sort(), TITLED.map(t => t.title).sort())
  for (const l of LIST_LINES) assert.ok(LIVE_ROW[l.id] && LIVE_ROW[l.id].text, l.id)
  // the fixed ones too, and the new fact lines
  for (const id of ['MIG_APP', 'MIG_PC', 'SAFE', 'HERMES', 'START', 'KEY_WHERE', 'd_windows', 'd_gateway', 'w_image', 'mem1', 'skill']) assert.ok(LIST_LINES.some(l => l.id === id), id)
  assert.equal(LIST_LINES.find(l => l.id === 'MIG_APP').title, 'Moving from Cursor, Claude Code, Codex or OpenClaw')
  assert.equal(LIVE_ROW.SAFE.text, TALK_DATA.fixed.SAFE.text)
  assert.deepEqual(LIVE_ROW.d_windows.shows, { kind: 'fact', need: 'd_windows' })
})

test('the list call\'s instructions are hhtech\'s LIST_CALL with the titles: Helper\'s own text, the same for every person and message', () => {
  const t = listCallText()
  assert.ok(t.startsWith('You find the right checked line for Helper, a part of the Hermes app that explains Hermes to newcomers.'))
  assert.match(t, /Reply with the ids of the lines that answer the message: at most three, the best first, separated by commas, and nothing else\./)
  assert.match(t, /reply with only the word NONE\./)
  assert.match(t, /reply with only the word BUILD\./)
  const lines = t.slice(t.indexOf('Lines:\n') + 7).split('\n')
  assert.deepEqual(lines, LIST_LINES.map(l => `${l.id} = ${l.title}`))
  assert.equal(LIST_MAX_TOKENS, 30)
  assert.equal(listCallText(), t)
  assert.ok(t.length < 12000, `${t.length} characters`)
})

test('readList: up to three known ids in the order given (any case, think blocks cut), else BUILD or NONE; a reply that starts with NONE or BUILD is that word', () => {
  assert.deepEqual(readList('HERMES'), { ids: ['HERMES'] })
  assert.deepEqual(readList('MIG_PC, d_backup_vs, d_export, d_windows'), { ids: ['MIG_PC', 'd_backup_vs', 'd_export'] })
  assert.deepEqual(readList('<think>maybe d_mac</think>\nmig_pc , MIG_PC'), { ids: ['MIG_PC'] })
  assert.deepEqual(readList('[d_windows]'), { ids: ['d_windows'] })
  assert.deepEqual(readList('NONE'), { word: 'NONE' })
  assert.deepEqual(readList('none.'), { word: 'NONE' })
  assert.deepEqual(readList('BUILD'), { word: 'BUILD' })
  assert.deepEqual(readList('I think zorbo_9'), { word: 'NONE' })
  assert.deepEqual(readList(''), { word: 'NONE' })
  // Builder: a wordy NONE must not be read as the word line "skill"
  assert.deepEqual(readList('NONE (no skill line fits)'), { word: 'NONE' })
  assert.deepEqual(readList('BUILD: the person wants a plugin installed'), { word: 'BUILD' })
})

test('which messages go to the list call: nothing found, a weak hit, and a line given from a subject word alone (the plain line, the subject\'s question, the nearest things); never a line code is sure of', () => {
  const pre = (text, st = visit()) => turnParts(text, st).pre
  for (const [text, kind] of [['do i need a credit card to try it', 'N1'], ['is chatgpt any good', 'question'], ['tell me about models', 'question'], ['can it print documents', 'N2']]) {
    const p = pre(text)
    assert.equal(p.kind, kind, text)
    assert.equal(goesToAi(p), true, text)
  }
  const st = visit()
  turnParts('tell me about memory', st)
  const plain = pre('tell me about memory stuff', st)
  assert.deepEqual([plain.kind, goesToAi(plain)], ['plain', true], 'the subject\'s plain line')
  // a plain line reached by a full hit of one of its phrases is code's own, unlike one given from a subject word alone
  assert.deepEqual((p => [p.kind, p.by, goesToAi(p)])(pre('which chat apps')), ['plain', 'title', false])
  for (const text of ['what is a model', 'does it work on windows', 'who made this', 'How can I migrate?', 'what is a skill', 'thanks', 'can it make pictures for me', 'build me a website', 'moving from cursor, can it take my rules']) assert.equal(goesToAi(pre(text)), false, text)
})

test('nothing found: ONE list call (max_tokens 30, the list), then the writer with the picked lines; the reply is shown after every check', async () => {
  const st = visit()
  const r = await ask(st, 'do i need a credit card to try it', ['FREE, COST', 'Hermes itself is free. The AI it uses can cost money, depending on which one you choose.\nUSED: COST'])
  assert.equal(r.calls.length, 2)
  assert.equal(r.calls[0].instructions, listCallText())
  assert.equal(r.calls[0].max_tokens, 30)
  assert.equal(r.calls[1].instructions, writerText(['FREE', 'COST']))
  assert.equal(r.calls[1].max_tokens, LIVE_DATA.writer.max_tokens)
  assert.deepEqual([r.shown.kind, r.line.text], ['written', 'Hermes itself is free. The AI it uses can cost money, depending on which one you choose.'])
  assert.equal(r.line.offer, undefined, 'the don\'t-know\'s offer is not under the AI\'s answer')
})

test('up to three ids, each with its next line, at most five rows handed', async () => {
  const st = visit()
  const r = await ask(st, 'do i need a credit card to try it', ['SAFE, msg1, use1, d_windows', 'NONE'])
  const handed = [...r.calls[1].instructions.matchAll(/^\[([A-Za-z0-9_-]+)\]/gm)].map(m => m[1])
  assert.equal(handed.length, 5)
  assert.deepEqual(handed.slice(0, 2), ['SAFE', 'SAFE-next'], 'a fixed line\'s next line comes with it')
  assert.ok(handed.includes('msg1') && handed.includes('msg1-then'))
  assert.ok(!handed.includes('d_windows'), 'the fourth id is not taken')
})

test('the fallback is code\'s line: when the list call says NONE, fails, gives thinking text, or a check drops the writer\'s reply; with nothing near, the don\'t-know and its four picks', async () => {
  for (const replies of [['NONE'], [new Error('boom')], ['Thinking Process:\n1. **Analyze'], ['FREE', 'Hermes costs 5 dollars a month.\nUSED: FREE'], ['FREE', 'NONE'], ['FREE', new Error('boom')]]) {
    const st = visit()
    const r = await ask(st, 'do i need a credit card to try it', replies)
    assert.equal(r.shown.kind, 'N1', JSON.stringify(replies).slice(0, 40))
    assert.deepEqual([r.line.line, r.line.offer.set], ['N1', 'start_four'])
    assert.equal(r.calls.length, replies.length)
  }
})

test('a subject word alone: the list call is asked, and code\'s own line (the subject\'s question with its picks) is the fallback', async () => {
  const st = visit()
  const none = await ask(st, 'tell me about models', ['NONE'])
  assert.equal(none.line.line, 'mod-q')
  assert.ok(none.line.answers.items.length >= 2)
  const st2 = visit()
  const yes = await ask(st2, 'tell me about models', ['mod0, d_default_ai', good('mod0')])
  assert.equal(yes.shown.kind, 'written')
  assert.equal(st2.pending, null, 'the open question is dropped when the AI answers')
})

test('BUILD from the list call: for a how or what question code\'s line (the don\'t-know with its offer); for a real request the copy box as now', async () => {
  const how = await ask(visit(), 'how do i get my money back from them', ['BUILD'])
  assert.deepEqual([how.shown.kind, how.calls.length], ['N1', 1])
  assert.ok(how.line.offer)
  const what = await ask(visit(), 'what happens to my goats then', ['BUILD'])
  assert.equal(what.shown.kind, 'N1')
  const req = await ask(visit(), 'my nephew needs the thing sorted today', ['BUILD'])
  assert.deepEqual([req.shown.kind, req.shown.why, req.calls.length], ['H1', 'ai', 1])
  assert.ok(req.line.paste, 'the copy box')
})

test('a follow-up is caught by code before the call: no list call, the writer gets the rows of the line before', async () => {
  const st = visit()
  await ask(st, 'does it work on windows', [])
  const r = await ask(st, 'what do you mean?', ['Hermes runs on Windows 10 and 11, and on Mac and Linux too.\nUSED: d_windows'])
  assert.equal(r.calls.length, 1)
  assert.notEqual(r.calls[0].instructions, listCallText())
  assert.match(r.calls[0].instructions, /^\[d_windows\] Yes\. Hermes runs on Windows 10 and 11\./m)
  assert.equal(r.shown.kind, 'written')
  // the rows of a written reply are the next follow-up's rows
  assert.deepEqual(followRows(beforeOf(st)), ['d_windows'])
})

test('lines a person picked never go to the AI: a pick under a question, under an offer and under the near offer are code\'s lines (no result of a pick reaches goesToAi)', () => {
  const st = visit()
  turnParts('tell me about models', st)
  assert.equal(pick('mod', 0, st).kind, 'row')
  const dk = turnParts('what about my chats history backup', st).out
  assert.equal(pressNear(dk.offer.picks[0], st).kind, dk.offer.picks[0].kind)
  assert.ok(pressOffer('can', st).kind)
})

test('with ai_picks_line the list call comes first too, and the AI then picks one of those lines', async () => {
  const st = visit()
  const r = await ask(st, 'do i need a credit card to try it', ['FREE, COST', 'FREE'], 'ai_picks_line')
  assert.equal(r.calls[0].instructions, listCallText())
  assert.deepEqual([r.shown.kind, r.line.line], ['FREE', 'FREE'])
})

test('nothing about the person is in the list call: with a name, what they do and kept answers, its instructions are the same text, and its input is only the lines that may be sent', async () => {
  const st = freshVisit('open', { name: 'Peter', work: 'I run a tennis club', mod: 'mod1' }, true)
  st.name = 'Peter'
  const before = beforeOf(st)
  const { pre, out } = turnParts('do i need a credit card to try it', st)
  const calls = []
  await askLive({ text: 'do i need a credit card to try it', pre, out, before, work: 'I run a tennis club', names: ['Peter'], request: async (m, p) => (calls.push(p), { text: 'NONE' }) })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].instructions, listCallText())
  assert.doesNotMatch(calls[0].instructions + calls[0].input, /peter|tennis/i)
  assert.equal(calls[0].input, "The person's newest message: do i need a credit card to try it")
})

/* ---------- on the built page ---------- */
test('on the built page: "do i need a credit card to try it": the dots, one list call and one writer call, then the AI\'s answer; the don\'t-know is not shown', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? 'COST' : 'Hermes itself is free. The AI it uses can cost money.\nUSED: COST') } })
  send(view, 'do i need a credit card to try it')
  assert.ok(dots(view))
  await settle()
  assert.equal(host.asks.length, 2)
  assert.equal(host.asks[0].max_tokens, 30)
  assert.match(host.asks[0].instructions, /^MIG_APP = Moving from Cursor, Claude Code, Codex or OpenClaw$/m)
  assert.equal(bubbleLine(view), 'written')
  assert.equal(bubbleSaid(view), 'Hermes itself is free. The AI it uses can cost money.')
  assert.ok(!allLines(view).includes('N1'))
})

test('on the built page: the list call says NONE: the don\'t-know with what is under it ("can it file my taxes": the three lines near the word file)', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => 'NONE' } })
  send(view, 'can it file my taxes')
  await settle()
  assert.equal(host.asks.length, 1)
  assert.equal(answerLine(view), 'N1')
  assert.equal(bubbleLine(view), 'offer-near')
  assert.deepEqual(labels(view), ['Packing one Hermes into a file to share', 'Giving Hermes a file', 'Reading your Word, Excel and PDF files'])
  finish(view) // the line has appeared whole: its picks can be pressed
  press(view, 'Giving Hermes a file')
  await settle()
  assert.equal(bubbleLine(view), 'd_drag')
  assert.equal(host.asks.length, 1, 'a pick is never sent')
})

test('on the built page: a line code is sure of makes no call ("How can I migrate?", "does it work on windows", "whats a gateway")', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: never } })
  for (const [m, line] of [['How can I migrate?', 'MIG'], ['does it work on windows', 'd_windows'], ['whats a gateway', 'd_gateway']]) {
    send(view, m)
    assert.equal(dots(view), null, m)
    await settle()
    assert.equal(answerLine(view), line)
    finish(view)
  }
  assert.equal(host.asks.length, 0)
})

test('with no AI step nothing is sent: no list call either', async () => {
  const { view, host } = await pastOpening('no_ai_step', { host: { oneshot: never } })
  for (const m of ['do i need a credit card to try it', 'tell me about models', 'can it print documents']) {
    send(view, m)
    await settle()
    finish(view)
  }
  assert.equal(host.asks.length, 0)
})
