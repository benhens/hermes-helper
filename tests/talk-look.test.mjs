// talk v2 look (Lead's job of 10 Nov 22:25, hhdesign's design/talk-r5-review/notes.md and notes-wants.md):
// curly quote marks where a line is drawn and their four exceptions; the docs quote under the line; the
// numbered clicks; "More"; the chevron; four picks two by two at 420 px and wider; the edges that fade.
// The look itself (sizes, colours, what wraps) is measured in the real app: dev/checks/talk-v2-look/run/.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, spoken, byData } from './lib/render.mjs'
import { TALK_DATA } from '../src/talk-data.js'
import { T, K } from '../src/look.js'
import { curlyQuotes, namesWhole, NAME_WHOLE_MAX } from '../src/quotes.js'
import { WANTS_DATA } from '../src/wants-data.js'
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
// setup-chat (offer-t1, changes-8): a line that carries an offer is followed by a second bubble with the offer's
// question. line() and said() below still mean Helper's line for the message: when the bubble holds an offer, the
// line just above it. offerLine() and offerSaid() read the offer bubble itself (tests/offers-page.test.mjs has its cases).
const offerUp = view => !!bubble(view) && String(bubble(view).props['data-line']).startsWith('offer-')
const lastOld = view => all(helper(view), n => n.props['data-hh'] === 'old').at(-1)
const offerLine = view => (offerUp(view) ? bubble(view).props['data-line'] : null)
const offerSaid = view => (offerUp(view) ? spoken(byData(bubble(view), 'said')).trim() : null)
const said = view => (offerUp(view) ? text(lastOld(view)).replace(/^Helper said: /, '').replace(/\s+/g, ' ').trim() : spoken(byData(bubble(view), 'said')).trim())
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

test('curlyQuotes: a pair of straight double quotes becomes curly; a lone one stays; an apostrophe between letters becomes ’ (d1ceddc review, 3.3); nothing else changes', () => {
  assert.equal(curlyQuotes('open "Bots", then "New bot".'), 'open “Bots”, then “New bot”.')
  assert.equal(curlyQuotes('a "lone one'), 'a "lone one')
  assert.equal(curlyQuotes('it\'s 5" tall and "x"'), 'it’s 5“ tall and ”x"')
  assert.equal(curlyQuotes('no quotes'), 'no quotes')
  assert.equal(curlyQuotes(null), null)
  // apostrophes: only between two letters (any alphabet); at a word's edge or by a digit it stays straight
  assert.equal(curlyQuotes("That's fine. I'm Helper. Helper's page. Don't."), 'That’s fine. I’m Helper. Helper’s page. Don’t.')
  assert.equal(curlyQuotes("the '90s, 5' tall, rock 'n' roll, 'quoted', Zoë's"), "the '90s, 5' tall, rock 'n' roll, 'quoted', Zoë’s")
})

test('a name in curly marks with no space in it stays on one line with its marks (d1ceddc review, 3.1); a name with a space, or longer than the limit, wraps as before', () => {
  const parts = namesWhole(curlyQuotes('It teaches Hermes to sort mail. Its name is "email-inbox-triage", built in.'))
  assert.deepEqual(parts, ['It teaches Hermes to sort mail. Its name is ', { whole: '“email-inbox-triage”' }, ', built in.'])
  assert.deepEqual(namesWhole('click “+”, then save'), ['click ', { whole: '“+”' }, ', then save'])
  assert.equal(namesWhole('click “New bot”'), null, 'a name with a space is left alone')
  assert.equal(namesWhole('plain words'), null)
  const long = 'x'.repeat(NAME_WHOLE_MAX + 1)
  assert.equal(namesWhole(`“${long}”`), null, 'longer than the limit: wraps as before')
  // every one of the 186 skill names is within the limit (the longest has 31 characters)
  assert.equal(Math.max(...WANTS_DATA.skills.map(s => s.name.length)), 31)
  assert.ok(WANTS_DATA.skills.every(s => Array.from(s.name).length <= NAME_WHOLE_MAX))
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



/* ---------- notes-wants.md rule A and B, items 3 and 7 ---------- */




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
  has('.hh-docs{margin:8px 0 0;padding:1px 0 1px 12px;border-left:2px solid var(--ui-text-tertiary)}')
  assert.match(TALK_CSS, /\.hh-docs-words\{[^}]*font-style:italic/)
  has('.hh-steps li::marker{color:var(--ui-text-tertiary);font-variant-numeric:tabular-nums}')
  has('.hh-steps li+li{margin-top:6px}')
  has('.hh-in.hh-col{flex-direction:column;align-items:flex-start;gap:10px}')
  has('.hh-after{font-size:12.5px;line-height:17px;text-wrap:pretty;color:var(--ui-text-tertiary)}')
  has('.hh-btn[aria-expanded=true] .codicon,.hh-old-link[aria-expanded=true] .codicon{transform:rotate(180deg)}')
  has('.hh-picks .hh-answer.hh-more{background:transparent;color:var(--ui-text-secondary);border-color:var(--ui-stroke-tertiary)}')
  // the cut edges fade over 20 px, only where something is hidden
  assert.match(TALK_CSS, /\.hh-conv\[data-fade=top\]\{mask-image:linear-gradient\(to bottom,transparent 0,var\(--ui-base\) 20px\)\}/)
  assert.match(TALK_CSS, /\.hh-conv\[data-fade=bottom\]\{mask-image:linear-gradient\(to top,transparent 0,var\(--ui-base\) 20px\)\}/)
  assert.match(TALK_CSS, /\.hh-conv\[data-fade=both\]/)
  assert.doesNotMatch(TALK_CSS, /\.hh-conv\{[^}]*mask-image/, 'no fade on an edge with nothing behind it')
})

test('the text to paste inside the bubble wears its own classes; the setup card\'s stays as it was', () => {
  assert.equal(K.bubblePaste, 'flex w-full min-w-0 items-start gap-2 rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) py-1.5 pl-2.5 pr-1.5')
  assert.match(K.bubblePasteText, /font-mono text-xs leading-4\.5 text-\(--ui-text-secondary\)/)
  // builder-qs (Lead, 11 Nov 00:55): text to paste at least 12 px, in an older line too
  assert.match(K.bubblePasteTextOld, /font-mono text-xs leading-4\.5 text-\(--ui-text-secondary\)/)
  assert.equal(K.cardPaste, 'flex min-w-0 items-center gap-1.5 rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5')
  assert.equal(K.cardPasteText, 'wrap-anywhere min-w-0 flex-1 font-mono text-[0.65rem] text-(--ui-text-tertiary)')
})
