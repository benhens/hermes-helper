// The wants steps (talk v2 row 5), as plain code in src/talk.js: what Helper does with a typed
// message about what Hermes can do, a skill by its name, a near miss, a service with its own line.
// The reference is hhtech's wants_step.py with fixes6_step.py on top of today's route2.py (route2.py
// itself has no wants steps; hhtech ran these two on every set below). dev/checks/talk-v2-wants/
// dump_oracle.py ran them and wrote tests/fixtures/wants-oracle.json; nothing here is typed in by hand
// except the differences listed in KNOWN, each with its reason.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TALK_DATA } from '../src/talk-data.js'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { freshVisit, laterVisit, turn, pick, pickTopic, pickGroup, pickWant, press, lineFor, skillOf, wantsOf, pageOf, SKILL_NEXT_PATTERNS, WANT_ROWS } from '../src/talk.js'
import { WANTS_DATA } from '../src/wants-data.js'
import { skillSentence } from '../scripts/wants-data.mjs'
import { pinned, PINS } from './lib/team-pins.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const TEAM = path.resolve(ROOT, '..')
const O = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/wants-oracle.json'), 'utf8'))
const WANTS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/helper-wants-v1.json'), 'utf8'))
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

// route2.py's show() and the oracle's own additions (wants_step.py show)
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
    // builder-qs (route2.py show): H2, BACK and HELLO with the name
    H2: () => `H2 (${o.why})`,
    BACK: () => `BACK name=${py(o.name)}`,
    HELLO: () => `HELLO name=${py(o.name)}`,
    term: () => 'term line ' + o.term,
    fact: () => 'fact ' + o.need, // find-v1 (breadth-t1): a fact line
    W1: () => 'W1 buttons ' + o.buttons.slice(0, 4).join('+'),
    // changes-11 (route2.py show)
    W2: () => 'W2 buttons ' + o.buttons.join('+'),
    NAME_AGAIN: () => 'NAME_AGAIN name=' + o.name,
    NAME_NEW: () => 'NAME_NEW name=' + o.name,
    F1: () => `F1 name=${py(o.name)}`,
    F2: () => `F2 name=${py(o.name)} work=${py(o.work)}`,
    want: () => 'ROW ' + o.row,
    skill: () => 'SKILL ' + o.skill,
    N2: () => 'N2 group ' + o.group,
    // loom-fixes (route2.py show)
    NAME: () => 'NAME ' + o.id,
    // loom-fixes-2 (route2.py show): ordinary talk at the opening's two questions
    OPEN_TALK: () => `OPEN_TALK ${TALK_DATA.opening_talk.line_by_kind[o.talk]} then ${TALK_DATA.opening_talk.ask[o.ask]}`
  }
  return (by[o.kind] || (() => o.kind))()
}
const isWants = o => ['want', 'skillS', 'N2'].includes(o.kind) || (o.kind === 'W1' && o.buttons.some(b => WANT_ROWS[b]))
// The oracle's steps where they are the wants steps; route2.py's own result everywhere else (the
// oracle's turn is older than route2.py's in its other steps: no "what can I ask", no N1a or N1b).
// changes-11: route2.py checks a name on a later visit and "what is ..." before the topics, so where it
// gives one of those, that is the result even when the reference (older than changes-11) has a row.
// The cost and where lines give way to a row in the plugin (the Builder's rule, tests/talk-fixes):
// there the reference's row stays the result.
const route2FirstSteps = r => ['NAME_AGAIN', 'NAME_NEW'].includes(r.kind) || (r.kind === 'plain' && r.why === 'what is')
// wants fixes v1: where hhcontent's third layer (wants_fixes_step.py) changes the reference's result, that
// result stands ("is there a skill for knitting": N1, not the term line)
const wf1Changed = m => m.oracle_f6 && m.oracle_f6.shown !== m.oracle.shown
const expected = m => (route2FirstSteps(m.route2) ? m.route2.shown : isWants(m.oracle) || wf1Changed(m) ? m.oracle.shown : m.route2.shown)
function ours(m) {
  const st = freshVisit({ '': 'open', name: 'name', work: 'work' }[m.after || ''])
  if (m.after === 'work') st.name = 'Sam'
  const o = turn(m.text, st)
  return { o, shown: show(o) }
}

