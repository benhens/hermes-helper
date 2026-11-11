// The disclosure in README.md ("What Helper keeps, and where it goes") is the content team's, word
// for word: point 11 is the version the talk data marks for use now (keeps.disclosure_point_11),
// and, where the team's folder is there, all twelve points are content/helper-keeps-v1.md section 7
// with point 10's settings-page sentence added (the page ships in this build).
// Builder, 10 Nov 2026 (talk v2, row 9). Since the talk v2 wants fixes: the team's section 7 as pinned
// (tests/lib/team-pins.mjs), hhcontent's own copy from before its changes-14 job, which changes it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PINS, TEAM, pinned } from './lib/team-pins.mjs'

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
  const file = path.join(TEAM, PINS['content/helper-keeps-v1.md'][1])
  const md = fs.readFileSync(file, 'utf8').split('## 7. The disclosure')[1].split('Point 11 for a build that calls a model')[0]
  const team = md.split('\n').map(l => l.trim()).filter(l => /^\d+\. /.test(l))
    .map(l => l.replace(' [IF THE SETTINGS PAGE SHIPS, add: You can also open Settings, then Plugins, then Helper.]', ' You can also open Settings, then Plugins, then Helper.'))
  assert.equal(team.length, 12)
  assert.deepEqual(points, team)
})
