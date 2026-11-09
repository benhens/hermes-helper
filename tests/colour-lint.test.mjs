// build-v1.md section 4: no colour, font or shadow value of our own; the page wears Hermes's look.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { colourFindings, styleFindings, paletteClassFindings } from './lib/colour-lint.mjs'
import { K } from '../src/look.js'

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
})

test('the style lint catches fonts and shadows of our own (it bites)', () => {
  assert.ok(styleFindings('.a{font-family:Inter, sans-serif}').length)
  assert.ok(styleFindings('.a{font:400 14px/20px Inter}').length)
  assert.ok(styleFindings('@font-face{font-family:var(--font-sans);src:url(x.woff)}').length)
  assert.ok(styleFindings('.a{box-shadow:0 2px 4px var(--ui-base)}').length)
  assert.deepEqual(styleFindings('.a{font:400 14px/20px var(--font-sans);box-shadow:var(--shadow-sm)}'), [])
})

test('no stylesheet of our own: no <style> element, no fonts, no font or shadow styles inline', () => {
  assert.doesNotMatch(plugin, /['"]style['"]\s*,/)
  assert.doesNotMatch(plugin, /@font-face|\.woff|\.ttf/)
  assert.doesNotMatch(plugin, /fontFamily|boxShadow|textShadow/)
})

test('the page paints no background of its own (the root and page columns carry no bg-*)', () => {
  for (const key of ['root', 'head', 'body', 'rail', 'detail', 'detailInner']) assert.doesNotMatch(K[key], /(^|\s)bg-/, key)
})
