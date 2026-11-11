// The disclosure in README.md ("What Helper keeps, and where it goes") is the content team's, word
// for word: point 11 is the version the talk data marks for use now (keeps.disclosure_point_11),
// and, where the team's folder is there, all twelve points are content/helper-keeps-v1.md section 7
// with point 10's settings-page sentence added (the page ships in this build).
// Builder, 10 Nov 2026 (talk v2, row 9). Since the talk v2 wants fixes: the team's section 7 as pinned
// (tests/lib/team-pins.mjs); since builder-qs at the newest checksum (helper-talk-live-v2.md names it).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PINS, TEAM, pinned, teamSha } from './lib/team-pins.mjs'
import { readmeForMode, slowRuleNow } from '../scripts/live-data.mjs'
import { aiModeOf, setupAiOf } from '../scripts/build.mjs'
// setup-chat-2: point 11 names the set-up conversation's lines only in a build that sends them (its AI step on);
// else changes-1's readme_point_11_work_only (only what you do is sent)
const P11 = setupAiOf() ? 'readme_point_11' : 'readme_point_11_work_only'

const ROOT = path.resolve(import.meta.dirname, '..')
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/helper-talk-v2.json'), 'utf8'))
const section = README.split('### What Helper keeps, and where it goes')[1].split('\n## ')[0]
const points = section.split('\n').filter(l => /^\d+\. /.test(l))

// talk-live-2: the commit's mode is ai_writes (Lead, 11 Nov 04:40); the talk data still marks no_ai_step for use now
// (its use_now is hhcontent's to change; changes-3, For lead). Point 11 is the committed mode's (lines_by_mode).
test('point 11 is the committed mode\'s; the talk data\'s own no-AI point 11 is still the one lines_by_mode has for no_ai_step', () => {
  const p = D.keeps.disclosure_point_11
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/helper-talk-live-v2.json'), 'utf8'))
  assert.equal(points[10], live.lines_by_mode[P11][aiModeOf()])
  assert.equal(p.no_ai_step, live.lines_by_mode.readme_point_11.no_ai_step)
  assert.doesNotMatch(section, /sent through Hermes to the AI model/)
})

// live-v2 changes-4 ("README points 2 to 4 still need what you do"; hhcontent: add "and what you do (one short
// answer)" to point 2): the Builder's words, until section 7 of the team's file has them
const POINT_2_C4 = ', and what you do (one short answer).'

test('all twelve points are the team\'s section 7, word for word, as pinned (when the team\'s folder is there)', t => {
  if (!fs.existsSync(path.join(TEAM, 'content', 'helper-keeps-v1.md'))) return t.skip('the team\'s content folder is not here')
  pinned(t, 'content/helper-keeps-v1.md')
  // the pinned text: the team's file while it is still at the pin, else hhcontent's own copy that the pin names
  // (builder-qs: the pin is now named in a note, so the team's own file must still be at it)
  const [pin, where] = PINS['content/helper-keeps-v1.md']
  const file = teamSha('content/helper-keeps-v1.md') === pin ? path.join(TEAM, 'content/helper-keeps-v1.md') : path.join(TEAM, where)
  assert.equal(path.basename(file), 'helper-keeps-v1.md', 'the team has moved helper-keeps-v1.md on since the pin, and the pin names no copy of it')
  const md = fs.readFileSync(file, 'utf8').split('## 7. The disclosure')[1].split('Point 11 for a build that calls a model')[0]
  const team = md.split('\n').map(l => l.trim()).filter(l => /^\d+\. /.test(l))
    // the team marks a changed point with its job at the end ("   (changes-14)"): a note, not README text
    .map(l => l.replace(/\s{2,}\(changes-\d+\)$/, ''))
    .map(l => l.replace(' [IF THE SETTINGS PAGE SHIPS, add: You can also open Settings, then Plugins, then Helper.]', ' You can also open Settings, then Plugins, then Helper.'))
  assert.equal(team.length, 12)
  // talk-live-2: point 2 gains what the person does (changes-4), point 11 is the committed mode's (test above)
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/helper-talk-live-v2.json'), 'utf8'))
  const want = team.map((l, i) => (i === 1 ? l.replace(/\.$/, POINT_2_C4) : i === 10 ? live.lines_by_mode[P11][aiModeOf()] : l))
  assert.equal(want[1], '2. It keeps your name, if you give it, and what you do (one short answer).')
  assert.deepEqual(points, want)
})

// talk-live (live-v2 changes-1): README's four lines that change with the mode are the data's, for the mode the
// commit's src/ai-mode.js holds (read from the file, so the same in every run of scripts/test-modes.mjs)
test('README\'s lines by mode (Status, the waiting dots, the model calls, point 11) are the data\'s for the committed mode, and only those change', () => {
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/helper-talk-live-v2.json'), 'utf8'))
  const mode = aiModeOf()
  const lm = live.lines_by_mode
  assert.equal(readmeForMode(README, live, mode, setupAiOf()), README, 'README is as the build writes it')
  assert.ok(README.includes(lm.readme_status_sentence_2[mode]))
  assert.ok(README.includes(lm.readme_model_call_bullet[mode]))
  assert.equal(points[10], lm[P11][mode])
  for (const m of ['no_ai_step', 'ai_picks_line', 'ai_writes']) {
    const other = readmeForMode(README, live, m, setupAiOf())
    // going there and back gives README again, and the lines that differ are the four (three with no window sentence)
    assert.equal(readmeForMode(other, live, mode, setupAiOf()), README, m)
    const diff = README.split('\n').filter((l, i) => l !== other.split('\n')[i]).length
    // the four lines, less those the data words alike for both modes (talk-live-2: the model-call bullet is the
    // same for ai_picks_line and ai_writes)
    const differ = ['readme_status_sentence_2', 'readme_window_sentence', 'readme_model_call_bullet', P11].filter(k => lm[k][m] !== lm[k][mode]).length
    assert.equal(diff, differ, m)
    if (m !== mode) assert.ok(differ >= 3, m)
    // find-v1 part 3: the data's sentence with the slow rule as built in place of the old one (scripts/live-data.mjs)
    if (lm.readme_window_sentence[m]) assert.ok(other.includes(slowRuleNow(lm.readme_window_sentence[m])), m)
    if (lm.readme_window_sentence[m]) assert.ok(!other.includes('When that happens with the first message'), m)
  }
  // the clause hhcontent asked about: llm.oneshot is one plain request with no tools (Hermes's agent/oneshot.py run_oneshot:
  // messages, max_tokens, temperature, nothing else), so "no tools run" stays in the AI modes
  assert.match(lm.readme_model_call_bullet.ai_writes, /no tools run\.$/)
})

