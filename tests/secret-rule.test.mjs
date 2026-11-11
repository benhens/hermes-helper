// changes-12 and -13: the secret rule (src/secret-rule.js) against hhcontent's own Python (secret_rule.py
// looks_secret, and the two places that use it: route2.py's "remember that ..." and settings_read.py's read of a
// box). dev/checks/talk-v2-look/dump_secrets.py ran the Python on every case below and wrote its answers to
// tests/fixtures/secret-cases.json; each must come out the same here, and so must the counts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { looksSecret, pyRegExp } from '../src/secret-rule.js'
import { turn, freshVisit } from '../src/talk.js'
import { readBox } from '../src/settings-file.js'
import { TALK_DATA } from '../src/talk-data.js'
import { pinned, PINS } from './lib/team-pins.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const X = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'secret-cases.json'), 'utf8'))
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const RF = TALK_DATA.keeps.remember.refuse

// what the plugin does with each line, in the same three ways as the Python
const remember = text => {
  const st = freshVisit()
  st.stage = 'open'
  const o = turn('remember that ' + text, st)
  return { kind: o.kind, kept: Object.keys(st.kept).length > 0 }
}
const settings = box => {
  const r = readBox(box)
  return { result: r.result, why: r.why ?? null, line: r.line ?? null }
}
const ours = text => ({ looks_secret: looksSecret(text), remember: remember(text), plain: settings('Name: Anna\n' + text), label: settings('Name: Anna\nRemember: ' + text) })
const theirs = r => ({ looks_secret: r.looks_secret, remember: r.remember, plain: r.plain, label: r.label })

test('the cases were made from the talk data this plugin holds and the secret rule\'s files at changes-12/13\'s checksums', () => {
  assert.equal(X.json_sha256, sha(path.join(ROOT, 'content/helper-talk-v2.json')), 'run bash dev/checks/talk-v2-look/recopy-look.sh again')
  assert.equal(X.sha256['hhcontent-talk-v2/secret_rule.py'], 'd7f5f5512d319eae03e909a0a71edcd2d26935e3667d823b8f9c53dbb391a9b3')
  assert.equal(X.sha256['hhcontent-settings-edit/settings_read.py'], '23b0ea4ea4ffba0ec22e335ad251c987da2b7137172b88056239f44387eb9bee')
  assert.equal(X.sha256['hhcontent-changes-10/refuse_tests.py'], '3a56eda6e6262bfce020018795af6da5b8057dcc36ab86f41a8dc58a25f55afc')
  assert.equal(X.sha256['hhcontent-talk-v2/route2.py'], PINS['dev/checks/hhcontent-talk-v2/route2.py'][0])
})

test('the team names those checksums (when the team\'s folder is there)', t => {
  for (const f of ['dev/checks/hhcontent-talk-v2/secret_rule.py', 'dev/checks/hhcontent-changes-10/refuse_tests.py', 'dev/checks/hhcontent-settings-edit/settings_read.py', 'dev/checks/hhcontent-settings-edit/tests.json']) {
    try {
      pinned(t, f)
    } catch (e) {
      if (/ENOENT/.test(String(e))) return t.skip('no team folder beside the plugin')
      throw e
    }
  }
})

test('refuse_tests.py\'s 144 cases: looks_secret, "remember that ...", a plain line and a Remember: line on the settings page each give what the Python gives', () => {
  assert.equal(X.refuse_tests.length, 144)
  assert.deepEqual(X.refuse_tests.map(r => r.part).reduce((n, p) => ({ ...n, [p]: (n[p] || 0) + 1 }), {}), { 1: 63, 2: 69, 3: 12 })
  for (const r of X.refuse_tests) {
    assert.deepEqual(ours(r.text), theirs(r), r.text)
    // and refuse_tests.py's own record holds (part 3: the rule as it behaves today, not as wanted)
    assert.equal(r.looks_secret !== null, r.want, `refuse_tests.py's record: ${r.text}`)
  }
})

