// setup-chat (Lead, 11 Nov): the checks on a written reply that changed with live changes-6, -7, offer-t1 (changes-8)
// and live changes-9, and Lead's points 9, 10 and 14.
//   9.  readWritten reads the USED label in any case; a reply with nothing left after the label is no reply
//   10. a reply to a follow-up with rows handed but no USED line is not judged as ordinary talk by c21
//   14. three correct replies hhtech saw dropped (docs/answers/hhtech-ask-run.md, raw text from
//       dev/checks/hhtech-ask-run/calls-A.json, calls-D0.json) are shown now, each with its raw text
//   c16 allow (changes-6), c26 skip_in_hand (changes-6), c27 apostrophes (changes-7), c28 (changes-8), c29 (changes-9)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { readWritten, judgeWritten, replyFlags, c16Fails, c26Fails, c27Fails, c28Fails, c29Fails } from '../src/live-checks.js'
import { LIVE_ROW } from '../src/live-rows.js'

const CONTENT = path.resolve(import.meta.dirname, '..', 'content')
const LIVE_JSON = JSON.parse(fs.readFileSync(path.join(CONTENT, 'helper-talk-live-v2.json'), 'utf8'))
const rows = ids => ids.map(id => LIVE_ROW[id])

/* ---------- point 9: the USED reader ---------- */
test('point 9: the USED label is read in any case, and cut from the reply', () => {
  for (const label of ['USED', 'Used', 'used']) {
    assert.deepEqual(readWritten(`A skill is a set of written steps.\n${label}: skill`), { text: 'A skill is a set of written steps.', used: ['skill'] }, label)
  }
  assert.deepEqual(readWritten('A skill is a set of written steps. Used: [skill]'), { text: 'A skill is a set of written steps.', used: ['skill'] }, 'on the same line')
})

test('point 9: a reply with nothing left after the label is no reply ("Used: none." is never shown)', () => {
  for (const raw of ['Used: none.', 'USED: none', 'used: none.', 'Used:', '.\nUsed: skill', 'None.\nUSED: none']) {
    assert.equal(readWritten(raw).text, '', JSON.stringify(raw))
    assert.deepEqual(judgeWritten(raw, rows(['skill']), {}), { fail: 'c0 empty' }, JSON.stringify(raw))
  }
})

test('point 9: a second label left in the reply fails c26, so the label never shows', () => {
  const { text } = readWritten('It is a guide. Used: skill\nMore.\nUSED: skill')
  assert.match(text, /Used: skill/)
  assert.equal(c26Fails(text), 'USED')
})

/* ---------- point 10: c21 ---------- */
test('point 10: rows handed and no USED line: the reply is not judged as ordinary talk by c21; with "USED: none" it is', () => {
  const reply = 'A skill is a set of written steps that teach Hermes one task.'
  const noLine = replyFlags(reply, rows(['skill']), null, {})
  assert.equal(noLine.some(f => f.startsWith('c21')), false, noLine.join(' | '))
  assert.equal(replyFlags(reply, rows(['skill']), ['none'], {}).some(f => f.startsWith('c21')), true, 'USED: none is ordinary talk, and a fact word then fails c21')
  assert.equal(replyFlags(reply, [], null, {}).some(f => f.startsWith('c21')), true, 'no row handed: ordinary talk, as before')
})

