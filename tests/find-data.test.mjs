// find-v1, part 1 (Lead, 11 Nov 08:30 and 08:35): hhcontent's live changes-11 and -12 ported (breadth-t1, titles-t2).
// The reference's own conversations are in tests/talk.test.mjs (route2.py at 8862ec3a, 503 of them); here are the
// points the job names, on the code and on the built page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { turn, turnParts, freshVisit, lineFor, buildHit, fullHit, nearLines, pressNear, TITLED, FACTS } from '../src/talk.js'
import { TALK_DATA } from '../src/talk-data.js'
import { pastOpening, send, press, settle, finish, bubbleLine, bubbleSaid, oldLines, labels, mine } from './lib/talk-page.mjs'

const visit = () => freshVisit('open', {}, true)
const say = (st, text) => lineFor(turn(text, st), st, text)
const answersOf = said => (said.offer ? said.offer.answers.items.map(i => i.label) : [])

test('182 fact lines have a title: none missing a phrase, no two titles the same, none over eight words; 89 of them are the new lines from the docs', () => {
  assert.equal(TITLED.length, 182)
  assert.equal(TALK_DATA.facts.length, 89)
  const titles = TITLED.map(t => t.title)
  assert.equal(new Set(titles).size, 182)
  assert.deepEqual(titles.filter(t => t.split(/\s+/).length > 8), [])
  assert.deepEqual(TITLED.filter(t => t.phrases.length < 3).map(t => t.title), [])
  for (const f of TALK_DATA.facts) assert.ok(f.text && f.sources.length && f.sources.every(s => s.file && s.line > 0), f.id)
})

test('hhtech\'s misses that have a line now reach it with no AI: windows, gateway, stop it, someone else, uninstall, gemini, forget, the % full meter', () => {
  for (const [msg, line] of [
    ['does it work on windows', 'd_windows'],
    ['whats a gateway', 'd_gateway'],
    ['how do i uninstall it', 'd_uninstall'],
    ['can i use gemini', 'd_gemini'],
    ['how do i tell it to forget something about me', 'd_forget'],
    ['what does the percent full thing mean', 'd_meter'],
    ['is it open source', 'd_open_source'],
    ['can it do two things at once', 'd_two'],
    ['moving from cursor, can it take my rules', 'MIG_APP'],
    ['got a new mac how do i take hermes with me', 'MIG_PC'],
    ['im totally new where do i start', 'START']
  ]) assert.equal(say(visit(), msg).line, line, msg)
})

test('a fact line shows its docs source and its button: a copy box (d_uninstall), Open Model (d_gemini), none on purpose (d_approve_off)', () => {
  const u = say(visit(), 'how do i uninstall it')
  assert.match(u.source, /user-guide\/desktop\.md line 587/)
  assert.deepEqual([u.next.kind, u.next.label], ['paste', 'Show me what to ask'])
  const g = say(visit(), 'can i use gemini')
  assert.deepEqual([g.next.kind, g.next.label], ['part', 'Open Model'])
  const a = say(visit(), 'how do i turn off the asking for permission every time')
  assert.equal(a.line, 'd_approve_off')
  assert.equal(a.next, null)
  assert.equal(a.offer, undefined, 'no offer under a fact line')
})

test('the OpenAI-key line names Settings, "Providers", "API keys" and has no button (nothing in the plugin opens that place)', () => {
  const k = say(visit(), 'where do i put my openai key')
  assert.equal(k.line, 'KEY_WHERE')
  assert.match(k.text, /Open Settings, then "Providers", the AI companies, then "API keys"/)
  assert.equal(k.next, null)
})

test('"can it make pictures for me" is a question, not a request to build: the picture row, never "I can\'t do that" (the build pair "for me" + "make" gave H1)', () => {
  assert.equal(buildHit('can it make pictures for me'), null)
  const o = turn('can it make pictures for me', visit())
  assert.deepEqual([o.kind, o.row], ['want', 'w_image'])
  for (const m of ['can it install a plugin for me', 'could it make a logo for me', 'does it make videos for me', 'can hermes build this for me', 'can i make it write for me']) assert.notEqual(turn(m, visit()).kind, 'H1', m)
  assert.equal(turn('can it install a plugin for me', visit()).kind, 'PLUGIN_ADD')
  // the old rules stay: said to Helper it is a request; "can it build an app" is H2; a plain request is H1
  assert.equal(turn('can you install the plugin for me', visit()).kind, 'H1')
  assert.equal(turn('can it build an app', visit()).kind, 'H2')
  assert.equal(turn('make pictures for me', visit()).kind, 'H1')
})

