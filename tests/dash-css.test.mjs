// dash-v1: the Dashboard's style sheet (src/dash.css), as tests/talk-css.test.mjs checks Helper's: built as it is,
// our own hhd- classes only, every colour a Hermes variable, no fonts, no shadows, no warning colours; and his rule
// for the path: the line is one neutral line, never coloured, in no state.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DASH_CSS } from '../src/dash-css.js'
import { talkCssText } from '../scripts/build.mjs'
import { D, K } from '../src/look.js'
import { colourFindings, styleFindings } from './lib/colour-lint.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8')
const sheet = read('src/dash.css')
const rules = DASH_CSS.split('\n')
const selectorsOf = rule => rule.slice(0, rule.indexOf('{')).split(',').map(s => s.trim())
// the line's colour: hhdesign's second choice (see the line's test below)
const EDGE = 'var(--ui-text-quaternary)'
const classesIn = text => [...new Set([...text.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]))]

test('the built string is the sheet with its comments and line breaks dropped, nothing else changed', () => {
  assert.equal(DASH_CSS, talkCssText(sheet))
})

test('every selector is one of our own hhd- classes (in the light theme, under Hermes\'s html:not(.dark))', () => {
  for (const rule of rules) for (const sel of selectorsOf(rule)) assert.match(sel, /^(html:not\(\.dark\) )?\.hhd-[\w.:\s-]*(\.hhd-[\w-]+|::?[\w-]+(\([^)]*\))?)*$/, sel)
  for (const c of classesIn(rules.map(r => r.slice(0, r.indexOf('{'))).join('\n'))) assert.ok(c.startsWith('hhd-') || c === 'dark', c)
})

