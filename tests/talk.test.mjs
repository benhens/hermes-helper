// Helper's answers as plain code (src/talk.js) against hhcontent's own route2.py: every
// conversation route2.py ran is replayed here and must give the same result and the same visit,
// the stored record included, at every turn. The expected results are not typed in:
// dev/checks/talk-v2/recopy.sh ran route2.py and wrote them to tests/fixtures/.
// Left out of the replay, and counted: conversations where a fake model answers (this build has no
// AI step), and those that press "Web, files, pictures and voice" (row 5, not in this build).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import * as TALK from '../src/talk.js'
import { TALK_DATA } from '../src/talk-data.js'
import { pinned } from './lib/team-pins.mjs'

const { freshVisit, laterVisit, turn, pick, pickTopic, press, skip, sayLine, change, rmPick, forgetAnswer, seeKept, askForgetAll, typedAboutKept, lineFor, openingLine, hintFor, buildHit, talkNorm, keptRows, PARTS, EXTRA_LINES, REPLY_HINT } = TALK
const ROOT = path.resolve(import.meta.dirname, '..')
const TEAM = path.resolve(ROOT, '..')
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const fixture = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures', name), 'utf8'))
const ON = fixture('route2-conversations.json')
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/helper-talk-v2.json'), 'utf8'))

// route2.py's own show(): one result as a short text.
function show(o) {
  if (o.name_taken) return show({ ...o, name_taken: null }) + ' +name=' + o.name_taken
  if (o.kept && o.kept.length) return show({ ...o, kept: null, first: null }) + ' +kept=' + o.kept.join(',') + (o.first ? ' +first' : '')
  if (o.used) return show({ ...o, used: null }) + ' +from-kept'
  const py = v => (v === null || v === undefined ? 'None' : v)
  const by = {
    row: () => 'line ' + o.need,
    question: () => 'question ' + o.topic,
    plain: () => 'plain line ' + o.topic + '0',
    H1: () => `H1 (${o.why})`,
    term: () => 'term line ' + o.term,
    W1: () => 'W1 buttons ' + o.buttons.join('+'),
    // changes-11
    W2: () => 'W2 buttons ' + o.buttons.join('+'),
    NAME_AGAIN: () => 'NAME_AGAIN name=' + o.name,
    NAME_NEW: () => 'NAME_NEW name=' + o.name,
    F1: () => `F1 name=${py(o.name)}`,
    F2: () => `F2 name=${py(o.name)} work=${py(o.work)}`,
    C1: () => 'C1 picks ' + o.buttons.join('+'),
    'can-q': () => 'question can-q groups ' + o.buttons.join('+'),
    C2: () => 'C2 picks ' + o.buttons.join('+')
  }
  return (by[o.kind] || (() => o.kind))()
}
const stateOf = st => ({ stage: st.stage, pending: st.pending, found: { ...st.found }, asked: [...st.asked].sort(), lastq: st.lastq, name: st.name, work: st.work, kept: JSON.parse(JSON.stringify(st.kept)) })
const expectedState = s => ({ stage: s.stage, pending: s.pending, found: s.found, asked: s.asked, lastq: s.lastq, name: s.name, work: s.work, kept: s.kept })
const usesModel = c => c.steps.some(s => s.has_model)
const usesWants = c => c.steps.some(s => s.do === 'topic' && s.topic === 'wants')
// A visit as route2.py has it: the wants steps (rows, skills by name, the near miss, the service
// lines) off, since route2.py has none of them. The held pick "Web, files, pictures and voice" is
// route2.py's own (pick_topic), so it stays.
const asRoute2 = st => Object.assign(st, { wants: false })