test('"can it make pictures for me" on the built page, with and without an AI step: the picture row, no call', async () => {
  for (const mode of ['no_ai_step', 'ai_writes']) {
    const { view, host } = await pastOpening(mode)
    send(view, 'can it make pictures for me')
    await settle()
    assert.equal(bubbleLine(view), 'w_image', mode)
    assert.doesNotMatch(bubbleSaid(view), /I can't do that/)
    assert.equal(host.asks.length, 0)
  }
})

test('a don\'t-know with something near: up to three near lines offered by title, said with a small first letter; a pick gives that line', () => {
  const st = visit()
  const text = 'what about my chats history backup'
  const said = say(st, text)
  assert.equal(said.line, 'N1')
  assert.equal(said.offer.set, 'near')
  const near = said.offer.answers.items
  assert.ok(near.length >= 1 && near.length <= 3)
  assert.match(said.offer.text, /^Do you want to know about [a-z]/)
  for (const i of near) assert.ok(TITLED.some(t => t.title === i.label), i.label)
  assert.ok(said.offer.text.includes(near[0].label.slice(1)), 'the question names the first pick by its title')
  const got = lineFor(pressNear(near[0].near, st), st)
  const want = TITLED.find(t => t.title === near[0].label).gives
  assert.equal(got.line, want.kind === 'fact' ? want.need : want.kind === 'want' ? want.row : got.line)
  assert.notEqual(got.line, 'N1')
})

test('a don\'t-know with nothing near: "Do you want one of these instead?" and the same four starting things, three times in a row', () => {
  const st = visit()
  for (const m of ['what is the weather in Riga', 'do goats like it', 'can it fly a plane']) {
    const said = say(st, m)
    assert.ok(['N1', 'N1_AGAIN'].includes(said.line), m)
    assert.deepEqual([said.offer.set, said.offer.text], ['start_four', 'Do you want one of these instead?'])
    assert.deepEqual(answersOf(said), ['What Hermes can do', 'Which AI to use', 'Phone and chat apps', 'What Hermes remembers'])
  }
})

test('on the built page: the near offer is a second bubble with its picks, and a pick shows the line with the title as the person\'s message', async () => {
  const { view } = await pastOpening('no_ai_step')
  send(view, 'what about my chats history backup')
  await settle()
  assert.equal(oldLines(view).at(-1), 'N1')
  assert.equal(bubbleLine(view), 'offer-near')
  const first = labels(view)[0]
  press(view, first)
  await settle()
  assert.equal(mine(view).at(-1), first)
  assert.notEqual(bubbleLine(view), 'offer-near')
  assert.doesNotMatch(bubbleLine(view), /^N1/)
})

test('"how", "why", "and then" alone after an answer line: its button or copy box, its then line, or "That is all I have checked on that."', () => {
  const st = visit()
  assert.equal(say(st, 'does it work on windows').line, 'd_windows')
  assert.equal(say(st, 'how').line, 'NO_MORE')
  const st2 = visit()
  say(st2, 'how do i uninstall it')
  const h = say(st2, 'how')
  assert.equal(h.line, 'HOW_PASTE')
  assert.equal(h.next.kind, 'paste')
  const st3 = visit()
  say(st3, 'can i use gemini')
  assert.equal(say(st3, 'and then').line, 'HOW_PART')
  const st4 = visit()
  say(st4, 'what is the weather in Riga')
  assert.equal(turn('how', st4).kind, 'PICK_FIRST', 'find-v1 part 5: the don\'t-know\'s things to pick stay (tests/find-typed.test.mjs)')
})

test('a typed question of three or more words wins over an open question; one or two words still answer it', () => {
  const st = visit()
  assert.equal(turn('which ai should i use', st).kind, 'question')
  assert.ok(st.pending)
  const o = turn('how do i stop it if it goes wrong', st)
  assert.deepEqual([o.kind, o.need, st.pending], ['fact', 'd_stop', null])
  // two words: still the answer to the open question, never the fact line
  const st2 = visit()
  turn('which ai should i use', st2)
  assert.notEqual(turn('stop it', st2).kind, 'fact')
})

test('Builder\'s two guards: an official skill named next to "skill" is that skill, not a line reached by a phrase; "is there a skill for knitting" keeps its don\'t-know', () => {
  assert.deepEqual((o => [o.kind, o.skill])(turn('what does the claude-code skill do', visit())), ['skill', 'claude-code'])
  assert.equal(fullHit('what does the claude-code skill do', false).kind, 'MIG_APP', 'the phrase alone would give the moving line')
  assert.equal(turn('is there a skill for knitting', visit()).kind, 'N1')
  assert.equal(fullHit('is there a skill for knitting', true).kind, 'term', 'the one-word phrase alone would give the word line')
})

test('"can it file my taxes" has no line: the don\'t-know, and under it the three lines near the word file, by title', () => {
  const said = say(visit(), 'can it file my taxes')
  assert.deepEqual([said.line, said.offer.set], ['N1', 'near'])
  assert.deepEqual(answersOf(said), ['Packing one Hermes into a file to share', 'Giving Hermes a file', 'Reading your Word, Excel and PDF files'])
  assert.equal(said.offer.text, 'Do you want to know about packing one Hermes into a file to share, giving Hermes a file, or reading your Word, Excel and PDF files?')
})

test('a title whose first word is in capitals keeps them in the near question (YOLO mode)', () => {
  const said = say(visit(), 'does it have a dark mode')
  assert.equal(said.offer.text, 'Do you want to know about YOLO mode: no approval questions in one chat?')
})

test('nearLines never offers the line Helper said last', () => {
  const st = visit()
  say(st, 'does it work on windows')
  assert.ok(!nearLines('windows computer thing', st).some(n => n.gives.need === 'd_windows'))
  assert.ok(nearLines('windows computer thing', visit()).some(n => n.gives.need === 'd_windows'))
  assert.ok(FACTS.d_windows && turnParts)
})
