// The team's files this build was made from, pinned at the checksums the job names (Lead, talk v2 wants
// fixes: "if the files on disk no longer match the checksums this job names, take them at the checksums
// this job names"). hhcontent changed helper-talk-v2.json and route2.py again after the wants fixes
// (content/helper-builder-qs-v1.md, 23:45 UTC), and the changes-14 job will change them once more; those
// are ported in a later job. So a test compares the plugin's copy with the pin, checks that the pin is a
// checksum the team named (in its note, or its own "before" copy), and only reports when the team's file
// on disk has moved on since.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const TEAM = path.resolve(import.meta.dirname, '..', '..', '..')
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

// file (in the team's folder) -> [the pinned sha256, where the team names it]
export const PINS = {
  'content/helper-talk-v2.json': ['e3c4666a33109960cb6304337530b4cf859eda170f97a1738ddce76e5098589b', 'content/helper-wants-fixes-v1.md'],
  'content/helper-wants-v1.json': ['6cc374ef4d754e8b1e59d3206be946169e2413b887d04755565c2c83c0b82b4a', 'content/helper-skill-lines-v1.md'],
  'content/skills-list-v1.json': ['b4102198861acf29e663a6afbc63fd4a473d876d616ada84891dcbf05a6b53d0', 'content/helper-skill-lines-v1.md'],
  'dev/checks/hhcontent-talk-v2/route2.py': ['46f1b2acd6f35c272f25e53507c7cb6a30a3d10c4e5dfdb911c90fb6625f1368', 'content/helper-wants-fixes-v1.md'],
  'dev/checks/hhcontent-wants-fixes/wants_fixes_step.py': ['9e49d87fffc2fa8ab62d7c38c6863dbfc9f223286d324cafbaf137329285d75a', 'content/helper-wants-fixes-v1.md'],
  // hhcontent's changes-14 job (started 00:30 UTC) changes check.py too: kept as it was, hhcontent's own
  // "before" copy of that job
  'dev/checks/hhcontent-talk-v2/check.py': ['83c807fdac78a1579386e03a8006f2d3c3afcd87dd536b6f323b4d04dce2de2f', 'dev/checks/hhcontent-changes-14/before/check.py'],
  // the disclosure the README copies word for word (tests/readme-disclosure.test.mjs): changes-14 changes it
  'content/helper-keeps-v1.md': ['80ebe181341055d633fc469ce44495bf2130e15166f8ce765ebfeff40bb6140a', 'dev/checks/hhcontent-changes-14/before/helper-keeps-v1.md'],
  // changes-12 and -13 (the secret rule) are not ported here (Lead: point 8 of the look job): the two
  // settings files stay at hhcontent's own copies from before changes-12
  'dev/checks/hhcontent-settings-edit/settings_read.py': ['470c4c774a34d4fa95915495f1365e7e3cd4ecefe9e93b46bd3e31a8a55cefdf', 'dev/checks/hhcontent-changes-12/before/dev/checks/hhcontent-settings-edit/settings_read.py'],
  'dev/checks/hhcontent-settings-edit/tests.json': ['c2ac3bb4a32c1dd2a779a67636b16a5dfd35a2daa0e569c119eea29b34c6a8c7', 'dev/checks/hhcontent-changes-12/before/dev/checks/hhcontent-settings-edit/tests.json']
}

// The sha256 a copy must have: the pin, after checking that the team names it. t: the test, for a note
// when the team's own file has moved on. Throws when the pin is not named where it says.
export function pinned(t, file) {
  const [pin, where] = PINS[file]
  const src = path.join(TEAM, where)
  // where: a note that names the pin (it must name it on the same line as the file's own name, not under
  // another file), or the team's own copy of the file (same name), whose checksum must be the pin
  const isCopy = path.basename(where) === path.basename(file)
  const lines = isCopy ? null : fs.readFileSync(src, 'utf8').split('\n')
  const named = lines ? lines.some(l => l.includes(pin) && l.includes(path.basename(file))) : sha(src) === pin
  if (!named) throw new Error(`${file}: the pin ${pin.slice(0, 12)} is not named in ${where}`)
  const now = sha(path.join(TEAM, file))
  if (now !== pin) t.diagnostic(`${file}: the team's file has moved on since the pin (now ${now.slice(0, 12)}); a later job ports it`)
  return pin
}
export const teamHas = file => fs.existsSync(path.join(TEAM, file))
export const teamSha = file => sha(path.join(TEAM, file))