const counts = items => {
  const sec = items.filter(i => i.want === 'refuse')
  const harm = items.filter(i => i.want === 'keep')
  const remRefused = i => ['RM6', 'K1'].includes(i.remember.kind)
  const labRefused = i => i.label.result === 'refused' && i.label.why === 'secret'
  return {
    remember: [sec.filter(remRefused).length, sec.length, harm.filter(i => !remRefused(i)).length, harm.length],
    settings: [sec.filter(labRefused).length, sec.length, harm.filter(i => !labRefused(i)).length, harm.length]
  }
}
// what the Python counted (dump-secrets-out.txt; changes-12 section 2 and changes-13 section 4 say the same)
const PYTHON_COUNTS = {
  hhtech50: { remember: [30, 30, 19, 20], settings: [30, 30, 19, 20] },
  hhcontent20: { remember: [10, 10, 10, 10], settings: [10, 10, 10, 10] },
  blind40: { remember: [22, 25, 15, 15], settings: [24, 25, 15, 15] }
}
for (const [name, file] of [['hhtech50', 'hhtech-secrets-hours/set.json'], ['hhcontent20', 'hhcontent-changes-12/my-set.json'], ['blind40', 'hhtech-secrets-blind/set40.json']]) {
  test(`${name} (${file}): the port's counts equal the Python's on the same set, item by item`, t => {
    const s = X.sets[name]
    assert.equal(s.file, file)
    const team = path.join(ROOT, '..', 'dev/checks', file)
    if (fs.existsSync(team) && sha(team) !== s.sha256) t.diagnostic(`${file} has changed since the cases were made`)
    const mine = s.items.map(i => ({ ...i, ...ours(i.text) }))
    assert.deepEqual(counts(s.items), PYTHON_COUNTS[name], 'the Python\'s own counts')
    assert.deepEqual(counts(mine), counts(s.items), 'the port counts differently from the Python')
    for (let k = 0; k < mine.length; k++) assert.deepEqual(ours(s.items[k].text), theirs(s.items[k]), `${s.items[k].id}: ${s.items[k].text}`)
  })
}

test('4000 random strings (the rule\'s own words, values, other scripts, odd spaces): the same reason as looks_secret for each', () => {
  assert.equal(X.fuzz.length, 4000)
  const refused = X.fuzz.filter(f => f.looks_secret !== null).length
  assert.ok(refused > 1000 && refused < 3000, `${refused} refused: the set must hold both`)
  const differ = X.fuzz.filter(f => looksSecret(f.text) !== f.looks_secret).map(f => `${JSON.stringify(f.text)}: port ${looksSecret(f.text)}, Python ${f.looks_secret}`)
  assert.deepEqual(differ, [])
})

test('the one difference on purpose: a sign that is a number but no digit (½, Ⅳ) counts as a digit in the port (\\p{N}), not in Python\'s isdigit()', () => {
  for (const f of X.number_signs) {
    assert.equal(f.looks_secret, null, f.text)
    assert.notEqual(looksSecret(f.text), null, f.text)
  }
})

test('letters and digits of other scripts count as in Python: Cyrillic, ş, ž, Arabic-Indic digits', () => {
  assert.equal(looksSecret('мой пароль: Солнце2026'), 'secret word and a value')
  assert.equal(looksSecret('şifre ist Güneş47x'), 'secret word and a value')
  assert.equal(looksSecret('slaptažodis yra Ąžuolas99'), 'secret word and a value')
  assert.equal(looksSecret('pin ١٢٣٤'), 'maybe word and a value')
  assert.equal(looksSecret('call ١٢٣٤٥٦٧٨'), 'long number')
})

test('every pattern of the rule\'s data compiles for JavaScript with the u flag, and \\d and \\s mean what they mean in Python', () => {
  for (const p of [...RF.value.not_values, RF.digits_pattern, RF.word_run.word]) assert.ok(pyRegExp(p) instanceof RegExp, p)
  assert.ok(pyRegExp('^\\d+$').test('١٢٣'))
  assert.ok(pyRegExp('^[^\\s]+$').test('a\ufeffb'), 'U+FEFF is no space in Python')
  assert.ok(!pyRegExp('^[^\\s]+$').test('a\x1cb'), 'U+001C is a space in Python')
})

test('names keep the old word list, not the secret rule (changes-12: opening.name_refused)', () => {
  // "Riga2026" alone is no secret by the rule, and a name with digits is no name anyway; "pin" is a refused name word
  const st = freshVisit()
  turn('my name is Pin', st)
  assert.equal(st.kept.name, undefined)
})

test('the bite: with one step of the rule switched off in the data, the port no longer gives the Python\'s answers', async () => {
  const saved = RF.secret_words
  RF.secret_words = []
  try {
    const differ = X.refuse_tests.filter(r => (looksSecret(r.text) !== null) !== (r.looks_secret !== null)).length
    assert.ok(differ > 0)
  } finally {
    RF.secret_words = saved
  }
})
