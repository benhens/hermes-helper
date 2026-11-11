// The fixes from hhtech's newcomer run of e86b410 (docs/answers/hhtech-run-e86b410.md), as hhcontent
// wrote them into the data and into route2.py (content/helper-talk-v2-changes-11.md):
//   - hhtech's ten typed messages and "my chat app is WhatsApp", typed after the topics, so with his
//     kept record (Anna, ChatGPT, Telegram), in the plugin as it runs (the wants on);
//   - "what is ..." gets the explanation, never the kept answer (what_is); cost (COST); where to run
//     Hermes (WHERE); skill and plugin compared (W2); email on a schedule (sch5);
//   - a chat app, service or AI typed after a different pick replaces the kept one (keeps.typed_change);
//   - a later visit that skips the name question, then a typed name (NAME_AGAIN, NAME_NEW);
//   - the faint "Kept: ..." line remembers what it kept, so the page can mark it once it is forgotten.
// tests/talk.test.mjs replays route2.py's own conversations for the same rules (the wants off);
// this file checks the lines a person sees, with the wants on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshVisit, laterVisit, turn, press, lineFor, forgetAnswer, noteForgotten, stillKept, whatIs, PARTS } from '../src/talk.js'
import { TALK_DATA } from '../src/talk-data.js'
import { talkProblems, FIXED_PARTS } from '../scripts/talk-data.mjs'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/helper-talk-v2.json'), 'utf8'))
const ANNA = () => ({ name: 'Anna', mod: 'mod1', msg: 'Telegram', told: true })
const need = (topic, id) => TALK_DATA.topics.find(t => t.id === topic).needs.find(n => n.id === id)
const plain = topic => TALK_DATA.topics.find(t => t.id === topic).plain
const term = id => TALK_DATA.terms.find(t => t.id === id)
const say = (st, typed) => lineFor(turn(typed, st), st, typed, { settingsPage: true })

// hhtech's ten, with what he wanted (his section 3) as route2.py's last block has it ("hhtech 1" to "hhtech 10")
const TEN = [
  ['how do I connect telegram', s => [s.line, s.next.label], ['msg1', 'Open Messaging']],
  ['what is a model', s => [s.line, s.text, s.next.label, s.used], ['mod0', 'A model is the AI that does the thinking. Hermes needs one to answer.', 'Open Model', null]],
  ['can hermes check my email every morning', s => [s.line, s.text, s.next.label, s.next.text], ['sch5', 'Yes. Connect your email to Hermes first. Then ask it once, in plain words.', 'Show me what to ask', 'Every morning at 8, check my email and send me a short summary.']],
  ['which AI should I use', s => [s.line, s.used && s.used.text], ['mod1', 'From what I keep: you pay for ChatGPT.']],
  ['how much does it cost', s => [s.line, s.text, s.next.label, s.used], ['COST', 'Hermes itself is free. The AI it uses can cost money, depending on which one you choose.', 'Open Model', null]],
  ['whats the difference between a skill and a plugin', s => [s.line, s.text, s.answers.items.map(a => a.label)], ['W2', 'A skill is written steps that teach Hermes one task. A plugin is an add-on that gives Hermes a new feature. Pick one.', ['Skills', 'Plugins']]],
  ['can you install the github plugin for me', s => [s.line, s.text], ['H1', "I can't do that, but your own Hermes can. Paste this into a new chat with it."]],
  ['my bot forgets everything', s => [s.line], ['mem3']],
  ['what is soul.md', s => [s.line, s.text], ['term-soul', 'SOUL.md is the file that says who your Hermes is.']],
  ['should I run it on my laptop or a server', s => [s.line, s.text, s.next.label], ['WHERE', 'Both work. Hermes answers and runs jobs only while its computer is on. For any time, use a computer that stays on.', 'Open Messaging']]
]

test('hhtech\'s ten typed messages, each with his kept record (Anna, ChatGPT, Telegram): the line he wanted for every one, nothing kept changes', () => {
  for (const [typed, pickOut, want] of TEN) {
    const st = laterVisit(ANNA())
    assert.deepEqual(pickOut(say(st, typed)), want, typed)
    assert.deepEqual(st.kept, ANNA(), typed + ': the kept record is unchanged')
  }
})