// Where the plugin differs from the reference on purpose: message -> [the plugin's result, why].
const TYPED_ABOUT_KEPT = 'keeps.typed (A2 and A4: "forget my name", "forget everything", changes-8 not_when): the plugin\'s own step from the talk v2 job, not in route2.py and switched off in the reference (SETTINGS_ON False, its word lists are older than the data); in a fresh visit nothing is kept, so Helper says there is nothing like that to forget'
const KEEPS_WORK = 'live-v2 changes-4: what the person does is kept; the reference keeps nothing at What do you do?'
const TITLES_FIRST = 'live changes-11 (near.first_step): a full hit by a phrase of a fact line comes first, before the topics and the plugin\'s wants step, as in route2.py; the wants layers of the reference are older than that step'
const KNOWN = {
  'can I speak to it instead of typing': ['fact d_voice_app', TITLES_FIRST],
  'forget everything': ['A-none', TYPED_ABOUT_KEPT],
  'please forget my name': ['A-none', TYPED_ABOUT_KEPT],
  'delete everything you know about me': ['A-none', TYPED_ABOUT_KEPT],
  'can you forget my name?': ['A-none', TYPED_ABOUT_KEPT],
  'will you forget everything when I close the window': ['A-none', TYPED_ABOUT_KEPT],
  'is it possible to delete everything you know about me?': ['A-none', TYPED_ABOUT_KEPT],
  'forget everything, it was a mistake': ['A-none', TYPED_ABOUT_KEPT],
  // talk-live-2: live-v2 changes-4 keeps what the person does at "What do you do?" (keeps.work step 7); route2.py
  // and the wants layers keep nothing there (changes-4: "route2.py ... still keep nothing at What do you do?")
  "I'm a nurse": ["F2 name=Sam work=I'm a nurse +kept=work,name +first", KEEPS_WORK],
  'I teach piano every day after school': ['F2 name=Sam work=I teach piano every day after school +kept=work,name +first', KEEPS_WORK],
  'I write emails and connect clients with suppliers': ['F2 name=Sam work=I write emails and connect clients with suppliers +kept=work,name +first', KEEPS_WORK]
}

test('the reference file was made from the team\'s scripts (when the team\'s folder is there): route2.py at the pin, the three wants layers as they are now', t => {
  const ck = path.join(TEAM, 'dev', 'checks')
  if (!fs.existsSync(path.join(ck, 'hhtech-fixes-6', 'fixes6_step.py'))) return t.skip('no team folder beside the plugin')
  assert.equal(O.route2_sha256, pinned(t, 'dev/checks/hhcontent-talk-v2/route2.py'), 'route2.py is not the pinned one: bash dev/checks/talk-v2-wf1/recopy-wf1.sh')
  assert.equal(O.wants_step_sha256, sha(path.join(ck, 'hhtech-wants-check', 'wants_step.py')))
  assert.equal(O.fixes6_step_sha256, sha(path.join(ck, 'hhtech-fixes-6', 'fixes6_step.py')))
  assert.equal(O.wants_fixes_step_sha256, pinned(t, 'dev/checks/hhcontent-wants-fixes/wants_fixes_step.py'))
})

test('wants fixes v1: the reference ran hhcontent\'s third layer after fixes6_step.py, and on the 296 messages it changes only "is there a skill for knitting", to N1', () => {
  assert.equal(O.wants_fixes_step_sha256, PINS['dev/checks/hhcontent-wants-fixes/wants_fixes_step.py'][0])
  // talk v2 look: route2.py run as the team has it (changes-12's secret rule is ported)
  assert.equal(O.route2_run, 'route2.py')
  assert.equal(O.route2_run_sha256, O.route2_sha256)
  const changed = O.sets.flatMap(s => s.messages.filter(wf1Changed).map(m => [s.name, m.text, m.oracle_f6.shown, m.oracle.shown]))
  assert.deepEqual(changed, [['test_wants40', 'is there a skill for knitting', 'term line skill', 'N1']])
  const knit = O.sets.flatMap(s => s.messages).find(m => m.text === 'is there a skill for knitting')
  assert.equal(ours(knit).shown, 'N1')
})

