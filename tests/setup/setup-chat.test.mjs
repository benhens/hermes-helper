// setup-chat (Lead, 11 Nov; content/helper-setup-chat-v1.md "For builder"): the set-up conversation's fixed rules,
// with no page. Runs on the files as committed (SETUP_BUILT true); skipped when a run switches it off.
//   1. the stages Q_NEW -> Q_GOAL -> SEEN -> REC -> STEP ..., their answers and typed lists; setup_ask; restart
//   3. the rule R1 to R5: all 24576 paths of hhcontent's build.py (tests/fixtures/setup-rule.json,
//      dev/checks/setup-chat/dump_setup.py)
//   4. the steps one at a time, word for word from the set-up list; STUCK's text to paste; "It worked" reads again
//   5. what is kept between visits, and the returning lines
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { SETUP_BUILT } from '../../src/setup-built.js'
import { choose, recText, seenLine, lookList, isSetupAsk, isRestart } from '../../src/setup-chat.js'
import { SETUP_DATA } from '../../src/setup-data.js'
import { cleanKept, keptToStore } from '../../src/kept.js'
import { setupProblems, slimSetupData } from '../../scripts/setup-data.mjs'
import { PINS, TEAM, pinned, teamHas, teamSha } from '../lib/team-pins.mjs'
import { person, NOTHING } from './sim.mjs'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'setup-rule.json'), 'utf8'))
const SETUP_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'helper-setup-chat-v1.json'), 'utf8'))
const LIST_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'dash-setup-list-v2.json'), 'utf8'))
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
const opt = { skip: !SETUP_BUILT && 'the set-up conversation is switched off in this run' }
const lines = l => l.map(x => [x.line, x.text])
const REC4 = ['Show me the steps', "I've done this already", 'Something else', 'Not now']

/* ---------- the data ---------- */
test('the two team files are the copies at the checksums the team named; the build finds no problem in them', opt, t => {
  for (const f of ['content/helper-setup-chat-v1.json', 'content/dash-setup-list-v2.json']) assert.equal(sha(path.join(ROOT, f)), pinned(t, f), f)
  assert.deepEqual(setupProblems(SETUP_JSON, LIST_JSON), [])
  assert.deepEqual(SETUP_DATA, slimSetupData(SETUP_JSON, LIST_JSON), 'src/setup-data.js is what the build makes of them')
})

test('a problem in the data stops the build: a thing with no steps, a fifth answer, a line that lost its slot', opt, () => {
  const a = structuredClone(LIST_JSON)
  a.items.find(i => i.id === 'memory').steps = []
  assert.ok(setupProblems(SETUP_JSON, a).some(p => p.startsWith('memory:')))
  const b = structuredClone(SETUP_JSON)
  b.questions[0].answers.push({ id: 'x', label: 'Fifth' })
  assert.ok(setupProblems(b, LIST_JSON).some(p => p.startsWith('Q_NEW:')))
  const c = structuredClone(SETUP_JSON)
  c.lines.STEP.text = 'Step: {step}'
  assert.ok(setupProblems(c, LIST_JSON).some(p => p.startsWith('line STEP:')))
})

/* ---------- 3: the rule ---------- */
test('the rule R1 to R5: the same thing as hhcontent\'s build.py for all 24576 paths', opt, t => {
  if (teamHas('dev/checks/hhcontent-setup-chat-v1/build.py') && teamSha('dev/checks/hhcontent-setup-chat-v1/build.py') !== FIX.build_py_sha256) t.diagnostic('the team\'s build.py has moved on since the fixture was made')
  assert.deepEqual(FIX.order, SETUP_DATA.rule_order)
  let n = 0
  const rules = {}
  for (const [key, row] of Object.entries(FIX.paths)) {
    const [model, isNew, goal] = key.split('|')
    assert.equal(row.length, 2 * 512, key)
    for (let mask = 0; mask < 512; mask++) {
      const done = FIX.order.filter((_, i) => (mask >> i) & 1)
      const [item, rule] = choose(model, isNew, goal, done)
      const code = (item === null ? '-' : item === 'model' ? 'm' : String(FIX.order.indexOf(item))) + rule[1]
      if (code !== row.slice(2 * mask, 2 * mask + 2)) assert.fail(`${key} done ${done.join(',')}: ${item} ${rule}, build.py says ${row.slice(2 * mask, 2 * mask + 2)}`)
      rules[rule] = (rules[rule] || 0) + 1
      n++
    }
  }
  assert.equal(n, 24576)
  assert.equal(FIX.count, 24576)
  assert.deepEqual(Object.keys(rules).sort(), ['R1', 'R2', 'R3', 'R4', 'R5'], 'every rule is reached')
})

