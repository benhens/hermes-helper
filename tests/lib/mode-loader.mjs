// The loader of tests/lib/mode-hook.mjs: src/ai-mode.js with AI_MODE set to HELPER_AI_MODE.
const MODE = process.env.HELPER_AI_MODE
export function aiModeSource(src, mode) {
  const re = /^(export )?const AI_MODE = '[a-z_]+'$/m
  if (!re.test(String(src))) throw new Error('mode hook: no AI_MODE line found')
  return String(src).replace(re, (m, e) => `${e || ''}const AI_MODE = '${mode}'`)
}
// setup-chat: src/setup-built.js with SETUP_BUILT set to HELPER_SETUP_BUILT ('true' or 'false'). The older tests are
// about the ordinary talk and run with the set-up conversation switched off (scripts/test-modes.mjs); tests/setup/
// runs on the files as committed.
const SETUP = process.env.HELPER_SETUP_BUILT
export function setupBuiltSource(src, value) {
  const re = /^(export )?const SETUP_BUILT = (?:true|false)$/m
  if (!re.test(String(src))) throw new Error('mode hook: no SETUP_BUILT line found')
  if (value !== 'true' && value !== 'false') throw new Error('mode hook: HELPER_SETUP_BUILT must be true or false')
  return String(src).replace(re, (m, e) => `${e || ''}const SETUP_BUILT = ${value}`)
}
// the second switch of src/setup-built.js: the AI step of the recommendation
export function setupAiSource(src, value) {
  const re = /^(export )?const SETUP_AI_BUILT = (?:true|false)$/m
  if (!re.test(String(src))) throw new Error('mode hook: no SETUP_AI_BUILT line found')
  return String(src).replace(re, (m, e) => `${e || ''}const SETUP_AI_BUILT = ${value}`)
}
export async function load(url, context, next) {
  const r = await next(url, context)
  if (SETUP && url.endsWith('/src/setup-built.js')) return { ...r, source: setupBuiltSource(r.source, SETUP) }
  if (MODE && url.endsWith('/src/ai-mode.js')) return { ...r, source: aiModeSource(r.source, MODE) }
  return r
}
