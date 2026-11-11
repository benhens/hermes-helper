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
import { readmeForMode } from '../scripts/live-data.mjs'
import { aiModeOf } from '../scripts/build.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/helper-talk-v2.json'), 'utf8'))
const section = README.split('### What Helper keeps, and where it goes')[1].split('\n## ')[0]
const points = section.split('\n').filter(l => /^\d+\. /.test(l))

test('point 11 is the one the talk data marks for use now: no AI step', () => {
  const p = D.keeps.disclosure_point_11
  assert.equal(p.use_now, 'no_ai_step')
  assert.equal(points[10], p.no_ai_step)
  assert.doesNotMatch(section, /sent through Hermes to the AI model/)
})

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
  assert.deepEqual(points, team)
})

// talk-live (live-v2 changes-1): README's four lines that change with the mode are the data's, for the mode the
// commit's src/ai-mode.js holds (read from the file, so the same in every run of scripts/test-modes.mjs)
test('README\'s lines by mode (Status, the waiting dots, the model calls, point 11) are the data\'s for the committed mode, and only those change', () => {
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/helper-talk-live-v2.json'), 'utf8'))
  const mode = aiModeOf()
  const lm = live.lines_by_mode
  assert.equal(readmeForMode(README, live, mode), README, 'README is as the build writes it')
  assert.ok(README.includes(lm.readme_status_sentence_2[mode]))
  assert.ok(README.includes(lm.readme_model_call_bullet[mode]))
  assert.equal(points[10], lm.readme_point_11[mode])
  for (const m of ['no_ai_step', 'ai_picks_line', 'ai_writes']) {
    const other = readmeForMode(README, live, m)
    // going there and back gives README again, and the lines that differ are the four (three with no window sentence)
    assert.equal(readmeForMode(other, live, mode), README, m)
    const diff = README.split('\n').filter((l, i) => l !== other.split('\n')[i]).length
    assert.equal(diff, m === mode ? 0 : 4, m)
    if (lm.readme_window_sentence[m]) assert.ok(other.includes(lm.readme_window_sentence[m]), m)
  }
  // the clause hhcontent asked about: llm.oneshot is one plain request with no tools (Hermes's agent/oneshot.py run_oneshot:
  // messages, max_tokens, temperature, nothing else), so "no tools run" stays in the AI modes
  assert.match(lm.readme_model_call_bullet.ai_writes, /no tools run\.$/)
})

