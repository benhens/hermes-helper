// Helper's answers as plain code (src/talk.js) against hhcontent's own route2.py: every
// conversation route2.py ran is replayed here and must give the same result at every turn.
// The expected results are not typed in: dev/checks/talk-v1/dump_route2.py ran route2.py and wrote
// them to tests/fixtures/ (with the keeping steps on, and with them switched off, which is how the
// plugin runs until row 1 of the plan is settled).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { freshVisit, turn, turnWithModel, turnNeedsModel, pick, pickTopic, press, skip, sayLine, lineFor, openingLine, hintFor, checkModelAnswer, buildHit, talkNorm, PARTS, EXTRA_LINES, REPLY_HINT } from '../src/talk.js'
import { TALK_DATA } from '../src/talk-data.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const OFF = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/route2-conversations-keeps-off.json'), 'utf8'))
const ON = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/route2-conversations.json'), 'utf8'))

// route2.py's own show(): one result as a short text.
function show(o) {
  if (o.name_taken) return show({ ...o, name_taken: null }) + ' +name=' + o.name_taken
  const py = v => (v === null || v === undefined ? 'None' : v)
  const by = {
    row: () => 'line ' + o.need,
    question: () => 'question ' + o.topic,
    plain: () => 'plain line ' + o.topic + '0',
    H1: () => `H1 (${o.why})`,
    term: () => 'term line ' + o.term,
    W1: () => 'W1 buttons ' + o.buttons.join('+'),
    F1: () => `F1 name=${py(o.name)}`,
    F2: () => `F2 name=${py(o.name)} work=${py(o.work)}`,
    C1: () => 'C1 picks ' + o.buttons.join('+'),
    C2: () => 'C2 picks ' + o.buttons.join('+')
  }
  return (by[o.kind] || (() => o.kind))()
}
const stateOf = st => ({ stage: st.stage, pending: st.pending, found: { ...st.found }, asked: [...st.asked].sort(), lastq: st.lastq, name: st.name, work: st.work })
const expectedState = s => ({ stage: s.stage, pending: s.pending, found: s.found, asked: s.asked, lastq: s.lastq, name: s.name, work: s.work })
// Steps that belong to keeping (a stored record's Change link, the "do you mean me" answer, a later visit).
const KEEPING_STEPS = ['change', 'rm', 'visit']

function replay(conv) {
  const st = freshVisit(conv.stage)
  const got = []
  for (const step of conv.steps) {
    let o
    if (step.do === 'say') o = turn(step.text, st, step.has_model ? () => step.model : null)
    else if (step.do === 'pick') o = pick(step.topic, step.i, st)
    else if (step.do === 'topic') o = pickTopic(step.topic, st)
    else if (step.do === 'press') o = press(step.choice, step.text, st)
    else if (step.do === 'skip') o = skip(st)
    else throw new Error('a step this port does not have: ' + step.do)
    got.push({ shown: show(o), state: stateOf(st), calls: o.calls })
  }
  return got
}

test('the test files were made from the talk data this plugin holds (a recopied JSON needs a new dump)', () => {
  const ours = sha(path.join(ROOT, 'content/helper-talk-v2.json'))
  assert.equal(OFF.json_sha256, ours, 'run dev/checks/talk-v1/dump_route2.py again')
  assert.equal(ON.json_sha256, ours)
  assert.equal(OFF.route2_sha256, ON.route2_sha256)
  assert.equal(OFF.keeps_off, true)
  assert.equal(ON.keeps_off, false)
  // route2.py itself passed all of its own conversations when the files were made
  assert.match(ON.last_printed_lines.join(' '), /conversations: (\d+) of \1 as expected/)
})

test('the plugin\'s copy of the talk data is the team\'s file (when the team\'s folder is there)', t => {
  const team = path.resolve(ROOT, '..', 'content', 'helper-talk-v2.json')
  if (!fs.existsSync(team)) return t.skip('no team content folder beside the plugin')
  assert.equal(sha(path.join(ROOT, 'content/helper-talk-v2.json')), sha(team), 'content/helper-talk-v2.json differs from the team\'s: recopy, dump again, build')
})

