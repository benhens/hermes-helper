// Wants fixes v1 (content/helper-wants-fixes-v1.md): hhcontent's own 53 cases (run_wf1.py), each put to the
// plugin. The cases and the Python's results are not typed in: dev/checks/talk-v2-wf1/dump_wf1.py ran
// run_wf1.py and wrote them to tests/fixtures/wf1-cases.json.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { freshVisit, turn, serviceIn } from '../src/talk.js'
import { WANTS_DATA } from '../src/wants-data.js'
import { looksLikeKey, KEY_PATTERNS } from '../src/key-check.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const F = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/wf1-cases.json'), 'utf8'))

// route2.py's show() with the wants layers' own kinds (as tests/talk-wants.test.mjs)
function show(o) {
  if (o.kept && o.kept.length) return show({ ...o, kept: null, first: null })
  const py = v => (v === null || v === undefined ? 'None' : v)
  const by = {
    F1: () => `F1 name=${py(o.name)}`,
    F2: () => `F2 name=${py(o.name)} work=${py(o.work)}`,
    row: () => 'line ' + o.need,
    question: () => 'question ' + o.topic,
    plain: () => 'plain line ' + o.topic + '0',
    term: () => 'term line ' + o.term,
    W1: () => 'W1 buttons ' + o.buttons.slice(0, 4).join('+'),
    want: () => 'ROW ' + o.row,
    skill: () => 'SKILL ' + o.skill,
    N2: () => 'N2 group ' + o.group,
    G1: () => 'G1 group ' + o.group
  }
  return (by[o.kind] || (() => o.kind))()
}
// run_wf1.py's run(): a fresh visit at a stage, optionally with Helper's own question open
function run(text, stage = 'open', pending = null) {
  const st = freshVisit(stage)
  if (pending) {
    st.pending = pending
    st.asked.push(pending)
    st.lastq = true
  }
  return [show(turn(text, st)), st]
}
// run_wf1.py's line_for(): the line a named service gets
const lineFor = svc => {
  if (!svc) return null
  const v = WANTS_DATA.service_lines[svc]
  return v ? (v.line === 'CN1' ? 'CN1' : 'S1') : 'svc1'
}

function ours(c) {
  if (c.name.startsWith('service of ')) {
    const svc = serviceIn(c.text, freshVisit('open'), false) || null
    return [svc, lineFor(svc)]
  }
  if (c.name === 'turn: can it use my google drive') return run('can it use my google drive')[0]
  if (c.name.startsWith('typed ')) return run(c.typed, 'open', 'svc')[1].kept.svc
  if (c.name === 'label at the name question is not a group') return run('pictures and video', 'name')[0].startsWith('G1')
  if (c.name === 'label plus more words is not a group') return run('i like pictures and video')[0].startsWith('G1')
  if (c.section === 5) return looksLikeKey(c.s)
  const got = run(c.text)[0]
  if (c.name.endsWith('(the term line)')) return got.includes('term')
  if (c.name.endsWith('(maps: its skill or its row)')) return got === 'SKILL maps' || got.startsWith('ROW')
  return got
}

test('the cases file is hhcontent\'s run_wf1.py, 53 cases, all as hhcontent expected in Python', t => {
  assert.equal(F.cases.length, 53)
  assert.equal(F.summary, '53 of 53 as expected')
  assert.ok(F.cases.every(c => c.ok))
  assert.deepEqual([1, 2, 3, 4, 5].map(s => F.cases.filter(c => c.section === s).length), [15, 11, 11, 9, 7])
  const run = path.join(ROOT, '..', 'dev/checks/hhcontent-wants-fixes/run_wf1.py')
  if (!fs.existsSync(run)) return t.skip('no team folder beside the plugin')
  assert.equal(F.run_wf1_sha256, crypto.createHash('sha256').update(fs.readFileSync(run)).digest('hex'), 'run_wf1.py changed: bash dev/checks/talk-v2-wf1/recopy-wf1.sh')
})

