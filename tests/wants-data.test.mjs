// The wants data (content/helper-wants-v1.json, hhcontent's, written by their build_wants.py) and
// the build's checks on it (scripts/wants-data.mjs, a port of build_wants.py section 3): the team's
// file passes; each check stops the build when the data is broken on purpose; the docs lines the
// quotes are checked against are the v0.23.0 docs' own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { wantsProblems, slimWantsData, serviceLines, MAX_GROUPS } from '../scripts/wants-data.mjs'
import { WANTS_DATA } from '../src/wants-data.js'
import { wantsDataSource } from '../scripts/build.mjs'
import { pinned } from './lib/team-pins.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const TEAM = path.resolve(ROOT, '..')
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'))
const W = read('helper-wants-v1.json')
const TALK = read('helper-talk-v2.json')
const SKILLS = read('skills-list-v1.json')
const DOCS = read('docs-lines-v0.23.0.json')
const copy = o => JSON.parse(JSON.stringify(o))
const problems = (w = W, t = TALK, s = SKILLS, d = DOCS) => wantsProblems(w, t, s, d)
const row = (w, id) => w.wants.find(r => r.id === id)

test('the team\'s wants data passes every check: 24 rows in four groups, 186 skills, five of them left out', () => {
  assert.deepEqual(problems(), [])
  assert.equal(W.wants.length, 24)
  assert.deepEqual(W.groups.map(g => [g.id, W.wants.filter(r => r.group === g.id).length]), [['web', 8], ['files', 7], ['pics', 6], ['voice', 3]])
  assert.equal(W.skills.length, 186)
  assert.deepEqual(WANTS_DATA.skills.filter(s => s.left_out).map(s => s.name).sort(), ['godmode', 'obliteratus', 'scrapling', 'sherlock', 'web-pentest'])
  assert.equal(WANTS_DATA.rows.length, 24)
})

