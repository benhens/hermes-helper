// talk-live rows 2, 5 and 6 without the page: src/live-turn.js with its request and clock passed in.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { freshVisit, turnParts } from '../src/talk.js'
import { askLive, goesToAi, liveWhyNot, liveApply, SECOND_CALL_MIN_MS } from '../src/live-turn.js'
import { LIVE_ROW } from '../src/live-rows.js'
import { lastLines, sendable } from '../src/live-request.js'

const fixture = f => JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures', f), 'utf8'))
const M24 = fixture('live-rows-oracle.json').cases.slice(0, 24).map(c => c.text)
const ok = { state: 'ok' }
// a fake request that answers in order and keeps what it was asked
function fake(...answers) {
  const asks = []
  const request = async (method, params, timeout) => {
    asks.push({ method, params, timeout })
    const a = answers[Math.min(asks.length - 1, answers.length - 1)]
    if (a instanceof Error) throw a
    return { text: typeof a === 'function' ? a(params) : a }
  }
  return { asks, request }
}
async function one(text, st, opts = {}) {
  const before = { last: st.last, lastKey: st.lastKey, liveRows: st.liveRows || null }
  const { pre, out } = turnParts(text, st)
  const why = liveWhyNot({ mode: opts.mode || 'ai_writes', pre, text, status: ok })
  if (why) return { why, pre, out }
  const got = await askLive({ mode: opts.mode || 'ai_writes', text, pre, out, before, request: opts.request, msLeft: opts.msLeft })
  return { got, pre, out, before, shown: liveApply(st, got, out, before, text) }
}

// setup-chat: "hi there, I'm new to all this" is a greeting with more words (live changes-6 greet_more) and "how do I
// update hermes ..." has the line UPDATE (offer-t1), so code answers 20 and the AI step is asked for 4
test('hhtech\'s 24 messages, each on its own: code answers 20, the AI step is asked for 4', () => {
  assert.equal(M24.length, 24)
  const toAi = M24.filter(t => goesToAi(turnParts(t, freshVisit()).pre))
  assert.deepEqual(toAi, ['what do you mean?', 'ok and then?', "sorry I don't get it", "what's the weather in Riga tomorrow"])
})

test('his three messages never reach the AI (code answers each); "what do you mean?" after the tokens line is a follow-up with the tokens rows', async () => {
  const st = freshVisit()
  for (const [t, kind] of [["How can I make it so I use less usage? Whenever I ask a question it doesn't take as many tokens", 'row'], ['hey', 'HELLO'], ['he', 'CUT']]) {
    const r = turnParts(t, st)
    assert.equal(r.out.kind, kind, t)
    assert.ok(!goesToAi(r.pre), t)
  }
  const st2 = freshVisit()
  turnParts("How can I make it so I use less usage? Whenever I ask a question it doesn't take as many tokens", st2)
  const f = fake(p => `${LIVE_ROW.use0.text}\nUSED: use0`)
  const r = await one('what do you mean?', st2, { request: f.request })
  assert.deepEqual([r.pre.kind, r.pre.why], ['plain', 'what do you mean'])
  assert.equal(f.asks.length, 1, 'a follow-up: no first call')
  const handed = [...f.asks[0].params.instructions.matchAll(/^\[([\w-]+)\] /gm)].map(m => m[1])
  assert.ok(handed.includes('use1') && handed.length <= 5, handed.join(','))
})

test('the second call starts only with 4 s or more left of the 12: a first call that took 11 s gives the fallback, with no writer call', async () => {
  let left = 12000
  const f = fake(() => {
    left -= 11000
    return 'mem'
  }, 'not asked')
  const st = freshVisit()
  const r = await one('tell me a joke', st, { request: f.request, msLeft: () => left })
  assert.equal(f.asks.length, 1)
  assert.deepEqual(r.got, { fallback: 'no time for the second call' })
  assert.equal(r.shown, null)
  assert.equal(SECOND_CALL_MIN_MS, 4000)
})

test(`every message of route2.py's conversations, in ai_writes with a fake model: never more than 5 rows, never a whole list, never a second request beyond two, host.request's 90 s kept`, async () => {
  const conv = fixture('route2-conversations.json').conversations
  let calls = 0
  let asked = 0
  for (const c of conv) {
    const st = freshVisit(c.stage || 'open', {}, false)
    for (const s of c.steps) {
      if (s.do !== 'say' || typeof s.text !== 'string') continue
      const f = fake(p => (/^You sort messages/.test(p.instructions) ? 'none' : 'NONE'))
      await one(s.text, st, { request: f.request })
      if (f.asks.length) asked++
      calls += f.asks.length
      assert.ok(f.asks.length <= 2)
      for (const a of f.asks) {
        assert.equal(a.method, 'llm.oneshot')
        assert.equal(a.timeout, 90000)
        const rows = (a.params.instructions.match(/^\[[\w-]+\] /gm) || []).length
        assert.ok(rows <= 5, `${rows} rows for ${s.text}`)
        assert.ok(a.params.input.length <= 1500)
      }
    }
  }
  assert.ok(asked > 20, `${asked} messages asked`)
  assert.ok(calls >= asked)
})

test('what may be sent of the conversation: the last 4 lines, the name\'s lines and the kept values left out, Helper\'s greeting without the name', () => {
  const log = [
    { who: 'helper', line: 'OPEN', text: 'Hi, I\'m Helper. What\'s your name?' },
    { who: 'you', text: 'Peter', send: sendable({ kind: 'F1' }).you },
    { who: 'helper', line: 'F1', text: 'Nice to meet you, Peter. What do you do?', send: sendable({ kind: 'F1' }).helper },
    { who: 'you', text: 'remember that my club has six courts', send: sendable({ kind: 'RM1' }).you },
    { who: 'helper', line: 'RM1', text: 'I will keep that: my club has six courts.', send: sendable({ kind: 'RM1' }).helper },
    { who: 'you', text: 'I use WhatsApp', send: sendable({ kind: 'row', kept: ['msg'] }).you },
    { who: 'helper', line: 'msg1', text: 'Hermes works in WhatsApp.', send: sendable({ kind: 'row', kept: ['msg'] }).helper },
    { who: 'you', text: 'peter here again' },
    { who: 'helper', line: 'THANKS', text: 'Glad to help.' }
  ]
  const got = lastLines(log, ['Peter', 'WhatsApp', 'my club has six courts'])
  assert.deepEqual(got, ["Helper: Hi, I'm Helper. What's your name?", 'Helper: Nice to meet you. What do you do?', 'Helper: Glad to help.'])
  assert.doesNotMatch(got.join('\n'), /peter|whatsapp|six courts/i)
  // each line cut at 200 characters, at most 4
  const long = Array.from({ length: 6 }, (_, i) => ({ who: 'you', text: `line ${i} `.repeat(40) }))
  const cut = lastLines(long)
  assert.equal(cut.length, 4)
  assert.ok(cut.every(l => l.length === 'Person: '.length + 200))
})