test('every conversation route2.py ran, with keeping switched off: the same result and the same state at every turn', () => {
  const run = OFF.conversations.filter(c => !c.steps.some(s => KEEPING_STEPS.includes(s.do)) && !c.failed)
  const left = OFF.conversations.length - run.length
  assert.ok(run.length >= 120, `only ${run.length} conversations to replay`)
  let turns = 0
  for (const conv of run) {
    const got = replay(conv)
    conv.steps.forEach((step, i) => {
      assert.equal(got[i].shown, step.shown, `${conv.name}, turn ${i + 1} (${step.text || step.do})`)
      assert.deepEqual(got[i].state, expectedState(step.state), `${conv.name}, turn ${i + 1}: the visit after it`)
      if (step.do === 'say') assert.equal(got[i].calls, step.out.calls, `${conv.name}, turn ${i + 1}: model calls`)
      turns++
    })
  }
  assert.ok(turns >= 200, `only ${turns} turns compared`)
  // the ones left out are only those with a keeping step; counted so a change shows
  assert.equal(left, OFF.conversations.filter(c => c.steps.some(s => KEEPING_STEPS.includes(s.do)) || c.failed).length)
  assert.ok(left <= 20, `${left} conversations left out`)
})

test('with keeping on in route2.py: every conversation that keeps and uses nothing gives the same result here', () => {
  // Proof that leaving the keeping steps out changes nothing else: where route2.py (keeping on)
  // neither kept, used nor refused anything, this port must agree turn for turn.
  const run = ON.conversations.filter(c => !c.about_keeping)
  assert.ok(run.length >= 85, `only ${run.length}`)
  for (const conv of run) {
    const got = replay(conv)
    conv.steps.forEach((step, i) => {
      assert.equal(got[i].shown, step.shown, `${conv.name}, turn ${i + 1}`)
      assert.deepEqual(got[i].state, expectedState(step.state), `${conv.name}, turn ${i + 1}`)
    })
    assert.equal(got[got.length - 1].shown, conv.expect, conv.name)
  }
})

test('hhtech\'s 56 messages, each as a fresh message with no model: the same line as route2.py for every one', () => {
  assert.equal(OFF.singles.length, 56)
  let right = 0
  for (const m of OFF.singles) {
    const st = freshVisit()
    const o = turn(m.text, st)
    assert.equal(show(o), m.shown, m.text)
    assert.deepEqual(stateOf(st), expectedState(m.state), m.text)
    if (m.want.includes(m.landed)) right++
  }
  assert.equal(right, 52, 'route2.py counts 52 of the 56 as right')
})

test('hhtech\'s second set of 60 messages: the same result as route2.py (the test file holds what route2.py gave)', () => {
  const set2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/route2-set2.json'), 'utf8'))
  assert.equal(set2.json_sha256, sha(path.join(ROOT, 'content/helper-talk-v2.json')))
  assert.equal(set2.messages.length, 60)
  for (const m of set2.messages) {
    const st = freshVisit({ '': 'open', name: 'name', work: 'work' }[m.after])
    if (m.after === 'work') st.name = 'Sam'
    const o = turn(m.text, st)
    assert.equal(show(o), m.shown, `${m.n}: ${m.text}`)
    assert.deepEqual(stateOf(st), expectedState(m.state), `${m.n}: ${m.text}`)
  }
})

test('matching: lower case, curly quotes straightened, spaces squeezed; a key word needs no letter or digit beside it', () => {
  assert.equal(talkNorm('  It\u2019s   \u201cMemory\u201d  '), 'it\'s "memory"')
  assert.equal(show(turn('how does memory work?', freshVisit())), 'question mem')
  assert.equal(show(turn('I bought a memoryfoam pillow', freshVisit())), 'N1')
  // other letters do not block a match
  assert.equal(show(turn('ā memory ē?', freshVisit())), 'question mem')
})

test('a pasted key: only the fixed line; nothing else changes', () => {
  const st = freshVisit('name')
  const o = turn('my key is sk-' + 'a1B2'.repeat(6), st)
  assert.equal(o.kind, 'K1')
  assert.deepEqual(stateOf(st), stateOf(freshVisit('name')))
  assert.equal(lineFor(o, st).text, TALK_DATA.fixed.K1.text)
})