test('the rule on the data\'s own table (nothing done yet, 48 rows), and its examples', opt, () => {
  assert.equal(SETUP_JSON.table_nothing_done.length, 48)
  for (const r of SETUP_JSON.table_nothing_done) assert.equal(choose(r.model, r.new, r.goal, [])[0], r.nothing_done, JSON.stringify(r))
  assert.deepEqual(choose('ok', 'new', 'schedule', []), ['first_chat', 'R2'])
  assert.deepEqual(choose('ok', 'some', 'schedule', []), ['scheduled_job', 'R3'])
  assert.deepEqual(choose('ok', 'well', 'unsure', []), ['personality', 'R4'])
  assert.deepEqual(choose('not', 'well', 'bots', SETUP_DATA.rule_order), ['model', 'R1'], 'the model first, whatever the answers')
  assert.deepEqual(choose('unread', 'well', 'unsure', SETUP_DATA.rule_order), [null, 'R5'], 'a model read that failed does not block')
})

test('the written recommendation and the look line: word for word as build.py makes them', opt, () => {
  for (const r of FIX.recs) assert.equal(recText(r.item, r.rule, r.new, r.goal), r.text, JSON.stringify(r))
  for (const s of FIX.seen) assert.equal(seenLine({ model: s.model, soul: s.soul, jobs: s.jobs, bots: s.bots }, s.goal), s.line, JSON.stringify(s))
  assert.ok(FIX.recs.length >= 100 && FIX.seen.length >= 200)
})

test('a read that failed is said as "couldn\'t", never as done or not done', opt, () => {
  const seen = { model: 'unread', soul: null, jobs: null, bots: null }
  assert.equal(seenLine(seen, 'schedule'), "I looked at your Hermes. I couldn't check your model this time. I couldn't read that part this time.")
  assert.equal(seenLine(seen, 'unsure'), "I looked at your Hermes. I couldn't check your model this time. I couldn't read that part this time.")
  assert.equal(seenLine(seen, 'phone'), "I looked at your Hermes. I couldn't check your model this time. I can't see whether you use a chat app.")
  assert.deepEqual(lookList(seen), ['Hermes installed: yes', "A model that answers: couldn't check", "Its own personality text: couldn't check", "Scheduled jobs: couldn't check", "Bots: couldn't check", "I can't see: first chat, chat apps, tools, memory, safety."])
  assert.deepEqual(lookList({ model: 'ok', soul: false, jobs: 2, bots: 1 }), ['Hermes installed: yes', 'A model that answers: yes', 'Its own personality text: no', 'Scheduled jobs: 2', 'Bots: 1', "I can't see: first chat, chat apps, tools, memory, safety."])
})