for (const s of [1, 2, 3, 4, 5]) {
  test(`run_wf1.py section ${s}: every case gives in the plugin what it gives in hhcontent's Python`, () => {
    const off = F.cases.filter(c => c.section === s).map(c => [c.name, ours(c), c.want]).filter(([, got, want]) => JSON.stringify(got) !== JSON.stringify(want))
    assert.deepEqual(off, [])
  })
}

// Pattern 5 as it was before wants fixes v1 (the plugin's src/talk-data.js at 827d19d)
const OLD_P5 = new RegExp('(?<![A-Za-z0-9/+.:_-])(?=[A-Za-z0-9/+]*[A-Z])(?=[A-Za-z0-9/+]*[a-z])(?=[A-Za-z0-9/+]*[0-9])[A-Za-z0-9+][A-Za-z0-9/+]{39}(?![A-Za-z0-9/+=.:_-])')
test('key pattern 5: 200,000 random AWS-style 40-character secrets, the new pattern catches every one the old one caught (run_wf1.py\'s count, here with a seeded random of our own)', () => {
  const P5 = KEY_PATTERNS[4]
  assert.notEqual(P5.source, OLD_P5.source, 'pattern 5 is the new one')
  const A64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  let old = 0
  let lost = 0
  for (let i = 0; i < 200000; i++) {
    let s = ''
    for (let j = 0; j < 40; j++) s += A64[Math.floor(rnd() * 64)]
    if (s[0] === '/') continue
    if (OLD_P5.test(s)) {
      old++
      if (!P5.test(s)) lost++
    }
  }
  assert.ok(old > 190000, `old pattern caught ${old}`)
  assert.equal(lost, 0)
})

// A group's label typed while the opening is not over (the name or the work question open): the reference
// opens the group only once the conversation is open (wants_fixes_step.py c). And keeps.typed_change with a
// service kept: a typed name inside a longer one does not count ("I use one drive now": OneDrive, not also
// Google Drive). The reference's results: tests/fixtures/wf1-extra.json, written by
// dev/checks/talk-v2-wf1/stage_label.py from the pinned scripts.
const X = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/wf1-extra.json'), 'utf8'))
test('the extra cases were made from the pinned scripts: route2.py and wants_fixes_step.py at the job\'s checksums', () => {
  assert.equal(X.sha256['hhcontent-talk-v2/route2.py'], '46f1b2acd6f35c272f25e53507c7cb6a30a3d10c4e5dfdb911c90fb6625f1368')
  assert.equal(X.sha256['hhcontent-wants-fixes/wants_fixes_step.py'], '9e49d87fffc2fa8ab62d7c38c6863dbfc9f223286d324cafbaf137329285d75a')
  assert.deepEqual([X.group_label_by_stage.length, X.typed_change.length], [12, 6])
})

test('a group\'s label at the name or work question is not a group: as the reference, F1 or F2, or N2 for a question', () => {
  const off = X.group_label_by_stage.map(c => [c.stage, c.text, run(c.text, c.stage)[0], c.shown]).filter(([, , got, want]) => got !== want)
  assert.deepEqual(off, [])
})

test('keeps.typed_change with a service kept: the longer typed name wins, as route2.py (wants steps off as in route2.py, and on)', () => {
  for (const wants of [false, true]) {
    const off = X.typed_change.flatMap(c => {
      const st = freshVisit('open', { svc: c.kept_before, told: true })
      st.wants = wants
      const shown = show(turn(c.text, st))
      return (!wants && shown !== c.shown) || st.kept.svc !== c.kept_after ? [[wants, c.text, shown, st.kept.svc, c.shown, c.kept_after]] : []
    })
    assert.deepEqual(off, [])
  }
  assert.equal(X.typed_change.find(c => c.text === 'I use one drive now').kept_after, 'OneDrive')
})