test('the same ten typed one after another in one visit, as hhtech did, then "my chat app is WhatsApp": the same lines, and WhatsApp replaces Telegram with a new "Kept:" line', () => {
  const st = laterVisit(ANNA())
  for (const [typed, pickOut, want] of TEN) assert.deepEqual(pickOut(say(st, typed)), want, typed)
  const s = say(st, 'my chat app is WhatsApp')
  assert.equal(s.line, 'msg2')
  assert.equal(s.text, need('msg', 'msg2').text)
  assert.equal(s.note.text, 'Kept: you use WhatsApp.')
  assert.equal(s.note.first, null, 'the first-time line was shown long ago')
  assert.deepEqual(st.kept, { ...ANNA(), msg: 'WhatsApp' })
  // and "what do you know about me" now says WhatsApp
  assert.ok(say(st, 'what do you know about me').rows.includes('Your chat app: WhatsApp'))
})

test('with nothing kept: "what is a model" the explanation, "which AI should I use" the question, "how much does it cost" the cost line', () => {
  assert.equal(say(freshVisit(), 'what is a model').line, 'mod0')
  assert.equal(say(freshVisit(), 'which AI should I use').line, TALK_DATA.topics.find(t => t.id === 'mod').question.id)
  assert.equal(say(freshVisit(), 'how much does it cost').line, 'COST')
})

test('"what is ...": only the words on the list get the explanation; the rest goes the old way', () => {
  for (const [typed, line] of [['what is memory?', 'mem0'], ["what's a bot?", 'bot0'], ['whats an llm', 'mod0'], ['what are scheduled jobs', 'sch0'], ['explain cron', 'sch0'], ['what is messaging', 'msg0']]) {
    const st = laterVisit(ANNA())
    const s = say(st, typed)
    assert.equal(s.line, line, typed)
    assert.equal(s.text, plain(line.replace(/0$/, '')).text, typed)
    assert.equal(s.used, null, typed + ': nothing kept is used')
  }
  // not a "what is": the question, or the kept answer, as before
  assert.equal(say(freshVisit(), 'what is the best ai').line, 'mod-q')
  assert.equal(say(laterVisit(ANNA()), 'what is the best ai').line, 'mod1')
  // a term is explained by its term line, as before
  assert.equal(say(freshVisit(), 'what is a skill').line, 'term-skill')
  assert.equal(say(freshVisit(), 'what is an mcp server').line, 'term-mcp')
})

test('cost and where: a cost word in a question, or a where word, with no topic and no term', () => {
  assert.equal(say(freshVisit(), 'is hermes free to use').line, 'COST')
  assert.equal(say(freshVisit(), 'do i have to pay for this').line, 'COST')
  assert.equal(say(freshVisit(), 'I dont want to pay for anything').line, 'mod3', 'not a question: the model topic, as before')
  assert.equal(say(laterVisit(ANNA()), 'how much does chatgpt cost').line, 'mod1', 'an AI named: its line')
  assert.equal(say(freshVisit(), 'can it check prices every day').line, 'sch3', 'a schedule word: the schedule')
  assert.equal(say(freshVisit(), 'can hermes be always on').line, 'WHERE')
  assert.equal(say(freshVisit(), 'can I run hermes on a raspberry pi').line, 'WHERE')
})

test('Builder (not in route2.py, please check): a row of the wants wins over the cost and where lines, as a topic word does; "can it keep an eye on airline ticket prices" is the prices row, not the cost line', () => {
  const st = freshVisit()
  const s = say(st, 'can it keep an eye on airline ticket prices')
  assert.equal(s.line, 'w_prices')
  // route2.py has no rows: there it is the cost line, and the plugin replays it the same way
  assert.equal(turn('can it keep an eye on airline ticket prices', Object.assign(freshVisit(), { wants: false })).kind, 'COST')
})

