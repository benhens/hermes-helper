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

// The copy gives what Hermes's own file gives: Hermes's TypeScript file is loaded as it is (Node
// strips the types) and both are run on the same ids and options. Runs only where the Hermes source
// is checked out (the team's test machine); the ship container has none, so there it is skipped.
const HERMES_FILE = path.resolve(import.meta.dirname, '..', '..', 'dev', 'hermes-src', 'apps', 'desktop', 'src', 'lib', 'model-status-label.ts')
const IDS = [
  ...HHTECH.map(([id]) => id),
  '  mock-small  ', 'claude-opus-4-8-fast', 'claude-haiku-4-5-thinking', 'claude-sonnet-5[1m]', 'anthropic/claude-sonnet-4-5-20250929-preview',
  'gpt-4o-mini', 'gpt-5.4-latest', 'gemini-2.5-flash', 'gemini-3-pro-preview', 'openai/gpt-oss-120b', 'deepseek-flash', 'deepseek/deepseek-r1',
  'minimax-m2', 'moonshotai/kimi-k2-instruct', 'qwen3-30b-a3b-instruct-2507-Q4_K_XL', 'Qwen3-8B-UD-Q8_0-flash', 'llama-3.3-70b-instruct-BF16',
  'ernie-4.5-vl-28b-a3b', 'mimo-7b-rl', 'bge-m3', 'gemma-3-27b-it', 'mistral-small-fp8', 'ai21/jamba', 'glm-4.5-air', 'x-ai/grok-4-fast',
  'hermes-4-70b', 'nousresearch/hermes-4-405b', 'local-model', 'a', '/', 'model-20250101', 'm-IQ4_XS', 'phi-4-F16'
]
test('the copy gives exactly what Hermes v0.23.0\'s own file gives (where the Hermes source is present)', async t => {
  if (!fs.existsSync(HERMES_FILE)) return t.skip('no Hermes source checkout next to the plugin')
  const hermes = await import(HERMES_FILE)
  const ours = await import('../src/model-name.js')
  for (const id of IDS) {
    for (const options of [undefined, { fastMode: true }, { serviceTier: 'ultrafast' }]) {
      assert.equal(ours.formatModelPillLabel(id, options), hermes.formatModelPillLabel(id, options), `${JSON.stringify(id)} ${JSON.stringify(options)}`)
    }
    assert.deepEqual(ours.modelDisplayParts(id), hermes.modelDisplayParts(id), id)
    assert.equal(ours.modelVariantTag(id), hermes.modelVariantTag(id), id)
    assert.equal(ours.modelBaseId(id), hermes.modelBaseId(id), id)
  }
})
