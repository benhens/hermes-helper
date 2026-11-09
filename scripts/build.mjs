// Joins src/ into desktop/plugin.js: plain text in, plain JavaScript out, no tools or downloads.
// Hermes loads exactly one file per plugin, and that file may import only @hermes/plugin-sdk,
// react and react/jsx-runtime. So the build:
//   1. reads the src/ files in the order below,
//   2. drops the imports between our own files (./x.js) and merges the outside imports into one
//      line per package at the top,
//   3. removes `export` from everything except main.js's `export default`.
// Usage: node scripts/build.mjs          writes desktop/plugin.js
//        node scripts/build.mjs --check  fails if desktop/plugin.js is not the current build
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ORDER = ['state.js', 'model-name.js', 'model-status.js', 'model-call.js', 'key-check.js', 'setup-cards.js', 'placeholder-steps.js', 'look.js', 'layout.js', 'character.js', 'setup-tab.js', 'page.js', 'main.js']
const ALLOWED = ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime']
const OUT = path.join(ROOT, 'desktop', 'plugin.js')

export function buildSource() {
  const named = new Map(ALLOWED.map(s => [s, new Set()]))
  const bodies = []
  const onDisk = fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')).sort()
  const missing = onDisk.filter(f => !ORDER.includes(f))
  if (missing.length) throw new Error(`src files not in the build order: ${missing.join(', ')}`)

  for (const file of ORDER) {
    const text = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8')
    const out = []
    for (const line of text.split('\n')) {
      const imp = line.match(/^import\s+(.*?)\s+from\s+'([^']+)'\s*;?\s*$/)
      if (imp) {
        const [, what, spec] = imp
        if (spec.startsWith('./')) continue
        if (!ALLOWED.includes(spec)) throw new Error(`${file}: import from '${spec}' is not allowed in a Hermes plugin`)
        const names = what.match(/^\{([^}]*)\}$/)
        if (!names) throw new Error(`${file}: only named imports are supported: ${line}`)
        names[1].split(',').map(s => s.trim()).filter(Boolean).forEach(n => named.get(spec).add(n))
        continue
      }
      if (/^\s*import[\s{'"(]/.test(line)) throw new Error(`${file}: write each import on one line: ${line}`)
      if (/^export default\b/.test(line) && file !== 'main.js') throw new Error(`${file}: only main.js has a default export`)
      if (/^export\s*\{/.test(line)) throw new Error(`${file}: use export before the declaration instead: ${line}`)
      out.push(line.replace(/^export (?=(async )?function\b|const\b|let\b|class\b)/, ''))
    }
    bodies.push(`// ---- src/${file} ----\n` + out.join('\n').trim() + '\n')
  }

  const imports = ALLOWED.filter(s => named.get(s).size)
    .map(s => `import { ${[...named.get(s)].sort().join(', ')} } from '${s}'`)
    .join('\n')
  return [
    '// Helping Hand: a Hermes Desktop plugin. Built by scripts/build.mjs from src/; edit src/, not this file.',
    '// Licence: MIT (see LICENSE).',
    imports,
    '',
    bodies.join('\n')
  ].join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const next = buildSource()
  if (process.argv.includes('--check')) {
    const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
    if (now !== next) {
      console.error('desktop/plugin.js is out of date: run node scripts/build.mjs')
      process.exit(1)
    }
    console.log('desktop/plugin.js is up to date')
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    fs.writeFileSync(OUT, next)
    console.log(`wrote desktop/plugin.js (${next.length} characters)`)
  }
}