// Each breakage must stop the build with a reason that names it.
const BREAKS = [
  ['a quote moved to another line', w => (row(w, 'w_web').sources[0].line = 28), /w_web: quote not on user-guide\/features\/tools.md line 28|line 28 is not in the docs lines/],
  ['a quote with one word changed', w => (row(w, 'w_web').sources[0].quote = 'Search the web and extract page contents.'), /w_web: quote not on/],
  ['a source in a file the docs do not have', w => (row(w, 'w_web').sources[0].file = 'user-guide/features/nothing.md'), /w_web: source file missing/],
  ['a row with no source', w => (row(w, 'w_web').sources = []), /w_web: no source/],
  ['a row line over the word limit', w => (row(w, 'w_web').text += ' It can also read many other things for you on all the pages it finds today.'), /w_web: line fails R rules/],
  ['a row line with a banned word', w => (row(w, 'w_code').text = 'Hermes can run code in the terminal. This is built in.'), /w_code: line fails R rules: banned term terminal/],
  ['a label of six words', w => (row(w, 'w_web').label = 'Search the whole web for me'), /w_web: label fails: label over 5 words/],
  ['an optional skill with a paste box', w => (row(w, 'w_reddit').next = { kind: 'paste', label: 'Show me what to ask', paste_text: 'Please add it.' }), /w_reddit: optional skill without the app's steps/],
  ['a command for the bot in an optional skill\'s box', w => row(w, 'w_stocks').next.steps.push('Or type: hermes skills install official/finance/stocks.'), /w_stocks: a command for the bot/],
  ['an optional row that does not say "add it first"', w => (row(w, 'w_stocks').text = row(w, 'w_stocks').text.replace(' You add it first.', '')), /w_stocks: optional row does not say it must be added/],
  ['a row that names a plugin', w => (row(w, 'w_web').text = 'Hermes can search the web with a plugin, an add-on.'), /w_web: names a plugin/],
  ['a built-in row for an optional skill', w => (row(w, 'w_pdf').kind = 'optional_skill'), /w_pdf: built in \/ optional differs from the page/],
  ['a row for a skill on neither page', w => ((row(w, 'w_pdf').thing = 'pdf-maker'), (row(w, 'w_pdf').text = row(w, 'w_pdf').text.replace('"pdf"', '"pdf-maker"'))), /w_pdf: names a skill that is on neither page/],
  ['a skill row whose line does not name it as the page does', w => (row(w, 'w_pdf').text = row(w, 'w_pdf').text.replace('"pdf"', '"PDF"')), /w_pdf: line does not name the skill/],
  ['a group of nine rows', w => { for (const id of ['w_docs', 'w_pdf']) row(w, id).group = 'voice'; for (const id of ['w_office', 'w_notes', 'w_meeting', 'w_code']) row(w, id).group = 'voice' }, /group voice has 9 rows, over 8/],
  ['five groups', w => w.groups.push({ id: 'look', label: 'Look something up', subject_words: [] }), new RegExp(`5 groups: more than ${MAX_GROUPS}|group look has no rows`)],
  ['two rows with the same key word', w => row(w, 'w_aloud').key_words.push('voice mode'), /key word 'voice mode' in w_voice and w_aloud/],
  ['two rows with the same thing and action', w => row(w, 'w_pdf').actions.push('read'), /collision w_docs \/ w_pdf: things pdf,pdfs with actions read/],
  ['a row key word that is a topic key word', w => row(w, 'w_web').key_words.push('memory'), /w_web: key word 'memory' is also a key word of mem/],
  ['CN1 says the links are free', w => (w.fixed_lines.find(f => f.id === 'CN1').text += ' It is free.'), /CN1 says something about cost/],
  ['S2\'s clicks with a step over the limit', w => w.fixed_lines.find(f => f.id === 'S2').next.steps.push('Then click on the small grey button with the name of the skill at the top of the long list of cards.'), /S2-step4: line fails R rules/],
  ['a skill\'s own words changed', w => (w.skills.find(s => s.name === 'github').docs_words = 'GitHub for everyone.'), /skill github: quote not on reference\/skills-catalog.md/],
  ['a skill missing from the wants that the skills list has', w => w.skills.splice(3, 1), /the wants' skills differ from content\/skills-list-v1.json/],
  ['the wants pick labelled differently', w => (w.topic.pick.label = 'Web and files'), /the wants pick is labelled differently/],
  ['a group answer missing under can-q', w => w.topic.question.answers.pop(), /can-q's answers are not the groups/],
  ['a fixed line the code says is missing', w => (w.fixed_lines = w.fixed_lines.filter(f => f.id !== 'G1')), /fixed line G1 is missing/],
  ['GitHub\'s line names a skill that is not built in', w => (w.service_lines.GitHub = 'S1 with the built-in skill stocks'), /service line GitHub: stocks is not a built-in skill/],
  ['a service line the code does not show', w => (w.service_lines.Gmail = 'N2'), /service line Gmail: N2 is not CN1 or S1/],
  ['a {slot} in a row\'s text to paste', w => (row(w, 'w_web').next.paste_text = 'Search the web for {topic}.'), /w_web: a \{slot\} Helper does not fill/],
  ['a {slot} other than {name} in S2\'s after line', w => (w.fixed_lines.find(f => f.id === 'S2').next.after = 'It works from your next {when}.'), /S2: a \{slot\} Helper does not fill/],
  ['an optional row with no clicks', w => (row(w, 'w_reddit').next.steps = []), /w_reddit: clicks with no steps or no after line/],
  ['a row with no kind (no crash, a reason)', w => delete row(w, 'w_web').kind, /w_web: kind undefined is not one the wants data uses/],
  ['a row id that is a topic id', w => (row(w, 'w_web').id = 'mem'), /mem: the same id as a topic, term or pick/],
  // wants fixes v1: skill_name_rule_wf1
  ['no skill_name_rule_wf1', w => delete w.skill_name_rule_wf1, /skill_name_rule_wf1 is missing/],
  ['an ordinary name that is no skill', w => w.skill_name_rule_wf1.ordinary_names.push('knitting'), /ordinary name knitting is no skill/],
  ['no ordinary names', w => delete w.skill_name_rule_wf1.ordinary_names, /ordinary_names is not a list of names/],
  ['a "not after" list that is no list', w => (w.skill_name_rule_wf1.skill_for_not_after = 'me'), /skill_for_not_after is not a list/],
  ['a say whose sentence is over 18 words with the fixed words', w => (w.skills.find(s => s.name === 'github').say = 'work with all GitHub issues, pull requests, reviews, code folders, the wiki, releases and more.'), /skill github: S1 line fails: .*sentence of 19 words > 14/],
  ['a "skill for" pattern that does not catch the word after it', w => (w.skill_name_rule_wf1.skill_for_pattern = 'skills? for (?:a )?'), /skill_for_pattern does not catch the word/],
  ['a "skill for" pattern that does not compile', w => (w.skill_name_rule_wf1.skill_for_pattern = 'skills? for ([a-z]'), /skill_for_pattern does not compile/],
  // skill lines v1: S1 and S2 say {say}, or text_fixed when a skill has none
  ['a skill with no say and S1 with no text_fixed', w => delete w.fixed_lines.find(f => f.id === 'S1').text_fixed, /skill sdlc-review: no say, and S1 has no text_fixed/],
  ['a say with a {slot}', w => (w.skills.find(s => s.name === 'github').say = 'work with {thing} on GitHub.'), /skill github: say holds a \{slot\}/],
  ['a say with no full stop', w => (w.skills.find(s => s.name === 'github').say = 'work with GitHub'), /skill github: say does not end with a full stop/],
  ['a say over the word limit', w => (w.skills.find(s => s.name === 'github').say = 'work with GitHub and all of its many issues, pull requests, reviews, code folders and other things too.'), /skill github: S1 line fails/],
  ['a {slot} other than {name} and {say} in S1', w => (w.fixed_lines.find(f => f.id === 'S1').text += ' {when}'), /S1: a \{slot\} Helper does not fill/],
  ['a {say} in S2\'s text_fixed', w => (w.fixed_lines.find(f => f.id === 'S2').text_fixed += ' {say}'), /S2 text_fixed: a \{slot\} Helper does not fill/]
]
for (const [what, breakIt, reason] of BREAKS) {
  test(`the build stops on ${what}`, () => {
    const w = copy(W)
    breakIt(w)
    const p = problems(w)
    assert.ok(p.some(x => reason.test(x)), `no problem matched ${reason}; got: ${p.join(' | ') || 'none'}`)
  })
}

test('the docs lines file is the one the build reads, and a quote is checked against the docs\' own line, not the file as a whole', () => {
  // the build itself stops, with nothing written, on a quote that is not on its line
  const w = copy(W)
  row(w, 'w_web').sources[0].line = 28
  assert.throws(() => wantsDataSource(w), /helper-wants-v1.json has \d+ problem\(s\); the build stops and nothing is written/)
  assert.doesNotThrow(() => wantsDataSource())
  const d = copy(DOCS)
  const f = d.files['user-guide/features/tools.md']
  f.lines['27'] = f.lines['27'].replace('Search the web and extract page content.', 'Search the web.')
  assert.ok(problems(W, TALK, SKILLS, d).some(x => x.startsWith('w_web: quote not on user-guide/features/tools.md line 27')))
  // the version must be the wants data's
  assert.ok(problems(W, TALK, SKILLS, { ...copy(DOCS), docs_version: 'v0.22.0' }).some(x => x.includes('docs lines are of v0.22.0')))
})

test('the docs lines are the v0.23.0 docs\' own, line for line (when the Hermes checkout is beside the plugin)', t => {
  const src = path.join(TEAM, 'dev', 'hermes-src', 'website', 'docs')
  if (!fs.existsSync(src)) return t.skip('no Hermes checkout at dev/hermes-src')
  let lines = 0
  for (const [file, f] of Object.entries(DOCS.files)) {
    const buf = fs.readFileSync(path.join(src, file))
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), f.sha256, `${file} is not the copy the lines were cut from`)
    const all = buf.toString('utf8').split('\n')
    for (const [n, text] of Object.entries(f.lines)) {
      assert.equal(all[Number(n) - 1], text, `${file} line ${n}`)
      lines++
    }
  }
  assert.ok(lines >= 200, `only ${lines} lines`)
})

test('the plugin\'s copy of the wants data is the team\'s at the checksum this job names (when the team\'s folder is there)', t => {
  const team = path.join(TEAM, 'content', 'helper-wants-v1.json')
  if (!fs.existsSync(team)) return t.skip('no team content folder beside the plugin')
  const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
  assert.equal(sha(path.join(ROOT, 'content', 'helper-wants-v1.json')), pinned(t, 'content/helper-wants-v1.json'), 'run bash dev/checks/talk-v2-wf1/recopy-wf1.sh')
})

test('the code gets only what it reads: no notes, no hints for a model, no screenshots\' paths; the service lines as data', () => {
  const text = JSON.stringify(slimWantsData(W, SKILLS))
  for (const k of ['model_hint', '"seen"', '"shot"', 'card_says', '"why"', '"status"', '"under"', 'hhtech', 'hhcontent', 'Builder']) assert.ok(!text.includes(k), k)
  assert.deepEqual(serviceLines(W), { Gmail: { line: 'CN1' }, 'Google Calendar': { line: 'CN1' }, 'Google Drive': { line: 'CN1' }, GitHub: { line: 'S1', skill: 'github' } })
  assert.deepEqual(WANTS_DATA, slimWantsData(W, SKILLS))
})