/* ---------- 1 and 4: conversation (a) ---------- */
const FIRST_CHAT = ['Click New session at the top of the left list (or Ctrl+N; Cmd+N on a Mac).', 'Ask something small you can check yourself.', 'Check: Hermes answers, with no error.', 'Check: ask one more thing in the same chat. It carries on.', 'To come back: click Helper in the left list.']
test('conversation (a) of the write-up: Peter, a tennis club, only installed', opt, () => {
  const p = person()
  p.type('Peter')
  p.type('I run a tennis club')
  let l = p.last()
  assert.deepEqual([l.line, l.text], ['F2', "Thanks, Peter. I'll help you set up Hermes for that. Are you new to Hermes?"])
  assert.deepEqual(p.labels(), ["Yes, I'm new", "I've used it a bit", 'I know it well', 'Skip'])
  assert.equal(l.note.text, 'Kept: I run a tennis club.')
  assert.equal(l.offer, undefined, 'no offer under it: the question is the set-up conversation\'s')
  p.said()
  p.press("Yes, I'm new")
  l = p.last()
  assert.deepEqual([l.line, l.text], ['Q_GOAL', 'Do you want jobs at set times, phone chats, or something else?'])
  assert.deepEqual(p.labels(), ['Do things at set times', 'Talk to it from my phone', 'Several bots, one per job', 'Not sure yet'])
  assert.equal(l.note.text, "Kept: new to Hermes: Yes, I'm new.")
  assert.equal(p.looks.length, 0, 'no look yet')
  p.said()
  p.type('send reminders to my members about training')
  assert.equal(p.looks.length, 1, 'Helper looks by itself at Q_GOAL\'s answer')
  let s = p.said()
  assert.deepEqual(lines(s), [
    ['SEEN', 'I looked at your Hermes. You have a model, the AI that thinks, and it answers. You have no scheduled jobs yet.'],
    ['REC', "You're new, so first check that Hermes answers you. Next: First chat. Ask Hermes one small thing, to see that it works. Want the steps?"]
  ])
  assert.equal(s[0].note.text, 'Kept: send reminders to my members about training.')
  assert.equal(s[0].hint, 'Read from your Hermes on this computer. Nothing was sent, and no AI was used.')
  assert.equal(s[0].next.label, 'What did you look at?')
  assert.deepEqual(p.labels(), REC4)
  assert.deepEqual([p.st.kept.setup_new, p.st.kept.setup_goal, p.st.kept.setup_goal_id, p.st.kept.setup_current], ['new', 'send reminders to my members about training', 'schedule', 'first_chat'])
  // First chat's steps, one at a time, word for word from the set-up list
  p.press('Show me the steps')
  FIRST_CHAT.forEach((step, i) => {
    const last = i === FIRST_CHAT.length - 1
    assert.equal(p.last().text, `Step ${i + 1} of 5: ${step}`)
    assert.deepEqual(p.labels(), last ? ['It worked', "It didn't work", 'Stop for now'] : ['Done', "I'm stuck", 'Stop for now'])
    if (!last) p.press('Done')
  })
  assert.deepEqual(FIRST_CHAT, LIST_JSON.items.find(i => i.id === 'first_chat').steps.map(x => x.text))
  p.said()
  p.press('It worked')
  assert.equal(p.looks.length, 2, '"It worked" reads again')
  s = p.said()
  assert.deepEqual(lines(s), [
    ['DONE_SAID', "Good. I can't see that one, so I'll take your word."],
    ['REC', 'You want Hermes to do things at set times. Next: Scheduled jobs. Hermes does a job for you at set times, like every morning. Want the steps?']
  ])
  assert.deepEqual(p.st.kept.setup_done_said, ['first_chat'])
  assert.equal(p.st.kept.setup_current, 'scheduled_job')
  p.press('Not now')
  s = p.said()
  assert.deepEqual([s[0].line, s[0].text], ['NOT_NOW', "That's fine. I'll keep your place."])
  assert.equal(s[1].line, 'offer-general_2', 'not the set-up again right after Not now')
  assert.deepEqual(p.labels(), ['Which AI to use', 'Phone and chat apps'])
  // Hermes closed and opened: the returning line, from what is kept
  const back = person(NOTHING(), { kept: cleanKept(keptToStore(p.st.kept)), met: true }).opening()
  assert.deepEqual([back.last().line, back.last().text], ['BACK_REC', 'Hi again, Peter. Next on your list: Scheduled jobs. Hermes does a job for you at set times, like every morning. Want the steps?'])
  assert.deepEqual(back.labels(), REC4)
})

test('the scheduled job\'s steps, then "It worked": Helper reads again and says what it sees; the next thing follows', opt, () => {
  const p = person()
  p.type('Ana')
  p.type('I work in sales')
  p.press("I've used it a bit")
  p.type('a summary of my emails every morning')
  assert.equal(p.last().text, 'You want Hermes to do things at set times. Next: Scheduled jobs. Hermes does a job for you at set times, like every morning. Want the steps?')
  p.press('Show me the steps')
  const steps = LIST_JSON.items.find(i => i.id === 'scheduled_job').steps.map(x => x.text)
  steps.forEach((step, i) => {
    assert.equal(p.last().text, `Step ${i + 1} of ${steps.length}: ${step}`)
    if (i < steps.length - 1) p.press('Done')
  })
  // not made yet: Helper does not take the person's word for a thing it can see
  p.said()
  p.press('It worked')
  let s = p.said()
  assert.deepEqual(lines(s), [['NOT_SEEN', "I can't see it yet. I only look at your main bot."]])
  assert.deepEqual(p.labels(), ['Show me the steps', 'I did it on another bot', 'Not now'])
  p.press('Show me the steps')
  assert.match(p.last().text, /^Step 1 of 3: /)
  for (let i = 0; i < 2; i++) p.press('Done')
  p.reads.jobs = 1 // the job is made in Hermes
  p.said()
  p.press('It worked')
  s = p.said()
  assert.deepEqual(lines(s), [
    ['DONE_SEEN', 'I can see it now. You have 1 scheduled job.'],
    ['REC', 'This is next in the order the Hermes docs suggest. Next: Its personality. A short text that tells your Hermes who it is and how to talk. Want the steps?']
  ])
  assert.equal(p.st.kept.setup_done_said, undefined, 'seen, so not kept as said')
})

