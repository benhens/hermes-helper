// The built desktop/plugin.js: what Hermes and the catalog require (build-v1.md sections 3, 4, 9).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { buildSource } from '../scripts/build.mjs'
import { K, D, ICONS, TABLER_ICONS } from '../src/look.js'
import { STEPS } from '../src/steps.js'
import { DASH_DATA } from '../src/dash-data.js'
import { looksLikeKey } from '../src/key-check.js'
import { selectorFor, missingClasses } from '../scripts/check-hermes-classes.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
// normal-chat: the Hermes docs chunks (one data line, scripts/docs-data.mjs) are the docs' own prose and code samples
// for the model to read ("import(", "session_id", "document.querySelector" in a sample), not the plugin's program
const builtFile = fs.readFileSync(path.join(ROOT, 'desktop/plugin.js'), 'utf8')
const plugin = builtFile.replace(/^const DOCS_CHUNKS = .*$/m, '')
// Code without comments, so a rule can't pass or fail because of a comment. loom-fixes-2: a "/*" inside a
// double-quoted string is no comment (hhcontent's names list quotes the docs' "openai/*, openai-codex/*"), so those
// strings are stepped over whole
const code = plugin.replace(/"(?:[^"\\\n]|\\.)*"|\/\*[\s\S]*?\*\//g, m => (m[0] === '"' ? m : '')).replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1')
// The program without hhcontent's Dashboard text: that text is prose for the person, so the code rules below read
// the code only, and the text gets the pasted-key check instead. (dash-v1: the first build's step text, which this
// set aside before, left the built file with the step list.)
const DASH_BLOCK = /\nconst DASH_DATA = \{[\s\S]*?\n\}\n/
// dash-v2 (the two branches joined): the set-up conversation's data (the list's step texts again) is prose too
const SETUP_BLOCK = /\nconst SETUP_DATA = \{[\s\S]*?\n\}\n/
const codeOnly = code.replace(DASH_BLOCK, '\n').replace(SETUP_BLOCK, '\n')

test('desktop/plugin.js is the current build of src/ (nobody edited it by hand or forgot to build)', () => {
  assert.equal(builtFile, buildSource())
})

test('node --check passes', () => {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'desktop/plugin.js')])
})

test('imports only @hermes/plugin-sdk, react and react/jsx-runtime', () => {
  const specs = [...code.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1])
  assert.ok(specs.length >= 3)
  for (const s of specs) assert.ok(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'].includes(s), s)
  assert.doesNotMatch(code, /\bimport\s*\(/)
  assert.doesNotMatch(code, /\brequire\s*\(/)
})

test('every SDK name used is imported (a missing one is a ReferenceError at render)', () => {
  const imported = new Set(
    [...code.matchAll(/^import\s*\{([^}]*)\}\s*from/gm)].flatMap(m => m[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop()))
  )
  for (const name of ['ROUTES_AREA', 'SIDEBAR_NAV_AREA', 'host', 'useValue', 'Codicon', 'Switch', 'Button', 'SegmentedControl', 'CopyButton',
    'Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue',
    'Textarea', 'Tip', 'EmptyState', 'GlyphSpinner', 'RowButton', 'PRIMARY_ICON_BTN', 'composerInputBacking',
    'composerSurfaceRing', 'jsx', 'jsxs', 'useState', 'useEffect', 'useRef', 'useId']) {
    // (in the code, not in the Dashboard's words or the set-up list's step texts: a step there says "Switch one off")
    if (new RegExp(`\\b${name}\\b`).test(codeOnly.replace(/^import.*$/gm, ''))) assert.ok(imported.has(name), `${name} used but not imported`)
  }
})

test('sidebar row: "Helper", compass icon, no tier; page at the same path', () => {
  assert.match(code, /area:\s*SIDEBAR_NAV_AREA,\s*data:\s*\{\s*path:\s*PATH,\s*label:\s*'Helper',\s*codicon:\s*'compass'\s*\}/)
  assert.match(code, /area:\s*ROUTES_AREA,\s*data:\s*\{\s*path:\s*PATH\s*\}/)
  assert.match(code, /const PATH = '\/helper'/)
  assert.doesNotMatch(code, /\btier\s*:/)
})

// The id is what `hermes plugins install` and the install folder use, and it can't change once the
// catalog entry is in. The same id must be in all three places, or Hermes sees two plugins.
test('the plugin is "Helper", id helper, in plugin.yaml, package.json and the built file', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'plugin.yaml'), 'utf8'), /^name: helper$/m)
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).name, 'helper')
  assert.match(code, /const ID = 'helper'/)
  assert.match(code, /export default \{\s*id: ID,\s*name: 'Helper',/)
})