test('skill and plugin compared (W2): the comparison line, then the two picks; each pick gives that term\'s line', () => {
  for (const typed of ['whats the difference between a skill and a plugin', 'is a skill the same as a plugin']) {
    const st = freshVisit()
    const s = say(st, typed)
    assert.equal(s.line, 'W2', typed)
    assert.equal(s.answers.kind, 'which')
    assert.deepEqual(s.answers.items.map(a => a.which), ['skill', 'plugin'])
    assert.equal(st.lastq, false, 'W2 is no question')
    const picked = lineFor(press('plugin', typed, st), st)
    assert.equal(picked.line, 'term-plugin')
    assert.equal(picked.text, term('plugin').text)
  }
  // any other pair still gets "Which one do you mean?"
  assert.equal(say(freshVisit(), 'is a tool the same as a plugin').line, 'W1')
})

test('email on a schedule (sch5): the mail line wins over the other schedule lines and over the service question', () => {
  assert.equal(say(freshVisit(), 'check my gmail every morning').line, 'sch5')
  assert.equal(say(freshVisit(), 'I want it to look at my inbox on fridays').line, 'sch5')
  assert.equal(say(freshVisit(), 'can it send me a summary every morning').line, 'sch1', 'no mail word: as before')
})

test('a typed chat app, service or AI replaces the kept one only when the person says it of themselves, not as a question, with no not-word, and only when something is kept', () => {
  const cases = [
    ['my chat app is WhatsApp', 'msg2', { msg: 'WhatsApp' }, 'Kept: you use WhatsApp.'],
    ['does it work with whatsapp', 'msg2', {}, null],
    ["I don't use whatsapp", 'msg2', {}, null],
    ['I use Telegram', 'msg1', {}, null],
    ['I pay for Claude now', 'mod2', { mod: 'mod2' }, 'Kept: you pay for Claude.']
  ]
  for (const [typed, line, change, note] of cases) {
    const st = laterVisit(ANNA())
    const s = say(st, typed)
    assert.equal(s.line, line, typed)
    assert.deepEqual(st.kept, { ...ANNA(), ...change }, typed)
    assert.equal(s.note ? s.note.text : null, note, typed)
  }
  // with nothing kept for that topic, a statement keeps nothing (keeps rule 2, unchanged)
  const st = freshVisit()
  assert.equal(say(st, 'my chat app is WhatsApp').line, 'msg2')
  assert.deepEqual(st.kept, {})
})

test('a later visit (the name question skipped), then a name typed: the kept name gets "Hi again"; "my name is Bea" replaces it; a bare other word is not taken as a name', () => {
  for (const typed of ['Anna', 'anna.', "I'm anna", "it's Anna"]) {
    const st = laterVisit(ANNA())
    const s = say(st, typed)
    assert.equal(s.line, 'NAME_AGAIN', typed)
    assert.equal(s.text, 'Hi again, Anna. Ask me anything about Hermes.', typed)
    assert.equal(s.note, null, typed + ': nothing is written')
    assert.deepEqual(st.kept, ANNA())
  }
  const st = laterVisit(ANNA())
  const s = say(st, 'my name is Bea')
  assert.equal(s.line, 'NAME_NEW')
  assert.equal(s.text, 'Thanks, Bea. Ask me anything about Hermes.')
  assert.equal(s.note.text, 'Kept: Bea.')
  assert.deepEqual(st.kept, { ...ANNA(), name: 'Bea' })
  assert.equal(st.name, 'Bea')
  const bare = laterVisit(ANNA())
  // changes-14 (small_talk rule c): one word of two or three letters, nothing open, looks cut off
  assert.equal(say(bare, 'Bea').line, 'CUT')
  assert.deepEqual(bare.kept, ANNA())
  // a name the conversation never keeps (changes-10 name_refused) is no new name
  const refused = laterVisit(ANNA())
  assert.notEqual(say(refused, 'my name is Password').line, 'NAME_NEW')
  assert.deepEqual(refused.kept, ANNA())
  // nothing kept yet (a visit that skipped the opening): "my name is Bea" is kept, with the first-time line
  const none = freshVisit('open')
  const first = say(none, 'my name is Bea')
  assert.equal(first.line, 'NAME_NEW')
  assert.ok(first.note.first)
  // not while Helper's own question is open
  const asking = laterVisit(ANNA())
  say(asking, 'how does memory work')
  assert.notEqual(say(asking, 'my name is Bea').line, 'NAME_NEW')
})