/* ---------- point 14: correct replies that were dropped ---------- */
const DROPPED = [
  {
    name: '"I don\'t get it" after the skill line (was refused by c16: "guide" read as a product word)',
    raw: 'It’s a written guide that teaches Hermes how to handle one specific task.  \nUSED: [skill]',
    ids: ['skill'],
    message: "I don't get it",
    lastLine: 'A skill is a set of written steps that teach Hermes one task.',
    shown: "It's a written guide that teaches Hermes how to handle one specific task.",
    used: ['skill']
  },
  {
    name: '"ok and how do I do that" after the news line (was refused by c20: the row says "only while", the reply "while")',
    raw: 'Ask Hermes in plain words for a news summary every morning. It runs while Hermes is running on a computer that’s on.\nUSED: sch0, sch1, sch4',
    ids: ['sch0', 'sch1', 'sch2', 'sch3', 'sch4'],
    message: 'ok and how do I do that',
    lastLine: 'Hermes can repeat a job every day or week. Ask it once, in plain words.',
    shown: "Ask Hermes in plain words for a news summary every morning. It runs while Hermes is running on a computer that's on.",
    used: ['sch0', 'sch1', 'sch4']
  },
  {
    name: '"can I run the AI on my own laptop" (run A; passed the checks at 0fead0a too)',
    raw: 'Yes, Hermes can run an AI on your own computer. It answers and runs jobs only while that computer is on.\n\nUSED: mod3, WHERE',
    ids: ['mod3', 'WHERE'],
    message: 'can I run the AI on my own laptop',
    lastLine: 'A model is the AI that does the thinking. Hermes needs one to answer.',
    shown: 'Yes, Hermes can run an AI on your own computer. It answers and runs jobs only while that computer is on.',
    used: ['mod3', 'WHERE']
  }
]
for (const c of DROPPED) {
  test('point 14, shown now: ' + c.name, () => {
    assert.deepEqual(judgeWritten(c.raw, rows(c.ids), { lastLine: c.lastLine, message: c.message, work: null }), { text: c.shown, used: c.used })
  })
}

// Not fixed, on purpose, and told to Lead: the same question in run D0 dropped the word "only" altogether. c20 exists to
// stop exactly that, and whether "while the laptop is on" still says the row's condition is hhcontent's call.
test('point 14, still refused (told to Lead): the laptop reply of run D0, which drops "only" and changes the words after it', () => {
  const raw = 'Yes, Hermes can run an AI on your own laptop. It answers and runs jobs while the laptop is on.\nUSED: mod3, WHERE'
  const j = judgeWritten(raw, rows(['mod3', 'WHERE']), { lastLine: '', message: 'can I run the AI on my own laptop', work: null })
  assert.equal(j.fail, 'c20 dropped only/never')
})

test('c20 still refuses a reply that drops "never", and one that drops "only" with other words after it', () => {
  const never = [{ id: 'x', text: 'Hermes never sends your files anywhere.', subject: 'mem', kw: [], weak: [] }]
  assert.equal(replyFlags('Hermes sends your files anywhere.', never, ['x'], {}).includes('c20 dropped only/never'), true)
  assert.equal(replyFlags('It runs jobs at any time.', rows(['sch0', 'sch1', 'sch4']), ['sch4'], {}).includes('c20 dropped only/never'), LIVE_ROW.sch4.text.includes('only'))
})

/* ---------- c16 allow (live changes-6) ---------- */
test('c16 (changes-6): guide and guides fail only in a sentence that speaks of Helper; other product words fail as before', () => {
  assert.equal(c16Fails('It is a written guide that teaches Hermes one task.'), false)
  const helperSentence = ['I am your guide.', 'Helper is a guide to Hermes.'].filter(s => c16Fails(s))
  assert.ok(helperSentence.length >= 1, 'a sentence that speaks of Helper with the word guide fails')
  const other = LIVE_JSON.checks.list.find(c => c.id === 'c16')
  assert.ok(other.allow_c6.words.includes('guide'))
})

/* ---------- c26 skip_in_hand (live changes-6) ---------- */
test('c26 (changes-6): a word that is also in the handed rows does not fail the reply; USED in capitals always does', () => {
  const words = LIVE_JSON.checks_c5.list.find(c => c.id === 'c26')
  assert.ok(words, 'c26 is in the data')
  assert.equal(c26Fails('That is all. USED'), 'USED')
  assert.equal(c26Fails('A plain sentence about Hermes.'), null)
})

/* ---------- c27 apostrophes (live changes-7) ---------- */
test('c27 (changes-7): a curly apostrophe in the message or the reply is read as a straight one', () => {
  const pairs = [
    ["I don't get it", 'You don’t get it yet, and that is fine.'],
    ['I don’t get it', "You don't get it yet, and that is fine."]
  ]
  for (const [message, reply] of pairs) {
    assert.deepEqual(c27Fails(reply, message), c27Fails(reply.replace(/’/g, "'"), message.replace(/’/g, "'")), message)
  }
})

