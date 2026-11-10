// The build's checks on hhcontent's talk data (scripts/talk-data.mjs): the build stops, and writes
// nothing, on a line with no source, a line over hhcontent's limits, an answer that gives a need of
// another topic, any list of things to pick longer than four, or answers under a question that
// carries none. Each is shown to bite on a copy
// of the data broken on purpose. The line rules are compared with hhcontent's own check.py.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { checkLine, talkLines, talkProblems, slimTalkData, pickLists, FIXED_USED, WANTS_BUILT } from '../scripts/talk-data.mjs'
import { talkDataSource } from '../scripts/build.mjs'
import { TALK_DATA } from '../src/talk-data.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'content/helper-talk-v2.json'), 'utf8'))
const PY = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/check-py-lines.json'), 'utf8'))
const broken = change => {
  const d = read()
  change(d)
  return d
}
const topic = (d, id) => d.topics.find(t => t.id === id)

test('the data as copied has no problem, and the built data file is what the build makes from it', () => {
  assert.deepEqual(talkProblems(read()), [])
  assert.equal(fs.readFileSync(path.join(ROOT, 'src/talk-data.js'), 'utf8'), talkDataSource())
  assert.deepEqual(TALK_DATA, slimTalkData(read(), JSON.parse(fs.readFileSync(path.join(ROOT, 'content/skills-list-v1.json'), 'utf8'))))
})

test('the line rules are hhcontent\'s check.py: the same findings for every line of the data and for lines broken on purpose', () => {
  const ours = talkLines(read())
  const dataLines = PY.lines.filter(l => !l.id.startsWith('broken-'))
  const brokenLines = PY.lines.filter(l => l.id.startsWith('broken-'))
  assert.deepEqual(dataLines.map(l => l.id), ours.map(l => l.id), 'the test file holds every line of the data: make it again after a recopy')
  assert.ok(ours.length >= 50, `${ours.length} lines`)
  assert.ok(brokenLines.length >= 30)
  ours.forEach((l, i) => assert.equal(dataLines[i].text, l.text, l.id))
  for (const l of PY.lines) assert.deepEqual(checkLine(l.text, l.kind), l.found, `${l.id}: ${l.text}`)
  // the broken ones cover every kind of finding check.py has
  const kinds = new Set(brokenLines.flatMap(l => l.found.map(f => f.replace(/\d+/g, 'N').replace(/(banned term|term not explained:|long word) .*/, '$1'))))
  for (const want of ['N words > N', 'N sentences > N', 'sentence of N words > N', 'more than one question', 'an answer line ends with a question', 'has !', 'has link', 'has em dash', 'has ;',
    'has bracket', 'long word', 'banned term', 'term not explained:', 'N Hermes terms in one line', 'product word', 'promises to do it']) assert.ok(kinds.has(want), `no broken line shows: ${want}`)
  assert.ok(brokenLines.some(l => l.found.length === 0), 'and some pass')
})

test('the build stops on a line with no source', () => {
  for (const [name, change] of [
    ['a need', d => delete topic(d, 'mem').needs[0].source],
    ['a plain line', d => (topic(d, 'mod').plain.source = '')],
    ['a term', d => delete d.terms[0].source],
    ['a line behind a button', d => delete topic(d, 'bot').needs[0].next.source],
    ['the where line', d => delete d.parts.bots.where_line.source]
  ]) {
    const d = broken(change)
    assert.ok(talkProblems(d).some(p => /: no source$/.test(p)), name)
    assert.throws(() => talkDataSource(d), /the build stops and nothing is written/, name)
  }
})