test('a how-question is never a request to do it; a request gets the hand-over line with the person\'s words to paste', () => {
  assert.equal(buildHit('how do I connect my Google Calendar?'), null)
  assert.equal(buildHit('connect my google calendar'), 'connect my')
  const st = freshVisit()
  const typed = 'please install the "github" plugin'
  const said = lineFor(turn(typed, st), st, typed)
  assert.equal(said.line, 'H1')
  assert.equal(said.paste, 'I asked for this: "please install the \'github\' plugin". Please do it for me. Ask me before you change anything.')
  // cut to 300 characters
  const long = 'please install ' + 'x'.repeat(400)
  const cut = lineFor(turn(long, freshVisit()), freshVisit(), long).paste
  assert.equal(cut.length, 'I asked for this: "". Please do it for me. Ask me before you change anything.'.length + 300)
})

test('the opening: the greeting, the name, what the person does, then the line that offers the topics', () => {
  const st = freshVisit('name')
  assert.equal(openingLine().text, "Hi, I'm Helper. I can help you learn about Hermes and set it up. What's your name?")
  assert.equal(openingLine().answers, null)
  const f1 = lineFor(turn('Peter', st), st)
  assert.equal(f1.text, 'Nice to meet you, Peter. What do you do?')
  assert.equal(f1.answers, null)
  assert.equal(st.stage, 'work')
  const f2 = lineFor(turn('I run a tennis club', st), st)
  assert.equal(f2.text, 'Thanks, Peter. Ask me anything about Hermes, or pick one of these.')
  assert.deepEqual(f2.answers.items.map(a => a.label), TALK_DATA.topic_picks.map(p => p.label))
  assert.equal(f2.answers.kind, 'topics')
  assert.deepEqual([st.stage, st.name, st.work], ['open', 'Peter', 'I run a tennis club'])
})

test('no name given: the lines without a name; Skip at either question: the "that\'s fine" line with the topics', () => {
  const st = freshVisit('name')
  assert.equal(lineFor(turn('hi', st), st).text, 'Nice to meet you. What do you do?')
  assert.equal(lineFor(turn('this and that', st), st).text, 'Thanks. Ask me anything about Hermes, or pick one of these.')
  const st2 = freshVisit('name')
  const f3 = lineFor(skip(st2), st2)
  assert.equal(f3.text, "That's fine. Ask me anything about Hermes, or pick one of these.")
  assert.equal(f3.answers.items.length, TALK_DATA.topic_picks.length)
  assert.equal(st2.stage, 'open')
  assert.equal(skip(st2), null, 'Skip does nothing once the opening is over')
})

test('at most five things to pick, everywhere: the topics, the answers under each question, and "Which one do you mean?" cut to five in list order', () => {
  assert.ok(TALK_DATA.topic_picks.length <= 5)
  for (const t of TALK_DATA.topics) assert.ok(t.question.answers.length <= 5, t.id)
  const st = freshVisit()
  const o = turn('memory model telegram schedule gmail second bot', st)
  assert.equal(o.kind, 'W1')
  assert.equal(o.buttons.length, 5)
  assert.deepEqual(o.buttons, TALK_DATA.topics.map(t => t.id).filter(id => o.buttons.includes(id)).slice(0, 5), 'in the list\'s order')
  const said = lineFor(o, st)
  assert.equal(said.answers.items.length, 5)
  assert.equal(said.answers.hint, 'Or type your own answer')
})

test('a question shows its answers; a pick goes by its id to its row, never through key words', () => {
  const st = freshVisit()
  const q = lineFor(pickTopic('mem', st), st)
  assert.equal(q.text, 'What do you want Hermes to remember?')
  assert.deepEqual(q.answers.items.map(a => a.label), ['Things about me', 'What we talked about', 'It forgot what I said', 'Work and home, kept apart'])
  assert.equal(q.answers.hint, 'Or type your own answer')
  // "It forgot what I said" holds the key word of another need of the same topic; the pick still gives its own row
  for (const [i, a] of TALK_DATA.topics[0].question.answers.entries()) {
    const v = freshVisit()
    pickTopic('mem', v)
    const o = pick('mem', i, v)
    assert.deepEqual([o.kind, o.topic, o.need], ['row', 'mem', a.gives])
    assert.deepEqual([v.pending, v.lastq, v.found.mem], [null, false, a.gives])
  }
})

test('the pick that holds two topics: its own line with those two to pick, then the topic\'s question', () => {
  const st = freshVisit()
  const c1 = lineFor(pickTopic('can', st), st)
  assert.equal(c1.line, 'C1')
  assert.deepEqual(c1.answers.items.map(a => a.label), ['Daily jobs and reminders', 'Gmail and other services'])
  assert.equal(c1.answers.hint, 'Or type your question')
  assert.equal(lineFor(pickTopic('sch', st), st).text, 'What should Hermes do on a schedule?')
})

