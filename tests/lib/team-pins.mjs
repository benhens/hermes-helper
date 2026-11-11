// The team's files this build was made from, pinned at the checksums the team named (Lead, talk v2 wants
// fixes: "if the files on disk no longer match the checksums this job names, take them at the checksums
// this job names"). builder-qs + changes-14 to -18 (11 Nov 2026): each file at the newest checksum the team
// named for it; the talk data at changes-18's. A test compares the plugin's copy with the pin, checks that
// the pin is a checksum the team named (in its note, or its own "before" copy), and only reports when the
// team's file on disk has moved on since.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const TEAM = path.resolve(import.meta.dirname, '..', '..', '..')
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

// file (in the team's folder) -> [the pinned sha256, where the team names it]
export const PINS = {
  'content/helper-talk-v2.json': ['4899a0ae3643d9efc67308e5dde65c77c0be04506ef067344597650107e45f57', 'content/helper-talk-v2-changes-18.md'],
  'content/helper-wants-v1.json': ['bb195263a1d70d2f468ed2de691ec872f39deac841e3c948eca13b84f8277956', 'content/helper-talk-v2-changes-16.md'],
  'content/skills-list-v1.json': ['b4102198861acf29e663a6afbc63fd4a473d876d616ada84891dcbf05a6b53d0', 'content/helper-skill-lines-v1.md'],
  'dev/checks/hhcontent-talk-v2/route2.py': ['3af440269b7f405d1e56136bd8b76597451b19955f41d52956cb14cf153af95c', 'content/helper-talk-v2-changes-17.md'],
  'dev/checks/hhcontent-wants-fixes/wants_fixes_step.py': ['87c60114d9284a78ea2ae2a3401dea349c9864154da307e11b8d93e569dbdd1e', 'content/helper-talk-v2-changes-16.md'],
  'dev/checks/hhcontent-talk-v2/check.py': ['73aabccdeb8f7540e3699ef377ccfb74cf0366c5541f38dcf01f06beab146623', 'content/helper-talk-v2-changes-14.md'],
  // the disclosure the README copies word for word (tests/readme-disclosure.test.mjs)
  'content/helper-keeps-v1.md': ['0b2563a8e2772d5b918af6bef73cb53af74ce0840b359151a3689c5168a311f4', 'content/helper-talk-live-v2.md'],
  // changes-12 and -13 (the secret rule), ported in the look job: settings_read.py and tests.json at
  // changes-12's checksums, secret_rule.py and refuse_tests.py at changes-13's
  'dev/checks/hhcontent-settings-edit/settings_read.py': ['23b0ea4ea4ffba0ec22e335ad251c987da2b7137172b88056239f44387eb9bee', 'content/helper-talk-v2-changes-12.md'],
  'dev/checks/hhcontent-settings-edit/tests.json': ['a59b234cda13acedc0fb13e62a503f496f7881eca725be0b7ea7f05a13a7078d', 'content/helper-talk-v2-changes-12.md'],
  'dev/checks/hhcontent-talk-v2/secret_rule.py': ['d7f5f5512d319eae03e909a0a71edcd2d26935e3667d823b8f9c53dbb391a9b3', 'content/helper-talk-v2-changes-13.md'],
  'dev/checks/hhcontent-changes-10/refuse_tests.py': ['3a56eda6e6262bfce020018795af6da5b8057dcc36ab86f41a8dc58a25f55afc', 'content/helper-talk-v2-changes-13.md']
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