function replay(conv) {
  let st = asRoute2(freshVisit(conv.stage, conv.kept ? { ...conv.kept } : {}))
  const got = []
  for (const step of conv.steps) {
    let o
    if (step.do === 'visit') {
      // a later visit: only the stored record is carried over (route2.py starts it at stage open)
      st = asRoute2(freshVisit('open', st.kept))
      got.push(null)
      continue
    }
    if (step.do === 'say') o = turn(step.text, st)
    else if (step.do === 'pick') o = pick(step.topic, step.i, st)
    else if (step.do === 'topic') o = pickTopic(step.topic, st)
    else if (step.do === 'press') o = press(step.choice, step.text, st)
    else if (step.do === 'skip') o = skip(st)
    else if (step.do === 'change') o = change(step.topic, st)
    else if (step.do === 'rm') o = rmPick(step.who, st)
    else throw new Error('a step this port does not have: ' + step.do)
    got.push({ shown: show(o), state: stateOf(st) })
  }
  return got
}

// talk v2 wants fixes: changes-12's secret rule (looks_secret) is not in this build (Lead: point 8 of the
// look job). The replay uses route2_secret11.py, the team's route2.py with its one changes-12 line put back
// (dev/checks/talk-v2-wf1/make_secret11.py); the team's own route2.py was run too (TEAM_RUN). These are the
// conversations where the two differ, each only at a "remember that ..." turn: the plugin does here what
// route2.py did before changes-12.
const TEAM_RUN = fixture('route2-conversations-team.json')
const SECRET_12 = [
  'changes-12: where the passwords are is not a password, kept',
  'changes-12: where the logins are is kept',
  'changes-12: pw and a colon',
  'changes-12: a short label, is, one value',
  'changes-12: another language, same shape',
  'changes-12: a typo of password',
  'changes-12: 12 plain words in a row',
  'changes-12: 24 plain words get RM6, not too long',
  'changes-12: talking about passwords is kept',
  'changes-12: talking about API keys is kept',
  'changes-12: a password manager is kept'
]

test('the test files were made from the talk data this plugin holds, by one route2.py, and route2.py met every one of its own expectations (the wants under C1 included)', () => {
  const ours = sha(path.join(ROOT, 'content/helper-talk-v2.json'))
  for (const f of [ON, TEAM_RUN, fixture('route2-set2.json'), fixture('route2-extra.json')]) {
    assert.equal(f.json_sha256, ours, 'run bash dev/checks/talk-v2-wf1/recopy-wf1.sh again')
    if (f !== TEAM_RUN) assert.equal(f.route2_sha256, ON.route2_sha256)
  }
  for (const f of [ON, TEAM_RUN]) {
    assert.equal(f.keeps_off, false)
    assert.equal(f.no_wants, false)
  }
  // the team's route2.py met all its expectations; the one with changes-12's line put back, all but those
  const missed = f => f.conversations.filter(c => !c.failed && c.steps.length && c.steps[c.steps.length - 1].shown !== c.expect).map(c => c.name)
  assert.deepEqual(missed(TEAM_RUN), [])
  assert.deepEqual(missed(ON), SECRET_12)
})

test('changes-12 not ported: the team\'s route2.py and the replayed one differ only in the listed conversations, and there only at a "remember that ..." turn', () => {
  assert.deepEqual(TEAM_RUN.conversations.map(c => c.name), ON.conversations.map(c => c.name))
  const differ = []
  ON.conversations.forEach((c, i) => {
    const t = TEAM_RUN.conversations[i]
    if (JSON.stringify(c.steps) === JSON.stringify(t.steps)) return
    differ.push(c.name)
    c.steps.forEach((s, j) => {
      if (JSON.stringify(s) === JSON.stringify(t.steps[j])) return
      assert.match(s.text || '', /^remember that /, `${c.name}: a turn that is not "remember that ..." differs`)
      assert.ok(/^RM/.test(s.shown) && /^RM/.test(t.steps[j].shown), `${c.name}: ${s.shown} / ${t.steps[j].shown}`)
    })
  })
  assert.deepEqual(differ, SECRET_12)
  assert.deepEqual(TEAM_RUN.singles, ON.singles)
})

test('the plugin\'s copies are the team\'s files at the checksums this job names (when the team\'s folder is there): the talk data, the skills list and the wants', t => {
  if (!fs.existsSync(path.join(TEAM, 'content'))) return t.skip('no team content folder beside the plugin')
  for (const f of ['helper-talk-v2.json', 'skills-list-v1.json', 'helper-wants-v1.json']) assert.equal(sha(path.join(ROOT, 'content', f)), pinned(t, 'content/' + f), `content/${f} is not the team's at the pin: bash dev/checks/talk-v2-wf1/recopy-wf1.sh`)
})