test('the faint "Kept:" line carries what it kept, and is forgotten exactly when none of that is kept any more', () => {
  const st = freshVisit('name')
  // changes-15: the name is kept, and told, under F1
  const f2 = say(st, 'Anna')
  // talk-live-2 (live-v2 changes-4): what the person does is kept, with its own line
  assert.deepEqual(say(st, 'I run a bakery').note.items, [['work', 'I run a bakery']])
  assert.deepEqual(f2.note.items, [['name', 'Anna']])
  const rm = say(st, 'remember that my club has six courts')
  assert.deepEqual(rm.note.items, [['asked', 'my club has six courts']])
  assert.equal(noteForgotten(f2.note, st.kept), false)
  assert.equal(noteForgotten(rm.note, st.kept), false)
  // the same thing in other capitals is still kept (as the settings page and "remember" count it)
  assert.equal(noteForgotten(f2.note, { name: 'anna' }), false)
  assert.equal(noteForgotten(rm.note, { asked: ['My club has SIX courts'] }), false)
  // forgotten one by one
  forgetAnswer('name', true, st)
  assert.equal(noteForgotten(f2.note, st.kept), true)
  assert.equal(noteForgotten(rm.note, st.kept), false)
  forgetAnswer('all', true, st)
  assert.deepEqual(st.kept, {})
  assert.equal(noteForgotten(rm.note, st.kept), true)
  // a line naming two things: struck once both are gone
  const two = { items: [['name', 'Anna'], ['msg', 'WhatsApp']] }
  assert.equal(noteForgotten(two, { msg: 'WhatsApp' }), false)
  assert.equal(noteForgotten(two, {}), true)
  // "From what I keep: ..." for a service: its topic and value
  const svc = laterVisit({ svc: 'Notion', told: true })
  const used = lineFor(turn('how do I connect a service', svc), svc).used
  assert.deepEqual([used.topic, used.value], ['svc', 'Notion'])
  assert.equal(noteForgotten(used, { svc: 'Notion' }), false)
  assert.equal(noteForgotten(used, { svc: 'Gmail' }), true)
  // nothing to judge by: never struck
  assert.equal(noteForgotten({ text: 'Kept: x.' }, {}), false)
  assert.equal(noteForgotten(null, {}), false)
  assert.equal(stillKept({}, ['name', 'Anna']), false)
})

test('a typed service replaces the kept one too: "I use gmail" with Notion kept gives the Connectors line, "Kept: you use Gmail.", and Gmail in the record', () => {
  const st = laterVisit({ svc: 'Notion', told: true })
  const s = say(st, 'I use gmail')
  assert.equal(s.line, 'CN1')
  assert.equal(s.note.text, 'Kept: you use Gmail.')
  assert.deepEqual(st.kept, { svc: 'Gmail', told: true })
})

test('Builder rule, the edge: while Helper\'s own question is open and the message is no question, the rows are not looked at, so the where line stands as in route2.py', () => {
  const st = freshVisit()
  say(st, 'how does memory work')
  assert.equal(st.pending, 'mem')
  const typed = 'it should watch flight prices always on'
  const route2 = Object.assign(freshVisit(), { wants: false })
  turn('how does memory work', route2)
  assert.equal(turn(typed, route2).kind, 'WHERE')
  assert.equal(turn(typed, st).kind, 'WHERE')
})

test('"what is ..." is looked for at the start only, as Python\'s re.match does', () => {
  assert.equal(whatIs('what is a model'), 'mod')
  assert.equal(whatIs('so what is a model'), 'mod')
  assert.equal(whatIs('tell me what is a model'), null, 'not at the start: no explanation step')
  assert.equal(whatIs('i wonder what is a model'), null)
  assert.equal(whatIs('what is a model and a bot'), null, 'more than the one word: no')
})

