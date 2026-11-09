// Checks that every class name in src/look.js exists in a built Hermes Desktop stylesheet.
// Hermes's CSS holds only the classes its own code uses, so a class that isn't there would silently
// do nothing on screen. Needs a Hermes build, so it runs on the team's test machine, not in `npm test`:
//   node scripts/check-hermes-classes.mjs <hermes-src>/apps/desktop/dist/assets/*.css
import fs from 'node:fs'
import { K, ICONS } from '../src/look.js'

// Class names that only mark a group for its children's hover rules (group-hover/row:...) and have
// no rule of their own in Tailwind's output.
const MARKERS = new Set(['group/row'])

// Tailwind writes a class into its selector with every character outside [A-Za-z0-9_-] escaped.
export function selectorFor(token) {
  return '.' + token.replace(/[^A-Za-z0-9_-]/g, ch => '\\' + ch)
}

export function missingClasses(cssText, table = K) {
  const tokens = new Set(Object.values(table).flatMap(v => v.split(/\s+/).filter(Boolean)))
  const missing = []
  for (const t of [...tokens].sort()) {
    if (MARKERS.has(t)) continue
    const sel = selectorFor(t)
    // The selector must end there: next char is not part of a longer class name.
    const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_\\\\-])')
    if (!re.test(cssText)) missing.push(t)
  }
  return { checked: tokens.size, missing }
}

export function missingIcons(codiconCss, icons = ICONS) {
  return icons.filter(name => !new RegExp(`\\.codicon-${name}:before`).test(codiconCss))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const iconAt = args.indexOf('--codicons')
  const codiconFile = iconAt >= 0 ? args.splice(iconAt, 2)[1] : null
  const files = args
  if (!files.length) {
    console.error('usage: node scripts/check-hermes-classes.mjs [--codicons <codicon.css>] <hermes css files...>')
    process.exit(2)
  }
  const css = files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
  const { checked, missing } = missingClasses(css)
  console.log(`${checked} class names checked against ${files.length} Hermes stylesheet(s)`)
  let failed = false
  if (missing.length) {
    failed = true
    console.log('NOT in Hermes CSS (would do nothing on screen):')
    for (const m of missing) console.log('  ' + m)
  } else console.log('all present')
  if (codiconFile) {
    const gone = missingIcons(fs.readFileSync(codiconFile, 'utf8'))
    console.log(`${ICONS.length} codicon names checked: ${gone.length ? 'MISSING ' + gone.join(', ') : 'all present'}`)
    if (gone.length) failed = true
  }
  if (failed) process.exit(1)
}
