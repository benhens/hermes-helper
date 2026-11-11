// The loader of tests/lib/mode-hook.mjs: src/ai-mode.js with AI_MODE set to HELPER_AI_MODE.
const MODE = process.env.HELPER_AI_MODE
export function aiModeSource(src, mode) {
  const out = String(src).replace(/^(export )?const AI_MODE = '[a-z_]+'$/m, (m, e) => `${e || ''}const AI_MODE = '${mode}'`)
  if (out === String(src)) throw new Error('mode hook: no AI_MODE line found')
  return out
}
export async function load(url, context, next) {
  const r = await next(url, context)
  if (MODE && url.endsWith('/src/ai-mode.js')) return { ...r, source: aiModeSource(r.source, MODE) }
  return r
}
