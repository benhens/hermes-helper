// find-v1, part 5 (Lead, 11 Nov; hhtech ask-run 2 "For builder" 2, 3 and 6):
//   2. a full typed question wins over the things to pick on screen
//   3. "how" alone goes to the last line said
//   6. BUILD from the AI: for a how or what question code's line, for a real request the copy box (tests/find-list.test.mjs)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { turn, freshVisit, lineFor } from '../src/talk.js'
import { pastOpening, send, settle, finish, bubbleLine, answerLine, labels } from './lib/talk-page.mjs'

const visit = () => freshVisit('open', {}, true)
const say = (st, text) => lineFor(turn(text, st), st, text)

test('2. "something is broken" typed while the memory picks show is read as if nothing were on screen: "Sorry it isn\'t working.", not the memory line', () => {
  const fresh = say(visit(), 'something is broken')
  assert.equal(fresh.line, 'STUCK')
  const st = visit()
  assert.equal(say(st, 'tell me about memory').line, 'mem-q')
  assert.ok(st.pending)
  const typed = say(st, 'something is broken')
  assert.deepEqual([typed.line, typed.text], [fresh.line, fresh.text])
  assert.equal(st.pending, null, 'the open question is dropped')
})

test('2. a message of three or more words that does not answer the open question gets the reply it gets with nothing on screen (four questions open, six messages)', () => {
  for (const open of ['tell me about memory', 'which ai should i use', 'tell me about scheduling', 'can it read my emails']) {
    for (const m of ['something is broken', 'does it work on windows', 'how do i stop it if it goes wrong', 'what is the weather in Riga', 'can it make pictures for me', 'is it open source']) {
      const fresh = say(visit(), m)
      const st = visit()
      const q = say(st, open)
      assert.ok(q.answers && st.pending, open + ' shows things to pick')
      const got = say(st, m)
      assert.deepEqual([got.line, got.text], [fresh.line, fresh.text], `${open} / ${m}`)
    }
  }
})

test('2. an answer still answers: typed in the answer\'s words (any length), or in one or two words, it is the open question\'s answer as before', () => {
  const st = visit()
  say(st, 'which ai should i use')
  assert.equal(say(st, 'i dont know yet').line, 'mod4')
  const st2 = visit()
  say(st2, 'which ai should i use')
  assert.equal(say(st2, 'chatgpt').line, 'mod1')
  const st3 = visit()
  say(st3, 'can it read my emails')
  assert.equal(say(st3, 'I mostly use my outlook calendar').line, 'svc1', 'a service named in the person\'s own words')
  // one or two words that are no answer: the open question's own line, as before
  const st4 = visit()
  say(st4, 'tell me about memory')
  assert.equal(say(st4, 'hmm okay').line, 'mem0')
  // a statement of three or more words that gets no line of its own when read alone (an answer in the person's own
  // words that no row catches): the open question's own line, as before, not a don't-know
  const st5 = visit()
  say(st5, 'tell me about memory')
  assert.equal(say(visit(), 'the green one over there').line, 'N1')
  assert.equal(say(st5, 'the green one over there').line, 'mem0')
})

test('2. on the built page: "something is broken" while the memory picks show', async () => {
  const { view } = await pastOpening('no_ai_step')
  send(view, 'tell me about memory')
  assert.equal(bubbleLine(view), 'mem-q')
  assert.ok(labels(view).length >= 2)
  send(view, 'something is broken')
  await settle()
  assert.equal(answerLine(view), 'STUCK')
})

test('3. "how" alone: after an answer line its next step or "That is all I have checked on that."; while things to pick show they stay ("Pick one of these first"); never "that looks cut off" after Helper said something to pick from', () => {
  const after = (first, word = 'how') => {
    const st = visit()
    const a = say(st, first)
    return [a.line, say(st, word).line]
  }
  assert.deepEqual(after('whats a gateway'), ['d_gateway', 'HOW_PART'])
  assert.deepEqual(after('does it work on windows'), ['d_windows', 'NO_MORE'])
  assert.deepEqual(after('how do i uninstall it'), ['d_uninstall', 'HOW_PASTE'])
  // things to pick on screen: a question's answers, an offer under a line, the picks under a don't-know
  assert.deepEqual(after('tell me about memory'), ['mem-q', 'PICK_FIRST'])
  assert.deepEqual(after('How can I migrate?'), ['MIG', 'PICK_FIRST'])
  assert.deepEqual(after('what is the weather in Riga'), ['N1', 'PICK_FIRST'])
  assert.deepEqual(after('can it file my taxes'), ['N1', 'PICK_FIRST'])
  assert.deepEqual(after('thanks'), ['THANKS', 'PICK_FIRST'])
  assert.deepEqual(after('im totally new where do i start'), ['START', 'PICK_FIRST'])
  for (const w of ['how?', 'why', 'and then', 'ok and then?']) assert.equal(after('what is the weather in Riga', w)[1], 'PICK_FIRST', w)
})

test('3. the picks stay the same ones under "how": the don\'t-know\'s four are still there to pick', async () => {
  const { view } = await pastOpening('no_ai_step')
  send(view, 'what is the weather in Riga')
  await settle()
  const before = labels(view)
  assert.equal(before.length, 4)
  send(view, 'how')
  await settle()
  assert.equal(answerLine(view), 'PICK_FIRST')
  finish(view)
  assert.deepEqual(labels(view), before)
})