/* ---------- c28 (offer-t1, changes-8) ---------- */
test('c28 (changes-8): hhcontent\'s own cases, from the data', () => {
  const c28 = LIVE_JSON.checks_c5.list.find(c => c.id === 'c28')
  assert.equal(c28.cases.length, 6)
  for (const c of c28.cases) assert.equal(c28Fails(c.reply) ? 'c28' : 'passes', c.result, c.reply)
  assert.ok(c28.cases.some(c => c.result === 'c28') && c28.cases.some(c => c.result === 'passes'), 'both answers are among the cases')
})

test('c28: a reply ending "ask me" or with an open question is dropped by judgeWritten; the same reply without the ending is shown', () => {
  const r = rows(['skill'])
  const talk = { lastLine: '', message: 'what is a skill', work: null }
  const good = 'A skill is a set of written steps that teach Hermes one task.'
  assert.deepEqual(judgeWritten(good + '\nUSED: skill', r, talk), { text: good, used: ['skill'] })
  for (const end of [' Ask me if you want more.', ' What would you like to know next?', ' Feel free to ask.']) {
    const j = judgeWritten(good + end + '\nUSED: skill', r, talk)
    assert.ok(j.flags && j.flags.includes('c28 ends on an invitation or a question'), end)
  }
})

/* ---------- c29 (live changes-9) ---------- */
// hhcontent's own cases (dev/checks/hhcontent-live-v2-changes-9/check_c9.py, list W), with the handed text it uses
const HAND = 'Telegram has a quick setup. In the app, open Messaging and press Create with QR. Hermes can run a Scheduled job.'
const C29 = [
  ['bad', 'I run a tennis club', 'You can then start playing tennis.'],
  ['bad', 'I run a tennis club', 'Hermes has a tennis mode.'],
  ['bad', 'I run a tennis club', 'Then open your tennis club in Telegram.'],
  ['bad', 'I run a tennis club', 'Tennis clubs use Hermes a lot.'],
  ['bad', 'I am a baker', 'Next, bake the bot.'],
  ['bad', 'I run a tennis club', 'Hermes is great for your tennis club.'],
  ['good', 'I coach tennis training', 'Reminders about training fit a Scheduled job.'],
  ['good', 'I run a tennis club', 'Hermes can send reminders for your tennis club on a schedule.'],
  ['good', 'I run a tennis club', 'Telegram has a quick setup. Open Messaging and press Create with QR.'],
  ['good', 'I run a tennis club', 'A Scheduled job fits things like tennis lessons that repeat.'],
  ['good', 'I run a tennis club', 'For your tennis club, open Messaging and press Create with QR.']
]
test('c29 (changes-9): what the person does used as a step or as a fact about Hermes; the same answers as check_c9.py prints for its cases', () => {
  const printed = fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures', 'c9-cases.txt'), 'utf8')
  for (const [want, work, reply] of C29) {
    const got = c29Fails(reply, work, HAND) ? 'FAILS' : 'passes'
    const line = printed.split('\n').find(l => l.includes(reply))
    assert.ok(line, 'check_c9.py printed this case: ' + reply)
    assert.equal(got, /\bFAILS\b/.test(line) ? 'FAILS' : 'passes', `${want}: ${reply}`)
  }
})

test('c29 runs only when the About them line was in the call (not on a follow-up, where it is not handed)', () => {
  const r = rows(['msg1'])
  const reply = 'You can then start playing tennis.'
  const withWork = replyFlags(reply, r, ['msg1'], { work: 'I run a tennis club', workHanded: true })
  const without = replyFlags(reply, r, ['msg1'], { work: 'I run a tennis club', workHanded: false })
  assert.equal(withWork.some(f => f.startsWith('c29')), true)
  assert.equal(without.some(f => f.startsWith('c29')), false)
})

// changes-7, For builder: "Add a test: "what’s next" with the reply "Your AI is set." fails as c27-next."
test('c27 (changes-7): "what’s next" (curly) with the reply "Your AI is set." fails as c27-next, as the straight one does', () => {
  // (the plugin names the flag "c27 next": c27Fails gives the id, replyFlags puts "c27 " before it)
  assert.deepEqual(c27Fails('Your AI is set.', 'what’s next'), ['next'])
  assert.deepEqual(c27Fails('Your AI is set.', "what's next"), ['next'])
  assert.ok(replyFlags('Your AI is set.', [], ['none'], { message: 'what’s next' }).includes('c27 next'))
})