test('the skill-name patterns are hhcontent\'s skill_next.py PATTERNS, word for word (the article before "NAME skill" of changes-8)', () => {
  assert.deepEqual(SKILL_NEXT_PATTERNS, O.skill_next_patterns)
  assert.match(SKILL_NEXT_PATTERNS[0], /^\(\?:the\|a\|an\|this\|that\) \{n\} skills\?$/)
})

test('every message of every set hhtech and hhcontent ran (296): the reference\'s result, except the differences listed with their reasons', () => {
  const off = []
  let n = 0
  let wantsResults = 0
  for (const s of O.sets) {
    for (const m of s.messages) {
      n++
      const got = ours(m).shown
      const want = expected(m)
      if (isWants(m.oracle)) wantsResults++
      if (got !== want) off.push([s.name, m.text, got, want])
    }
  }
  const unexplained = off.filter(([, text, got]) => !(KNOWN[text] && KNOWN[text][0] === got))
  assert.deepEqual(unexplained, [], unexplained.map(x => x.join(' | ')).join('\n'))
  const stale = Object.keys(KNOWN).filter(text => !off.some(x => x[1] === text))
  assert.deepEqual(stale, [], 'a listed difference that no longer happens')
  assert.equal(n, 296)
  assert.ok(wantsResults >= 60, `only ${wantsResults} results are the wants'`)
})

// What a result means, in the sets' own words (run_fixes6.py landed()).
function landed(o) {
  if (o.kind === 'want') return o.row
  if (o.kind === 'N2') return 'N2:' + o.group
  if (['N1', 'N1a', 'N1b'].includes(o.kind)) return 'N1'
  if (o.kind === 'H1') return 'build'
  if (o.kind === 'W1') return 'which:' + o.buttons.join('+')
  if (o.kind === 'skill') return 'skill:' + o.skill
  if (o.kind === 'term') return 'word:' + o.term
  return o.topic || o.kind
}
const set = name => O.sets.find(s => s.name === name).messages

test('hhtech\'s thirty wants messages (new30, wanted results fixed before the run): 24 right, as hhtech counted with the fixes; never a row for something Hermes does not do', () => {
  let right = 0
  const rowsForNone = []
  for (const m of set('new30')) {
    const got = landed(ours(m).o)
    if (m.want.includes(got)) right++
    if (m.kind === 'none' && got.startsWith('w_')) rowsForNone.push(m.text)
  }
  assert.equal(right, 24)
  assert.deepEqual(rowsForNone, [])
})

test('skills by name, hhtech\'s twenty sentences (Q4): all ten that name a skill find it, none of the ten that must not find one does', () => {
  let found = 0
  let quiet = 0
  for (const m of set('Q4')) {
    const o = ours(m).o
    if (m.skill_want) found += o.kind === 'skill' ? o.skill === m.skill_want : o.kind === 'want' && WANT_ROWS[o.row].thing === m.skill_want
    else quiet += o.kind !== 'skill' && !skillOf(m.text.toLowerCase()).length
  }
  assert.deepEqual([found, quiet], [10, 10])
})

test('hhcontent\'s forty messages (test_wants.py): 39 as hhcontent expected; the one hhcontent named still differs ("a skill for knitting" is N1 now, wants fixes v1)', () => {
  const as = e => (e.startsWith('S:') ? 'skill:' + e.slice(2) : e.startsWith('topic:') ? e.slice(6) : e)
  const off = set('test_wants40').filter(m => landed(ours(m).o) !== as(m.hhcontent_expects)).map(m => [m.text, landed(ours(m).o)])
  // find-v2: live-v2 changes-13 took "youtube" off svc's words, so the last of hhcontent's own two lands as expected too
  assert.deepEqual(off, [])
  assert.equal(landed(ours(set('test_wants40').find(m => m.text === 'is there a skill for knitting')).o), 'N1')
})

