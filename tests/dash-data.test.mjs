// The Dashboard's data and its build checks (scripts/dash-data.mjs). dash-v2: the data is two files of the team's,
// each copied as it is at the checksum the team named: content/dash-setup-list-v2.json (the 11 stops) and
// content/dash-words-v1.json (every other word, page_words), joined by the build. The build refuses a changed docs
// quote, as it does for the wants; every word on the tab is in the files.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { dashProblems, slimDashData, quotesOf, SEEN_IDS, ROUTE_TARGETS } from '../scripts/dash-data.mjs'
import { dashDataSource, dashJoined } from '../scripts/build.mjs'
import { pinned } from './lib/team-pins.mjs'
import { DASH_DATA } from '../src/dash-data.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const TEAM = path.resolve(ROOT, '..')
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const DATA = dashJoined()
const DOCS = read('content/dash-docs-lines-v0.23.0.json')
const copy = () => structuredClone(DATA)

test('the data as committed passes every check, and src/dash-data.js is made from it', () => {
  assert.deepEqual(dashProblems(DATA, DOCS), [])
  assert.deepEqual(DASH_DATA, slimDashData(DATA))
})

test('every docs quote is checked: 93 quotes (90 different) from 20 docs files, each on its line (16 lines sit elsewhere in the tagged v0.23.0 docs and are followed there)', () => {
  const docsQuotes = quotesOf(DATA).filter(q => !q.s.file.startsWith('/'))
  assert.equal(docsQuotes.length, 93, `${docsQuotes.length} quotes`)
  assert.equal(new Set(docsQuotes.map(q => `${q.s.file}:${q.s.line}:${q.s.quote}`)).size, 90)
  assert.equal(Object.keys(DOCS.files).length, 20)
  assert.equal(Object.values(DOCS.files).reduce((n, f) => n + Object.keys(f.moved || {}).length, 0), 16)
})

test('a text to paste (what the Copy button copies) that is not word for word in its docs quote is refused, and one without a quote', () => {
  const bad = JSON.parse(JSON.stringify(DATA))
  const install = bad.items.find(i => i.id === 'install')
  install.terminal.paste[0].text = 'curl -fsSL https://example.com/x.sh | bash'
  assert.ok(dashProblems(bad, DOCS).some(p => /install: paste 1 is not in its docs quote/.test(p)))
  const none = JSON.parse(JSON.stringify(DATA))
  delete none.items.find(i => i.id === 'install').terminal.paste[1].src
  assert.ok(dashProblems(none, DOCS).some(p => /install: paste 2 has no docs quote/.test(p)))
})

test('a changed docs quote is refused: a word changed, a line number changed, or a quote on a moved line changed', () => {
  const a = copy()
  a.items[1].steps[0].src.quote = '**Cmd/Ctrl+,** Preferences'
  assert.match(dashProblems(a, DOCS).join('\n'), /quote not on user-guide\/desktop\.md line 549/)
  const b = copy()
  b.items[0].sources[0].line = 54
  assert.match(dashProblems(b, DOCS).join('\n'), /getting-started\/quickstart\.md line 54 is not in the docs lines file|quote not on getting-started\/quickstart\.md line 54/)
  const c = copy()
  c.items[3].sources[0].quote = '`SOUL.md` is the **only identity**'
  assert.match(dashProblems(c, DOCS).join('\n'), /quote not on user-guide\/features\/personality\.md line 9/)
  // and the build stops with nothing written
  assert.throws(() => dashDataSource(a, DOCS), /the build stops and nothing is written/)
})

test('the docs lines file could not have been made to fit: a moved line points at a line that holds the quote, and a changed docs line is caught', () => {
  const d = structuredClone(DOCS)
  const f = d.files['user-guide/desktop.md']
  const [from, to] = Object.entries(f.moved)[0]
  f.lines[String(to)] = 'a line that no longer holds the quote'
  assert.ok(dashProblems(DATA, d).length >= 1, `line ${from} -> ${to}`)
})

// loom-fixes (dash-setup-list-v2 eb3aeba8): 10 stops on the path (Install off it), every one counted; the stops the page
// sees are exactly those the code has a rule for, First chat among them by hhtech's rule (the data marks it person)
test('the path: 10 stops, Install off it; the page sees exactly the stops the code has a rule for (First chat by hhtech\'s rule); a stop the data gives to the page with no rule is refused', () => {
  assert.deepEqual(DATA.items.filter(i => i.on_path).map(i => i.id), ['model', 'first_chat', 'personality', 'chat_apps', 'tools_apps', 'skills', 'memory', 'scheduled_job', 'second_bot', 'safety'])
  assert.equal(DATA.items.find(i => i.id === 'install').on_path, false)
  assert.deepEqual(DASH_DATA.items.filter(i => i.seen).map(i => i.id).sort(), [...SEEN_IDS].sort())
  assert.deepEqual(DASH_DATA.items.filter(i => !i.seen).map(i => i.id), ['tools_apps', 'skills', 'memory', 'safety'])
  assert.equal(DASH_DATA.total, 10)
  const b = copy()
  b.items.find(i => i.id === 'memory').marked_by = 'page'
  assert.match(dashProblems(b, DOCS).join('\n'), /the code has rules for exactly/)
  const c = copy()
  c.items.find(i => i.id === 'install').on_path = true
  assert.match(dashProblems(c, DOCS).join('\n'), /the path has 11 stops, not 10/)
})

