// Every test run of `npm test`. talk-live (Lead's answer 6): the whole test run in each of the three AI modes, with
// src/ai-mode.js's switch changed only in what the tests load (tests/lib/mode-hook.mjs); the files on disk stay.
// setup-chat: in each mode there are two runs:
//   1. tests/ with the set-up conversation switched off (HELPER_SETUP_BUILT=false, the same hook): the older tests
//      are about the ordinary talk, which the set-up conversation's opening would stand in front of; the tests in
//      tests/setup/ skip themselves there
//   2. tests/setup/ on the files as committed (SETUP_BUILT true): the set-up conversation, and the ordinary talk
//      around it
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(import.meta.dirname, '..')
const committed = fs.readFileSync(path.join(ROOT, 'src', 'ai-mode.js'), 'utf8').match(/^export const AI_MODE = '([a-z_]+)'$/m)[1]
const hook = pathToFileURL(path.join(ROOT, 'tests', 'lib', 'mode-hook.mjs')).href
let failed = 0
function run(what, args, env) {
  console.log(`\n== ${what} ==`)
  const r = spawnSync(process.execPath, ['--test', ...args], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import ${hook}`.trim() } })
  if (r.status !== 0) failed++
  console.log(`== ${what}: ${r.status === 0 ? 'pass' : 'FAIL'} ==`)
}
for (const mode of [committed, ...['no_ai_step', 'ai_picks_line', 'ai_writes'].filter(m => m !== committed)]) {
  run(`AI_MODE = ${mode}, the set-up conversation off: all tests`, ['tests/'], { HELPER_AI_MODE: mode, HELPER_SETUP_BUILT: 'false' })
  run(`AI_MODE = ${mode}, as committed: tests/setup/`, ['tests/setup/'], { HELPER_AI_MODE: mode })
}
process.exit(failed ? 1 : 0)
