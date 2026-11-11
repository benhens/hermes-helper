// setup-chat (Lead, 11 Nov): the offers (offer-t1, content/helper-talk-live-v2-changes-8.md), ask-fix-t1 (changes-10)
// and live changes-9, in the talk logic. On the page: tests/offers-page.test.mjs.
//   12. a line that would leave the person to think of what to type carries an offer: two to four things to pick
//   13. no line Helper can say holds "ask me", "type your question" or "what would you like" unless that same line
//       carries things to pick (all three ways of the AI step); broken on purpose once, below
//   15. a how or what question never gets the "I can't do that" line, also when the AI's first call says build
//   note b (Lead 06:25): with the set-up conversation not in the build, no offer shows the pick "Set up Hermes"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { freshVisit, laterVisit, turnParts, lineFor, openingLine, offerSets, pressOffer, skip } from '../src/talk.js'
import { TALK_DATA } from '../src/talk-data.js'
import { LIVE_DATA } from '../src/live-data.js'
import { SETUP_BUILT } from '../src/setup-built.js'
import { withNext, LIVE_ROWS } from '../src/live-rows.js'
import { askLive } from '../src/live-turn.js'
import { talkLines } from '../scripts/talk-data.mjs'

const CONTENT = path.resolve(import.meta.dirname, '..', 'content')
const TALK_JSON = JSON.parse(fs.readFileSync(path.join(CONTENT, 'helper-talk-v2.json'), 'utf8'))
const LIVE_JSON = JSON.parse(fs.readFileSync(path.join(CONTENT, 'helper-talk-live-v2.json'), 'utf8'))

// one visit past the opening; say() types a message and returns the line as the page gets it
const visit = () => freshVisit('open', {}, true)
function say(st, text) {
  const o = turnParts(text, st)
  return lineFor(o.out, st, text)
}
const labels = s => (s.offer ? s.offer.answers.items.map(i => i.label) : null)

/* ---------- 12: the offers ---------- */
test('every offer has two to four things to pick, each with a label and something it gives', () => {
  const sets = offerSets()
  assert.ok(sets.length >= 10)
  for (const [id, text, picks] of sets) {
    assert.ok(picks.length >= 2 && picks.length <= 4, `${id}: ${picks.length} picks`)
    assert.match(text, /\?$/, id)
    for (const p of picks) {
      const thing = TALK_DATA.offers.things[p]
      assert.ok(thing && thing.label && thing.gives, `${id}: ${p}`)
    }
  }
})

test('note b: this build has no set-up conversation, so no offer shows the pick "Set up Hermes" and no offer text speaks of setting up', () => {
  assert.equal(SETUP_BUILT, false, 'the first built file: src/setup-built.js is false')
  for (const [id, text, picks] of offerSets()) {
    for (const p of picks) {
      assert.notEqual(TALK_DATA.offers.things[p].gives.kind, 'setup_chat', `${id}: ${p}`)
      assert.doesNotMatch(TALK_DATA.offers.things[p].label, /set up hermes/i, id)
    }
    const s = TALK_JSON.offers.sets[id.split(':')[0]]
    if (s.text_no_setup) assert.equal(text, s.text_no_setup, id)
  }
  // and the data does have such a pick, so the test above is not empty
  assert.ok(Object.values(TALK_JSON.offers.things).some(t => t.gives.kind === 'setup_chat'))
})

test('the lines that used to say "Ask me anything" carry the offer general: F2, F3, BACK, thanks', () => {
  const st = freshVisit('name')
  turnParts('Peter', st)
  const f2 = say(st, 'I run a tennis club')
  assert.deepEqual([f2.line, f2.text, f2.offer.set], ['F2', 'Thanks, Peter.', 'general'])
  assert.equal(f2.offer.text, 'Do you want to see what Hermes does, or pick its AI?')
  assert.deepEqual(labels(f2), ['What Hermes can do', 'Which AI to use'])
  const st2 = freshVisit('name')
  const f3 = lineFor(skip(st2), st2)
  assert.deepEqual([f3.line, f3.text, f3.offer.set], ['F3', "That's fine.", 'general'])
  const back = openingLine(laterVisit({ name: 'Peter' }, true))
  assert.deepEqual([back.line, back.text, back.offer.set], ['BACK', 'Hi again, Peter.', 'general'])
  const th = say(visit(), 'thanks')
  assert.deepEqual([th.line, th.text, th.offer.set], ['THANKS', "You're welcome.", 'general'])
})

test('the don\'t-know line carries the offer dont_know, and the same offer is never shown twice in a row', () => {
  const st = visit()
  const a = say(st, 'can it fly a plane')
  assert.deepEqual([a.line, a.offer.set], ['N1', 'dont_know'])
  assert.deepEqual(labels(a), ['What Hermes is', 'What Hermes can do'])
  const b = say(st, 'tell me about goats')
  assert.equal(b.line, 'N1_AGAIN')
  assert.notEqual(b.offer.set, 'dont_know', 'its instead set')
  assert.equal(b.offer.set, TALK_JSON.offers.sets.dont_know.instead)
})

