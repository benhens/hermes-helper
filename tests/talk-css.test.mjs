// The one style sheet of our own (src/talk.css, Helper's conversation window; row 11 of
// docs/build/talk-v1-plan.md). Its rules: every class starts with hh-; every colour is a Hermes
// variable; no fonts, no shadows, no pictures; part 1 is hhdesign's design/talk-r5/talk.css rule
// for rule; every class the code names has a rule and the sheet has no class nothing names.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { colourFindings, styleFindings } from './lib/colour-lint.mjs'
import { talkCssText, talkCssSource } from '../scripts/build.mjs'
import { TALK_CSS } from '../src/talk-css.js'
import { T } from '../src/look.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8')
const sheet = read('src/talk.css')
const DESIGN = read('tests/fixtures/talk-r5.css')
const PART_2 = '/* ==== part 2: ours ==== */'
const rulesOf = css => css.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.trim()).filter(Boolean)
const classesIn = css => [...new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]))]
// Class names in selectors only (not the .5 of a number, not a value).
const selectorClasses = css => [...new Set(rulesOf(css).flatMap(rule => [...rule.slice(0, rule.indexOf('{')).matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1])))]

test('the built string is the sheet with its comments and line breaks dropped, nothing else changed', () => {
  assert.equal(TALK_CSS, talkCssText(sheet))
  assert.equal(read('src/talk-css.js'), talkCssSource())
  assert.doesNotMatch(TALK_CSS, /\/\*/)
  assert.deepEqual(TALK_CSS.split('\n'), rulesOf(sheet))
  // it goes into a <style> element as text: nothing in it can end that element
  assert.doesNotMatch(TALK_CSS, /<|>\s*\/|@import|expression\(/i)
})

test('every class in the sheet starts with hh- (Hermes\'s codicon class is the one named exception)', () => {
  const names = selectorClasses(sheet)
  assert.ok(names.length >= 30, `${names.length} classes`)
  for (const name of names) assert.ok(name.startsWith('hh-') || name === 'codicon', name)
  // and no rule reaches outside our window: every selector begins at one of our own classes
  // (talk-live: the one named animation, the waiting dots', is ours by its name hh-dot)
  for (const rule of rulesOf(sheet).filter(r => !r.startsWith('@keyframes hh-'))) for (const sel of rule.slice(0, rule.indexOf('{')).split(',')) assert.match(sel.trim(), /^\.hh-/, sel)
  assert.deepEqual(rulesOf(sheet).filter(r => r.startsWith('@')).map(r => r.slice(0, r.indexOf('{'))), ['@keyframes hh-dot'])
})

test('every colour is a Hermes variable; no fonts, no shadows, no pictures', () => {
  assert.deepEqual(colourFindings(sheet.replace(/\/\*[\s\S]*?\*\//g, '')), [])
  assert.deepEqual(styleFindings(sheet), [])
  assert.doesNotMatch(sheet, /font-family|@font-face|box-shadow|text-shadow|url\(|@import/)
  // the variables it names are the ones read in the running app (docs/build/talk-v1-stage1.md, part 0)
  const named = [...new Set([...sheet.matchAll(/var\((--(?!hh-)[\w-]+)/g)].map(m => m[1]))].sort()
  assert.deepEqual(named, ['--dt-user-bubble-border', '--ui-accent', '--ui-base', '--ui-bg-elevated', '--ui-bg-tertiary', '--ui-chat-bubble-background', '--ui-control-active-background',
    '--ui-control-hover-background', '--ui-sidebar-surface-background', '--ui-stroke-primary', '--ui-stroke-secondary', '--ui-stroke-tertiary', '--ui-text-primary', '--ui-text-quaternary',
    '--ui-text-secondary', '--ui-text-tertiary'])
})

test('the lint on the sheet bites: a colour, a font or a shadow of our own is found', () => {
  assert.ok(colourFindings(sheet.replace('var(--ui-bg-elevated)', '#16181d')).length)
  assert.ok(colourFindings(sheet.replace('var(--ui-stroke-primary)', 'white')).length)
  assert.ok(styleFindings(sheet + '.hh-x{font-family:Inter}').length)
  assert.ok(styleFindings(sheet + '.hh-x{box-shadow:0 1px 2px var(--ui-base)}').length)
})

// What part 1 changes in a copied rule, and nothing else:
//  - the design page's stand-in classes for "under the cursor" and "pressed" (.is-hover, .is-down)
//    are dropped: the real states do that here;
//  - the lit dot's class .on becomes .hh-on, so that every class starts with hh-.
const asCopied = rule => rule.replace(/,[^,{]*\.is-(?:hover|down)(?=[,{])/g, '').replace('.hh-dots i.on{', '.hh-dots i.hh-on{')
// Rules of the design that are not copied, each with its reason.
const LEFT_OUT = [
  [/^\.hh-earlier/, 'the "Earlier" marker: plain scrolling'],
  [/^\.hh-w0\{/, 'a word not said yet: src/reveal.js holds the words\' room its own way'],
  [/^\.hh-btn\.hh-pri/, 'the filled button: no line has one (the "Keep this?" box is gone)'],
  [/^\.hh-tail\{/, 'the tail\'s place: now the cell .hh-linkcell in part 2, the same numbers plus the character\'s inset'],
  [/^\.hh-box\{/, 'the message box\'s own look: the message box is Hermes\'s own composer (talk v1)'],
  [/^\.hh-box \.hh-answers?\{/, 'the things to pick in the box: the same declarations in part 2 under .hh-picks, the composer not being .hh-box']
]

test('part 1 is hhdesign\'s talk-r5 sheet (option 4), rule for rule; what is left out is listed with its reason', () => {
  const design = rulesOf(DESIGN)
  const part1 = rulesOf(sheet.split(PART_2)[0])
  assert.equal(sheet.split(PART_2).length, 2)
  const copied = design.filter(rule => !LEFT_OUT.some(([re]) => re.test(rule))).map(asCopied)
  assert.deepEqual(part1, copied)
  assert.equal(design.length, 44)
  assert.equal(part1.length, 34)
  // every reason is used, and the lit-dot and stand-in rewrites really happened
  for (const [re, why] of LEFT_OUT) assert.ok(design.some(rule => re.test(rule)), why)
  assert.doesNotMatch(part1.join('\n'), /\.is-hover|\.is-down|i\.on\{/)
  assert.equal(copied.filter((rule, i) => rule !== design.filter(r => !LEFT_OUT.some(([re]) => re.test(r)))[i]).length, 5)
  // part 2's things to pick carry the design's declarations, with the side padding 9 px (row 1)
  const own = rulesOf(sheet.split(PART_2)[1])
  const box = design.find(r => r.startsWith('.hh-box .hh-answers{'))
  assert.ok(own.includes(box.replace('.hh-box .hh-answers{', '.hh-picks .hh-answers{')))
  const one = design.find(r => r.startsWith('.hh-box .hh-answer{'))
  assert.ok(own.includes(one.replace('.hh-box .hh-answer{', '.hh-picks .hh-answer{').replace('padding:5px 11px', 'padding:5px 9px')))
})

test('the design sheet the comparison uses is the team\'s file (when the team\'s folder is there)', t => {
  const team = path.resolve(ROOT, '..', 'design', 'talk-r5', 'talk.css')
  if (!fs.existsSync(team)) return t.skip('no team design folder beside the plugin')
  const sha = text => crypto.createHash('sha256').update(text).digest('hex')
  assert.equal(sha(DESIGN), sha(fs.readFileSync(team, 'utf8')))
})

test('every class the code names has a rule in the sheet, and the sheet has no class the code does not name', () => {
  const named = [...new Set(Object.values(T).flatMap(v => v.split(' ')))]
  const inSheet = selectorClasses(sheet).filter(n => n !== 'codicon')
  for (const name of named) assert.ok(inSheet.includes(name), `no rule for ${name}`)
  for (const name of inSheet) assert.ok(named.includes(name), `a rule for ${name}, which nothing names`)
  // hh- classes are written in the T table only, never in page code
  for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter(x => x.endsWith('.js') && !['look.js', 'talk-css.js'].includes(x))) {
    const code = read('src/' + f).split('\n').filter(line => !line.trim().startsWith('//')).join('\n')
    // (hh-face-… and hh-tab… are element ids, not classes)
    assert.doesNotMatch(code, /['"`\s]hh-(?!face-|tab)[a-z]/, `${f} writes an hh- class outside the T table`)
  }
  assert.ok(classesIn(sheet).length > 0)
})

test('held room: what waits for the line\'s last word is unseen but keeps its place', () => {
  assert.match(TALK_CSS, /^\.hh-wait\{visibility:hidden\}$/m)
  assert.doesNotMatch(TALK_CSS, /\.hh-wait\{[^}]*display/)
})

test('the piece between bubble and character is placed by rules alone: its cell hangs 1 px into the bubble, one fixed size of 22 by 24 px (talk-r5), never stretched', () => {
  const cell = rulesOf(sheet).find(r => r.startsWith('.hh-linkcell{'))
  assert.match(cell, /position:absolute/)
  assert.match(cell, /top:-1px/)
  assert.match(cell, /width:22px;height:24px/)
  assert.doesNotMatch(cell, /calc\(100%/, 'not stretched to the character')
  assert.match(cell, /left:calc\(var\(--hh-inset\) \+ var\(--hh-char\)\*\.5 - 2px\)/)
  assert.match(cell, /z-index:2/)
  // the design's own .hh-tail, the same numbers
  const tail = rulesOf(DESIGN).find(r => r.startsWith('.hh-tail{'))
  assert.match(tail, /left:calc\(var\(--hh-char\)\*\.5 - 2px\);top:-1px;width:22px;height:24px/)
  // the two sizes of the character: 168 px (k = .84) and 132 px (k = .66), as 200 units of drawing
  assert.match(TALK_CSS, /--hh-char:168px;--hh-k:\.84/)
  assert.match(TALK_CSS, /\.hh-win\.hh-small\{--hh-char:132px;--hh-k:\.66\}/)
  assert.equal(168 / 200, 0.84)
  assert.equal(132 / 200, 0.66)
})

// hhdesign's review of d1ceddc, 3.2: the first-time line under "Kept:" is about privacy, so it takes the secondary
// text colour in both themes (the faint tertiary measured 3.5:1 in light); "Kept: ... See what I keep" stays faint.
test('the first-time line under "Kept:" in Helper\'s window is in --ui-text-secondary; the "Kept:" line itself stays in --ui-text-tertiary', () => {
  const rules = sel => TALK_CSS.split('\n').filter(r => r.startsWith(sel + '{'))
  const colours = sel => rules(sel).flatMap(r => [...r.matchAll(/(?:^|[;{])color:([^;}]+)/g)].map(m => m[1]))
  assert.deepEqual(colours('.hh-note-first'), ['var(--ui-text-secondary)'])
  assert.deepEqual(colours('.hh-note'), ['var(--ui-text-tertiary)'])
  // no rule for a theme of its own: the same variable serves dark and light
  assert.doesNotMatch(TALK_CSS, /\.dark[^{\n]*\.hh-note-first/)
})
