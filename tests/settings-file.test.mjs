// Helper's settings page, read back on Save (src/settings-file.js) against hhcontent's own
// settings_read.py: every case of hhcontent's tests.json and the Builder's extra boxes went through
// settings_read.py (dev/checks/talk-v2/dump_settings.py), and the port must give the same result,
// the same message, the same record and the same box for every one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { renderKept, readBox, saveBox } from '../src/settings-file.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/settings-read.json'), 'utf8'))
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

test('the box Helper writes from a stored record is settings_read.py\'s, for every stored record in the cases', () => {
  for (const c of S.cases) assert.equal(renderKept(c.stored), c.rendered, c.id)
})

test('every one of hhcontent\'s 49 cases and the Builder\'s 35 boxes: the same result as settings_read.py', () => {
  assert.equal(S.cases.filter(c => c.from === 'hhcontent').length, 49)
  assert.ok(S.cases.filter(c => c.from === 'builder').length >= 35)
  const kinds = new Set()
  for (const c of S.cases) {
    const got = saveBox(c.stored, c.box, c.answer == null ? undefined : c.answer)
    kinds.add(got.result + (got.why ? ':' + got.why : ''))
    assert.deepEqual(got, c.got, `${c.id}: ${c.what}`)
  }
  // the cases reach every result and every reason a line can be refused
  for (const k of ['saved', 'ask', 'not_saved', 'refused:secret', 'refused:too_much', 'refused:no_label', 'refused:empty', 'refused:name_value', 'refused:mod_value', 'refused:msg_value', 'refused:svc_value',
    'refused:remember_short', 'refused:remember_long', 'refused:remember_bracket', 'refused:twice', 'refused:same_twice', 'refused:too_many']) assert.ok(kinds.has(k), k)
})

test('hhcontent\'s own checks on every case: refused, ask and not saved write nothing and leave the box as typed; a saved box reads back the same', () => {
  for (const c of S.cases) {
    const got = saveBox(c.stored, c.box, c.answer == null ? undefined : c.answer)
    if (got.result === 'saved') assert.deepEqual(saveBox(got.stored, got.box).stored, got.stored, c.id)
    else {
      assert.deepEqual(got.stored, c.stored, c.id)
      assert.equal(got.box, c.box, c.id)
    }
  }
})

test('a secret is never quoted back, and a long line is quoted cut to 60 characters', () => {
  const r = readBox('Name: Pete\nRemember: my password is hunter22')
  assert.equal(r.why, 'secret')
  assert.doesNotMatch(r.message.join(' '), /hunter/)
  const long = readBox('x'.repeat(80))
  assert.equal(long.message[1], '"' + 'x'.repeat(60) + '..."')
})

test('the cases were made from the settings_read.py and tests.json on record', () => {
  const copied = path.resolve(ROOT, '..', 'dev', 'checks', 'talk-v2', 'copied')
  if (!fs.existsSync(path.join(copied, 'settings_read.py'))) return
  assert.equal(S.settings_read_sha256, sha(path.join(copied, 'settings_read.py')))
  assert.equal(S.tests_sha256, sha(path.join(copied, 'tests.json')))
})
