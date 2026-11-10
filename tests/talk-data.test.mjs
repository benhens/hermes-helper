// The build's checks on hhcontent's talk data (scripts/talk-data.mjs): the build stops, and writes
// nothing, on a line with no source, a line over hhcontent's limits, an answer that gives a need of
// another topic, or any list of things to pick longer than five. Each is shown to bite on a copy
// of the data broken on purpose. The line rules are compared with hhcontent's own check.py.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { checkLine, talkLines, talkProblems, slimTalkData, pickLists, FIXED_USED } from '../scripts/talk-data.mjs'
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
  assert.deepEqual(TALK_DATA, slimTalkData(read()))
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
  const d = broken(x => (topic(x, 'mem').question.answers[1].gives = 'mod1'))
  assert.deepEqual(talkProblems(d), ['mem-q: the answer "What we talked about" gives mod1, which is not a need of mem'])
  assert.throws(() => talkDataSource(d), /the build stops/)
})

test('the build stops on any list of things to pick longer than five', () => {
  const six = { label: 'One more', gives: 'x' }
  for (const [name, change] of [
    ['the topic picks', d => d.topic_picks.push({ ...d.topic_picks[1] })],
    ['the answers under a question', d => topic(d, 'sch').question.answers.push({ label: 'Five', gives: 'sch1' }, { label: 'Six', gives: 'sch2' })],
    ['the picks a pick holds', d => (d.topic_picks[0].holds = ['sch', 'svc', 'mem', 'mod', 'msg', 'bot'])]
  ]) {
    const d = broken(change)
    assert.ok(talkProblems(d).some(p => /^over five to pick at once: /.test(p)), name)
    assert.throws(() => talkDataSource(d), /the build stops/, name)
  }
  assert.ok(six)
  // five is allowed
  const five = broken(d => topic(d, 'bot').question.answers.push({ label: 'Four', gives: 'bot1' }, { label: 'Five', gives: 'bot2' }))
  assert.ok(!talkProblems(five).some(p => /over five/.test(p)))
  // every list in the data today, counted
  for (const [name, count] of pickLists(read())) assert.ok(count >= 1 && count <= 5, `${name}: ${count}`)
})

test('the build stops on a missing fixed line, a button of an unknown kind, picks that miss a topic', () => {
  assert.ok(talkProblems(broken(d => (d.fixed_lines = d.fixed_lines.filter(f => f.id !== 'W1')))).includes('fixed line W1 is missing'))
  assert.ok(talkProblems(broken(d => (topic(d, 'mem').needs[0].next.kind = 'popup'))).some(p => /mem1: button of an unknown kind popup/.test(p)))
  assert.ok(talkProblems(broken(d => (topic(d, 'mem').needs[0].next.paste_text = ''))).some(p => /mem1: text to paste is empty/.test(p)))
  assert.ok(talkProblems(broken(d => d.topic_picks.pop())).some(p => /do not reach every topic exactly once/.test(p)))
  assert.ok(talkProblems(broken(d => (d.topic_picks[0].line = 'C9'))).some(p => /names a line that is missing: C9/.test(p)))
  assert.ok(talkProblems(broken(d => (d.answers.max_at_once = 6))).some(p => /the rule is five/.test(p)))
})

test('with a problem the build writes no file at all (the texts are all made before the first is written)', () => {
  const build = fs.readFileSync(path.join(ROOT, 'scripts/build.mjs'), 'utf8')
  // generatedSources() makes every text, talk data included, in one list; the loop that writes comes after it
  assert.match(build, /for \(const \[file, text, from\] of generatedSources\(\)\)/)
  assert.match(build, /\[TALK_JS, talkDataSource\(\), 'content\/helper-talk-v2\.json'\]/)
})

test('what goes into the public built file: only what the code reads, and each line\'s source; no notes, nothing about keeping', () => {
  const built = fs.readFileSync(path.join(ROOT, 'src/talk-data.js'), 'utf8')
  assert.doesNotMatch(built, /"(?:note|\w+_note|about|when|rule|seen|used_in)":/)
  assert.doesNotMatch(built, /"keeps"|kept_words|"tell"|request_starts|topic_picks_way_2|r6_never|screen_names|depends_on_his_answer/)
  // A team member is named only where a line's own source names who saw it in the running app.
  const withoutSources = JSON.stringify(TALK_DATA, (key, value) => (key === 'source' ? undefined : value))
  assert.doesNotMatch(withoutSources, /hhtech|hhcontent|hhdesign|\bLead\b|\bBuilder\b|P\u0113teris|his words/i)
  for (const t of TALK_DATA.topics) for (const n of [t.plain, ...t.needs]) assert.ok(n.source, n.id)
  for (const t of TALK_DATA.terms) assert.ok(t.source, t.id)
  assert.deepEqual(Object.keys(TALK_DATA.fixed), FIXED_USED)
  // about two thirds of the team's file stays out
  const whole = fs.statSync(path.join(ROOT, 'content/helper-talk-v2.json')).size
  assert.ok(JSON.stringify(TALK_DATA).length < whole / 2, `${JSON.stringify(TALK_DATA).length} of ${whole}`)
})
