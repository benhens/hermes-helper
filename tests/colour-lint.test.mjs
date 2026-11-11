// build-v1.md section 4: no colour, font or shadow value of our own; the page wears Hermes's look.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { colourFindings, styleFindings, paletteClassFindings } from './lib/colour-lint.mjs'
import { K, T } from '../src/look.js'
import { TALK_CSS } from '../src/talk-css.js'
import { DASH_CSS } from '../src/dash-css.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8')
const srcFiles = fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')).map(f => 'src/' + f)
const plugin = read('desktop/plugin.js')

test('the lint itself catches colours of our own (it bites)', () => {
  const bad = ['color:#fff', 'background:#0053fd', 'fill: rgb(0,0,0)', 'x: hsl(10 20% 30%)', 'c: oklch(0.5 0.1 200)',
    'stop-color: white', "fill: 'black'", 'border: 1px solid red', 'color-mix(in srgb, var(--ui-accent) 50%, #fff)']
  for (const s of bad) assert.ok(colourFindings(s).length > 0, `not caught: ${s}`)
})

test('the lint lets Hermes variables and harmless words through', () => {
  const ok = ['color:var(--ui-red)', 'white-space:nowrap', 'background:var(--ui-green)', 'border:1px solid transparent',
    'color-mix(in oklab, var(--ui-accent) 62%, var(--ui-editor-surface-background))', 'color:currentColor',
    'var(--ui-accent, var(--dt-primary))']
  for (const s of ok) assert.deepEqual(colourFindings(s), [], `wrongly caught: ${s}`)
})

for (const file of ['desktop/plugin.js', ...srcFiles]) {
  test(`${file}: no hex, rgb(), hsl() or named colour outside var()`, () => {
    assert.deepEqual(colourFindings(read(file)), [])
  })
}

test('the palette lint catches Tailwind colours that are not the theme (it bites)', () => {
  for (const s of ['bg-amber-500/10', 'text-emerald-600', 'text-white', 'bg-black/5', 'border-gray-200'])
    assert.ok(paletteClassFindings(s).length, `not caught: ${s}`)
  assert.deepEqual(paletteClassFindings('bg-primary/15 text-(--ui-text-tertiary) text-foreground/85'), [])
})

test('class table: only theme colours (no Tailwind palette colours, no white/black)', () => {
  assert.deepEqual(paletteClassFindings(Object.values(K).join(' ')), [])
  assert.deepEqual(paletteClassFindings(Object.values(T).join(' ')), [])
})

test('the style lint catches fonts and shadows of our own (it bites)', () => {
  assert.ok(styleFindings('.a{font-family:Inter, sans-serif}').length)
  assert.ok(styleFindings('.a{font:400 14px/20px Inter}').length)
  assert.ok(styleFindings('@font-face{font-family:var(--font-sans);src:url(x.woff)}').length)
  assert.ok(styleFindings('.a{box-shadow:0 2px 4px var(--ui-base)}').length)
  assert.deepEqual(styleFindings('.a{font:400 14px/20px var(--font-sans);box-shadow:var(--shadow-sm)}'), [])
})

test('two style sheets of our own: Helper\'s window (row 11 of the talk v1 plan) and, since dash-v1, the Dashboard tab: one <style> element each, made in one place from its built sheet; no fonts, no font or shadow styles inline', () => {
  // The sheets' own rules (hh- and hhd- classes, Hermes variables only, no fonts, no shadows) are
  // tests/talk-css.test.mjs and tests/dash-css.test.mjs. Here: the built file makes exactly two style elements, each
  // text a built sheet, never text put together at run time. (dash-v1: Lead's job adds the Dashboard; its sheet
  // lives in the tab, so it leaves with the tab.)
  const made = [...plugin.matchAll(/jsxs?\(\s*['"]style['"]\s*,\s*\{([^}]*)\}/g)]
  assert.equal(made.length, 2)
  assert.match(made[0][1], /children:\s*DASH_CSS\b/)
  assert.match(made[1][1], /children:\s*TALK_CSS\b/)
  assert.doesNotMatch(plugin, /dangerouslySetInnerHTML|createElement\(\s*['"]style|insertRule|adoptedStyleSheets|\.styleSheets|document\.head/)
  assert.equal(srcFiles.filter(f => /['"]style['"]\s*,/.test(read(f))).join(), 'src/dash.js,src/page.js')
  assert.doesNotMatch(plugin, /@font-face|\.woff|\.ttf/)
  assert.doesNotMatch(plugin, /fontFamily|boxShadow|textShadow/)
  // and the sheets inside the built file pass the same lints as every source file
  assert.deepEqual(colourFindings(TALK_CSS), [])
  assert.deepEqual(styleFindings(TALK_CSS), [])
  assert.deepEqual(colourFindings(DASH_CSS), [])
  assert.deepEqual(styleFindings(DASH_CSS), [])
})

test('the page paints no background of its own (the root and page columns carry no bg-*)', () => {
  for (const key of ['root', 'head', 'body', 'rail', 'detail', 'detailInner']) assert.doesNotMatch(K[key], /(^|\s)bg-/, key)
})