test('"I\'m stuck": the line and the text to paste with the thing and the step; for the model, the docs page instead', opt, () => {
  const p = person()
  p.type('Ana')
  p.type('I work in sales')
  p.press('I know it well')
  p.press('Talk to it from my phone')
  assert.match(p.last().text, /^You want to talk to Hermes from your phone\. Next: Chat apps\./)
  p.press('Show me the steps').press('Done').press("I'm stuck")
  let l = p.last()
  assert.deepEqual([l.line, l.text], ['STUCK', 'Your own Hermes can help with this. Paste this into a new chat there.'])
  assert.equal(l.paste, "I'm setting up Chat apps in Hermes. I'm stuck at this step: On the Telegram card, click Create with QR. Scan the code with Telegram on your phone. Please help me, one small step at a time.")
  assert.deepEqual(p.labels(), ['Done, it works now', 'Stop for now'])
  p.press('Done, it works now')
  assert.equal(p.said().find(x => x.line === 'DONE_SAID').text, "Good. I can't see that one, so I'll take your word.")
  const m = person({ model: 'not', soul: false, jobs: 0, bots: 1 })
  m.skip()
  m.press('Skip').press('Not sure yet')
  assert.equal(m.log.find(x => x.line === 'SEEN').text, 'I looked at your Hermes. You have no model that answers yet (the AI that thinks). Its personality text is still the starter one.')
  assert.match(m.last().text, /^Hermes needs a model before anything else\. Next: A model\./)
  m.press('Show me the steps').press("I'm stuck")
  l = m.last()
  assert.deepEqual([l.line, l.text], ['STUCK_MODEL', "Your Hermes can't answer yet, so it can't help here. The docs page Quickstart walks through it."])
  assert.deepEqual(l.next, { kind: 'docs', label: 'Open the Quickstart', url: 'https://hermes-agent.nousresearch.com/docs/getting-started/quickstart' })
  assert.equal(l.paste, null)
})

/* ---------- conversation (c): skips everything ---------- */
test('conversation (c): Skip, Skip, Not sure yet: nothing kept, the usual first step, then the docs\' order', opt, () => {
  const p = person()
  p.skip()
  assert.deepEqual([p.last().line, p.last().text], ['F3', "That's fine. I'll help you set up Hermes. Are you new to Hermes?"])
  p.press('Skip')
  assert.equal(p.last().note, null, 'Skip is not kept')
  p.press('Not sure yet')
  const s = p.said()
  assert.equal(s.find(x => x.line === 'SEEN').text, 'I looked at your Hermes. You have a model, the AI that thinks, and it answers. Its personality text is still the starter one.')
  assert.equal(s.find(x => x.line === 'SEEN').note, null)
  assert.equal(p.last().text, 'The usual first step is to check that Hermes answers. Next: First chat. Ask Hermes one small thing, to see that it works. Want the steps?')
  p.press("I've done this already")
  assert.deepEqual(lines(p.said()), [['DONE_SAID', "Good. I can't see that one, so I'll take your word."], ['REC', 'This is next in the order the Hermes docs suggest. Next: Its personality. A short text that tells your Hermes who it is and how to talk. Want the steps?']])
  p.press("I've done this already")
  // setup-chat-2 (changes-1 ALREADY_SEEABLE): a thing Helper can see, and does not see done
  assert.equal(p.said()[0].text, "I can't see that yet. Its personality text is still the starter one.")
  p.press('Count it as done')
  assert.equal(p.said()[0].text, "Fine. I'll count it as done.")
  p.press('Something else')
  assert.equal(p.said()[0].text, "Fine, here's another.")
  assert.deepEqual(p.st.kept.setup_done_said, ['first_chat', 'personality'], 'Something else is for this visit only')
  assert.deepEqual(Object.keys(keptToStore(p.st.kept)).sort(), ['setup_current', 'setup_done_said'])
})