test('the build stops on a line over hhcontent\'s limits', () => {
  const cases = [
    [d => (topic(d, 'mem').needs[0].text += ' And one more sentence that makes this line far too long for the rule of twenty-five words.'), /mem1: \d+ words > 25/],
    [d => (topic(d, 'msg').question.text = 'Which of the many chat apps that exist today do you use the most often?'), /msg-q: \d+ words > 12/],
    [d => (topic(d, 'sch').plain.text = 'Use cron for that.'), /sch0: banned term cron/],
    [d => (d.terms[1].text = 'A skill is a thing.'), /term-skill: term not explained: skill/],
    [d => (d.fixed_lines.find(f => f.id === 'N1').text = 'Sorry! Nothing.'), /N1: has !/],
    [d => (d.fixed_lines.find(f => f.id === 'K1').text = 'I will install it.'), /K1: promises to do it/],
    [d => (topic(d, 'bot').needs[0].next.text = 'Is it this? Or that?'), /bot1-next: more than one question/]
  ]
  for (const [change, want] of cases) {
    const d = broken(change)
    assert.ok(talkProblems(d).some(p => want.test(p)), String(want) + ' in ' + JSON.stringify(talkProblems(d)))
    assert.throws(() => talkDataSource(d), /the build stops/)
  }
})

test('the build stops on an answer that gives a need of another topic', () => {
  const d = broken(x => (topic(x, 'mod').question.answers[1].gives = 'mem1'))
  assert.deepEqual(talkProblems(d), [`mod-q: the answer "${topic(d, 'mod').question.answers[1].label}" gives mem1, which is not a need of mod`])
  assert.throws(() => talkDataSource(d), /the build stops/)
})

test('the build stops on any list of things to pick longer than four (his words of 10 Nov 20:05); four is allowed', () => {
  for (const [name, change] of [
    ['the topic picks', d => d.topic_picks.push({ ...d.topic_picks[1] })],
    ['the answers under a question', d => topic(d, 'mod').question.answers.push({ label: 'Five', gives: 'mod1' })],
    ['the picks a pick holds', d => (d.topic_picks[0].holds = ['sch', 'svc', 'bot', 'mem', 'wants'])],
    ['the answers under "Do you mean me"', d => d.keeps.remember.lines.find(l => l.id === 'RM2').answers.push({ label: 'a', gives: 'RM3' }, { label: 'b', gives: 'RM3' }, { label: 'c', gives: 'RM3' })],
    ['the Yes and No under a delete question', d => d.keeps.typed.forget_one.answers.push({ label: 'a', gives: 'no' }, { label: 'b', gives: 'no' }, { label: 'c', gives: 'no' })]
  ]) {
    const d = broken(change)
    assert.ok(talkProblems(d).some(p => /^over four to pick at once: /.test(p)), name)
    assert.throws(() => talkDataSource(d), /the build stops/, name)
  }
  const four = broken(d => topic(d, 'msg').question.answers.splice(3))
  assert.ok(!talkProblems(four).some(p => /over four/.test(p)))
  // every list in the data today, counted
  for (const [name, count] of pickLists(read())) assert.ok(count <= 4, `${name}: ${count}`)
})

test('answers to pick only under the questions that carry them (answers.when_shown): the build stops on answers under an open question, or none under a question that carries them', () => {
  const extra = broken(d => (topic(d, 'mem').question.answers = [{ label: 'Things about me', gives: 'mem1' }]))
  assert.ok(talkProblems(extra).includes('mem-q: answers to pick, but when_shown says it carries none'))
  const none = broken(d => (topic(d, 'msg').question.answers = []))
  assert.ok(talkProblems(none).includes('msg-q: no answers to pick, but when_shown says it carries them'))
  const missing = broken(d => delete d.answers.when_shown.questions['sch-q What should Hermes do on a schedule, such as a daily summary?'])
  assert.ok(talkProblems(missing).includes('sch-q: not in answers.when_shown'))
  assert.throws(() => talkDataSource(extra), /the build stops/)
})

test('the wants (row 5) are not in this build: C1 says its text without them and holds the three topics; a held pick that is neither a topic nor described stops the build', () => {
  assert.equal(WANTS_BUILT, false)
  const d = read()
  assert.deepEqual(d.topic_picks[0].holds, ['wants', 'sch', 'svc', 'bot'], 'the team\'s data holds the wants')
  assert.deepEqual(TALK_DATA.topic_picks[0].holds, ['sch', 'svc', 'bot'])
  assert.equal(TALK_DATA.fixed.C1.text, d.fixed_lines.find(f => f.id === 'C1').text_without_wants)
  assert.ok(talkProblems(broken(x => x.topic_picks[0].holds.push('zzz'))).some(p => /holds zzz, which is not a topic/.test(p)))
})