test('the reference scripts the test files were made from are the team\'s (when the team\'s folder is there): route2.py, check.py, settings_read.py and its cases, at the pins', t => {
  const checks = path.join(TEAM, 'dev', 'checks')
  if (!fs.existsSync(path.join(checks, 'hhcontent-talk-v2', 'route2.py'))) return t.skip('no team folder beside the plugin')
  assert.equal(TEAM_RUN.route2_sha256, pinned(t, 'dev/checks/hhcontent-talk-v2/route2.py'), 'route2.py is not the pinned one: bash dev/checks/talk-v2-wf1/recopy-wf1.sh')
  assert.equal(fixture('check-py-lines.json').check_py_sha256, pinned(t, 'dev/checks/hhcontent-talk-v2/check.py'), 'check.py is not the pinned one')
  const s = fixture('settings-read.json')
  assert.equal(s.settings_read_sha256, pinned(t, 'dev/checks/hhcontent-settings-edit/settings_read.py'), 'settings_read.py is not the pinned one')
  assert.equal(s.tests_sha256, pinned(t, 'dev/checks/hhcontent-settings-edit/tests.json'), 'tests.json is not the pinned one')
})

test('every conversation route2.py ran, keeping on, the wants steps off as route2.py has none: the same result and the same visit (stored record included) at every turn', () => {
  const run = ON.conversations.filter(c => !c.failed && !usesModel(c))
  let turns = 0
  for (const conv of run) {
    const got = replay(conv)
    conv.steps.forEach((step, i) => {
      if (step.do === 'visit') return
      assert.equal(got[i].shown, step.shown, `${conv.name}, turn ${i + 1} (${step.text || step.do})`)
      assert.deepEqual(got[i].state, expectedState(step.state), `${conv.name}, turn ${i + 1}: the visit after it`)
      turns++
    })
  }
  assert.ok(run.length >= 135, `only ${run.length} conversations replayed`)
  assert.ok(turns >= 220, `only ${turns} turns compared`)
  // the ones left out are counted, so a change shows
  const model = ON.conversations.filter(usesModel).length
  assert.equal(ON.conversations.length - run.length, model + ON.conversations.filter(c => c.failed).length)
  assert.ok(model <= 30, `${model} with a model`)
  assert.ok(run.some(usesWants), 'the held pick "Web, files, pictures and voice" is replayed')
  // and the replayed ones reach every kind of keeping step
  const steps = new Set(run.flatMap(c => c.steps.map(s => s.do)))
  for (const s of ['say', 'pick', 'topic', 'press', 'skip', 'change', 'rm', 'visit']) assert.ok(steps.has(s), s)
  const shown = run.flatMap(c => c.steps.map(s => s.shown || ''))
  for (const k of ['+kept=', '+first', '+from-kept', 'RM1', 'RM2', 'RM3', 'RM4', 'RM5', 'RM6', 'TP', 'N1a']) assert.ok(shown.some(x => x.includes(k)), k)
})

test('hhtech\'s 56 messages, each as a fresh message: the same line as route2.py for every one', () => {
  assert.equal(ON.singles.length, 56)
  let right = 0
  for (const m of ON.singles) {
    const st = asRoute2(freshVisit())
    const o = turn(m.text, st)
    assert.equal(show(o), m.shown, m.text)
    assert.deepEqual(stateOf(st), expectedState(m.state), m.text)
    if (m.want.includes(m.landed)) right++
  }
  assert.equal(right, 52, 'route2.py counts 52 of the 56 as right')
})

for (const [file, count, what] of [['route2-set2.json', 60, 'hhtech\'s second set of 60 messages'], ['route2-extra.json', 50, 'fifty more messages of the Builder\'s own, for rules the sets above do not reach']]) {
  test(`${what}: the same result and the same visit as route2.py`, () => {
    const set = fixture(file)
    assert.equal(set.messages.length, count)
    for (const m of set.messages) {
      const st = asRoute2(freshVisit({ '': 'open', name: 'name', work: 'work' }[m.after]))
      if (m.after === 'work') st.name = 'Sam'
      const o = turn(m.text, st)
      assert.equal(show(o), m.shown, `${m.n}: ${m.text}`)
      assert.deepEqual(stateOf(st), expectedState(m.state), `${m.n}: ${m.text}`)
    }
  })
}