/* ---------- typed answers ---------- */
test('Q_NEW typed: the lists in the order well, some, new; anything else is Skip and is not kept', opt, () => {
  const ask = typed => {
    const p = person()
    p.skip()
    p.type(typed)
    return [p.last().line, p.st.kept.setup_new || null]
  }
  assert.deepEqual(ask('yes'), ['Q_GOAL', 'new'])
  assert.deepEqual(ask('just installed it'), ['Q_GOAL', 'new'])
  assert.deepEqual(ask('a little'), ['Q_GOAL', 'some'])
  assert.deepEqual(ask('no, I know it'), ['Q_GOAL', 'well'])
  assert.deepEqual(ask('not new'), ['Q_GOAL', 'well'], 'well before new')
  assert.deepEqual(ask('banana'), ['Q_GOAL', null])
  assert.deepEqual(ask("Yes, I'm new"), ['Q_GOAL', 'new'], 'an answer\'s own label typed')
})

test('Q_GOAL typed: schedule, then phone, then bots; no match is Not sure yet with the typed text still kept; too long or secret-looking is not kept', opt, () => {
  const ask = typed => {
    const p = person()
    p.skip()
    p.press('I know it well')
    p.type(typed)
    return [p.st.kept.setup_goal_id || null, p.st.kept.setup_goal || null, p.st.kept.setup_current]
  }
  assert.deepEqual(ask('remind me of things'), ['schedule', 'remind me of things', 'scheduled_job'])
  assert.deepEqual(ask('send reminders to my phone every morning'), ['schedule', 'send reminders to my phone every morning', 'scheduled_job'], 'two lists hit: the first in order')
  assert.deepEqual(ask('chat with it on telegram'), ['phone', 'chat with it on telegram', 'chat_apps'])
  assert.deepEqual(ask('a bot for each client'), ['bots', 'a bot for each client', 'second_bot'])
  assert.deepEqual(ask('write my novel'), ['unsure', 'write my novel', 'personality'])
  assert.deepEqual(ask('skip'), [null, null, 'personality'])
  assert.deepEqual(ask('one two three four five six seven eight nine ten eleven twelve thirteen'), [null, null, 'personality'], 'more than 12 words: used for the goal, not kept')
})

test('a question typed in place of an answer is answered by the ordinary talk, then the question is asked again, once', opt, () => {
  const p = person()
  p.skip()
  p.said()
  p.type('what is a skill?')
  let s = p.said()
  assert.equal(s[0].line, 'term-skill')
  assert.deepEqual([s.at(-1).line, s.at(-1).text], ['SETUP_REASK', "When you're ready: are you new to Hermes?"])
  assert.deepEqual(p.labels(), ["Yes, I'm new", "I've used it a bit", 'I know it well', 'Skip'])
  p.type('what is a plugin?')
  s = p.said()
  assert.equal(s.some(x => x.line === 'SETUP_REASK'), false, 'once only')
  p.type('yes')
  assert.equal(p.last().line, 'Q_GOAL')
  p.said()
  p.type('what is a plugin?')
  s = p.said()
  assert.deepEqual([s.at(-1).line, s.at(-1).text], ['SETUP_REASK_GOAL', "When you're ready: do you want jobs, phone chats, or more?"])
})

/* ---------- setup_ask and restart ---------- */
test('setup_ask: "what should I set up first", "where do I start" and the like run the look and the recommendation, not the don\'t-know line', opt, () => {
  for (const ph of SETUP_DATA.ask_phrases) assert.equal(isSetupAsk(ph), true, ph)
  for (const typed of ['what should I set up first', 'where do I start', 'Where do I start?', 'help me set up', "I'm lost"]) {
    const p = person()
    p.type('Ana').type('I work in sales')
    p.press('I know it well').press('Not sure yet').press('Not now')
    p.said()
    const looks = p.looks.length
    p.type(typed)
    const s = p.said()
    assert.equal(p.looks.length, looks + 1, typed + ': the look runs')
    assert.deepEqual(s.map(x => x.line), ['SEEN', 'REC'], typed)
    assert.match(s[1].text, /Next: Its personality\./)
  }
  // with a question not answered yet, that question first
  const q = person()
  q.skip()
  q.type('what is a skill?')
  q.said()
  q.type('where do I start')
  assert.deepEqual(lines(q.said()), [['Q_NEW', 'Are you new to Hermes?']])
})

