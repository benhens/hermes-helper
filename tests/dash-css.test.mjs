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

test('every selector is one of our own hhd- classes (in the light theme, under Hermes\'s html:not(.dark)); the only other lines are the ring\'s registered angle, its turn and its reduced-motion rule', () => {
  // look: three lines are not plain rules (the ring of Hermes's Capabilities cards, turned by CSS alone)
  const atRules = rules.filter(r => r.startsWith('@'))
  assert.deepEqual(atRules, [
    "@property --hhd-arc{syntax:'<angle>';inherits:false;initial-value:0deg}",
    '@keyframes hhd-arc-turn{to{--hhd-arc:360deg}}',
    // look-fix: a banner narrower than 600 px draws no character, only the dot field at 30%
    `@container (max-width:599px){.${D.bannerChar}{display:none}.${D.bannerArt}{width:100%;opacity:.3}.${D.bannerTitle},.${D.bannerLine},.${D.bannerOpen}{max-width:100%}}`,
    `@media (prefers-reduced-motion:reduce){.${D.tile}::after,.${D.scard}::after,.${D.steps}::after{animation:none}}`,
    // look-fix (PICK.md way 3): the card's sign 96 px (140 x .686) at .5 under 300 px of card, gone under 240 px
    `@container (max-width:299px){.${D.scardSign}{transform:scale(.686);transform-origin:100% 50%;opacity:.5}}`,
    `@container (max-width:239px){.${D.scardSign}{display:none}.${D.scardWhy}{max-width:none}}`
  ])
  for (const rule of rules.filter(r => !r.startsWith('@'))) for (const sel of selectorsOf(rule)) assert.match(sel, /^(html:not\(\.dark\) )?\.hhd-[\w.:\s-]*(\.hhd-[\w-]+|::?[\w-]+(\([^)]*\))?)*$/, sel)
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

test('look-fix: four accents only (blue, orange, purple, green), named only by the four accent classes; red, cyan and yellow are not used; done is always --ui-green; nothing else on the tab names a warning colour', () => {
  const warn = /--ui-(red|yellow|orange|green|cyan)|destructive|warning/
  const ORDER = ['blue', 'orange', 'purple', 'green']
  assert.deepEqual(Object.keys(D).filter(k => /^acc\d$/.test(k)), ['acc0', 'acc1', 'acc2', 'acc3'])
  assert.doesNotMatch(DASH_CSS, /--ui-(red|cyan|yellow)/)
  const accentRules = ORDER.map((name, i) => `.${D['acc' + i]}{--hhd-accent:var(--ui-${name})}`)
  for (const r of accentRules) assert.ok(rules.includes(r), r)
  const DONE = [`.${D.done} .${D.tileIcon}{background:var(--ui-green);color:var(--background)}`, rules.find(r => r.startsWith(`.${D.doneLine}{`))]
  assert.deepEqual(rules.filter(r => /--ui-(blue|orange|purple|green|red|cyan|yellow)/.test(r)), [...accentRules, ...DONE])
  assert.doesNotMatch(rules.filter(r => !accentRules.includes(r) && !DONE.includes(r)).join('\n'), warn)
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

// look: Hermes's Capabilities card (catalog.css lines 26 to 44), under our own classes
const WASH = 'background:radial-gradient(140% 100% at 0% var(--hhd-rest-y),color-mix(in srgb,var(--hhd-accent) var(--hhd-tint),transparent),transparent 70%) var(--ui-chat-bubble-background)'
const BOXES = [D.tile, D.scard, D.steps]

test('look: every box (tile, set-up card, opened panel) is a Capabilities card: Hermes\'s surface under the wash of its accent (dark: top left, 11%; light: bottom left, 6%), Hermes\'s corners, a transparent border, 20 px padding, no shadow', () => {
  const rule = sel => rules.find(r => r.startsWith(sel + '{')) || ''
  assert.match(rule(`.${D.stats}`), /grid-template-columns:repeat\(3,minmax\(0,1fr\)\);gap:20px/)
  assert.match(rule(`.${D.main}`), /gap:20px/)
  for (const box of BOXES) {
    const r = rule(`.${box}`)
    assert.ok(r.includes(WASH), box)
    assert.match(r, /--hhd-rest-y:0%;--hhd-tint:11%/, box)
    assert.match(r, /border:1px solid transparent;border-radius:var\(--radius-lg\);padding:20px/, box)
    assert.ok(rules.includes(`html:not(.dark) .${box}{--hhd-rest-y:100%;--hhd-tint:6%}`), box)
    // the old look is gone: no --ui-bg-elevated on a box, and the surface does not change on hover
    assert.doesNotMatch(r, /--ui-bg-elevated|--ui-bg-tertiary/, box)
    assert.equal(rule(`.${box}:hover`), '', box)
  }
  assert.equal(rule(`.${D.tileBtn}:hover`), '')
  // the icon square and the icon take the box's accent
  assert.match(rule(`.${D.tileIcon}`), /width:40px;height:40px;border-radius:var\(--radius-lg\);background:color-mix\(in srgb,var\(--hhd-accent\) 16%,transparent\);color:var\(--hhd-accent\)/)
  assert.match(rule(`.${D.tileNum}`), /font-size:28px;line-height:32px;font-weight:600/)
  // the light theme's inset hairline stays
  assert.equal(rule(`html:not(.dark) .${D.scard}`), `html:not(.dark) .${D.scard}{box-shadow:inset 0 0 0 1px var(--ui-stroke-tertiary)}`)
  assert.equal(rule(`html:not(.dark) .${D.tile}`), `html:not(.dark) .${D.tile}{box-shadow:inset 0 0 0 1px var(--ui-stroke-tertiary)}`)
})

test('look: the words as in the catalog cards: a name 1.125rem / 600 in --ui-text-primary; the sentence under it at Hermes\'s caption size, line-height 1.625, in --ui-text-secondary (never tertiary)', () => {
  const rule = sel => rules.find(r => r.startsWith(sel + '{')) || ''
  for (const name of [D.scardName, D.tileName]) assert.match(rule(`.${name}`), /font-size:1\.125rem;line-height:1\.4;font-weight:600;color:var\(--ui-text-primary\)/, name)
  for (const line of [D.scardWhy, D.tileLine, D.tileLabel, D.bannerLine]) {
    assert.match(rule(`.${line}`), /font-size:var\(--conversation-caption-font-size\);line-height:1\.625;color:var\(--ui-text-secondary\)/, line)
  }
  // the head: a Capabilities section heading (catalog-discovery.css .catalog-section-heading h2), sentence case
  assert.equal(rule(`.${D.title}`), `.${D.title}{margin:0;font-size:1.4rem;font-weight:600;letter-spacing:-.025em;color:var(--ui-text-primary)}`)
  assert.doesNotMatch(DASH_CSS, /hhd-count/)
})

test('look: the ring of catalog.css on every tile and card and on the opened panel: a 1.5 px conic ring in --color-primary that fades in over 0.35 s on hover and focus, turned once every 4 s by a CSS animation of the registered --hhd-arc; still with reduced motion; the opened card keeps it on', () => {
  const ring = rules.find(r => r.startsWith(`.${D.tile}::after,.${D.scard}::after,.${D.steps}::after{`)) || ''
  assert.match(ring, /content:'';position:absolute;inset:0;padding:1\.5px;border-radius:inherit;pointer-events:none/)
  assert.match(ring, /background:conic-gradient\(from var\(--hhd-arc\),transparent 0deg,var\(--color-primary\) 60deg,transparent 130deg\)/)
  assert.match(ring, /mask-composite:exclude;opacity:0;transition:opacity \.35s ease;animation:hhd-arc-turn 4s linear infinite paused/)
  const on = rules.find(r => r.endsWith('{opacity:1;animation-play-state:running}')) || ''
  assert.deepEqual(selectorsOf(on), [`.${D.tile}:hover::after`, `.${D.tile}:focus-within::after`, `.${D.scard}:hover::after`, `.${D.scard}:focus-within::after`, `.${D.scard}.${D.sel}::after`, `.${D.steps}:hover::after`, `.${D.steps}:focus-within::after`])
  assert.ok(rules.includes("@property --hhd-arc{syntax:'<angle>';inherits:false;initial-value:0deg}"))
  assert.ok(rules.includes('@keyframes hhd-arc-turn{to{--hhd-arc:360deg}}'))
  assert.ok(rules.includes(`@media (prefers-reduced-motion:reduce){.${D.tile}::after,.${D.scard}::after,.${D.steps}::after{animation:none}}`))
  for (const box of [D.tile, D.scard, D.steps]) assert.match(rules.find(r => r.startsWith(`.${box}{`)), /position:relative/, box)
  // no script animation on the Dashboard's own drawing
  assert.doesNotMatch(read('src/dash.js'), /\.animate\(/)
})

test('look-fix: the banner (mockup dash-look-r8): 20 px padding, 12 px gap, at least 200 px tall, isolated, clipped at its edge, the darker surface (a 22% wash of the theme colour from the top left); the words in the left 56%; the picture in the right 42%, fading in from the left; the character\'s bottom on the banner\'s bottom edge; under 600 px no character, the dots at 30%', () => {
  const rule = sel => rules.find(r => r.startsWith(sel + '{')) || ''
  const b = rule(`.${D.banner}`)
  for (const part of ['isolation:isolate', 'gap:12px', 'min-height:200px', 'padding:20px', 'overflow:hidden', 'container-type:inline-size', 'border-radius:var(--radius-lg)', 'background:radial-gradient(140% 100% at 0% 0%,color-mix(in srgb,var(--color-primary) 22%,transparent),transparent 70%) var(--ui-chat-bubble-background)']) assert.ok(b.includes(part), part)
  assert.match(rule(`.${D.bannerEyebrow}`), /font-size:\.75rem;color:var\(--ui-text-tertiary\)/)
  assert.match(rule(`.${D.bannerTitle}`), /max-width:56%;font-size:2rem;line-height:1\.2;font-weight:600;letter-spacing:-\.025em;color:var\(--ui-text-primary\)/)
  assert.match(rule(`.${D.bannerLine}`), /max-width:56%/)
  assert.match(rule(`.${D.bannerOpen}`), /max-width:56%/)
  const art = rule(`.${D.bannerArt}`)
  for (const part of ['position:absolute', 'inset:0 0 0 auto', 'width:42%', 'height:100%', 'z-index:-1', 'mask-image:linear-gradient(to right,transparent,var(--ui-base) 45%)']) assert.ok(art.includes(part), part)
  // the dots: the theme's colour, 2 px on a 9 px grid, and 3.5 px on an 18 px grid over the right third; both thinned by a soft mask
  const DOT = 'color-mix(in srgb,var(--color-primary) 80%,var(--ui-text-primary))'
  assert.ok(rule(`.${D.bannerDots}`).includes(`background:radial-gradient(circle,${DOT} 1px,transparent 1.2px) 0 0/9px 9px`))
  assert.ok(rule(`.${D.bannerDots2}`).includes(`background:radial-gradient(circle,${DOT} 1.75px,transparent 1.95px) 0 0/18px 18px`))
  assert.match(rule(`.${D.bannerDots2}`), /width:33\.333%/)
  assert.match(rule(`.${D.bannerDots}`), /opacity:\.85/)
  assert.match(rule(`.${D.bannerDots2}`), /opacity:\.75/)
  for (const d of [D.bannerDots, D.bannerDots2]) assert.match(rule(`.${d}`), /mask-image:radial-gradient\(120% 130% at 100% 0%,var\(--ui-base\) 25%,transparent 75%\)/, d)
  // the character's fingers end on the banner's bottom edge; nothing hangs below it
  assert.match(rule(`.${D.bannerChar}`), /position:absolute;right:5%;bottom:0;z-index:-1;pointer-events:none/)
  assert.doesNotMatch(DASH_CSS, /bottom:-/)
  // narrow: the container rule (checked whole in the at-rules test)
  assert.ok(rules.some(r => r.startsWith('@container (max-width:599px){') && r.includes(`.${D.bannerChar}{display:none}`) && r.includes(`.${D.bannerArt}{width:100%;opacity:.3}`)))
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

test('look-fix: a marked card: its icon square filled with --ui-green and "Done" in --ui-green, whatever the card\'s accent; "Start here" in the theme\'s accent; the opened card keeps the ring on (no outline, no shadow)', () => {
  assert.equal(ruleOf(`.${D.done} .${D.tileIcon}`), `.${D.done} .${D.tileIcon}{background:var(--ui-green);color:var(--background)}`)
  assert.match(ruleOf(`.${D.doneLine}`), /font-weight:600;color:var\(--ui-green\)/)
  assert.match(ruleOf(`.${D.start}`), /color:var\(--ui-accent\)/)
  assert.equal(ruleOf(`.${D.scard}.${D.sel}`), '')
  assert.ok(rules.some(r => selectorsOf(r).includes(`.${D.scard}.${D.sel}::after`) && r.endsWith('{opacity:1;animation-play-state:running}')))
  assert.match(ruleOf(`.${D.scard}:focus-visible`), /outline:2px solid var\(--ui-text-secondary\)/)
})

test('look: the corners are Hermes\'s own: --hhd-round is gone, and every corner of a banner, card, tile, panel, icon square, waiting block and video place is var(--radius-lg)', () => {
  assert.doesNotMatch(DASH_CSS, /--hhd-round/)
  assert.doesNotMatch(sheet, /--hhd-round/)
  const radii = [...DASH_CSS.matchAll(/border-radius:([^;}]+)/g)].map(m => m[1])
  // what is left is no box of its own: the ring follows its box, the picture follows the banner's right side, the 2 px pointer
  assert.deepEqual([...new Set(radii)].sort(), ['0 var(--radius-lg) var(--radius-lg) 0', '2px', 'inherit', 'var(--radius-lg)'])
  for (const sel of [`.${D.banner}`, `.${D.scard}`, `.${D.tile}`, `.${D.steps}`, `.${D.tileIcon}`, `.${D.wait}`, `.${D.video}`, `.${D.videoSoon}`]) assert.match(ruleOf(sel), /border-radius:var\(--radius-lg\)/, sel)
  // the video place is also drawn in Helper's window: nothing in its rules is a variable of our own
  for (const sel of [`.${D.video}`, `.${D.videoSoon}`, `.${D.videoName}`]) assert.doesNotMatch(ruleOf(sel), /--hhd-/, sel)
})

test('at the narrow size a tile\'s word may take a second line rather than run out of its tile (a 340 px left side leaves a tile 65 px of room)', () => {
  assert.match(ruleOf(`.${D.tileLabel}`), /white-space:nowrap/)
  assert.equal(ruleOf(`.${D.compact} .${D.tileLabel}`), `.${D.compact} .${D.tileLabel}{white-space:normal}`)
  // loom2: on a tile that is a button (skills, plugins) the word may wrap at any size: in the app at 1180 px "See them in
  // Capabilities" ran past the plugins tile's edge by a few pixels
  assert.equal(ruleOf(`.${D.tileBtn} .${D.tileLabel}`), `.${D.tileBtn} .${D.tileLabel}{white-space:normal}`)
})

test('look-fix: the opened card: the video place 320 px wide (16:9) at the left, the steps to its right, wrapping under it below 700 px of panel (320 + 20 + 320 px of room); no room kept for the close button', () => {
  for (const v of [D.video, D.videoSoon]) assert.match(ruleOf(`.${v}`), /flex:none;.*width:320px;max-width:100%;aspect-ratio:16\/9/, v)
  assert.match(ruleOf(`.${D.steps}`), /display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px 20px;.*padding:20px;/)
  assert.match(ruleOf(`.${D.stepsBody}`), /flex:1 1 320px/)
  assert.doesNotMatch(ruleOf(`.${D.steps}`), /padding:20px 44px/)
})

test('look-fix: tiles keep the icon left of the words at every width; the line under the number never runs past two lines', () => {
  assert.doesNotMatch(DASH_CSS, /\.hhd-compact \.hhd-tile\{[^}]*flex-direction:column/)
  assert.match(ruleOf(`.${D.tileLine}`), /-webkit-line-clamp:2;overflow:hidden/)
})

test('look-fix (PICK.md way 3): each set-up card draws its sign large in dots at its right: 140 px, right -8px, centred, behind the words at .8 in the card\'s accent, masked by a 4 px dot grid and a fade from the left; the card clips; the why-line keeps 64%', () => {
  const s = ruleOf(`.${D.scardSign}`)
  for (const part of ['position:absolute', 'right:-8px', 'top:calc(50% - 70px)', 'z-index:-1', 'width:140px', 'height:140px', 'opacity:.8', 'color:var(--hhd-accent)', 'pointer-events:none', 'mask-size:4px 4px,100% 100%', 'mask-composite:intersect']) assert.ok(s.includes(part), part)
  assert.match(ruleOf(`.${D.scard}`), /position:relative;isolation:isolate;overflow:hidden/)
  assert.match(ruleOf(`.${D.scardWhy}`), /max-width:64%/)
})
