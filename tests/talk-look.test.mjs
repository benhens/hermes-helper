// talk v2 look (Lead's job of 10 Nov 22:25, hhdesign's design/talk-r5-review/notes.md and notes-wants.md):
// curly quote marks where a line is drawn and their four exceptions; the docs quote under the line; the
// numbered clicks; "More"; the chevron; four picks two by two at 420 px and wider; the edges that fade.
// The look itself (sizes, colours, what wraps) is measured in the real app: dev/checks/talk-v2-look/run/.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, spoken, byData } from './lib/render.mjs'
import { TALK_DATA } from '../src/talk-data.js'
import { T, K } from '../src/look.js'
import { curlyQuotes } from '../src/quotes.js'
import { columnsFor, linesAllowed, FOUR_TWO_LINES_PX } from '../src/layout.js'
import { turn, freshVisit, lineFor } from '../src/talk.js'
import { renderKept } from '../src/settings-file.js'

function useHost() {
  globalThis.__hhHost = { request: async m => ({ 'setup.runtime_check': { ok: true, model: 'mock-small' }, 'setup.status': { provider_configured: false } })[m] }
}
async function open(storage = fakeStorage()) {
  useHost()
  const reg = await registerPlugin(storage, fakeTimers())
  const view = mount(reg.Page)
  await settle()
  return { view, storage, reg }
}
const helper = view => byData(view.tree, 'helper')
const bubble = view => byData(helper(view), 'bubble')
const said = view => spoken(byData(bubble(view), 'said')).trim()
const conversation = view => byData(helper(view), 'conversation-lines').props.children
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const answers = view => all(view.tree, n => n.props['data-hh'] === 'answer')
const answer = (view, label) => answers(view).find(a => text(a).trim() === label)
const button = view => byData(bubble(view), 'bubble-button')
const click = node => node.props.onClick({ preventDefault() {} })
const finish = view => byData(view.tree, 'page').props.onPointerDownCapture({})
function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  finish(view)
}
async function pastOpening(storage) {
  const o = await open(storage)
  finish(o.view)
  send(o.view, 'Peter')
  send(o.view, 'I run a tennis club')
  return o
}
const STRAIGHT_PAIR = /"[^"\n]*"/

beforeEach(() => {
  delete globalThis.__hhHost
  delete globalThis.ResizeObserver
})

/* ---------- point 4: quote marks ---------- */

test('curlyQuotes: a pair of straight double quotes becomes curly; a lone one stays; nothing else changes', () => {
  assert.equal(curlyQuotes('open "Bots", then "New bot".'), 'open “Bots”, then “New bot”.')
  assert.equal(curlyQuotes('a "lone one'), 'a "lone one')
  assert.equal(curlyQuotes('it\'s 5" tall and "x"'), 'it\'s 5“ tall and ”x"')
  assert.equal(curlyQuotes('no quotes'), 'no quotes')
  assert.equal(curlyQuotes(null), null)
})

test('every Helper line drawn in the bubble and the older lines has no straight pair left, while the data keeps its own', async () => {
  const { view } = await pastOpening()
  const seen = []
  for (const w of ['second bot for work', 'what can I ask', 'is there a github skill', 'what does the dspy skill do', 'tell me a joke', 'can it read my gmail', 'what do you know about me']) {
    send(view, w)
    if (button(view) && button(view).props['data-kind'] === 'steps') click(button(view))
    seen.push(said(view), text(bubble(view)))
  }
  for (const c of conversation(view).filter(c => c.props['data-hh'] === 'old')) seen.push(text(c))
  assert.ok(seen.some(s => /“/.test(s)), 'some line had quote marks to curl')
  for (const s of seen) assert.doesNotMatch(s, STRAIGHT_PAIR, s)
  assert.match(TALK_DATA.parts.bots.where_line.text, STRAIGHT_PAIR, 'the data is not changed')
})

test('exception 1, text to paste: drawn and copied exactly as it will be pasted, straight quotes included', async () => {
  const { view } = await pastOpening()
  send(view, 'please install a skill for writing emails')
  const paste = byData(bubble(view), 'paste')
  assert.ok(paste)
  const words = text(byData(paste, 'paste-text'))
  // the data's own straight pair around the request ("{request}") stays straight in the text to paste
  assert.match(words, /^I asked for this: "please install a skill for writing emails"\. /)
  assert.doesNotMatch(words, /[“”]/)
  assert.equal(all(paste, n => n.type === 'sdk:CopyButton')[0].props.text, words)
})