test('no AI step: the port has no model path left (no model argument, no waiting form, no model data)', () => {
  for (const name of ['turnWithModel', 'turnNeedsModel', 'checkModelAnswer']) assert.equal(TALK[name], undefined, name)
  assert.equal(TALK_DATA.model, undefined)
  let asked = 0
  const st = freshVisit()
  turn('how does memory work?', st, () => asked++)
  assert.equal(asked, 0, 'a function handed in as a model is never called')
})

test('matching: lower case, curly quotes straightened, spaces squeezed; a key word needs no letter or digit beside it', () => {
  assert.equal(talkNorm('  It\u2019s   \u201cMemory\u201d  '), 'it\'s "memory"')
  assert.equal(show(turn('how does memory work?', freshVisit())), 'question mem')
  assert.equal(show(turn('I bought a memoryfoam pillow', freshVisit())), 'N1')
  assert.equal(show(turn('ā memory ē?', freshVisit())), 'question mem')
})

test('a pasted key: only the fixed line; nothing else changes, nothing is kept', () => {
  const st = freshVisit('name')
  const o = turn('remember that my key is sk-' + 'a1B2'.repeat(6), st)
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
  const long = 'please install ' + 'x'.repeat(400)
  const cut = lineFor(turn(long, freshVisit()), freshVisit(), long).paste
  assert.equal(cut.length, 'I asked for this: "". Please do it for me. Ask me before you change anything.'.length + 300)
})

test('the opening: greeting, name, what the person does, then a line with nothing to pick, the name kept and told once', () => {
  const st = freshVisit('name')
  assert.equal(openingLine().text, "Hi, I'm Helper. I can help you learn about Hermes and set it up. What's your name?")
  const f1 = lineFor(turn('Peter', st), st)
  assert.equal(f1.text, 'Nice to meet you, Peter. What do you do?')
  assert.equal(f1.answers, null)
  assert.equal(f1.note, null, 'nothing is kept while the opening is still open')
  const f2 = lineFor(turn('I run a tennis club', st), st)
  assert.equal(f2.text, 'Thanks, Peter. Ask me anything about Hermes.')
  assert.equal(f2.answers, null, 'no topics after the greeting')
  assert.deepEqual(f2.note, { text: 'Kept: Peter.', link: 'See what I keep', first: 'I keep this in the Hermes app on this computer. Nothing you type to me goes to any AI or anyone. Never tell me passwords.', items: [['name', 'Peter']] })
  assert.deepEqual(st.kept, { name: 'Peter', told: true })
  assert.equal(st.work, 'I run a tennis club', 'what the person does is used for this visit')
  assert.equal(st.kept.work, undefined, 'and never kept')
})

test('no name given: the lines without a name and nothing kept; Skip: the "that\'s fine" line with nothing to pick', () => {
  const st = freshVisit('name')
  assert.equal(lineFor(turn('hi', st), st).text, 'Nice to meet you. What do you do?')
  const f2 = lineFor(turn('this and that', st), st)
  assert.equal(f2.text, 'Thanks. Ask me anything about Hermes.')
  assert.equal(f2.note, null)
  assert.deepEqual(st.kept, {})
  const st2 = freshVisit('name')
  const f3 = lineFor(skip(st2), st2)
  assert.equal(f3.text, "That's fine. Ask me anything about Hermes.")
  assert.equal(f3.answers, null)
  assert.equal(skip(st2), null, 'Skip does nothing once the opening is over')
})

