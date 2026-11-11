// loom-fixes (Lead's point 6; helper-loom-fixes-v1 point 3): no text to copy ever shows angle brackets or a blank to
// fill in. His Loom 2:13: \"Please bring my setup over from <my old AI app> with hermes migrate.\" hhcontent rewrote 25
// such texts; this test goes over every text to copy in the plugin's copies of the team's data, and over the built file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { freshVisit, lineFor, pressOffer } from '../src/talk.js'
import { TALK_DATA } from '../src/talk-data.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const FILES = ['helper-talk-v2.json', 'helper-wants-v1.json', 'helper-setup-chat-v1.json', 'dash-setup-list-v2.json', 'helper-talk-live-v2.json']
// the slots code fills before a text is shown (never a blank for the person): {service}, {request} (the person's own
// words), {app_label} and {app_agent} (the app picked), {card} and {step} (the set-up list's), {name}
const SLOTS = /\{(service|request|app_label|app_agent|card|step|name)\}/g
// a blank: angle brackets, square-bracket stand-ins, a run of underscores or dots for the person to fill
const BLANK = /[<>]|\[[^\]]*\]|_{3,}|\.{4,}|\{[a-z_]+\}/

// every text to copy in a data file: [where, text]. The fields that hold one: paste_text, paste (a string), and the
// set-up list's terminal paste (text). The team's own kept old texts (*_was_*) are records, never shown.
function copyTexts(v, where = '', out = []) {
  if (Array.isArray(v)) v.forEach((x, i) => copyTexts(x, `${where}[${i}]`, out))
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (/_was/.test(k)) continue
      if ((k === 'paste_text' || k === 'paste') && typeof x === 'string') out.push([`${where}.${k}`, x])
      else if (k === 'text' && typeof x === 'string' && /\.paste\[\d+\]$/.test(where)) out.push([`${where}.${k}`, x])
      else copyTexts(x, `${where}.${k}`, out)
    }
  }
  return out
}

test('every text to copy in the data: no angle brackets, no blank to fill in (only slots code fills)', () => {
  let n = 0
  for (const f of FILES) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'))
    for (const [where, t] of copyTexts(data)) {
      n++
      assert.doesNotMatch(t.replace(SLOTS, 'X'), BLANK, `${f}${where}: ${t}`)
    }
  }
  // hhcontent's check_copy.py counted 48 in the talk, wants and set-up data; the set-up list's commands come on top
  assert.ok(n >= 48, `${n} texts to copy`)
})

test('the check bites: the migrate text as it was in his Loom is refused', () => {
  assert.match('Please bring my setup over from <my old AI app> with hermes migrate. Show me the plan before you write anything.'.replace(SLOTS, 'X'), BLANK)
})

test('the built page: every text to copy in desktop/plugin.js has no angle brackets; the migrate one names the app', () => {
  const built = fs.readFileSync(path.join(ROOT, 'desktop', 'plugin.js'), 'utf8')
  const texts = [...built.matchAll(/"(?:paste_text|paste)": "((?:[^"\\]|\\.)*)"/g)].map(m => JSON.parse(`"${m[1]}"`))
  assert.ok(texts.length >= 40, `${texts.length}`)
  for (const t of texts) assert.doesNotMatch(t.replace(SLOTS, 'X'), BLANK, t)
  // each app picked fills the text: no slot is left
  for (const a of TALK_DATA.offer_words.migrate_apps) {
    const st = freshVisit('open')
    const l = lineFor(pressOffer('mig_' + a.id, st), st)
    assert.equal(l.line, 'MIG_APP')
    assert.doesNotMatch(l.next.text, /[<>{}]/, a.id)
    assert.ok(l.next.text.includes(a.label) && l.next.text.includes('hermes migrate ' + a.agent), l.next.text)
  }
})

// Lead's point 4: the recommendation is the written sentence only. In the built page the one call that would ask an
// AI to word it (askRec) sits behind SETUP_AI_BUILT, which the built file holds false.
test('the built page: no path lets an AI word the recommendation (SETUP_AI_BUILT false; askRec only behind it)', () => {
  const built = fs.readFileSync(path.join(ROOT, 'desktop', 'plugin.js'), 'utf8')
  assert.equal((built.match(/^const SETUP_AI_BUILT = false$/gm) || []).length, 1)
  // one call of it in the whole page (the function itself is "const askRec = (")
  assert.equal([...built.matchAll(/askRec\(/g)].length, 1)
  assert.match(built, /const i = SETUP_AI_BUILT && AI_MODE === 'ai_writes' && shown \? says\.findIndex\(s => s\.rec\) : -1/)
  // and with i = -1 nothing is asked: the call is inside \"if (i >= 0)\"
  const at = built.indexOf("const i = SETUP_AI_BUILT && AI_MODE")
  const block = built.slice(at, built.indexOf('askRec(', at))
  assert.match(block, /if \(i < 0 \|\| [^\n]*\) return put\(says\)/)
})