test('"start again": the two answers and the thing recommended are cleared, the name, what you do and the things said done stay', opt, () => {
  for (const ph of SETUP_DATA.restart_phrases) assert.equal(isRestart(ph), true, ph)
  const p = person()
  p.type('Peter').type('I run a tennis club')
  p.press("Yes, I'm new").press('Do things at set times').press("I've done this already")
  assert.deepEqual(Object.keys(p.st.kept).filter(k => k.startsWith('setup')).sort(), ['setup_current', 'setup_done_said', 'setup_goal', 'setup_goal_id', 'setup_new'])
  p.type('start again')
  // loom-fixes (the data's RESTART.then): "Sure, let's start again.", then the first question as its own bubble
  const said = p.said()
  assert.deepEqual(said.slice(-2).map(x => [x.line, x.text]), [['RESTART', "Sure, let's start again."], ['Q_NEW', 'Are you new to Hermes?']])
  assert.deepEqual(p.labels(), ["Yes, I'm new", "I've used it a bit", 'I know it well', 'Skip'])
  assert.deepEqual(Object.keys(p.st.kept).filter(k => !k.startsWith('told')).sort(), ['name', 'setup_done_said', 'work'])
  p.press('I know it well')
  assert.equal(p.last().line, 'Q_GOAL')
})

test('during the steps, "next", "done" and "what next" mean the next step', opt, () => {
  const p = person()
  p.skip()
  p.press('Skip').press('Not sure yet').press('Show me the steps')
  for (const [typed, n] of [['next', 2], ['done', 3], ['what next', 4]]) {
    p.type(typed)
    assert.match(p.last().text, new RegExp(`^Step ${n} of 5: `), typed)
  }
  p.type('stop for now')
  assert.equal(p.last().line.startsWith('offer-') ? p.log.at(-2).line : p.last().line, 'NOT_NOW')
})

/* ---------- 5: kept between visits, and the returning lines ---------- */
test('what is kept is cleaned when read back: only the data\'s ids, a goal text only by the What you do rule', opt, () => {
  const ok = { setup_new: 'some', setup_goal: 'Do things at set times', setup_goal_id: 'schedule', setup_done_said: ['first_chat', 'memory'], setup_current: 'chat_apps' }
  assert.deepEqual(cleanKept(ok), ok)
  assert.deepEqual(cleanKept({ setup_new: 'skip', setup_goal: 'x', setup_goal_id: 'nope', setup_done_said: ['nope', 'memory', 'memory'], setup_current: 'install' }), { setup_done_said: ['memory'] })
  assert.deepEqual(cleanKept({ setup_goal: 'my password is hunter2hunter2 ok', setup_goal_id: 'unsure' }).setup_goal, undefined)
  assert.equal(keptToStore({}), null)
  assert.deepEqual(keptToStore({ setup_new: 'new' }), { setup_new: 'new' }, 'kept also with no name')
})

