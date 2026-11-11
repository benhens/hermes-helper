// dash-v1: the Dashboard's data file and its build checks (scripts/dash-data.mjs). The build refuses a changed docs
// quote, as it does for the wants; the plugin's copy is the team's file plus exactly the changes its builder block
// lists; every word on the tab is in the file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { dashProblems, slimDashData, quotesOf, COUNTED_IDS, ROUTE_TARGETS } from '../scripts/dash-data.mjs'
import { dashDataSource } from '../scripts/build.mjs'
import { DASH_DATA } from '../src/dash-data.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const TEAM = path.resolve(ROOT, '..')
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const DATA = read('content/dash-setup-list-v2.json')
const DOCS = read('content/dash-docs-lines-v0.23.0.json')
const copy = () => structuredClone(DATA)

test('the data as committed passes every check, and src/dash-data.js is made from it', () => {
  assert.deepEqual(dashProblems(DATA, DOCS), [])
  assert.deepEqual(DASH_DATA, slimDashData(DATA))
})

test('every docs quote is checked: 77 quotes from 20 docs files, each on its line (16 lines sit elsewhere in the tagged v0.23.0 docs and are followed there)', () => {
  const docsQuotes = quotesOf(DATA).filter(q => !q.s.file.startsWith('/'))
  assert.ok(docsQuotes.length >= 70, `${docsQuotes.length} quotes`)
  assert.equal(Object.keys(DOCS.files).length, 20)
  assert.equal(Object.values(DOCS.files).reduce((n, f) => n + Object.keys(f.moved || {}).length, 0), 16)
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

test('counted: exactly the six the code has a rule for, Chat apps among them (Lead\'s ruling); the team\'s counts: false for Chat apps is refused', () => {
  assert.deepEqual(DATA.items.filter(i => i.counts).map(i => i.id), COUNTED_IDS)
  const a = copy()
  a.items.find(i => i.id === 'chat_apps').counts = false
  assert.match(dashProblems(a, DOCS).join('\n'), /the code has rules for exactly/)
  const b = copy()
  b.items.find(i => i.id === 'memory').counts = true
  assert.match(dashProblems(b, DOCS).join('\n'), /the code has rules for exactly/)
})

test('every word on the tab is in the file: one missing stops the build; marks fit (at most 15 letters); routes go only where hhtech ran', () => {
  for (const [part, key] of [['setup', 'you_are_here'], ['activity', 'last_used_today'], ['stats', 'plugins'], ['tabs', 'learn']]) {
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
  // "not counted" is hhcontent's own pick 1 of its three
  assert.equal(DATA.page_words.setup.not_counted, DATA.cannot_tell_words[0])
  assert.equal(DATA.page_words.stand_in, true)
})

test('the words he took out are not in the file: no "chats in 30 days", no "days with a chat", no "streak"', () => {
  const words = JSON.stringify(DATA.page_words)
  assert.doesNotMatch(words, /30 days|days with a chat|streak|Journey/i)
})

test('the plugin\'s copy is the team\'s file plus exactly the builder block\'s changes (when the team\'s folder is there)', t => {
  const team = path.join(TEAM, DATA.builder.from)
  if (!fs.existsSync(team)) return t.skip('the team folder is not here')
  const buf = fs.readFileSync(team)
  const sha = crypto.createHash('sha256').update(buf).digest('hex')
  if (sha !== DATA.builder.from_sha256) return t.diagnostic(`note: the team's ${DATA.builder.from} has moved on since this copy (${sha.slice(0, 12)}); a later job ports it`)
  const out = JSON.parse(buf.toString('utf8'))
  for (const c of DATA.builder.changes) {
    const parts = c.path.split('.')
    let obj = out
    if (parts[0] === 'items') {
      obj = out.items.find(i => i.id === parts[1])
      parts.splice(0, 2)
    }
    const key = parts.join('.')
    assert.deepEqual(obj[key] ?? null, c.was, `${c.path} was`)
    if (c.now === null) delete obj[key]
    else obj[key] = c.now
  }
  out.builder = DATA.builder
  out.page_words = DATA.page_words
  assert.deepEqual(DATA, out)
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
