// The team's files this build was made from, pinned at the checksums the team named (Lead, talk v2 wants
// fixes: "if the files on disk no longer match the checksums this job names, take them at the checksums
// this job names"). builder-qs + changes-14 to -18 (11 Nov 2026): each file at the newest checksum the team
// named for it; the talk data at changes-18's. talk-live (11 Nov 2026): the talk data, the live data,
// route2.py at live-v2 changes-2's, check.py at changes-1's; the wants and the skills list at changes-19's.
// talk-live-2 (11 Nov 2026): the talk data and the live data at live-v2 changes-4's, route2.py at changes-3's. talk-live-3: the talk data and the live data at changes-5's.
// setup-chat: the talk data, the live data and route2.py at live-v2 changes-10's. find-v1: the talk data, the wants and route2.py at live-v2
// changes-12's (that note names each checksum by its first 16 characters, so a pin counts as named when its first 16
// stand on the file's line). setup-chat-2: the live data, the set-up conversation and the set-up list at setup-chat changes-1's (Lead, 11 Nov 08:50). A test compares the plugin's copy with the pin, checks that
// the pin is a checksum the team named (in its note, or its own "before" copy), and only reports when the
// team's file on disk has moved on since.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const TEAM = path.resolve(import.meta.dirname, '..', '..', '..')
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

// file (in the team's folder) -> [the pinned sha256, where the team names it]
export const PINS = {
  'content/helper-talk-v2.json': ['cd2c4d54992939b44f2ef36d6b6b532dd884073fea372f9bd0b643d57d400b4c', 'content/helper-talk-live-v2-changes-12.md'],
  'content/helper-talk-live-v2.json': ['efc691e0542cccc7aba0bb6dd5db7c4543346e810f3e979921c891022a1690ec', 'content/helper-setup-chat-v1-changes-1.md'],
  'content/helper-wants-v1.json': ['fe9f0d567550b7ed2517d54ae5a15481f19ce747b0d0f2a5246058c8eaaf9024', 'content/helper-talk-live-v2-changes-12.md'],
  'content/skills-list-v1.json': ['678667bfa3277f54885b530297a782b7b297c823e0ce4583e6cf5bfe656d7eb9', 'content/helper-talk-v2-changes-19.md'],
  'dev/checks/hhcontent-talk-v2/route2.py': ['8862ec3aeee840a82a958bc674c5dd108eab5576358136d9f5a0708409f0f56e', 'content/helper-talk-live-v2-changes-12.md'],
  'dev/checks/hhcontent-wants-fixes/wants_fixes_step.py': ['87c60114d9284a78ea2ae2a3401dea349c9864154da307e11b8d93e569dbdd1e', 'content/helper-talk-v2-changes-16.md'],
  'dev/checks/hhcontent-talk-v2/check.py': ['0eb598430d47d77857013a8017f57cffacbf69bc16d5e5aa478a77909790afac', 'content/helper-talk-live-v2-changes-1.md'],
  // setup-chat: the set-up conversation (named at changes-8, unchanged at changes-10) and the set-up list
  'content/helper-setup-chat-v1.json': ['e23e553b56164824df39f012b6aaefe8244ee8272add90b7f0c2b322baab974d', 'content/helper-setup-chat-v1-changes-1.md'],
  'content/dash-setup-list-v2.json': ['95d3debcf1e4f7e70f6d751eac0f7d3435f0d47614e4019a5887cac30a91b929', 'content/helper-setup-chat-v1-changes-1.md'],
  // dash-v2: every other word on the Dashboard tab
  'content/dash-words-v1.json': ['c7b22d5f2805797ccadb2d0dae47e4df5b606b9c11656b99ab56eaef5a7992b5', 'content/result-hhcontent-dash-words.md'],
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
  const named = lines ? lines.some(l => l.includes(pin.slice(0, 16)) && l.includes(path.basename(file))) : sha(src) === pin
  if (!named) throw new Error(`${file}: the pin ${pin.slice(0, 12)} is not named in ${where}`)
  const now = sha(path.join(TEAM, file))
  if (now !== pin) t.diagnostic(`${file}: the team's file has moved on since the pin (now ${now.slice(0, 12)}); a later job ports it`)
  return pin
}
export const teamHas = file => fs.existsSync(path.join(TEAM, file))
export const teamSha = file => sha(path.join(TEAM, file))