test('returning: the thing picked last time; seen done now; before the questions; all done', opt, () => {
  const kept = { name: 'Peter', setup_new: 'new', setup_goal: 'Do things at set times', setup_goal_id: 'schedule', setup_done_said: ['first_chat'], setup_current: 'scheduled_job' }
  let p = person(NOTHING(), { kept: { ...kept }, met: true }).opening()
  assert.deepEqual(lines(p.log), [['BACK_REC', 'Hi again, Peter. Next on your list: Scheduled jobs. Hermes does a job for you at set times, like every morning. Want the steps?']])
  assert.deepEqual(p.labels(), REC4)
  p.press('Show me the steps')
  assert.match(p.last().text, /^Step 1 of 3: In a chat, ask in plain words/)
  // the job was made meanwhile: Helper reads first and says so, then the next thing
  p = person({ model: 'ok', soul: false, jobs: 2, bots: 1 }, { kept: { ...kept }, met: true }).opening()
  assert.deepEqual(lines(p.log), [
    ['BACK_DONE', 'Hi again, Peter. I can see it now. You have 2 scheduled jobs.'],
    ['REC', 'This is next in the order the Hermes docs suggest. Next: Its personality. A short text that tells your Hermes who it is and how to talk. Want the steps?']
  ])
  assert.equal(p.st.kept.setup_current, 'personality')
  // no name kept
  p = person(NOTHING(), { kept: { setup_current: 'memory' }, met: true }).opening()
  assert.deepEqual(lines(p.log), [['BACK_REC', `Hi again. Next on your list: Memory. ${LIST_JSON.items.find(i => i.id === 'memory').why} Want the steps?`]])
  // closed before the questions
  p = person(NOTHING(), { kept: { name: 'Peter', work: 'I run a tennis club' }, met: true }).opening()
  assert.deepEqual(lines(p.log), [['BACK_Q', 'Hi again, Peter. Before we go on: are you new to Hermes?']])
  assert.deepEqual(p.labels(), ["Yes, I'm new", "I've used it a bit", 'I know it well', 'Skip'])
  // Q_NEW answered, Q_GOAL never shown
  p = person(NOTHING(), { kept: { name: 'Peter', setup_new: 'well' }, met: true }).opening()
  assert.deepEqual(lines(p.log), [['BACK', 'Hi again, Peter.'], ['Q_GOAL', 'Do you want jobs at set times, phone chats, or something else?']])
  // everything done: the old BACK with its offer
  p = person({ model: 'ok', soul: true, jobs: 1, bots: 2 }, { kept: { name: 'Peter', setup_new: 'well', setup_goal: 'Not much', setup_goal_id: 'unsure', setup_done_said: ['chat_apps', 'tools_apps', 'memory', 'safety', 'skills'] }, met: true }).opening()
  // setup-chat-2 (changes-1 BACK_SEEN, "... or ALL_DONE"): a thing seen done is named first, then all done
  assert.deepEqual(p.log.map(x => x.line), ['BACK_SEEN', 'ALL_DONE', 'offer-general_2'])
  assert.equal(p.log[0].text, 'Hi again, Peter. I can see you have 1 scheduled job.')
  // nothing seen done (all said done): the old BACK alone, with its offer
  p = person({ model: 'ok', soul: false, jobs: 0, bots: 1 }, { kept: { name: 'Peter', setup_new: 'well', setup_goal: 'Not much', setup_goal_id: 'unsure', setup_done_said: ['personality', 'scheduled_job', 'second_bot', 'chat_apps', 'tools_apps', 'memory', 'safety', 'skills'] }, met: true }).opening()
  assert.deepEqual(p.log.map(x => x.line), ['BACK', 'offer-general_2'])
  assert.equal(p.log[0].text, 'Hi again, Peter.')
})

test('a read that fails after "It worked": Helper says it could not read it and takes the person\'s word, never "I can see it"', opt, () => {
  const p = person()
  p.skip()
  p.press('I know it well').press('Do things at set times').press('Show me the steps')
  for (let i = 0; i < 2; i++) p.press('Done')
  p.reads.jobs = null
  p.said()
  p.press('It worked')
  const s = p.said()
  assert.equal(s[0].text, "I couldn't read that part this time. Good. I can't see that one, so I'll take your word.")
  assert.equal(s.some(x => /I can see it now/.test(x.text)), false)
  assert.deepEqual(p.st.kept.setup_done_said, ['scheduled_job'])
})

test('"What did you look at?": the six short lines of the last look', opt, () => {
  const p = person({ model: 'ok', soul: false, jobs: 0, bots: 3 })
  p.skip()
  p.press('Skip').press('Not sure yet')
  p.said()
  p.button('What did you look at?')
  const l = p.said()[0]
  assert.equal(l.line, 'LOOK_LIST')
  assert.deepEqual(l.rows, ['Hermes installed: yes', 'A model that answers: yes', 'Its own personality text: no', 'Scheduled jobs: 0', 'Bots: 3', "I can't see: first chat, chat apps, tools, memory, safety."])
  assert.equal(p.looks.length, 1, 'no new read for it')
  // the recommendation's four answers stay under the list, and still work
  assert.deepEqual(p.labels(), REC4)
  p.press('Show me the steps')
  assert.match(p.last().text, /^Step 1 of 5: /)
})