test('every word on the tab is in the file: one missing stops the build; marks fit (at most 15 letters); routes go only where hhtech ran', () => {
  for (const [part, key] of [['setup', 'you_are_here'], ['stats', 'plugins'], ['tabs', 'learn'], ['setup', 'mark_done'], ['setup', 'mark_undo'], ['setup', 'person_note'], ['helper_window', 'hide'], ['helper_window', 'clear_ask']]) {
    const a = copy()
    delete a.page_words[part][key]
    assert.match(dashProblems(a, DOCS).join('\n'), new RegExp(`page_words\\.${part}\\.${key} missing`))
  }
  const m = copy()
  m.page_words.marks.tools_apps = 'Tools and outside apps'
  assert.match(dashProblems(m, DOCS).join('\n'), /marks\.tools_apps longer than 15/)
  const r = copy()
  r.page_words.routes[0].to = '/settings?tab=config:safety'
  assert.match(dashProblems(r, DOCS).join('\n'), /is not a place hhtech ran/)
  assert.deepEqual(DATA.page_words.routes.map(x => x.to), ['/settings?tab=config:model', 'new-chat', '/messaging', '/cron'])
  assert.ok(DATA.page_words.routes.every(x => ROUTE_TARGETS.includes(x.to)))
  // the sentence under a stop the person marks is hhcontent's one cannot_tell sentence
  assert.equal(DATA.page_words.setup.person_note, DATA.cannot_tell_words[0])
  // loom-fixes: two tabs, My setup out
  assert.deepEqual(Object.keys(DATA.page_words.tabs), ['dashboard', 'learn'])
  const t = copy()
  t.page_words.tabs.my_setup = 'My setup'
  assert.match(dashProblems(t, DOCS).join('\n'), /not exactly Dashboard and Learn/)
})

test('the words he took out are not in the file: no "chats in 30 days", no "days with a chat", no "streak"', () => {
  const words = JSON.stringify(DATA.page_words)
  assert.doesNotMatch(words, /30 days|days with a chat|streak|Journey/i)
})

test('the plugin\'s two copies are the team\'s files at the checksums the team named, unchanged (no builder block, no stand-in words)', t => {
  const sha = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex')
  for (const file of ['content/dash-setup-list-v2.json', 'content/dash-words-v1.json']) assert.equal(sha(file), pinned(t, file), file)
  assert.equal(read('content/dash-setup-list-v2.json').builder, undefined)
  assert.equal(read('content/dash-setup-list-v2.json').page_words, undefined)
  assert.equal(DATA.page_words.stand_in, undefined)
  assert.deepEqual(DATA.page_words, read('content/dash-words-v1.json').page_words)
})

test('the docs lines file matches the Hermes v0.23.0 docs (when the checkout is there)', t => {
  const docs = path.join(TEAM, 'dev', 'hermes-src', 'website', 'docs')
  if (!fs.existsSync(docs)) return t.skip('no Hermes checkout here')
  for (const [file, f] of Object.entries(DOCS.files)) {
    const buf = fs.readFileSync(path.join(docs, file))
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), f.sha256, file)
    const all = buf.toString('utf8').split('\n')
    for (const [n, line] of Object.entries(f.lines)) assert.equal(all[Number(n) - 1], line, `${file}:${n}`)
  }
})

test('what teammates saw in the app ("seen" sources in team files) is in that file; on another line than named: a note (team files grow)', t => {
  const seen = quotesOf(DATA).filter(q => q.s.file.startsWith('/root/projects/helping-hand/'))
  assert.ok(seen.length >= 4)
  for (const { where, s } of seen) {
    if (!fs.existsSync(s.file)) return t.skip('the team folder is not here')
    const all = fs.readFileSync(s.file, 'utf8').split('\n')
    const at = all.findIndex(l => l.includes(s.quote)) + 1
    assert.ok(at > 0, `${where}: not in ${s.file}: ${s.quote}`)
    if (!(all[s.line - 1] || '').includes(s.quote)) t.diagnostic(`note: ${where}: ${s.file} line ${s.line} is now line ${at}`)
  }
})

