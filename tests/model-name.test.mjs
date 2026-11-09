// The model's name, the way Hermes's own model button shows it (src/model-name.js, a copy of
// Hermes's apps/desktop/src/lib/model-status-label.ts). The 14 ids and answers are hhtech's run of
// Hermes's own unchanged file (docs/answers/hhtech-model-display-name.md section 3); our copy must
// give exactly the same.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { formatModelPillLabel, modelDisplayParts, modelBaseId } from '../src/model-name.js'

const HHTECH = [
  ['mock-small', 'Mock Small'],
  ['model-a', 'Model A'],
  ['claude-opus-4-8', 'Opus 4.8'],
  ['anthropic/claude-opus-4.8', 'Opus 4.8'],
  ['claude-sonnet-4-5-20250929', 'Sonnet 4.5'],
  ['gpt-5.4', 'GPT-5.4'],
  ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
  ['z-ai/glm-5.3', 'GLM 5.3'],
  ['qwen3-8b', 'Qwen3 8B'],
  ['llama3.1:8b', 'Llama3.1:8B'],
  ['hermes-4-405b', 'Hermes 4 405B'],
  ['deepseek-v4.1-flash', 'DeepSeek V4.1 · Flash'],
  ['nous/welcome', 'Welcome'],
  ['', 'No model']
]

test("hhtech's 14 ids give exactly what Hermes's own model button shows", () => {
  for (const [id, want] of HHTECH) assert.equal(formatModelPillLabel(id), want, JSON.stringify(id))
})

test('the parts: provider prefix dropped, date pin dropped, variant and quant as tags', () => {
  assert.equal(modelBaseId('openrouter/anthropic/claude-x'), 'claude-x')
  assert.deepEqual(modelDisplayParts('claude-opus-4-8-fast'), { name: 'Opus 4.8', tag: 'Fast' })
  assert.deepEqual(modelDisplayParts('qwen3-30b-a3b-instruct-2507-Q4_K_XL'), { name: 'Qwen3 30B A3B', tag: 'Q4' })
  assert.deepEqual(modelDisplayParts('claude-sonnet-5[1m]'), { name: 'Sonnet 5', tag: '1M' })
})

// The copy keeps Hermes's rules word for word: every rule line of Hermes's file (types and
// comments aside) is in ours. Runs only where the Hermes source is checked out (the team's test
// machine); the ship container has none, so there it says so and passes.
const HERMES_FILE = path.resolve(import.meta.dirname, '..', '..', 'dev', 'hermes-src', 'apps', 'desktop', 'src', 'lib', 'model-status-label.ts')
test('the copied rules match Hermes v0.23.0 line by line (where the Hermes source is present)', t => {
  if (!fs.existsSync(HERMES_FILE)) return t.skip('no Hermes source checkout next to the plugin')
  const ours = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'model-name.js'), 'utf8')
  const theirs = fs.readFileSync(HERMES_FILE, 'utf8')
  const start = theirs.indexOf('const VARIANT_TAGS')
  const end = theirs.indexOf('const FAST_TIERS')
  // displayModelName (menus and session rows) is the one function in that range not copied.
  const skipFrom = theirs.indexOf('export function displayModelName')
  const skipTo = theirs.indexOf('export function modelVariantTag')
  assert.ok(start > 0 && skipFrom > start && skipTo > skipFrom && end > skipTo, 'Hermes file layout changed: re-check the copy')
  const plain = line => line.trim()
  const ourLines = new Set(ours.split('\n').map(plain))
  const ruleLines = (theirs.slice(start, skipFrom) + theirs.slice(skipTo, end))
    .split('\n')
    .map(plain)
    .filter(l => l && !l.startsWith('//') && !l.startsWith('/**') && !l.startsWith('*') && !l.startsWith('export function') && !l.startsWith('function') && !/^const \w+ = \(|^const \w+: /.test(l) && !/^let \{/.test(l))
  // Lines that carry TypeScript types read differently by design; the rest must be identical.
  const typed = l => /: (string|boolean|ReadonlyArray|\{)|as const|<.*>/.test(l)
  const missing = ruleLines.filter(l => !typed(l) && !ourLines.has(l))
  assert.deepEqual(missing, [])
  assert.ok(ruleLines.length > 60, `only ${ruleLines.length} rule lines found`)
})