test('his example "How can I migrate?": the line MIG with the offer move; each pick gives its own line, by its id', () => {
  const st = visit()
  const m = say(st, 'How can I migrate?')
  assert.deepEqual([m.line, m.text, m.offer.set], ['MIG', 'There are two kinds of moving.', 'move'])
  assert.deepEqual(labels(m), ['From another AI app', 'To another computer'])
  assert.deepEqual(m.offer.answers.items.map(i => i.offer), ['mig_app', 'mig_pc'])
  const app = lineFor(pressOffer('mig_app', st), st)
  assert.equal(app.line, 'MIG_APP')
  assert.equal(app.next.label, 'Show me what to ask')
  const st2 = visit()
  say(st2, 'How can I migrate?')
  const pc = lineFor(pressOffer('mig_pc', st2), st2)
  assert.equal(pc.line, 'MIG_PC')
})

test('Lead\'s typed list (06:48): each gets a checked line from code, none the don\'t-know line', () => {
  const want = {
    'I want to switch over from Claude Code, how': 'MIG_APP',
    'what even is this app': 'HERMES',
    'what should I do first': 'START',
    'how do I change the model': 'MODEL_CHANGE',
    'how do I give it a personality': 'PERSONALITY',
    'I dont want to pay for anything': 'FREE'
  }
  for (const [typed, id] of Object.entries(want)) assert.equal(say(visit(), typed).line, id, typed)
  const st = visit()
  assert.equal(say(st, "what's a skill").line, 'term-skill')
  const mean = say(st, "I don't get it")
  assert.equal(mean.line, 'skill-mean')
  assert.equal(mean.text, TALK_DATA.terms.find(t => t.id === 'skill').mean.text)
  assert.equal(mean.next.label, 'Open Capabilities', 'the word line\'s button stays')
})

/* ---------- ask-fix-t1 (changes-10) ---------- */
test('ask-fix-t1: a brand name alone does not choose a written line that answers another question (a weak hit): the topic\'s question', () => {
  const s = say(visit(), 'is chatgpt any good')
  assert.equal(s.line, 'mod-q')
  assert.deepEqual(s.answers.items.map(i => i.label), ['ChatGPT', 'Claude', 'Neither', 'I want it free'])
})

test('ask-fix-t1: "ok and how do I do that" by Helper\'s last line: its then line, its button named, or "Choose one" with the same picks', () => {
  const a = visit()
  say(a, "what's a skill")
  const part = say(a, 'ok and how do I do that')
  assert.deepEqual([part.line, part.text, part.next.label], ['HOW_PART', 'Press "Open Capabilities". It opens that part for you.', 'Open Capabilities'])
  const b = visit()
  say(b, 'can it fly a plane')
  const pf = say(b, 'ok and how do I do that')
  assert.deepEqual([pf.line, pf.text, pf.samePicks], ['PICK_FIRST', 'Choose one, and I will show you how.', true])
  assert.equal(pf.offer, undefined, 'no new offer: the one above stays')
})

test('live changes-9: "and then?" after the Telegram line is its then line from code; once more, the not-clear line, never a guess', () => {
  const st = visit()
  assert.equal(say(st, 'telegram').line, 'msg1')
  const then = say(st, 'and then?')
  assert.equal(then.line, 'msg1-then')
  assert.match(then.text, /^Scan the code with Telegram on your phone\./)
  assert.equal(say(st, 'and then?').line, 'MEAN_NONE')
})

test('the second wordings are handed to the AI only on a follow-up (Decided myself; changes-10 leaves it open)', () => {
  const second = LIVE_ROWS.filter(r => r.follow_only).map(r => r.id)
  assert.deepEqual(second.sort(), ['plugin-mean', 'skill-mean', 'use1-next-mean', 'use3-next-mean'])
  assert.equal(withNext(['skill']).includes('skill-mean'), false)
  assert.equal(withNext(['skill'], true).includes('skill-mean'), true)
  assert.equal(withNext(['msg1']).includes('msg1-then'), true, 'a then line goes with its row always')
})

/* ---------- 15: build is never the answer to a how or what question ---------- */
test('point 15: the AI\'s first call says "build" for a how or what question: no "I can\'t do that" line; for a request it is still taken', async () => {
  const run = async typed => {
    const st = visit()
    const before = { last: st.last, lastKey: st.lastKey, liveRows: null, lastAnswer: null, lastAnswerKey: null, lastOffer: null, lastTopic: null }
    const { pre, out } = turnParts(typed, st)
    const calls = []
    const got = await askLive({ mode: 'ai_writes', text: typed, pre, out, before, lines: [], lastLine: '', request: async (m, p) => (calls.push(p), { text: calls.length === 1 ? 'build' : 'NONE' }) })
    return { got, calls: calls.length, pre }
  }
  for (const typed of ['how would a kite get flown by it', 'what would a kite need from it', 'why would it fly a kite']) {
    const { got, calls } = await run(typed)
    assert.ok(calls >= 1, typed)
    const kind = got.result ? got.result.kind : null
    assert.ok(!['C1', 'C2', 'H1', 'BUILD'].includes(kind), `${typed}: ${kind}`)
  }
  const { got } = await run('fly a kite for me please')
  assert.ok(got.result && ['C1', 'C2', 'H1'].includes(got.result.kind), 'a request: the build line, as before: ' + JSON.stringify(got).slice(0, 120))
})