test('the topics show only when the person asks what they can ask (TP): four of them, "Or type your question"', () => {
  for (const ask of ['what can I ask you?', 'help', 'Hey Helper, what do you know?', 'i don\'t know what to ask', '?']) {
    const st = freshVisit('name')
    const said = lineFor(turn(ask, st), st)
    assert.equal(said.line, 'TP', ask)
    assert.equal(said.text, 'You can ask me how Hermes works and how to set it up. Pick one, or type your own question.')
    assert.deepEqual(said.answers.items.map(a => a.label), ['What Hermes can do', 'Which AI to use', 'Phone and chat apps', 'What Hermes remembers'])
    assert.equal(hintFor(said), 'Or type your question')
    assert.equal(st.stage, 'open')
  }
  assert.equal(turn('what can you tell me about memory', freshVisit()).kind, 'question', 'a topic word wins')
  assert.equal(turn('what do you know about me', freshVisit()).kind, 'A1', 'the kept-things list first')
})

test('the don\'t-know lines show no topics, and the small grey line under each tells how to see them', () => {
  const hint = 'To see what I can help with, type "what can I ask you".'
  for (const [msg, line] of [['can you book me a flight?', 'N1'], ['is there a skill called "zorbo"', 'N1a'], ['what is the weather like?', 'N1']]) {
    const st = freshVisit()
    const said = lineFor(turn(msg, st), st)
    assert.equal(said.line, line, msg)
    assert.equal(said.answers, null)
    assert.equal(said.hint, hint)
  }
  // N1b: a skill the list marks as left out (the file's mark is followed until hhcontent changes it)
  const out = TALK_DATA.skills.find(s => s.left_out)
  assert.ok(out, 'the skills list marks some skills as left out')
  const st = freshVisit()
  assert.equal(lineFor(turn(`is there a skill called "${out.name}"`, st), st).line, 'N1b')
  assert.equal(TALK_DATA.skills.filter(s => s.left_out).length, 5)
  // the same skill named the wants' way ("the NAME skill") is left out too
  const st3 = freshVisit()
  assert.equal(lineFor(turn(`what does the ${out.name} skill do`, st3), st3).line, 'N1b')
  // an official skill named that way: S1 or S2 (the skills by name, tests/talk-wants.test.mjs)
  const ok = TALK_DATA.skills.find(s => !s.left_out)
  const st2 = freshVisit()
  const o = turn(`the skill named "${ok.name}" please`, st2)
  assert.deepEqual([o.kind, o.skill], ['skill', ok.name])
})

test('never more than four things to pick: the topics, every answer list, C1, and "Which one do you mean?" cut to four in list order', () => {
  assert.equal(TALK_DATA.answers.max_at_once, 4)
  assert.ok(TALK_DATA.topic_picks.length <= 4)
  for (const p of TALK_DATA.topic_picks) assert.ok((p.holds || []).length <= 4)
  for (const t of TALK_DATA.topics) assert.ok(t.question.answers.length <= 4, t.id)
  const st = freshVisit()
  const o = turn('memory model telegram schedule gmail second bot', st)
  assert.equal(o.kind, 'W1')
  assert.equal(o.buttons.length, 4)
  assert.deepEqual(o.buttons, TALK_DATA.topics.map(t => t.id).filter(id => o.buttons.includes(id)).slice(0, 4), 'in the list\'s order')
  const said = lineFor(o, st)
  assert.equal(said.answers.items.length, 4)
  assert.equal(said.answers.hint, 'Or type your own answer')
})

test('answers to pick only under the questions that carry them (answers.when_shown): which AI, which chat app, which service', () => {
  const carries = Object.fromEntries(Object.entries(DATA.answers.when_shown.questions).map(([k, v]) => [k.split(' ')[0], v]))
  for (const t of TALK_DATA.topics) {
    const st = freshVisit()
    const q = lineFor(pickTopic(t.id, st), st)
    assert.equal(q.line, t.question.id)
    assert.equal(!!q.answers, carries[t.question.id], t.question.id)
    assert.equal(hintFor(q), q.answers ? 'Or type your own answer' : REPLY_HINT)
  }
  assert.deepEqual(TALK_DATA.topics.filter(t => t.question.answers.length).map(t => t.id).sort(), ['mod', 'msg', 'svc'])
})