test('the order of steps: a skill by name before the topics; a row takes svc off only for its own word; rows count only in a question while a topic question is open', () => {
  // "is there a github skill": the skill, not the service question (changes-6 fix 3)
  assert.deepEqual([turn('is there a github skill', freshVisit()).kind, turn('is there a github skill', freshVisit()).skill], ['skill', 'github'])
  // a hand-written row for that skill wins
  assert.deepEqual(['want', 'w_pdf'], (o => [o.kind, o.row])(turn('what does the pdf skill do', freshVisit())))
  // changes-19: no skill is left out any more; godmode gets its skill line, by the wants' pattern too
  assert.deepEqual((o => [o.kind, o.skill])(turn('is there a godmode skill', freshVisit())), ['skill', 'godmode'])
  // ordinary words that are skill names, with no article before "skill": nothing named
  for (const t of ['my sketch skills are terrible', 'I have no canvas skills', 'can it read a map']) assert.notEqual(turn(t, freshVisit()).kind, 'skill', t)
  // fix 2: youtube is w_youtube's own word, so the row wins over the service topic; dropbox is not,
  // so svc stays (and dropbox, a word of its row svc1, gives that row: the text to paste)
  assert.deepEqual((o => [o.kind, o.row])(turn('can it summarize youtube videos', freshVisit())), ['want', 'w_youtube'])
  assert.deepEqual((o => [o.kind, o.topic, o.need])(turn('can it look at my dropbox files', freshVisit())), ['row', 'svc', 'svc1'])
  // a name never ends before a hyphen, and a name inside a longer one's match is not counted: brag-slim
  // is not also brag (Builder's changes, please check)
  assert.deepEqual(skillOf('is there a skill called "brag-slim"'), ['brag-slim'])
  assert.deepEqual(skillOf('is there a skill for brag-slim'), ['brag-slim'])
  assert.deepEqual(skillOf('is there a skill called brag slim'), ['brag-slim'])
  assert.deepEqual(skillOf('what does the brag skill do'), ['brag'])
  // a group's label typed as on its button is that group (Builder's, please check); not a near miss
  for (const [typed, group] of [['Pictures and video', 'pics'], ['voice and sound!', 'voice'], ['files and my computer', 'files']]) {
    const st = freshVisit()
    pickTopic('wants', st)
    assert.deepEqual((o => [o.kind, o.group])(turn(typed, st)), ['G1', group], typed)
  }
  assert.equal(turn('pictures and video please make one', freshVisit()).kind !== 'G1', true)
  // while "Which service ...?" is open, a plain answer is the answer; a question still finds its row
  let st = freshVisit()
  pickTopic('svc', st)
  assert.deepEqual((o => [o.kind, o.topic, o.need])(turn('the booking system of my club', st)), ['row', 'svc', 'svc1'])
  st = freshVisit()
  pickTopic('svc', st)
  assert.deepEqual((o => [o.kind, o.row])(turn('can it make pictures?', st)), ['want', 'w_image'])
  st = freshVisit()
  pickTopic('mem', st)
  assert.notEqual(turn('make pictures', st).kind, 'want', 'not a question: taken as the answer to the open memory question')
})

test('a row\'s line: its own words, its sources, and its button; an optional skill\'s button is the app\'s clicks with its name filled in', () => {
  for (const r of WANTS_DATA.rows) {
    const st = freshVisit()
    const said = lineFor(pickWant(r.id, st), st)
    assert.equal(said.line, r.id)
    assert.equal(said.text, r.text)
    assert.ok(said.source && said.source.includes(r.sources[0].file), r.id)
    assert.equal(said.docs, null, 'a hand-written row has no docs box')
    if (r.kind === 'optional_skill') {
      assert.equal(said.next.kind, 'steps', r.id)
      assert.equal(said.next.label, 'Show me how to add it')
      assert.ok(said.next.steps.some(s => s.includes(`"${r.thing}"`) && s.includes('"Show more"')), r.id)
      assert.equal(said.next.after, 'It works from your next new chat, not this one.')
    } else {
      assert.deepEqual([said.next.kind, said.next.label, said.next.text], ['paste', 'Show me what to ask', r.next.paste_text], r.id)
    }
    assert.equal(st.lastq, false)
  }
})