test('the service fills the text to paste: from the picked answer, from the key word, from the typed answer (cut to 40 characters)', () => {
  let st = freshVisit()
  pickTopic('svc', st)
  let said = lineFor(pick('svc', 2, st), st)
  assert.equal(said.next.kind, 'paste')
  assert.equal(said.next.text, 'Please connect Notion. If there is a ready-made MCP for it, add that. Ask me before you change anything.')
  st = freshVisit()
  said = lineFor(turn('can it read my gmial', st), st)
  assert.match(said.next.text, /^Please connect Gmail\./)
  st = freshVisit()
  pickTopic('svc', st)
  const typed = 'the booking system of my tennis club that nobody else uses'
  said = lineFor(turn(typed, st), st)
  assert.equal(said.line, 'svc1')
  assert.equal(said.next.text, `Please connect ${typed.slice(0, 40)}. If there is a ready-made MCP for it, add that. Ask me before you change anything.`)
})

test('a named service the code cannot name: the line is said without its button, never with a hole in the text', () => {
  const st = freshVisit()
  const o = turn('something about services', st, () => JSON.stringify({ topic: 'svc', need: 'svc1', name: '', work: '' }))
  assert.deepEqual([o.kind, o.need], ['row', 'svc1'])
  const said = lineFor(o, st)
  assert.equal(said.next, null)
  assert.doesNotMatch(JSON.stringify(said), /\{service\}/)
})

test('part buttons open Hermes\'s own screens; Bots has no screen a button can open, so there is no button: in its place the line about where the tab is', () => {
  assert.deepEqual(Object.keys(PARTS).sort(), ['bots', 'capabilities', 'messaging', 'model'])
  assert.equal(PARTS.messaging.to, '/messaging')
  assert.equal(PARTS.model.to, '/settings?tab=config:model')
  assert.equal(PARTS.capabilities.to, '/capabilities')
  assert.equal(PARTS.bots.to, undefined)
  let st = freshVisit()
  pickTopic('msg', st)
  let said = lineFor(pick('msg', 0, st), st)
  assert.deepEqual(said.next, { kind: 'part', label: 'Open Messaging', to: '/messaging' })
  st = freshVisit()
  pickTopic('bot', st)
  said = lineFor(pick('bot', 1, st), st)
  const where = 'In the Hermes app, "Bots" is the tab next to "Sessions", top left.'
  assert.equal(said.next.kind, 'where')
  assert.equal(said.next.text, where)
  assert.equal(said.next.line, 'bots-where')
  assert.equal(said.next.label, undefined, 'nothing to press')
  assert.ok(said.next.source)
  // the memory topic's plain line: our page has no Memory part, so the data names Bots for it
  st = freshVisit()
  st.lastq = true
  said = lineFor(pickTopic('mem', st), st)
  assert.equal(said.line, 'mem0')
  assert.equal(said.next.text, where)
  // a button that makes Helper say one more line: the data's own (the second bot's "How to add one")
  st = freshVisit()
  pickTopic('bot', st)
  said = lineFor(pick('bot', 0, st), st)
  assert.deepEqual(said.next, { kind: 'line', label: 'How to add one', line: 'bot1-next' })
  const more = lineFor(sayLine(said.next.line, st), st)
  assert.match(more.text, /^Open "Bots", press "\+", then "New bot"\./)
  assert.equal(more.next, null)
  assert.ok(more.source)
})

test('every line a button can lead to exists, and every button in the data becomes a button, a line or nothing', () => {
  const st = freshVisit()
  st.service = 'Gmail'
  for (const t of TALK_DATA.topics) {
    for (const n of [t.plain, ...t.needs]) {
      const said = lineFor(n === t.plain ? { kind: 'plain', topic: t.id } : { kind: 'row', topic: t.id, need: n.id }, st)
      assert.equal(said.text, n.text)
      assert.ok(said.source, `${n.id} has its source`)
      if (n.next.kind === 'none') assert.equal(said.next, null)
      else {
        assert.ok(said.next && (said.next.label || said.next.kind === 'where'), `${n.id}: its button, or the line in its place`)
        assert.doesNotMatch((said.next.label || '') + (said.next.text || ''), /\{\w+\}/, n.id)
        if (said.next.kind === 'line') assert.ok(EXTRA_LINES[said.next.line], `${n.id}: the line ${said.next.line}`)
        if (said.next.kind === 'part') assert.match(said.next.to, /^\/[a-z]/)
        // "Open Bots" is never a button
        if (/Bots/.test(n.next.label)) assert.equal(said.next.kind, 'where', n.id)
      }
    }
  }
  for (const t of TALK_DATA.terms) assert.equal(lineFor({ kind: 'term', term: t.id }, st).text, t.text)
})

