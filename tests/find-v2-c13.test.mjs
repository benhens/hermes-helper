// find-v2 part 4 (Lead, 11 Nov 11:40): live-v2 changes-13's "For builder" lines, on the plugin (route2.py adab5484 is
// the reference; tests/talk-qs, talk-wants and the route2 conversations compare whole sets with it). Here: hhtech's
// ask-run 3 messages that the points are about, each as he typed it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TALK_DATA } from '../src/talk-data.js'
import { WANTS_DATA } from '../src/wants-data.js'
import { turnParts, freshVisit, lineFor } from '../src/talk.js'
import { goesToAi } from '../src/live-turn.js'
import { pastOpening, send, settle, finish, answerLine, dots } from './lib/talk-page.mjs'

const visit = () => freshVisit('open', {}, true)
const say = (st, m) => {
  const { pre, out } = turnParts(m, st)
  return { pre, said: lineFor(out, st, m) }
}

test('1. no fixed line opens with Yes or No (line_start_rule); answers to Helper\'s own questions are exempt', () => {
  const texts = [...Object.entries(TALK_DATA.fixed).map(([id, f]) => [id, f.text]), ...TALK_DATA.facts.map(f => [f.id, f.text]),
    ...TALK_DATA.topics.flatMap(t => [[t.plain.id, t.plain.text], ...t.needs.map(n => [n.id, n.text])]), ...TALK_DATA.terms.map(t => [t.id, t.text]),
    ...WANTS_DATA.rows.map(r => [r.id, r.text])]
  const bad = texts.filter(([, t]) => /^(yes|no)\b/i.test(String(t || '').trim())).map(([id]) => id)
  assert.deepEqual(bad, [])
  assert.ok(texts.length > 200, `${texts.length} lines`)
})

test('2. false beliefs get a plain correction, no AI call: x1 OpenAI, x2 Google, x4 ChatGPT plan; x3 windows has no "Yes."; "nous" and "models from openai" are no false belief', () => {
  const cases = [
    ['is hermes made by OpenAI?', 'FB_MAKER', 'Hermes is not made by OpenAI. It is made by Nous Research.'],
    ['this is the Google app right', 'FB_MAKER', 'Hermes is not made by Google. It is made by Nous Research.'],
    ['so it needs a ChatGPT subscription', 'FB_PLAN', 'Hermes does not need a ChatGPT plan. It needs an AI to think with. That AI can come from many AI companies, or run on your own computer.'],
    ['does it only work on windows', 'd_windows', 'Hermes runs on Mac, Windows and Linux. On Windows, the docs name Windows 10 and 11.']
  ]
  for (const [m, line, text] of cases) {
    const { pre, said } = say(visit(), m)
    assert.deepEqual([said.line, said.text], [line, text], m)
    assert.equal(goesToAi(pre), false, m + ': code\'s own line')
  }
  assert.equal(say(visit(), 'so it needs a ChatGPT subscription').said.next.label, 'Open Model')
  assert.notEqual(say(visit(), 'is hermes made by nous research').said.line, 'FB_MAKER')
  assert.notEqual(say(visit(), 'can i use models from openai').said.line, 'FB_MAKER')
})

test('3. near needs more than one ordinary word: #13 smart home, #28 dark mode no longer get unrelated near picks', () => {
  for (const m of ['can it control my smart home', 'how do i turn on dark mode']) {
    const { said } = say(visit(), m)
    if (said.offer && said.offer.set === 'near') for (const i of said.offer.answers.items) assert.doesNotMatch(i.label, /second Hermes|approval|meeting notes/i, m)
  }
  assert.equal(say(visit(), 'how do i turn on dark mode').said.line, 'd_dark')
})

// "can it watch youtube videos" is left out: the plugin's wants step answers it first with N2 (the nearest rows),
// where route2.py alone gives w_youtube by its new phrase (a known gap, in docs/build/find-v2-report.md)
test('6. the new lines: terminal, AGENTS.md, dark mode, smart home, cost, toolsets, shorter answers (f13 "how do i find a chat from last week" stays d_find: route2.py adab5484 gives d_find too)', () => {
  for (const [m, line] of [['what is a terminal', 'd_terminal'], ['what is AGENTS.md', 'd_agents_md'], ['how do i turn on dark mode', 'd_dark'],
    ['how do i make it answer shorter', 'd_shorter'], ['what are toolsets', 'd_toolsets'], ['does it work with home assistant', 'd_home'], ['how do i see what it costs', 'd_cost']]) {
    const got = say(visit(), m).said.line
    assert.ok(got === line || got.endsWith(line), `${m}: ${got}`)
  }
})

test('7. a follow-up keeps its subject, before any AI call: #21 "where do i do that" after the provider line: Open Model; #6 "is that hard" after a line with no button: NO_MORE', () => {
  const st = visit()
  say(st, 'it says no provider configured')
  const w = say(st, 'where do i do that')
  assert.equal(w.said.line, 'HOW_PART')
  assert.match(w.said.text, /Press "Open Model"\./)
  assert.equal(goesToAi(w.pre), false)
  const st2 = visit()
  say(st2, 'how do i turn on dark mode')
  const h = say(st2, 'is that hard')
  assert.equal(h.said.line, 'NO_MORE')
  assert.equal(goesToAi(h.pre), false)
  // after anything that is not an answer line, the message goes the usual way
  assert.notEqual(say(visit(), 'is that hard').said.line, 'NO_MORE')
})

test('on the built page: "where do i do that" after a line with no button: NO_MORE, no dots, no call', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => 'NONE' } })
  send(view, 'how do i turn on dark mode')
  await settle()
  finish(view)
  assert.equal(answerLine(view), 'd_dark')
  send(view, 'where do i do that')
  assert.equal(dots(view), null)
  await settle()
  assert.equal(answerLine(view), 'NO_MORE')
  assert.equal(host.asks.length, 0)
})

// find-v2 part 5 (4) (Lead's answer 4 to find-v1's questions): hhtech opened Settings at #/settings?tab=providers&pview=keys
// (Providers, API keys). The key lines get a button "Open API keys" that goes there through host.navigate (seen working
// in the app run, dev/checks/find-v2/app-run-keys).
test('the key lines (where a key goes, what a key is) have the button "Open API keys" to Settings, Providers, API keys', () => {
  for (const m of ['where do i put my api key', 'what is an api key']) {
    const { said } = say(visit(), m)
    assert.deepEqual([said.next && said.next.kind, said.next && said.next.label, said.next && said.next.to], ['part', 'Open API keys', '/settings?tab=providers&pview=keys'], m)
  }
})