test('S1 and S2 for every skill on the two pages: Helper\'s fixed line with the name, the docs box with the page\'s own words and its line; S2 the clicks', () => {
  let s1 = 0
  let s2 = 0
  for (const s of WANTS_DATA.skills) {
    const st = freshVisit()
    const o = turn(`is there a skill called "${s.name}"`, st)
    assert.equal(s.left_out, undefined, s.name) // changes-19: all 186 answered
    const row = WANTS_DATA.rows.find(r => r.thing === s.name)
    if (row) {
      assert.deepEqual([o.kind, o.row], ['want', row.id], s.name)
      continue
    }
    assert.deepEqual([o.kind, o.skill], ['skill', s.name], s.name)
    const said = lineFor(o, st)
    // skill lines v1: "It teaches Hermes to {say}", or the old sentence (text_fixed) when say is null
    assert.equal(said.text, skillSentence(WANTS_JSON, WANTS_JSON.skills.find(x => x.name === s.name)), s.name)
    assert.deepEqual(said.docs, { head: 'From the Hermes docs', words: s.docs_words, source: `${s.page} line ${s.line}` })
    if (s.kind === 'optional') {
      s2++
      assert.equal(said.next.kind, 'steps')
      assert.ok(said.next.steps[2].startsWith(`Find the card "${s.name}".`), s.name)
    } else {
      s1++
      assert.equal(said.next, null)
    }
  }
  // 186 skills (changes-19: none left out), 15 with a row of their own (changes-16 added w_meme for meme-generation), the rest by S1 or S2
  const withRow = WANTS_DATA.rows.filter(r => WANTS_DATA.skills.some(s => s.name === r.thing)).length
  assert.equal(withRow, 15)
  assert.equal(s1 + s2, 186 - withRow)
  assert.ok(s1 > 25 && s2 > 120, `${s1} built in, ${s2} optional`)
  // skill lines v1 section 3: 174 of 186 skills have a plain line, 12 keep the fixed sentence
  assert.deepEqual([WANTS_DATA.skills.filter(s => s.say != null).length, WANTS_DATA.skills.filter(s => s.say == null).length], [174, 12])
  assert.ok(!/\{say\}/.test(JSON.stringify(WANTS_DATA.fixed.S1.text_fixed + WANTS_DATA.fixed.S2.text_fixed)))
})

test('the service lines: Gmail gets the Connectors line CN1, Google Calendar and Google Drive CN2 with their name (changes-16); GitHub gets the github skill with its docs box; typed, picked and kept alike; Notion is as before', () => {
  const CN1 = WANTS_DATA.fixed.CN1.text
  const CN2 = svc => WANTS_DATA.fixed.CN2.text.replace('{service}', svc)
  let st = freshVisit()
  assert.equal(lineFor(turn('can it read my gmail', st), st).text, CN1)
  st = freshVisit()
  assert.equal(lineFor(turn('can it add events to google calendar', st), st).text, CN2('Google Calendar'))
  st = freshVisit()
  assert.equal(lineFor(turn('can it use my drive', st), st).text, CN2('Google Drive'))
  st = freshVisit()
  const gh = lineFor(turn('can it connect to github', st), st)
  assert.equal(gh.line, 'S1')
  assert.match(gh.text, /"github"/)
  assert.equal(gh.docs.words, 'GitHub via gh CLI: PRs, issues, reviews, repos, auth.')
  // picked: kept as before, the line is CN1
  st = freshVisit()
  pickTopic('svc', st)
  const o = pick('svc', 0, st)
  assert.deepEqual(o.kept, ['svc'])
  assert.equal(st.kept.svc, 'Gmail')
  assert.equal(lineFor(o, st).line, 'CN1')
  // kept: a later visit, the service topic picked: CN1 with "From what I keep: ... Change"
  st = laterVisit({ name: 'Peter', svc: 'Gmail', told: true })
  const k = lineFor(pickTopic('svc', st), st)
  assert.equal(k.line, 'CN1')
  assert.match(k.used.text, /Gmail/)
  // a service with no line of its own: svc1 and its text to paste, as before
  st = freshVisit()
  assert.equal(lineFor(turn('can it connect to notion', st), st).line, 'svc1')
})