// The old name may stay in one place only: the hidden model-call task name (written with an
// underscore, which this search skips on purpose).
test('the old name is gone from everything a person can read', () => {
  const OLD = /helping[ -]?hand/i
  const files = ['plugin.yaml', 'package.json', 'README.md', 'content/README.md', 'content/steps-v1.json', 'scripts/build.mjs', 'desktop/plugin.js',
    ...fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')).map(f => 'src/' + f)]
  // live changes-7: the slow-AI paste text says "Helper's short calls" now, so talk-live-3's one exception is gone
  const found = files.flatMap(f => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter(l => OLD.test(l)).map(l => `${f}: ${l.trim().slice(0, 60)}`))
  assert.deepEqual(found, [])
})

test('helper panel is a div with role complementary, never an <aside>', () => {
  assert.doesNotMatch(code, /['"]aside['"]/)
  assert.doesNotMatch(code, /<aside/)
  assert.match(code, /role:\s*'complementary'/)
})

test('"no model" comes from setup.runtime_check; setup.status is read only after it says ok false', () => {
  assert.match(code, /'setup\.runtime_check'/)
  const ms = src('model-status.js')
  assert.equal((code.match(/setup\.status/g) || []).length, 1)
  const block = ms.slice(ms.indexOf('if (!rc.ok) {'), ms.indexOf("return { state: 'none', configured }"))
  assert.match(block, /request\('setup\.status'/)
})

// talk-live: the conversation's AI step asks the same way (src/live-turn.js, through model-call.js's params), so
// there are two places now; nowhere else.
// setup-chat: and a third, the recommendation's one sentence (src/setup-rec.js), asked the same way.
test('the model calls: only in model-call.js (the setup card), live-turn.js (the AI step) and setup-rec.js (the recommendation), task helping_hand, 90000 ms, never a session id', () => {
  const files = fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js'))
  for (const f of files) {
    if (f !== 'model-call.js' && f !== 'live-turn.js' && f !== 'setup-rec.js') assert.doesNotMatch(src(f), /'llm\.oneshot'/, f)
  }
  // loom-fixes-2 part B 1: and the set-up look's one check call (setup-rec.js MODEL_CHECK, a fixed text), the fourth
  assert.equal((code.match(/'llm\.oneshot'/g) || []).length, 4)
  assert.match(src('setup-rec.js'), /request\('llm\.oneshot', oneshotParams\(MODEL_CHECK\), ONESHOT_TIMEOUT_MS\)/)
  assert.match(src('setup-rec.js'), /export const MODEL_CHECK = \{ instructions: 'Reply with exactly: OK', input: 'Reply with exactly: OK', temperature: 0, max_tokens: 20 \}/)
  assert.match(src('setup-rec.js'), /request\('llm\.oneshot', liveParams\(instructions, REC_INPUT, REC_MAX_TOKENS\), ONESHOT_TIMEOUT_MS\)/)
  assert.match(src('live-turn.js'), /request\('llm\.oneshot', liveParams\(instructions, input, maxTokens\), ONESHOT_TIMEOUT_MS\)/)
  assert.match(src('live-request.js'), /oneshotParams\(\{ instructions, input, temperature: LV_IN\.temperature, max_tokens: maxTokens \}\)/)
  assert.match(src('model-call.js'), /request\('llm\.oneshot', oneshotParams\(call\), ONESHOT_TIMEOUT_MS\)/)
  assert.match(src('model-call.js'), /export const ONESHOT_TASK = 'helping_hand'/)
  assert.match(src('model-call.js'), /export const ONESHOT_TIMEOUT_MS = 90000/)
  assert.doesNotMatch(code, /session_id|sessionId/)
})

test('the model name never comes from host.state.model or config.get', () => {
  assert.doesNotMatch(code, /state\.model\b/)
  assert.doesNotMatch(code, /config\.get/)
})

test('the page reads only through read-only calls (no set, configure, write or send); the one newChat is the Dashboard\'s "New session" button', () => {
  // dash-v1: the Dashboard adds cron.manage and plugins.manage, each only with action 'list' (and Your setup's
  // reads left the built file with it)
  const methods = [...code.matchAll(/request\('([a-z_.]+)'/g)].map(m => m[1])
  // loom-fixes: the plugins read is gone (hhtech-loom-n1 1: no read gives the number Hermes's Plugins screen shows)
  assert.deepEqual([...new Set(methods)].sort(), ['cron.manage', 'free_tier.status', 'llm.oneshot', 'profiles.describe', 'setup.runtime_check', 'setup.status'])
  for (const m of code.matchAll(/request\('(cron|plugins)\.manage', \{([^}]*)\}/g)) assert.match(m[2], /^\s*action: 'list',/, m[0])
  // one: the set-up conversation's look at the scheduled jobs (loom-fixes: no plugins read; loom2: the Dashboard reads
  // nothing to decide what is done)
  assert.equal([...code.matchAll(/request\('(cron|plugins)\.manage'/g)].length, 1)
  assert.doesNotMatch(code, /setEnabled|profiles\.configure|set_asset|config\.set|composer\.setDraft|\.write\(/)
  // host.newChat only in the Dashboard's route button, and only when the person presses it (goTo)
  assert.deepEqual([...code.matchAll(/\bnewChat\(/g)].length, 1)
  assert.match(code, /if \(to === 'new-chat'\) host\.newChat\(\)/)
})

test('no raw globals the host cannot clean up, no reach into Hermes markup, no network', () => {
  assert.doesNotMatch(code, /\bwindow\.(setTimeout|setInterval|addEventListener)\b/)
  assert.doesNotMatch(code, /(?<![\w.])(setInterval|setTimeout)\(/)
  assert.doesNotMatch(code, /\bdocument\.(querySelector|getElementBy|getElementsBy|head|body)/)
  assert.doesNotMatch(code, /hermesDesktop/)
  assert.doesNotMatch(code, /\b(fetch|XMLHttpRequest|WebSocket|eval)\s*\(/)
  assert.doesNotMatch(code, /createElement\(\s*['"]script/)
})


test('no keys or credentials, never reads the full config', () => {
  assert.ok(DASH_BLOCK.test(code), 'the Dashboard data block is where the build puts it')
  assert.ok(SETUP_BLOCK.test(code), 'the set-up conversation\'s data block is where the build puts it')
  // exactly those two blocks were set aside (each leaves one line break behind)
  assert.equal(codeOnly.length, code.length - code.match(DASH_BLOCK)[0].length - code.match(SETUP_BLOCK)[0].length + 2)
  assert.ok(code.match(DASH_BLOCK)[0].length < 30000 && code.match(SETUP_BLOCK)[0].length < 30000, 'a block that swallowed code would be far longer')
  assert.doesNotMatch(codeOnly, /(api[_-]?key|secret|password|bearer)\s*[:=]/i)
  assert.doesNotMatch(code, /config\.get/)
  for (const it of DASH_DATA.items) assert.equal(looksLikeKey(JSON.stringify(it)), false, it.id)
})

test('the old helper header is gone from the built file: no Move, Close, "Show helper" or Chat log; the strip can still hide and show Helper', () => {
  for (const label of ['Move to the left', 'Move to the right', 'Close the helper', "'Show helper'", 'Chat log', 'arrow-swap']) {
    assert.ok(!code.includes(label), label)
  }
  for (const label of ['Hide the helper', 'Show the helper']) assert.ok(code.includes(label), label)
})

test('model names, counts and source tags in normal letters: mono is only for text to paste', () => {
  // Hermes keeps mono for code, paths and commands (hhdesign fixes 2 and 9, B3a item 4).
  for (const key of ['cardValue', 'chip', 'chipsLabel', 'cardTitle', 'cardState', 'rowNumber', 'rowNumberOn']) {
    assert.doesNotMatch(K[key], /font-mono/, key)
  }
  const mono = Object.entries(K).filter(([, v]) => /font-mono/.test(v)).map(([k]) => k)
  // and the text box on Helper's settings page: Hermes's own config-field.tsx draws a JSON value in
  // mono, and hhdesign drew this box that way (design/talk-r5/settings.html, "like memory.md");
  // talk v2 look: a line of that box that cannot be read, shown in a mono chip under it (hhdesign's
  // review of e86b410, section 3 point 3), and text to paste inside Helper's bubble, Hermes's own
  // small code card (notes-wants.md item 4), large and small; talk-live-3 (Lead's call on question 5 of the c18 report):
  // text to type inside a Helper line (/usage), in the paste box's code style
  // (dash-v1: mono, Hermes's font-mono for the Dashboard's commands to paste)
  assert.deepEqual(mono, ['cardPasteText', 'settingsBox', 'settingsRefusedLine', 'bubblePasteText', 'bubblePasteTextOld', 'typed', 'mono'])
})

test('header clears Hermes\'s title-bar band, where its window buttons float (top-right corner stays empty)', () => {
  // Same top padding as Hermes's own Capabilities page header (app/page-search-shell.tsx).
  assert.match(K.head, /(^|\s)pt-\[calc\(var\(--titlebar-height\)\+1\.5rem\)\](\s|$)/)
})

const src = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')

// The props object of every jsx(<name>, {...}) call in a source file (balanced braces).
function propsOf(text, name) {
  const out = []
  const start = `jsx(${name}, {`
  for (let i = text.indexOf(start); i !== -1; i = text.indexOf(start, i + 1)) {
    let depth = 0
    let j = i + start.length - 1
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++
      else if (text[j] === '}' && --depth === 0) break
    }
    out.push(text.slice(i + start.length, j))
  }
  return out
}

test('every class comes from the two class tables (K: Hermes\'s own classes; T: our style sheet for Helper\'s window): page code writes no class string of its own', () => {
  for (const f of ['page.js', 'setup-tab.js', 'character.js', 'reveal.js', 'eyes.js', 'expressions.js', 'motion.js', 'main.js', 'talk-view.js', 'bubble-link.js', 'talk.js', 'layout.js', 'state.js']) {
    assert.doesNotMatch(src(f), /className:\s*['"`]/, `${f} has a literal className`)
    // cx(...) may hold K and T values and conditions, never a class string.
    // A className is a K or T value, a cx(...) of them, or a choice between them: never a class string.
    for (const m of src(f).matchAll(/className:\s*/g)) {
      const rest = src(f).slice(m.index + m[0].length)
      let depth = 0
      let end = 0
      for (; end < rest.length; end++) {
        const c = rest[end]
        if (c === '(') depth++
        else if (c === ')' && depth-- === 0) break
        else if ((c === ',' || c === '}' || c === '\n') && depth === 0) break
      }
      const expr = rest.slice(0, end).replace(/[!=]==\s*'[^']*'/g, '')
      assert.doesNotMatch(expr, /['"`]/, `${f}: className: ${rest.slice(0, end)}`)
    }
    for (const m of src(f).matchAll(/cx\(([^)]*)\)/g)) {
      const args = m[1].replace(/[!=]==\s*'[^']*'/g, '')
      assert.doesNotMatch(args, /['"`]/, `${f}: cx(${m[1]})`)
    }
  }
})

test('no tabs (loom2: his Loom of 11 Nov, 1:51 "just have this set up"): no tab list, no tab, no Learn; never the SegmentedControl pill', () => {
  assert.doesNotMatch(src('page.js'), /SegmentedControl/)
  assert.doesNotMatch(src('page.js'), /TABS|TAB_IDS|role: 'tablist'|role: 'tab'|tabpanel|notBuilt/)
  assert.doesNotMatch(src('page.js'), /'Your setup'|label: 'Setup'/)
})

test('buttons are Hermes Button components; bare <button>s only where Hermes uses them too', () => {
  // On the page: Helper's strip (PaneTab vertical / kanban rail are plain buttons) and "Skip" in the message box.
  // (dash-v1: the step's choice cards left with the step; loom2: the text tabs left with the tabs.)
  const bare = [...src('page.js').matchAll(/jsxs?\(\s*'button',\s*\{\s*type: 'button',\s*(['\w-]+)/g)].map(m => m[1])
  assert.deepEqual(bare.sort(), ['className', 'className'])
  assert.equal([...src('page.js').matchAll(/jsxs?\(\s*'button'/g)].length, 2)
  // loom2: on the Dashboard each set-up card is one real <button type="button"> wearing D classes (a whole card that
  // opens; no Hermes component is a card that is a button); every other button there is Hermes's
  const stops = [...src('dash.js').matchAll(/'button',\s*\{\s*type: 'button',\s*className: (cx\(D\.scard,[^\n]*\)),/g)].map(m => m[1])
  assert.equal(stops.length, 1)
  // loom-fixes (Lead's point 15): a tile that opens Hermes's own screen is the whole tile as one real <button
  // type="button"> wearing D classes (no Hermes component is a card that is a button); the bots tile stays a <div>
  const tiles = [...src('dash.js').matchAll(/'button',\s*\{\s*type: 'button',\s*className: (cx\(D\.tile, D\.tileBtn\)),/g)].map(m => m[1])
  assert.equal(tiles.length, 1)
  assert.equal([...src('dash.js').matchAll(/jsxs?\(\s*'button'/g)].length, 2)
  assert.match(src('page.js'), /jsx\('button', \{ type: 'button', className: T\.skip,/)
  assert.doesNotMatch(src('setup-tab.js'), /jsxs?\(\s*'button'/)
  // In Helper's window (src/talk-view.js): the answers to pick, a button inside the bubble and an
  // older line's small link are our own shapes from hhdesign's sheet (row 11 of the plan), each a
  // real <button type="button"> wearing a class of the T table and nothing else.
  const own = [...src('talk-view.js').matchAll(/'button',\s*\{\s*type: 'button',\s*className: (T\.\w+|cx\(T\.\w+, a\.more && T\.more\)),/g)].map(m => m[1])
  // (talk v2: and the links in the faint lines, "See what I keep" and "Change", wearing T.link;
  // talk v2 look: "More" among the answers also wears T.more)
  // (chat-fix: a quick reply under the model's reply wears T.answer, as the things to pick do; an older reply's link
  // to its card wears T.oldLink, as an older line's other links do)
  assert.deepEqual(own.sort(), ['T.answer', 'T.button', 'T.link', 'T.link', 'T.oldLink', 'T.oldLink', 'cx(T.answer, a.more && T.more)'])
  assert.equal([...src('talk-view.js').matchAll(/jsxs?\(\s*'button'/g)].length, 7)
  // Helper's settings page uses Hermes's Button only
  assert.doesNotMatch(src('settings-page.js'), /jsxs?\(\s*'button'/)
})

test('every codicon named in the code is in the ICONS list (which hermes-checks.sh checks against Hermes)', () => {
  // A name written straight (name: 'x'), picked between two (name: a ? 'x' : 'y'), or handed out
  // by talk-view.js's nextIcon().
  // dash-v1: and the Dashboard's table of Hermes's own icons (codicon: 'x' in DASH_ICONS); setup-tab.js is parked
  const files = ['page.js', 'main.js', 'talk-view.js', 'bubble-link.js', 'dash.js']
  const named = files.flatMap(f => [
    ...[...src(f).matchAll(/(?:name|icon|codicon):\s*'([a-z-]+)'/g)].map(m => m[1]),
    ...[...src(f).matchAll(/(?:name|icon|codicon):\s*[^,'{}]+\?\s*'([a-z-]+)'\s*:\s*'([a-z-]+)'/g)].flatMap(m => [m[1], m[2]]),
    ...[...src(f).matchAll(/nextIcon = [^\n]*\?\s*'([a-z-]+)'\s*:\s*'([a-z-]+)'/g)].flatMap(m => [m[1], m[2]])
  ])
  for (const n of named) assert.ok(ICONS.includes(n), `${n} not in ICONS`)
  // and the list holds no name the code has stopped using
  assert.deepEqual([...new Set(named)].sort(), [...ICONS].sort())
  // every Codicon in these files takes its name in one of those three ways
  for (const f of files) for (const m of src(f).matchAll(/jsx\(Codicon, \{ name: ([^,}]+)/g)) assert.match(m[1].trim(), /^'[a-z-]+'$|\?\s*'[a-z-]+'\s*:\s*'[a-z-]+'$|^nextIcon\(\w+(\.\w+)?\)$|^icon\.codicon$/, `${f}: ${m[0]}`)
  // the Tabler ones: only the three Hermes shows for Model, Memory and Safety, taken from the SDK's icons
  const tabler = [...src('dash.js').matchAll(/tabler: '(\w+)'/g)].map(m => m[1])
  assert.deepEqual([...new Set(tabler)].sort(), [...TABLER_ICONS].sort())
  assert.doesNotMatch(plugin, /@tabler\/icons-react|@\/lib\/icons/)
})

test('the step list left the built file with the step (dash-v1: parked in src/, not joined)', () => {
  STEPS.forEach((s, i) => assert.equal(s.number, i + 1))
  assert.doesNotMatch(plugin, /---- src\/(steps|steps-data|setup-tab|setup-cards)\.js ----/)
  assert.doesNotMatch(code, /I understand, next step|Ask about this step/)
})

test('Hermes Buttons get no size, padding or radius overrides beyond Hermes\'s own patterns', () => {
  // Allowed: the composer's own send class. Anything else would restyle Hermes's button.
  const allowed = new Set()
  // dash-v1: the Dashboard's Buttons instead of the parked Your setup's
  const buttons = [...propsOf(src('page.js'), 'Button'), ...propsOf(src('dash.js'), 'Button')]
  assert.ok(buttons.length >= 3, `found ${buttons.length} Button calls`)
  for (const props of buttons) {
    const cls = props.match(/className:\s*(cx\([^)]*\)|[^,\n]+)/)
    if (!cls) continue
    const expr = cls[1].trim()
    if (expr === 'cx(PRIMARY_ICON_BTN, K.composerSend)') continue
    const key = expr.match(/^K\.(\w+)$/)
    assert.ok(key && allowed.has(K[key[1]]), `Button className ${expr}`)
  }
  for (const key of ['composerSend']) assert.doesNotMatch(K[key], /(^|\s)(h|w|size|p[xytrbl]?|text-\[)/, key)
})

test('the character is one swappable component, used only through <Character>', () => {
  assert.match(src('character.js'), /export function Character\(/)
  assert.equal((src('page.js').match(/jsx\(Character,/g) || []).length >= 1, true)
  assert.doesNotMatch(src('page.js'), /<svg|'svg'/)
  assert.match(src('character.js'), /var\(--ui-accent\)/)
})

test('the character is drawn, not loaded: no picture, no data URL, no sprite sheet anywhere in the built file', () => {
  assert.doesNotMatch(code, /data:image|base64|\.(png|webp|gif|jpe?g|svg)['"`)?#]/)
  assert.doesNotMatch(code, /maskImage|WebkitMask|background-image|backgroundImage/)
  assert.doesNotMatch(code, /jsxs?\(\s*['"](img|image|canvas|picture|object|embed|use)['"]/)
  // loom2 point 6 (Lead's job): one <video>, the set-up card's own video in src/dash.js, never in the character
  assert.equal([...code.matchAll(/jsxs?\(\s*['"]video['"]/g)].length, 1)
  assert.equal([...src('dash.js').matchAll(/jsxs?\(\s*['"]video['"]/g)].length, 1)
  assert.doesNotMatch(src('character.js'), /video/)
  // the 9 Nov sprite-sheet slot and the drawn hand's poses are gone (commit cff33f6 has them)
  assert.equal(fs.existsSync(path.join(ROOT, 'src', 'pet-sheet.js')), false)
  // (loom-fixes: the names from the Hermes docs hold "pets (petdex mascots)", a docs page's title, so the word is
  // looked for outside that list)
  assert.doesNotMatch(code.replace(/const NAMES_DATA = \[[\s\S]*?\n\]\n/, ''), /PET_SHEET|POSE_ROW|poseFor|spriteLayer|petdex/)
  // one colour: the accent is the only theme colour the character names
  const colours = [...src('character.js').matchAll(/var\(--[\w-]+\)/g)].map(m => m[0])
  assert.deepEqual([...new Set(colours)], ['var(--ui-accent)'])
  for (const f of ['expressions.js', 'eyes.js', 'reveal.js', 'motion.js']) assert.doesNotMatch(src(f), /var\(--/, f)
})

test('the eyes listen on our own page only: nothing is put on the Hermes window or document', () => {
  assert.doesNotMatch(code, /ctx\.addEventListener/)
  assert.doesNotMatch(code, /\b(window|document|globalThis|self)\s*\.\s*(addEventListener|on(pointer|mouse)\w*)/)
  // the single listener the plugin adds is the watch on the reduce-motion setting itself
  const added = [...code.matchAll(/(\w+)\.addEventListener\(\s*'([^']+)'/g)].map(m => `${m[1]}:${m[2]}`)
  assert.deepEqual(added, ['setting:change'])
  assert.equal((code.match(/removeEventListener\(/g) || []).length, 1)
  // cursor, focus and scroll reach the eyes through React handlers on the page's outer box
  const page = src('page.js')
  const rootBox = page.slice(page.lastIndexOf('return jsxs('))
  for (const handler of ['onPointerMove', 'onPointerLeave', 'onFocus', 'onBlur', 'onScrollCapture']) assert.ok(rootBox.includes(handler + ':'), handler)
  assert.equal((page.match(/onPointerMove:/g) || []).length, 1)
  // The page tests draw the character with stand-in hooks, so they cannot see the eyes move: the
  // wiring is checked here by its shape, and in the real app (dev/checks/character-v2-shots).
  assert.match(rootBox, /onPointerMove: e => eyes\.current\.pointerMove\(e\.clientX, e\.clientY\)/)
  assert.match(rootBox, /onFocus: e => eyes\.current\.focus\(e\.target\)/)
  assert.match(page, /jsx\(Character, \{[^}]*\beyes: eyes\.current\b[^}]*\}\)/)
  assert.match(page, /eyes\.current = makeEyes\(\{ setTimeout: \(fn, ms\) => ctx\.setTimeout\(fn, ms\) \}\)/)
  // drawn frames and the reduce-motion check are asked for in one place each
  assert.equal((code.match(/requestAnimationFrame\(/g) || []).length, 1)
  assert.equal((code.match(/\bmatchMedia\(/g) || []).length, 2)
})

test('Hermes-class checker: escapes like Tailwind and finds a missing class (it bites)', () => {
  assert.equal(selectorFor('pt-[calc(var(--titlebar-height)+1.5rem)]'), '.pt-\\[calc\\(var\\(--titlebar-height\\)\\+1\\.5rem\\)\\]')
  assert.equal(selectorFor('hover:bg-accent/60'), '.hover\\:bg-accent\\/60')
  const css = '.flex{display:flex}.hover\\:bg-accent\\/60:hover{x:y}.px-6{x:y}'
  assert.deepEqual(missingClasses(css, { a: 'flex hover:bg-accent/60 px-6' }).missing, [])
  assert.deepEqual(missingClasses(css, { a: 'flex px-60 made-up' }).missing, ['made-up', 'px-60'])
})