test('the grey text in the message box: the data\'s two hints while there is something to pick, the stand-in otherwise', () => {
  const st = freshVisit()
  assert.equal(hintFor(lineFor(pickTopic('mod', st), st)), 'Or type your own answer')
  assert.equal(hintFor(lineFor({ kind: 'N1' }, st)), 'Or type your question')
  assert.equal(hintFor(openingLine()), REPLY_HINT)
  assert.equal(REPLY_HINT, 'Reply to Helper')
  assert.equal(hintFor(null), REPLY_HINT)
})

test('a model\'s answer is checked before it is used: every check of section 4.3', () => {
  const J = (topic, need, name = '', work = '') => JSON.stringify({ topic, need, name, work })
  assert.deepEqual(checkModelAnswer(J('mem', 'mem1')), { topic: 'mem', need: 'mem1', name: '', work: '' })
  assert.ok(checkModelAnswer('```json\n' + J('none', '') + '\n```'), 'a fenced answer is unwrapped')
  for (const bad of [undefined, null, '', 'mem', '[]', '{"topic":"mem"}', J('memory', ''), J('mem', 'mod1'), J('none', 'mem1'), J('tool', 'mem1'), J('none', '', 'Pe7er'),
    J('none', '', '', 'one two three four five six seven eight nine ten eleven twelve thirteen'), J('none', '', '', 'x'.repeat(61)), J('none', '', '', 'sk-' + 'a1B2'.repeat(6)),
    JSON.stringify({ topic: 'mem', need: 5, name: '', work: '' })]) assert.equal(checkModelAnswer(bad), null, String(bad))
})

test('with a model: asked only when code did not find both topic and need, once per message, and a failed call leaves code\'s own result', async () => {
  const J = (topic, need, name = '', work = '') => JSON.stringify({ topic, need, name, work })
  // code finds topic and need: the model is not asked
  let asked = 0
  let st = freshVisit()
  let o = turn('can it read my gmail', st, () => (asked++, J('none', '')))
  assert.deepEqual([o.kind, o.need, asked, o.calls], ['row', 'svc1', 0, 0])
  assert.equal(turnNeedsModel('can it read my gmail', freshVisit()), false)
  // code finds the topic only: the model is asked and adds the need
  st = freshVisit()
  o = turn('how does memory work?', st, () => (asked++, J('mem', 'mem2')))
  assert.deepEqual([o.kind, o.need, asked, o.calls], ['row', 'mem2', 1, 1])
  assert.equal(turnNeedsModel('how does memory work?', freshVisit()), true)
  // the call fails (throws): code's own result, the topic's question
  st = freshVisit()
  o = turn('how does memory work?', st, () => { throw new Error('no model') })
  assert.deepEqual([o.kind, o.topic], ['question', 'mem'])
  // at the name question an answer that fails the checks is not asked for twice
  asked = 0
  st = freshVisit('name')
  o = turn('Peter the great of somewhere far', st, () => (asked++, 'not json'))
  assert.equal(asked, 1)
  // the waiting form gives the same results, and tells when the wait begins
  st = freshVisit()
  let waits = 0
  o = await turnWithModel('how does memory work?', st, async () => J('mem', 'mem2'), () => waits++)
  assert.deepEqual([o.kind, o.need, waits], ['row', 'mem2', 1])
  st = freshVisit()
  o = await turnWithModel('how does memory work?', st, async () => { throw new Error('x') })
  assert.deepEqual([o.kind, o.topic], ['question', 'mem'])
  st = freshVisit()
  o = await turnWithModel('can it read my gmail', st, async () => { throw new Error('must not be asked') }, () => waits++)
  assert.deepEqual([o.kind, waits], ['row', 1])
})

test('asking whether a message needs the model changes nothing in the visit', () => {
  const st = freshVisit('name')
  const before = JSON.stringify(st)
  turnNeedsModel("I'm Tom, can it remember things", st)
  turnNeedsModel('Peter', st)
  assert.equal(JSON.stringify(st), before)
})