test('exception 2, the settings text box: its lines keep their straight quotes; the page\'s own words around it are curled', async () => {
  const kept = { name: 'Peter', asked: ['my shop is called "Blue Door"'], told: true }
  const storage = fakeStorage({ kept })
  const reg = await registerPlugin(storage, fakeTimers())
  const page = mount(reg.settingsPages[0].render().type)
  const row = all(page.tree, n => n.type === 'sdk:ListRow')[0]
  const tb = byData(row.props.below, 'settings-box')
  assert.equal(tb.props.value, renderKept(kept))
  assert.match(tb.props.value, /my shop is called "Blue Door"/)
  // what the page itself says: no straight pair left in its own words
  const own = [row.props.title, ...TALK_DATA.keeps.settings_file.under_box, ...TALK_DATA.keeps.settings_file.facts]
  for (const s of own) assert.doesNotMatch(curlyQuotes(s), STRAIGHT_PAIR)
})

test('exception 3, what the person typed: their message, the kept thing in a faint "Kept: ..." line and in the list, as typed', async () => {
  const { view } = await pastOpening()
  send(view, 'remember that my shop is called "Blue Door"')
  const me = conversation(view).filter(c => c.props['data-hh'] === 'me').at(-1)
  assert.match(text(me), /remember that my shop is called "Blue Door"/)
  const note = conversation(view).filter(c => c.props['data-hh'] === 'kept-note').at(-1)
  assert.match(text(note), /"Blue Door"/)
  send(view, 'what do you know about me')
  const rows = all(byData(bubble(view), 'kept-rows'), n => n.type === 'li').map(n => text(n))
  assert.ok(rows.some(r => /"Blue Door"/.test(r)), rows.join(' / '))
})

test('exception 4, what is matched or stored: the stored record keeps the straight quotes, and the line Helper chooses (src/talk.js) keeps the data\'s words', async () => {
  const { view, storage } = await pastOpening()
  send(view, 'remember that my shop is called "Blue Door"')
  assert.deepEqual(storage.data.get('kept').asked, ['my shop is called "Blue Door"'])
  const st = freshVisit()
  const said2 = lineFor(turn('second bot for work', st), st)
  assert.equal(said2.text, TALK_DATA.topics.find(t => t.id === 'bot').needs.find(n => n.id === 'bot1').text)
  // a curly quote typed by the person is matched as a straight one, as before (talkNorm)
  const a = freshVisit()
  const b = freshVisit()
  assert.equal(turn('what is a “skill”', a).kind, turn('what is a "skill"', b).kind)
})

/* ---------- notes-wants.md rule A and B, items 3 and 7 ---------- */

test('rule A: the docs quote sits directly under Helper\'s line, before the divider; with no button the bubble has no divider at all', async () => {
  const { view } = await pastOpening()
  send(view, 'is there a github skill')
  const kids = bubble(view).props.children.filter(Boolean)
  assert.equal(kids[1].props['data-hh'], 'docs')
  assert.equal(kids.length, 2, 'a built-in skill: line and quote, no divider')
  assert.equal(byData(bubble(view), 'in-bubble'), null)
  send(view, 'what does the dspy skill do')
  const k2 = bubble(view).props.children.filter(Boolean)
  assert.deepEqual(k2.map(k => k.props['data-hh'] || k.type), [k2[0].props['data-hh'] || k2[0].type, 'docs', 'in-bubble'])
  assert.equal(byData(k2[2], 'docs'), null, 'the quote is not under the divider')
})

test('rule B and item 3: the steps are Hermes\'s own list, the line after them faint (hh-after); the arrow\'s state is aria-expanded', async () => {
  const { view } = await pastOpening()
  send(view, 'what does the dspy skill do')
  assert.equal(button(view).props['aria-expanded'], false)
  click(button(view))
  assert.equal(button(view).props['aria-expanded'], true)
  assert.equal(byData(bubble(view), 'steps').type, 'ol')
  assert.equal(byData(bubble(view), 'steps-after').props.className, T.after)
})