/* ---------- dash-v2: hhcontent's words (content/result-hhcontent-dash-words.md, "For builder") ---------- */
test('the words for one (bot, skill, plugin on in this bot), for a screen reader (Counting, could not read) and Copied are needed: one missing stops the build', () => {
  for (const [part, key] of [['stats', 'bots_one'], ['stats', 'skills_one'], ['stats', 'plugins_one'], ['stats', 'not_known'], ['stats', 'waiting'], ['setup', 'copied']]) {
    const a = copy()
    delete a.page_words[part][key]
    assert.match(dashProblems(a, DOCS).join('\n'), new RegExp(`page_words\\.${part}\\.${key} missing`))
  }
  assert.deepEqual([DATA.page_words.stats.bots_one, DATA.page_words.stats.skills_one, DATA.page_words.stats.plugins_one, DATA.page_words.stats.plugins], ['bot', 'skill', 'plugin on in this bot', 'plugins on in this bot'])
})

test('"All 10 are set up." has the number written in it: when the number of stops on the path is not the one in the sentence, the build stops', () => {
  assert.equal(DATA.page_words.setup.all_done, 'All 10 are set up.')
  const a = copy()
  a.page_words.setup.all_done = 'All 6 are set up.'
  assert.match(dashProblems(a, DOCS).join('\n'), /all_done says 6; the path has 10 stops/)
  const b = copy()
  b.page_words.setup.all_done = 'Everything is set up.'
  assert.match(dashProblems(b, DOCS).join('\n'), /all_done does not say how many/)
})

test('the built data: "No chats with this bot yet" is not in it (Lead: not shown); the team\'s step marks (seen, not seen, notes) are not in it; a step without a docs line (src null) is still a step', () => {
  assert.equal(DATA.page_words.activity.no_chats, 'No chats with this bot yet', 'the team\'s file has the line')
  const built = JSON.stringify(DASH_DATA)
  assert.doesNotMatch(built, /No chats with this bot yet|not_seen|docs words, not seen|seen_note|"note"/)
  // loom2: Activity is out (his Loom, 0:05): none of its words are built in
  assert.equal(DASH_DATA.words.activity, undefined)
  assert.doesNotMatch(built, /This bot's activity|Last used/)
  const personality = DATA.items.find(i => i.id === 'personality')
  assert.deepEqual(personality.steps.map(s => s.src === null), [false, false, true, false, true])
  assert.deepEqual(DASH_DATA.items.find(i => i.id === 'personality').steps.map(s => Object.keys(s)), [['text'], ['text'], ['text'], ['text'], ['text']])
  assert.equal(DATA.items.filter(i => i.steps.some(s => s.src === null)).length >= 3, true)
  // every step carries one of the team's two marks (seen in the app, or docs words not seen)
  for (const it of DATA.items) for (const s of it.steps) assert.equal(Boolean(s.seen) !== Boolean(s.not_seen), true, `${it.id}: ${s.text}`)
  // the stop's names as hhcontent has them now
  assert.deepEqual(DASH_DATA.items.map(i => i.name), ['A model', 'First chat', 'Its personality', 'Chat apps', 'Tools and apps', 'Skills', 'Memory', 'Scheduled jobs', 'A second bot', 'Safety'])
  // the route buttons stay on the steps hhcontent names: model 3, first_chat 1, chat_apps 1, scheduled_job 3
  assert.deepEqual(DASH_DATA.items.flatMap(i => i.steps.map((s, k) => (s.route ? `${i.id} ${k + 1}` : null)).filter(Boolean)), ['model 3', 'first_chat 1', 'chat_apps 1', 'scheduled_job 3'])
})

test('the plugins tile\'s short word for the narrow size is hhcontent\'s variant 3 ("plugins, this bot"), taken from the words file; without it the build stops', () => {
  assert.deepEqual([DASH_DATA.words.stats.plugins_short_one, DASH_DATA.words.stats.plugins_short], ['plugin, this bot', 'plugins, this bot'])
  const v = read('content/dash-words-v1.json').variants.plugins_label
  assert.deepEqual(v.find(x => x.n === 3), { n: 3, one: 'plugin, this bot', many: 'plugins, this bot', note: v.find(x => x.n === 3).note })
  // the recommended one (variant 1) is what page_words holds
  assert.deepEqual([v[0].one, v[0].many], [DATA.page_words.stats.plugins_one, DATA.page_words.stats.plugins])
  const a = copy()
  a.word_variants.plugins_label = a.word_variants.plugins_label.filter(x => x.n !== 3)
  assert.match(dashProblems(a, DOCS).join('\n'), /no short variant \(n: 3\) of the plugins label/)
})
