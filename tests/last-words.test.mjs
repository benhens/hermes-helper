// last-words 1 (Lead, 11 Nov 16:48; hhtech-last-reset-run fault 1): Forget all is a full reset, so Helper asks the name
// again. The three lines around the reset lose the false sentence that it won't; nothing else in them changes. The
// team's file still has the old lines until hhcontent brings it in line, so the build cuts the sentence
// (scripts/talk-data.mjs LAST_WORDS_CUTS) and the built file must not hold "ask your name again" anywhere.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { TALK_DATA } from '../src/talk-data.js'
import { slimTalkData } from '../scripts/talk-data.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const K = TALK_DATA.keeps

test('1. the three lines around the reset no longer promise the name is not asked again', () => {
  assert.equal(K.tell.see.delete_all.after_yes, 'Done. I keep nothing about you now.')
  assert.equal(K.settings_file.forget_all.under, 'Deletes everything on this page from this computer.')
  assert.equal(K.settings_file.forget_all.after_yes, 'Done. Helper keeps nothing about you now.')
})

test('1. the built file holds "ask your name again" nowhere', () => {
  const built = fs.readFileSync(path.join(ROOT, 'desktop', 'plugin.js'), 'utf8')
  assert.equal(built.split('ask your name again').length - 1, 0)
  assert.equal(built.split("won't ask your name").length - 1, 0)
})

test('1. once hhcontent has taken the sentence out of its own file, the build gives the same lines', () => {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'helper-talk-v2.json'), 'utf8'))
  const fixed = JSON.parse(JSON.stringify(d))
  fixed.keeps.tell.see.delete_all.after_yes = 'Done. I keep nothing about you now.'
  fixed.keeps.settings_file.forget_all.under = 'Deletes everything on this page from this computer.'
  fixed.keeps.settings_file.forget_all.after_yes = 'Done. Helper keeps nothing about you now.'
  assert.deepEqual(slimTalkData(fixed).keeps, slimTalkData(d).keeps)
})