test('item 7: "More" wears hh-more besides the answer\'s own class; the other picks do not', async () => {
  const { view } = await pastOpening()
  send(view, 'can it edit my videos')
  const more = answer(view, 'More')
  assert.equal(more.props.className, `${T.answer} ${T.more}`)
  assert.equal(answer(view, 'Make pictures').props.className, T.answer)
})

/* ---------- review section 3 point 1: four picks ---------- */

test('four picks at 420 px and wider may take two lines each before going into one column; under 420, and for two or three, one line', () => {
  assert.equal(FOUR_TWO_LINES_PX, 420)
  assert.equal(linesAllowed(4, 420), 2)
  assert.equal(linesAllowed(4, 460), 2)
  assert.equal(linesAllowed(4, 419), 1)
  assert.equal(linesAllowed(4, 360), 1)
  assert.equal(linesAllowed(3, 460), 1)
  assert.equal(linesAllowed(2, 600), 1)
  assert.equal(columnsFor(4, false), 2)
  assert.equal(columnsFor(4, true), 1)
})

/* ---------- the style sheet's new values ---------- */

test('the faint lines do not leave one word alone (text-wrap: pretty on .hh-note-first, .hh-note and .hh-old .hh-where)', async () => {
  const { TALK_CSS } = await import('../src/talk-css.js')
  const rule = sel => TALK_CSS.split('\n').filter(r => r.startsWith(sel + '{')).join('')
  for (const sel of ['.hh-note-first', '.hh-note', '.hh-old .hh-where']) assert.match(rule(sel), /text-wrap:pretty/, sel)
})

test('rule A, B, C and items 3 and 7 in the style sheet, with hhdesign\'s values', async () => {
  const { TALK_CSS } = await import('../src/talk-css.js')
  const has = r => assert.ok(TALK_CSS.split('\n').includes(r), r)
  has('.hh-docs{margin:8px 0 0;padding:1px 0 1px 12px;border-left:2px solid var(--ui-stroke-secondary)}')
  assert.match(TALK_CSS, /\.hh-docs-words\{[^}]*font-style:italic/)
  has('.hh-steps li::marker{color:var(--ui-text-tertiary);font-variant-numeric:tabular-nums}')
  has('.hh-steps li+li{margin-top:6px}')
  has('.hh-in.hh-col{flex-direction:column;align-items:flex-start;gap:10px}')
  has('.hh-after{font-size:12.5px;line-height:17px;text-wrap:pretty;color:var(--ui-text-tertiary)}')
  has('.hh-btn[aria-expanded=true] .codicon,.hh-old-link[aria-expanded=true] .codicon{transform:rotate(180deg)}')
  has('.hh-picks .hh-answer.hh-more{background:transparent;color:var(--ui-text-secondary);border-color:var(--ui-stroke-tertiary)}')
  // the cut edges fade over 20 px, only where something is hidden
  assert.match(TALK_CSS, /\.hh-conv\[data-fade=top\]\{mask-image:linear-gradient\(to bottom,transparent 0,var\(--ui-text-primary\) 20px\)\}/)
  assert.match(TALK_CSS, /\.hh-conv\[data-fade=bottom\]\{mask-image:linear-gradient\(to top,transparent 0,var\(--ui-text-primary\) 20px\)\}/)
  assert.match(TALK_CSS, /\.hh-conv\[data-fade=both\]/)
  assert.doesNotMatch(TALK_CSS, /\.hh-conv\{[^}]*mask-image/, 'no fade on an edge with nothing behind it')
})

test('the text to paste inside the bubble wears its own classes; the setup card\'s stays as it was', () => {
  assert.equal(K.bubblePaste, 'flex w-full min-w-0 items-start gap-2 rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) py-1.5 pl-2.5 pr-1.5')
  assert.match(K.bubblePasteText, /font-mono text-xs leading-4\.5 text-\(--ui-text-secondary\)/)
  assert.match(K.bubblePasteTextOld, /font-mono text-\[11px\] leading-4/)
  assert.equal(K.cardPaste, 'flex min-w-0 items-center gap-1.5 rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5')
  assert.equal(K.cardPasteText, 'wrap-anywhere min-w-0 flex-1 font-mono text-[0.65rem] text-(--ui-text-tertiary)')
})
