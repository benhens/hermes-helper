// The team's files this build was made from, pinned at the checksums the team named (Lead, talk v2 wants
// fixes: "if the files on disk no longer match the checksums this job names, take them at the checksums
// this job names"). builder-qs + changes-14 to -18 (11 Nov 2026): each file at the newest checksum the team
// named for it; the talk data at changes-18's. talk-live (11 Nov 2026): the talk data, the live data,
// route2.py and check.py at live-v2 changes-1's; the wants and the skills list at changes-19's. A test compares the plugin's copy with the pin, checks that
// the pin is a checksum the team named (in its note, or its own "before" copy), and only reports when the
// team's file on disk has moved on since.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const TEAM = path.resolve(import.meta.dirname, '..', '..', '..')
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

// file (in the team's folder) -> [the pinned sha256, where the team names it]
export const PINS = {
  'content/helper-talk-v2.json': ['575105bec6781282d63b7f9ee681a298ffc834ca1e415601f945d16d8773aa72', 'content/helper-talk-live-v2-changes-1.md'],
  'content/helper-talk-live-v2.json': ['c4545b896e4e372844d736cccd3e3f48724cf58b97a91be6a902d78ba10ca38f', 'content/helper-talk-live-v2-changes-1.md'],
  'content/helper-wants-v1.json': ['96530c154849c2dd34397eeadf74748620a45e21589b52be8aafe92800dbd4ac', 'content/helper-talk-v2-changes-19.md'],
  'content/skills-list-v1.json': ['678667bfa3277f54885b530297a782b7b297c823e0ce4583e6cf5bfe656d7eb9', 'content/helper-talk-v2-changes-19.md'],
  'dev/checks/hhcontent-talk-v2/route2.py': ['55160e1e72b692d2d3dbe7f9c970eeae1eb9845e72d90b97c276eac07dc17c3c', 'content/helper-talk-live-v2-changes-1.md'],
  'dev/checks/hhcontent-wants-fixes/wants_fixes_step.py': ['87c60114d9284a78ea2ae2a3401dea349c9864154da307e11b8d93e569dbdd1e', 'content/helper-talk-v2-changes-16.md'],
  'dev/checks/hhcontent-talk-v2/check.py': ['0eb598430d47d77857013a8017f57cffacbf69bc16d5e5aa478a77909790afac', 'content/helper-talk-live-v2-changes-1.md'],
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