test('a pick goes by its id to its row, never through key words', () => {
  for (const t of TALK_DATA.topics) {
    for (const [i, a] of t.question.answers.entries()) {
      const v = freshVisit()
      pickTopic(t.id, v)
      const o = pick(t.id, i, v)
      assert.deepEqual([o.kind, o.topic, o.need], ['row', t.id, a.gives])
      assert.deepEqual([v.pending, v.lastq, v.found[t.id]], [null, false, a.gives])
    }
  }
})

test('"What Hermes can do": C1 with its full text and four picks, the wants first; then the topic\'s question', () => {
  const st = freshVisit()
  const c1 = lineFor(pickTopic('can', st), st)
  assert.equal(c1.line, 'C1')
  assert.equal(c1.text, DATA.fixed_lines.find(f => f.id === 'C1').text)
  assert.deepEqual(c1.answers.items.map(a => a.label), ['Web, files, pictures and voice', 'Daily jobs and reminders', 'Gmail and other services', 'More than one Hermes'])
  assert.equal(c1.answers.hint, 'Or type your question')
  assert.equal(lineFor(pickTopic('sch', st), st).text, 'What should Hermes do on a schedule, such as a daily summary?')
})

test('the service fills the text to paste: from the picked answer, from the key word, from the typed answer (cut to 40 characters), from what is kept', () => {
  let st = freshVisit()
  pickTopic('svc', st)
  let said = lineFor(pick('svc', 2, st), st)
  assert.equal(said.next.text, 'Please connect Notion. If there is a ready-made MCP for it, add that. Ask me before you change anything.')
  st = asRoute2(freshVisit()) // Gmail has its own line with the wants (CN1, tests/talk-wants.test.mjs)
  said = lineFor(turn('can it read my gmial', st), st)
  assert.match(said.next.text, /^Please connect Gmail\./)
  st = freshVisit()
  pickTopic('svc', st)
  const typed = 'the booking system of my tennis club that nobody else uses'
  said = lineFor(turn(typed, st), st)
  assert.equal(said.next.text, `Please connect ${typed.slice(0, 40)}. If there is a ready-made MCP for it, add that. Ask me before you change anything.`)
  st = laterVisit({ svc: 'Trello', told: true })
  said = lineFor(pickTopic('svc', st), st)
  assert.equal(said.line, 'svc1')
  assert.match(said.next.text, /^Please connect Trello\./)
})

test('part buttons open Hermes\'s own screens; Bots has no screen a button can open: in its place the line about where the tab is', () => {
  assert.deepEqual(Object.keys(PARTS).sort(), ['bots', 'capabilities', 'messaging', 'model'])
  assert.equal(PARTS.messaging.to, '/messaging')
  assert.equal(PARTS.model.to, '/settings?tab=config:model')
  let st = freshVisit()
  pickTopic('msg', st)
  assert.deepEqual(lineFor(pick('msg', 0, st), st).next, { kind: 'part', label: 'Open Messaging', to: '/messaging' })
  st = freshVisit()
  pickTopic('bot', st)
  const said = lineFor(turn('I just want a new chat', st), st)
  assert.equal(said.line, 'bot3')
  st = freshVisit()
  st.lastq = true
  // changes-10: mem0's button is mem1's "Try it" box now, not the Bots fallback
  const mem0 = lineFor(pickTopic('mem', st), st)
  assert.equal(mem0.line, 'mem0')
  assert.deepEqual([mem0.next.kind, mem0.next.label], ['paste', 'Try it'])
  assert.equal(mem0.next.text, 'Please save this to your memory: <one thing about you>. Then tell me what you saved.')
  // the Bots tab line stays where a line is about bots
  st = freshVisit()
  st.lastq = true
  const bot0 = lineFor(pickTopic('bot', st), st)
  assert.equal(bot0.line, 'bot0')
  assert.equal(bot0.next.kind, 'where')
  assert.equal(bot0.next.text, 'In the Hermes app, "Bots" is the tab next to "Sessions", top left.')
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
        assert.ok(said.next && (said.next.label || said.next.kind === 'where'), n.id)
        assert.doesNotMatch((said.next.label || '') + (said.next.text || ''), /\{\w+\}/, n.id)
        if (said.next.kind === 'line') assert.ok(EXTRA_LINES[said.next.line], n.id)
        if (/Bots/.test(n.next.label)) assert.equal(said.next.kind, 'where', n.id)
      }
    }
  }
  for (const t of TALK_DATA.terms) assert.equal(lineFor({ kind: 'term', term: t.id }, st).text, t.text)
  const more = lineFor(sayLine('bot1-next', st), st)
  assert.match(more.text, /^Open "Bots", press "\+", then "New bot"\./)
})

