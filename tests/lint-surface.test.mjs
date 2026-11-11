// release round 20:25: Hermes's desktop-surface lint (hermes_cli/plugin_validate_desktop.py; `hermes plugins
// validate` and the catalog's CI run it) finds nothing in the built desktop/plugin.js: none of its refusals and none
// of its review cues, in the plugin's code or in the docs text (scripts/lint-patterns.mjs has the patterns, with the
// lint's comment stripping). The docs text still says what the docs say: only the way it is written changed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintHits, REFUSED, REVIEW } from '../scripts/lint-patterns.mjs'
import { escapedString } from '../scripts/docs-data.mjs'
import { DOCS_CHUNKS } from '../src/docs-data.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const built = fs.readFileSync(path.join(ROOT, 'desktop/plugin.js'), 'utf8')

test('the built desktop/plugin.js has no hit of any of the lint\'s patterns (refused or review)', () => {
  const hits = lintHits(built).map(h => `${h.rule} (desktop/plugin.js:${h.line}): ${JSON.stringify(h.text.slice(0, 60))}`)
  assert.deepEqual(hits, [])
})

// the patterns bite: each of these, as the docs or a plugin could write it, is found (so the test above is not empty)
const SAMPLES = [
  ['dynamic code evaluation', 'x = eval(code)'],
  ['dynamic code evaluation', 'new Function("a")'],
  ['dynamic import outside the SDK', 'await import("lodash")'],
  ['remote import outside the SDK', "import x from 'https://e.x/a.js'"],
  ['script injection', "document.createElement('script')"],
  ['script injection', 'el.innerHTML = "<script src=x>"'],
  ['app DOM reach', 'document.querySelector(\'[data-slot="sidebar"]\')'],
  ['app DOM reach', 'm.observe(document.body, { childList: true })'],
  ['preview guest reach', "document.querySelector('webview')"],
  ['raw bridge window.hermesDesktop', 'window.hermesDesktop.files'],
  ['app markup selector', 'const s = "[data-tree-tab=x]"']
]
test('every pattern finds its sample, also inside a string literal', () => {
  assert.equal(new Set(SAMPLES.map(s => s[0])).size, new Set([...REFUSED, ...REVIEW].map(p => p[0])).size)
  for (const [rule, code] of SAMPLES) {
    assert.ok(lintHits(code).some(h => h.rule === rule), `${rule} not found in ${code}`)
    assert.ok(lintHits(JSON.stringify(code)).some(h => h.rule === rule), `${rule} not found in the literal of ${code}`)
  }
  // a comment is stripped the way the lint strips it
  assert.deepEqual(lintHits('// eval(x)\n/* <script */ a()'), [])
  // the import of the SDK or react is allowed
  assert.deepEqual(lintHits('import("@hermes/plugin-sdk")'), [])
})

test('the docs data escaping: no hit left, and the text reads back the same', () => {
  for (const [, code] of SAMPLES) {
    const lit = escapedString(code + '\n' + code)
    assert.deepEqual(lintHits(lit), [], lit)
    assert.equal(JSON.parse(lit), code + '\n' + code)
  }
  // a hit right after an escape such as \n: the escape is left whole
  const s = 'a\new Function(x) \\eval( \u00e9eval('
  assert.equal(JSON.parse(escapedString(s)), s)
  assert.deepEqual(lintHits(escapedString(s)), [])
  // the docs still quote the code: the escaping is only in how the file writes it
  const all = DOCS_CHUNKS.map(c => c[3]).join('\n')
  assert.ok(all.includes('eval('))
  assert.ok(all.includes('<script'))
  assert.ok(all.includes('window.hermesDesktop'))
})