test('every colour is a Hermes variable; no fonts, no shadows (the light card edge is Hermes\'s own inset hairline), no pictures', () => {
  assert.deepEqual(colourFindings(DASH_CSS), [])
  assert.deepEqual(styleFindings(DASH_CSS), [])
  assert.doesNotMatch(DASH_CSS, /font-family|url\(|@import|@font-face/)
})

test('the lint on the sheet bites: a colour, a font or a ring drawn as a shadow is found', () => {
  assert.ok(colourFindings(DASH_CSS + '\n.hhd-x{color:#4a84fe}').length)
  assert.ok(styleFindings(DASH_CSS + '\n.hhd-x{font-family:Inter}').length)
  assert.ok(styleFindings(DASH_CSS + '\n.hhd-x{box-shadow:0 0 0 7px var(--ui-accent)}').length)
})

test('no warning colours anywhere on the tab: no red, yellow, orange or green, in the sheet or in the classes the tab wears', () => {
  const warn = /--ui-(red|yellow|orange|green)|destructive|warning/
  assert.doesNotMatch(DASH_CSS, warn)
  assert.doesNotMatch(Object.values(D).join(' '), warn)
  const dash = read('src/dash.js')
  for (const [key] of [...dash.matchAll(/\bK\.(\w+)/g)].map(m => [m[1]])) assert.doesNotMatch(K[key], warn, key)
})

test('every class the code names has a rule in the sheet, and the sheet has no class the code does not name; hhd- classes are written in the D table only', () => {
  const named = [...new Set(Object.values(D))]
  const inSheet = classesIn(rules.map(r => r.slice(0, r.indexOf('{'))).join('\n')).filter(c => c !== 'dark')
  for (const name of named) assert.ok(inSheet.includes(name), `no rule for ${name}`)
  for (const name of inSheet) assert.ok(named.includes(name), `a rule for ${name}, which nothing names`)
  for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter(x => x.endsWith('.js') && !['look.js', 'dash-css.js'].includes(x))) {
    const code = read('src/' + f).split('\n').filter(line => !line.trim().startsWith('//')).join('\n')
    assert.doesNotMatch(code, /['"`\s]hhd-[a-z]/, `${f} writes an hhd- class outside the D table`)
  }
})

test('hhdesign\'s r7 sizes: tiles 3 across, icon square 40 px at 13% accent; loom2: a set-up card is a tile (the same surface, edge, corners, padding and icon square)', () => {
  const rule = sel => rules.find(r => r.startsWith(sel + '{')) || ''
  assert.match(rule(`.${D.stats}`), /grid-template-columns:repeat\(3,minmax\(0,1fr\)\);gap:10px/)
  assert.match(rule(`.${D.tileIcon}`), /width:40px;height:40px;border-radius:calc\(10px\*var\(--hhd-round\)\);background:color-mix\(in srgb,var\(--ui-accent\) 13%,transparent\)/)
  assert.match(rule(`.${D.tileNum}`), /font-size:28px;line-height:32px;font-weight:600/)
  // the same surface, corners and padding as a tile, and the same hairline edge in light
  assert.match(rule(`.${D.scard}`), /background:var\(--ui-bg-elevated\);border-radius:calc\(12px\*var\(--hhd-round\)\);padding:14px 16px/)
  assert.match(rule(`.${D.tile}`), /background:var\(--ui-bg-elevated\);border-radius:calc\(12px\*var\(--hhd-round\)\);padding:14px 16px/)
  assert.equal(rule(`html:not(.dark) .${D.scard}`), `html:not(.dark) .${D.scard}{box-shadow:inset 0 0 0 1px var(--ui-stroke-tertiary)}`)
  assert.equal(rule(`html:not(.dark) .${D.tile}`), `html:not(.dark) .${D.tile}{box-shadow:inset 0 0 0 1px var(--ui-stroke-tertiary)}`)
})

/* ---------- dash-v2: hhdesign's review of 65b108b (design/dash-r7/review-65b108b.md, "For builder") ---------- */
const ruleOf = sel => rules.find(r => r.startsWith(sel + '{')) || ''

test('the pointer over an opened card: only its half above the panel is drawn (it was two-toned); the source tags are quieter: 10.5 px in --ui-text-quaternary, 4 px apart', () => {
  assert.match(ruleOf(`.${D.caret}`), /clip-path:polygon\(0 0,100% 0,0 100%\)/)
  assert.match(ruleOf(`.${D.foot}`), /gap:4px/)
  assert.equal(ruleOf(`.${D.foot} .${D.src}`), `.${D.foot} .${D.src}{font-size:10.5px;color:var(--ui-text-quaternary)}`)
  assert.match(read('src/dash.js'), /className: `\$\{K\.chipLink\} \$\{D\.src\}`/)
})

/* ---------- loom2: the set-up as cards ---------- */
test('no path and no line: nothing in the sheet draws a stroke or a path; the hairline is only the light edge of tiles and cards', () => {
  assert.doesNotMatch(DASH_CSS, /[{;]stroke|hhd-line|hhd-road|hhd-stop|hhd-dot/)
  assert.deepEqual(rules.filter(r => r.includes('--ui-stroke-tertiary')).map(r => r.slice(0, r.indexOf('{'))), [`html:not(.dark) .${D.tile}`, `html:not(.dark) .${D.scard}`])
  assert.doesNotMatch(read('src/dash.js'), /'svg'|'path'|stroke/)
})

test('a marked card: its icon square filled with the accent and "Done" in the accent; "Start here" in the accent; the opened card ringed with an outline (no shadow)', () => {
  assert.equal(ruleOf(`.${D.done} .${D.tileIcon}`), `.${D.done} .${D.tileIcon}{background:var(--ui-accent);color:var(--background)}`)
  assert.match(ruleOf(`.${D.doneLine}`), /font-weight:600;color:var\(--ui-accent\)/)
  assert.match(ruleOf(`.${D.start}`), /color:var\(--ui-accent\)/)
  assert.equal(ruleOf(`.${D.scard}.${D.sel}`), `.${D.scard}.${D.sel}{outline:2px solid var(--ui-accent);outline-offset:-2px}`)
  assert.match(ruleOf(`.${D.scard}:focus-visible`), /outline:2px solid var\(--ui-text-secondary\)/)
})

test('the corners sit behind one value: --hhd-round is set once (1 = the round look he picked in dash-r3), and every corner of a card, tile, panel, icon square and waiting block is its size times that value', () => {
  const sets = [...DASH_CSS.matchAll(/--hhd-round:([^;}]+)/g)].map(m => m[1])
  assert.deepEqual(sets, ['1'], 'set in one place')
  assert.match(ruleOf(`.${D.main}`), /--hhd-round:1[;}]/)
  const radii = [...DASH_CSS.matchAll(/border-radius:([^;}]+)/g)].map(m => m[1])
  const scaled = radii.filter(r => r.includes('--hhd-round'))
  // (loom2: the card's video and its quiet box, 8 px each)
  assert.deepEqual(scaled.sort(), ['calc(10px*var(--hhd-round))', 'calc(12px*var(--hhd-round))', 'calc(12px*var(--hhd-round))', 'calc(12px*var(--hhd-round))', 'calc(7px*var(--hhd-round))', 'calc(8px*var(--hhd-round))', 'calc(8px*var(--hhd-round))'])
  // what is left with a fixed corner is not a box: the 2 px pointer (loom2: no round stops any more)
  assert.deepEqual([...new Set(radii.filter(r => !r.includes('--hhd-round')))].sort(), ['2px'])
  for (const sel of [`.${D.scard}`, `.${D.tile}`, `.${D.steps}`]) assert.match(ruleOf(sel), /border-radius:calc\(12px\*var\(--hhd-round\)\)/, sel)
  assert.match(ruleOf(`.${D.wait}`), /border-radius:calc\(7px\*var\(--hhd-round\)\)/)
})

test('at the narrow size a tile\'s word may take a second line rather than run out of its tile (a 340 px left side leaves a tile 65 px of room)', () => {
  assert.match(ruleOf(`.${D.tileLabel}`), /white-space:nowrap/)
  assert.equal(ruleOf(`.${D.compact} .${D.tileLabel}`), `.${D.compact} .${D.tileLabel}{white-space:normal}`)
  // loom2: on a tile that is a button (skills, plugins) the word may wrap at any size: in the app at 1180 px "See them in
  // Capabilities" ran past the plugins tile's edge by a few pixels
  assert.equal(ruleOf(`.${D.tileBtn} .${D.tileLabel}`), `.${D.tileBtn} .${D.tileLabel}{white-space:normal}`)
})