/* ---------- what Helper keeps: the lines around it (not in route2.py) ---------- */

test('the grey kept line: the values as kept, one line for one moment, the first-time line once, and again after everything was deleted', () => {
  const st = freshVisit()
  pickTopic('mod', st)
  let said = lineFor(pick('mod', 0, st), st)
  assert.deepEqual(said.note, { text: 'Kept: you pay for ChatGPT.', link: 'See what I keep', first: TALK_DATA.keeps.tell.first_time_if_no_model_call, items: [['mod', 'mod1']] })
  pickTopic('msg', st)
  said = lineFor(pick('msg', 1, st), st)
  assert.deepEqual(said.note, { text: 'Kept: you use WhatsApp.', link: 'See what I keep', first: null, items: [['msg', 'WhatsApp']] })
  said = lineFor(turn('remember that I only use a Windows laptop', st), st)
  assert.equal(said.text, 'Done. It is on your list now. I do not act on it, and your Hermes is not told.')
  assert.equal(said.note.text, 'Kept: I only use a Windows laptop.')
  // a name and a question in one message: the name is kept with the question's line
  const st2 = freshVisit('name')
  said = lineFor(turn("I'm Tom, can it remember things", st2), st2)
  assert.equal(said.line, 'mem-q')
  assert.equal(said.note.text, 'Kept: Tom.')
  // everything deleted, then something new kept: the first-time line again
  forgetAnswer('all', true, st)
  assert.deepEqual(st.kept, {})
  pickTopic('svc', st)
  said = lineFor(pick('svc', 0, st), st)
  assert.equal(said.note.text, 'Kept: you use Gmail.')
  assert.ok(said.note.first)
})

test('the first-time line is the one for a build with no AI step: nothing about sending to an AI', () => {
  const first = TALK_DATA.keeps.tell.first_time_if_no_model_call
  assert.equal(first, 'I keep this in the Hermes app on this computer. Nothing you type to me goes to any AI or anyone. Never tell me passwords.')
  assert.doesNotMatch(JSON.stringify(TALK_DATA), /Only your name goes to your AI/)
})

test('a later visit: a kept name skips the opening; its line is the greeting without the question', () => {
  const st = laterVisit({ name: 'Peter', told: true })
  assert.equal(st.stage, 'open')
  const said = openingLine(st)
  assert.equal(said.text, "Hi, I'm Helper. I can help you learn about Hermes and set it up.")
  assert.equal(laterVisit({ mod: 'mod1', told: true }).stage, 'name', 'no kept name: the name is asked again')
  assert.equal(laterVisit(null).stage, 'name')
})

test('a kept answer is used where its question would be asked: "From what I keep" and Change, which asks again', () => {
  const st = laterVisit({ mod: 'mod1', told: true })
  let said = lineFor(pickTopic('mod', st), st)
  assert.equal(said.line, 'mod1')
  assert.deepEqual(said.used, { text: 'From what I keep: you pay for ChatGPT.', link: 'Change', topic: 'mod', value: 'mod1' })
  said = lineFor(change('mod', st), st)
  assert.equal(said.line, 'mod-q')
  assert.ok(said.answers)
  said = lineFor(pick('mod', 1, st), st)
  assert.equal(said.note.text, 'Kept: you pay for Claude.')
  assert.equal(st.kept.mod, 'mod2')
  // typed: the chat app
  const st2 = laterVisit({ msg: 'Telegram', told: true })
  said = lineFor(turn('can I talk to it from my phone?', st2), st2)
  assert.equal(said.line, 'msg1')
  assert.equal(said.used.text, 'From what I keep: you use Telegram.')
})

