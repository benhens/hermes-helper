// find-v2 part 1 (Lead, 11 Nov 11:40; hhtech ask-run 3, For builder 4): when the list call picked lines and the writer
// then says NONE, fails, is slow, or a check drops its reply, the first picked line itself is shown, word for word, with
// its button, as the answer: not the don't-know. Twice in run A the right line was picked ("tool" for "what are
// toolsets", PERSONALITY for "how do i make it answer shorter") and the person got a don't-know. Only when nothing was
// picked: the don't-know with its picks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askLive, goesToAi, liveApply } from '../src/live-turn.js'
import { LIVE_ROW, resultOfRow } from '../src/live-rows.js'
import { turnParts, freshVisit, lineFor } from '../src/talk.js'
import { pastOpening, send, settle, finish, dots, bubbleSaid, allLines, never, deferred, helper } from './lib/talk-page.mjs'
import { text } from './lib/render.mjs'

const visit = () => freshVisit('open', {}, true)
const beforeOf = st => ({ last: st.last, lastKey: st.lastKey, liveRows: st.liveRows || null, lastAnswer: st.lastAnswer || null, lastAnswerKey: st.lastAnswerKey || null, lastOffer: st.lastOffer || null, lastTopic: st.lastTopic || null })
async function ask(st, text, replies, mode = 'ai_writes') {
  const before = beforeOf(st)
  const { pre, out } = turnParts(text, st)
  const request = async (method, params) => {
    const r = replies.shift()
    if (r instanceof Error) throw r
    return { text: r === undefined ? 'NONE' : r }
  }
  assert.ok(goesToAi(pre), text + ' goes to the AI')
  const got = await askLive({ mode, text, pre, out, before, request })
  const shown = liveApply(st, got, out, before, text) || out
  return { pre, out, got, shown, line: lineFor(shown, st, text) }
}
const toolText = LIVE_ROW.tool.text

test('the list call picked "tool", the writer says NONE: the tool line itself, word for word', async () => {
  const r = await ask(visit(), 'can it fly a kite', ['tool', 'NONE'])
  assert.equal(r.got.picked, 'tool')
  assert.deepEqual(r.got.result, resultOfRow('tool'))
  assert.equal(r.line.text, toolText)
})

test('the same for a failed writer call, a thinking reply and a reply a check drops; in ai_picks_line for a pick call that says NONE', async () => {
  for (const replies of [['tool', new Error('boom')], ['tool', '<think>hmm'], ['tool', 'Hermes is made by Zorbo Corp.\nUSED: tool']]) {
    const r = await ask(visit(), 'can it fly a kite', replies)
    assert.equal(r.line.text, toolText, String(replies[1]))
  }
  const p = await ask(visit(), 'can it fly a kite', ['tool', 'NONE'], 'ai_picks_line')
  assert.equal(p.line.text, toolText)
})

test('PERSONALITY picked, writer NONE: the PERSONALITY line, with its button when it has one', async () => {
  const r = await ask(visit(), 'can it fly a plane', ['PERSONALITY', 'NONE'])
  assert.deepEqual(r.got.result, resultOfRow('PERSONALITY'))
  assert.equal(r.line.text, lineFor(resultOfRow('PERSONALITY'), visit(), '').text)
  assert.ok(!/Sorry, I don/.test(r.line.text))
})

test('nothing picked (the list says NONE): the don\'t-know, as before', async () => {
  const r = await ask(visit(), 'what is the weather in riga', ['NONE'])
  assert.equal(r.got.picked, undefined)
  assert.ok(r.got.fallback)
})

test('on the built page: list "tool", writer NONE: the tool line, no don\'t-know', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? 'tool' : 'NONE') } })
  send(view, 'can it fly a kite')
  assert.ok(dots(view))
  await settle()
  assert.equal(host.asks.length, 2)
  assert.equal(bubbleSaid(view), toolText)
  assert.ok(!allLines(view).some(l => /^N1/.test(l)), allLines(view).join(' '))
})

test('on the built page: list "tool", the writer never answers: at 12 s the tool line, not the don\'t-know', async () => {
  const { view, host, timers } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? 'tool' : never()) } })
  send(view, 'can it fly a kite')
  await settle()
  assert.equal(host.asks.length, 2)
  timers.fire(12000)
  await settle()
  assert.equal(bubbleSaid(view), toolText)
  assert.ok(!allLines(view).some(l => /^N1/.test(l)))
})

test('on the built page: the person types on while the writer works: the picked line answers the first message', async () => {
  const d = deferred()
  const { view } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? 'tool' : n === 2 ? d.promise : 'NONE') } })
  send(view, 'can it fly a kite')
  await settle()
  send(view, 'how do i stop it if it goes wrong')
  await settle()
  finish(view)
  const helperTexts = allLines(view)
  assert.ok(!helperTexts.some(l => /^N1/.test(l)), helperTexts.join(' '))
  d.resolve('NONE')
  await settle()
})

test('on the built page: the picked line shows with its button (tool: Open Capabilities)', async () => {
  const { view } = await pastOpening('ai_writes', { host: { oneshot: (p, n) => (n === 1 ? 'tool' : 'NONE') } })
  send(view, 'can it fly a kite')
  await settle()
  finish(view)
  assert.match(text(helper(view)), /Open Capabilities/)
})