test('"More": at most four on screen; over four, three and "More" holding the rest, which shows the next ones the same way', () => {
  const items = n => Array.from({ length: n }, (_, i) => ({ id: 'x' + i, label: 'X' + i }))
  assert.deepEqual(pageOf(items(4)).map(x => x.label), ['X0', 'X1', 'X2', 'X3'])
  const p = pageOf(items(8))
  assert.deepEqual(p.map(x => x.label), ['X0', 'X1', 'X2', 'More'])
  assert.deepEqual(pageOf(p[3].more).map(x => x.label), ['X3', 'X4', 'X5', 'More'])
  assert.deepEqual(pageOf(pageOf(p[3].more)[3].more).map(x => x.label), ['X6', 'X7'])
  // a group of eight under G1, and "Which one do you mean?" over four rows
  const st = freshVisit()
  const g = lineFor(pickGroup('web', st), st)
  assert.deepEqual(g.answers.items.map(a => a.label), ['Search the web', 'Use a website for me', 'Post on X for me', 'More'])
  assert.equal(g.answers.items[3].more.length, 5)
  const w1 = lineFor({ kind: 'W1', buttons: ['w_web', 'w_browser', 'w_xpost', 'w_reddit', 'w_papers'] }, st)
  assert.equal(w1.answers.items.length, 4)
  assert.equal(w1.answers.items[3].label, 'More')
  // a W1 row button gives that row
  assert.deepEqual((o => [o.kind, o.row])(press('w_reddit', 'whatever', st)), ['want', 'w_reddit'])
})

test('the wants pick and the groups: can-q with the four groups, G1 with a group\'s rows; neither is a question that blocks the next one', () => {
  const st = freshVisit()
  const q = lineFor(pickTopic('wants', st), st)
  assert.equal(q.line, 'can-q')
  assert.equal(q.text, 'What do you want Hermes to do?')
  assert.deepEqual(q.answers.items.map(a => a.group), ['web', 'files', 'pics', 'voice'])
  assert.equal(st.lastq, false)
  const g = pickGroup('voice', st)
  // changes-16: w_stt (voice notes into text) joined the voice group, now four rows, still no More
  assert.deepEqual(g.buttons, ['w_voice', 'w_aloud', 'w_stt', 'w_music'])
  assert.equal(lineFor(g, st).answers.items.some(a => a.more), false)
  assert.equal(lineFor(g, st).text, 'Here is what I have checked for that. Pick one, or type your own.')
  // a topic question may follow it (lastq false)
  assert.equal(pickTopic('mem', st).kind, 'question')
})

test('nothing Helper says for the wants shows an unfilled {slot}: every row, every skill (S1, S2), every group, the near miss (the docs box may: it is the docs\' own words)', () => {
  const slot = /\{\w+\}/
  const words = said => [said.text, ...(said.answers ? said.answers.items.map(a => a.label) : []), ...(said.next ? [said.next.label, said.next.text, ...(said.next.steps || []), said.next.after] : [])].filter(Boolean)
  const all = []
  for (const r of WANTS_DATA.rows) { const st = freshVisit(); all.push(...words(lineFor(pickWant(r.id, st), st))) }
  for (const s of WANTS_DATA.skills) { const st = freshVisit(); all.push(...words(lineFor(turn(`is there a ${s.name} skill`, st), st))) }
  for (const g of WANTS_DATA.groups) { const st = freshVisit(); all.push(...words(lineFor(pickGroup(g.id, st), st)), ...words(lineFor({ kind: 'N2', group: g.id }, st))) }
  { const st = freshVisit(); all.push(...words(lineFor(pickTopic('wants', st), st))) }
  assert.ok(all.length > 1000, `${all.length} texts`)
  assert.deepEqual(all.filter(t => slot.test(t)), [])
})