test('"what do you know about me" (A1): the list of what is kept, then "Open Helper settings", or "Delete all of it" where that page cannot open', () => {
  const kept = { name: 'Peter', mod: 'mod4', msg: 'WhatsApp', svc: 'Gmail', asked: ['I only use a Windows laptop'], told: true }
  let st = laterVisit({ ...kept })
  let said = lineFor(turn('what do you know about me', st), st, '', { settingsPage: true })
  assert.equal(said.text, 'This is all I keep about you.')
  assert.deepEqual(said.rows, ['Your name: Peter', 'Paying for an AI: you pay for neither', 'Your chat app: WhatsApp', 'A service you use: Gmail', 'You asked me to remember: I only use a Windows laptop'])
  assert.deepEqual(said.next, { kind: 'settings', label: 'Open Helper settings' })
  said = lineFor(seeKept(st), st, '', { settingsPage: false })
  assert.deepEqual(said.next, { kind: 'forget-all', label: 'Delete all of it' })
  said = lineFor(askForgetAll(st), st)
  assert.equal(said.text, 'Delete everything I keep about you?')
  assert.deepEqual(said.answers.items.map(a => a.label), ['Yes, delete it', 'No'])
  st = freshVisit()
  said = lineFor(turn('what have you kept?', st), st, '', { settingsPage: true })
  assert.equal(said.text, 'I keep nothing about you yet.')
  assert.equal(said.next, null)
  assert.deepEqual(keptRows({}), [])
})

test('"forget my name" (A2): asks for a Yes in the conversation; Yes deletes it, No changes nothing; nothing like that kept: says so', () => {
  let st = laterVisit({ name: 'Peter', msg: 'Slack', told: true })
  st.name = 'Peter'
  let said = lineFor(turn('please forget my name', st), st)
  assert.equal(said.text, 'Delete your name?')
  assert.deepEqual(said.answers.items.map(a => [a.label, a.forget]), [['Yes, delete it', ['name', true]], ['No', ['name', false]]])
  said = lineFor(forgetAnswer('name', false, st), st)
  assert.equal(said.text, 'Fine. Nothing is changed.')
  assert.equal(st.kept.name, 'Peter')
  said = lineFor(forgetAnswer('name', true, st), st)
  assert.equal(said.text, 'Done. I no longer keep that.')
  assert.deepEqual(st.kept, { msg: 'Slack', told: true })
  assert.equal(st.name, null, 'a forgotten name is not used again in this visit')
  said = lineFor(turn('forget my name', st), st)
  assert.equal(said.text, 'I keep nothing like that, so there is nothing to delete.')
  assert.equal(said.answers, null)
  // the last thing deleted: the whole record goes, told as well
  forgetAnswer('msg', true, st)
  assert.deepEqual(st.kept, {})
})

test('"forget everything" (A4): the delete-all question; Yes removes the whole record; a question about Hermes is not taken for it (the data\'s own examples)', () => {
  const st = laterVisit({ name: 'Peter', asked: ['a b'], told: true })
  const said = lineFor(turn('forget everything', st), st)
  assert.equal(said.text, 'Delete everything I keep about you?')
  assert.equal(lineFor(forgetAnswer('all', true, st), st).text, 'Done. I keep nothing about you now. What Hermes itself remembers is not touched.')
  assert.deepEqual(st.kept, {})
  const nw = DATA.keeps.typed.not_when
  for (const m of nw.examples_taken) assert.ok(['A2', 'A4'].includes(typedAboutKept(m) && typedAboutKept(m).kind), m)
  for (const m of nw.examples_go_on) assert.equal(typedAboutKept(m), null, m)
  // and those go on to the memory topic as before
  for (const m of nw.examples_go_on) assert.equal(turn(m, freshVisit()).topic, 'mem', m)
})

test('typing in place of Yes or No counts as No: the typed message is handled as usual (Helper asked last, so no second question in a row) and nothing is deleted', () => {
  const st = laterVisit({ name: 'Peter', told: true })
  turn('forget my name', st)
  assert.equal(st.lastq, true)
  const o = turn('how does memory work?', st)
  assert.deepEqual([o.kind, o.topic], ['plain', 'mem'])
  assert.equal(st.kept.name, 'Peter')
})