test('the new build checks stop the build on broken data (each broken on purpose)', () => {
  const problemsWith = change => {
    const d = JSON.parse(JSON.stringify(DATA))
    change(d)
    return talkProblems(d)
  }
  const has = (ps, start) => assert.ok(ps.some(p => p.startsWith(start)), `${start}: ${JSON.stringify(ps)}`)
  has(problemsWith(d => (d.what_is.pattern = '^(?:what is)\\s+.+$')), 'what_is.pattern has no part to catch')
  has(problemsWith(d => (d.what_is.pattern = '^(?<=x)(')), 'what_is.pattern is not a JavaScript pattern')
  has(problemsWith(d => delete d.what_is.pattern), 'what_is.pattern has no part to catch')
  has(problemsWith(d => (d.what_is.words = {})), 'what_is.words is empty')
  has(problemsWith(d => (d.what_is.words.llm = ['llm'])), 'what_is.words names llm, which is not a topic')
  has(problemsWith(d => (d.cost.words = [])), 'cost.words is empty')
  has(problemsWith(d => delete d.where), 'where.words is empty')
  has(problemsWith(d => (d.w1_pairs = [{ terms: ['skill', 'gadget'] }])), 'w1_pairs:')
  has(problemsWith(d => (d.w1_pairs = [{ terms: ['skill'] }])), 'w1_pairs:')
  for (const k of ['self_words', 'question_words', 'not_words']) has(problemsWith(d => (d.keeps.typed_change[k] = [])), `keeps.typed_change.${k} is empty`)
  has(problemsWith(d => (d.fixed_lines.find(f => f.id === 'COST').next.part = 'billing')), 'COST: a button to a part the plugin cannot open')
  has(problemsWith(d => (d.fixed_lines.find(f => f.id === 'WHERE').next = { kind: 'door', label: 'Go' })), 'WHERE: button of an unknown kind')
  has(problemsWith(d => delete d.fixed_lines.find(f => f.id === 'WHERE').next.label), 'WHERE: button with no label')
  has(problemsWith(d => (d.fixed_lines.find(f => f.id === 'COST').next = { kind: 'paste', label: 'Show me' })), 'COST: text to paste is empty')
  // the parts a fixed line may open are the ones the plugin has
  assert.deepEqual([...FIXED_PARTS].sort(), Object.keys(PARTS).sort())
})

test('the build: the new lines are in the plugin\'s data, and W2 alone may hold two Hermes terms (each still explained); a W2 that breaks another rule still stops the build', () => {
  for (const id of ['COST', 'WHERE', 'W2', 'NAME_AGAIN', 'NAME_NEW']) assert.ok(TALK_DATA.fixed[id] && TALK_DATA.fixed[id].text, id)
  assert.equal(TALK_DATA.keeps.tell.first_time_if_no_model_call, 'I keep this in the Hermes app on this computer. Nothing you type to me goes to any AI or anyone. Never tell me passwords.')
  assert.deepEqual(talkProblems(DATA), [])
  const broken = (id, change) => {
    const d = JSON.parse(JSON.stringify(DATA))
    change(d.fixed_lines.find(f => f.id === id))
    return talkProblems(d)
  }
  // the same two terms in another line: stopped
  assert.ok(broken('COST', f => (f.text = 'A skill is written steps. A plugin is an add-on.')).some(p => p.startsWith('COST: ') && p.includes('Hermes terms in one line')))
  // W2 with a term not explained: stopped
  assert.ok(broken('W2', f => (f.text = 'A skill is one thing. A plugin is another. Pick one.')).some(p => p.startsWith('W2: term not explained')))
  // W2 with a banned word: stopped
  assert.ok(broken('W2', f => (f.text += ' Ask your server.')).some(p => p.startsWith('W2: banned term')))
  // a missing new line: stopped
  const d = JSON.parse(JSON.stringify(DATA))
  d.fixed_lines = d.fixed_lines.filter(f => f.id !== 'NAME_AGAIN')
  assert.ok(talkProblems(d).includes('fixed line NAME_AGAIN is missing'))
})