test('the build stops on a missing fixed line, a button of an unknown kind, picks that miss a topic', () => {
  assert.ok(talkProblems(broken(d => (d.fixed_lines = d.fixed_lines.filter(f => f.id !== 'W1')))).includes('fixed line W1 is missing'))
  assert.ok(talkProblems(broken(d => (d.fixed_lines = d.fixed_lines.filter(f => f.id !== 'TP')))).includes('fixed line TP is missing'))
  assert.ok(talkProblems(broken(d => (topic(d, 'mem').needs[0].next.kind = 'popup'))).some(p => /mem1: button of an unknown kind popup/.test(p)))
  assert.ok(talkProblems(broken(d => (topic(d, 'mem').needs[0].next.paste_text = ''))).some(p => /mem1: text to paste is empty/.test(p)))
  assert.ok(talkProblems(broken(d => d.topic_picks.pop())).some(p => /do not reach every topic exactly once/.test(p)))
  assert.ok(talkProblems(broken(d => (d.topic_picks[0].line = 'C9'))).some(p => /names a line that is missing: C9/.test(p)))
  assert.ok(talkProblems(broken(d => (d.answers.max_at_once = 5))).some(p => /the rule is four/.test(p)))
})

test('Helper\'s own lines about what it keeps pass the same word rules (and a broken one stops the build)', () => {
  const ids = talkLines(read()).map(l => l.id)
  for (const id of ['RM1', 'RM2', 'A2-name', 'A4', 'A1', 'kept-first', 'used-line', 'settings-top', 'settings-why-msg_value', 'settings-forget-all']) assert.ok(ids.includes(id), id)
  const d = broken(x => (x.keeps.remember.lines.find(l => l.id === 'RM1').text = 'Done! I keep that.'))
  assert.ok(talkProblems(d).includes('RM1: has !'))
})

test('with a problem the build writes no file at all (the texts are all made before the first is written)', () => {
  const build = fs.readFileSync(path.join(ROOT, 'scripts/build.mjs'), 'utf8')
  // generatedSources() makes every text, talk data included, in one list; the loop that writes comes after it
  assert.match(build, /for \(const \[file, text, from\] of generatedSources\(\)\)/)
  assert.match(build, /\[TALK_JS, talkDataSource\(\), 'content\/helper-talk-v2\.json'\]/)
})

test('what goes into the public built file: only what the code reads, and each line\'s source; no notes, no model data, nothing for a build that calls a model', () => {
  const built = fs.readFileSync(path.join(ROOT, 'src/talk-data.js'), 'utf8')
  // (unsure.about is a list of words the code reads, not a note: notes are texts)
  assert.doesNotMatch(built, /"(?:note|\w+_note|about|when|rule|seen|used_in|status)": "/)
  assert.doesNotMatch(built, /topic_picks_way_2|r6_never|screen_names|depends_on_his_answer|model_hint|"topic_ids"|max_tokens|"first_time":|top_line_2|ai_step|disclosure/)
  // A team member is named only where a line's own source names who saw it in the running app.
  const withoutSources = JSON.stringify(TALK_DATA, (key, value) => (key === 'source' ? undefined : value))
  assert.doesNotMatch(withoutSources, /hhtech|hhcontent|hhdesign|\bLead\b|\bBuilder\b|P\u0113teris|his words/i)
  for (const t of TALK_DATA.topics) for (const n of [t.plain, ...t.needs]) assert.ok(n.source, n.id)
  for (const t of TALK_DATA.terms) assert.ok(t.source, t.id)
  assert.deepEqual(Object.keys(TALK_DATA.fixed), FIXED_USED)
  // of the skills list, only the names and which are left out
  for (const s of TALK_DATA.skills) assert.deepEqual(Object.keys(s).filter(k => k !== 'left_out'), ['name'])
  // more than half of the team's file stays out
  const whole = fs.statSync(path.join(ROOT, 'content/helper-talk-v2.json')).size
  assert.ok(JSON.stringify(TALK_DATA).length < whole * 0.6, `${JSON.stringify(TALK_DATA).length} of ${whole}`)
})
