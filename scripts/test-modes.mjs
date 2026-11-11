// talk-live (Lead's answer 6): the whole test run again in the two AI modes the commit does not hold, with
// src/ai-mode.js's switch changed only in what the tests load (tests/lib/mode-hook.mjs); the files on disk stay.
// npm test runs the committed mode first, then this.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(import.meta.dirname, '..')
const committed = fs.readFileSync(path.join(ROOT, 'src', 'ai-mode.js'), 'utf8').match(/^export const AI_MODE = '([a-z_]+)'$/m)[1]
const hook = pathToFileURL(path.join(ROOT, 'tests', 'lib', 'mode-hook.mjs')).href
let failed = 0
for (const mode of ['no_ai_step', 'ai_picks_line', 'ai_writes'].filter(m => m !== committed)) {
  console.log(`\n== all tests again with AI_MODE = ${mode} ==`)
  const r = spawnSync(process.execPath, ['--test', 'tests/'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, HELPER_AI_MODE: mode, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import ${hook}`.trim() } })
  if (r.status !== 0) failed++
  console.log(`== AI_MODE = ${mode}: ${r.status === 0 ? 'pass' : 'FAIL'} ==`)
}
process.exit(failed ? 1 : 0)