/* ---------- 13: no open-ended line without things to pick ---------- */
const OPEN_ENDED = /ask me|type your question|what would you like/i
// Every line Helper can say from the data, as [id, text, carries things to pick]. Three sources:
//   the talk data's lines (scripts/talk-data.mjs talkLines: every fixed line, topic line, row, word, keeps line ...),
//   the offers' own questions (always with their picks), and the live data's lines for each of the three ways.
function everyLine(talk, live) {
  const fixed = Object.fromEntries(talk.fixed_lines.map(f => [f.id, f]))
  const workOffers = (talk.keeps.work.offer_t1 && talk.keeps.work.offer_t1.offers) || talk.keeps.work.offers || {}
  const carries = id => !!((fixed[id] && (fixed[id].offer || (Array.isArray(fixed[id].answers) && fixed[id].answers.length) || fixed[id].picks)) || workOffers[id] || talk.topics.some(t => t.question.id === id && t.question.answers.length))
  const out = talkLines(talk).map(l => [l.id, l.text, carries(l.id)])
  for (const [id, s] of Object.entries(talk.offers.sets)) for (const k of ['text', 'text_no_setup', 'template']) if (s[k]) out.push(['offer-' + id + '-' + k, s[k], true])
  const lm = live.lines_by_mode
  for (const mode of ['no_ai_step', 'ai_picks_line', 'ai_writes']) {
    for (const [k, v] of Object.entries(lm)) {
      const x = v && typeof v === 'object' ? v[mode] : null
      const text = x && typeof x === 'object' ? x.text : x
      if (typeof text === 'string') out.push([`live-${k}-${mode}`, text, false])
    }
  }
  for (const v of live.slow_ai.variants) out.push(['live-' + v.id, v.text, false])
  return out
}
const openEnded = lines => lines.filter(([, text, picks]) => OPEN_ENDED.test(text) && !picks).map(([id]) => id)

test('point 13: no line Helper can say holds "ask me", "type your question" or "what would you like" without things to pick (all three ways)', () => {
  const lines = everyLine(TALK_JSON, LIVE_JSON)
  assert.ok(lines.length > 220, `${lines.length} lines`)
  assert.deepEqual(openEnded(lines), [])
  // the lines of the built data too: every string the plugin can show as Helper's words (text to paste into Hermes and
  // the AI's own instructions are not Helper's lines)
  const found = []
  const NOT_LINES = /(^|\.)(paste_text|writer|pick_only|first_call|checks|no_reply|offer_words|kinds|source|key_words|weak_key_words)(\.|$)/
  const walk = (o, p) => {
    if (typeof o === 'string') {
      if (OPEN_ENDED.test(o) && !NOT_LINES.test(p) && !/hint/.test(p)) found.push(p)
    } else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, p + '.' + k)
  }
  walk(TALK_DATA, 'talk')
  walk(LIVE_DATA, 'live')
  assert.deepEqual(found, [])
})

test('point 13, broken on purpose: put "Ask me anything about Hermes." back and take the offer away, and the test above names the line', () => {
  const broken = structuredClone(TALK_JSON)
  const f2 = broken.fixed_lines.find(f => f.id === 'F2')
  f2.text = 'Thanks, {name}. Ask me anything about Hermes.'
  assert.deepEqual(openEnded(everyLine(broken, LIVE_JSON)), [], 'with its offer the line may say it')
  delete f2.offer
  assert.deepEqual(openEnded(everyLine(broken, LIVE_JSON)), ['F2'])
  const b2 = structuredClone(TALK_JSON)
  b2.fixed_lines.find(f => f.id === 'N1').text += ' Type your question again.'
  delete b2.fixed_lines.find(f => f.id === 'N1').offer
  assert.deepEqual(openEnded(everyLine(b2, LIVE_JSON)), ['N1'])
  const b3 = structuredClone(LIVE_JSON)
  b3.slow_ai.variants[0].text += ' What would you like next?'
  assert.equal(openEnded(everyLine(TALK_JSON, b3)).length, 1)
})

test('point 13 in the talk itself: after every message of a long visit, a line that ends the turn open carries an offer or things to pick', () => {
  const st = visit()
  const typed = ['hi', 'thanks', 'can it fly a plane', 'what even is this app', 'what should I do first', 'ok', 'bye', 'tell me a joke', 'How can I migrate?', 'what can I ask you', 'are you an ai', 'what do you know about me']
  for (const t of typed) {
    const s = say(st, t)
    assert.doesNotMatch(s.text, OPEN_ENDED, `${t}: ${s.text}`)
    if (s.offer) assert.ok(s.offer.answers.items.length >= 2 && s.offer.answers.items.length <= 4, t)
  }
})
