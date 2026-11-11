// Helper's page in Hermes's Settings (src/settings-page.js), rendered from the built plugin with the
// stand-ins: the box drawn from the stored record, Save with the read-back rules, the question before
// anything is forgotten, Undo changes, "Forget all of this", the Esc guard, and that the conversation
// sees the change when it is put on screen again. The read-back rules themselves are
// tests/settings-file.test.mjs (compared with hhcontent's settings_read.py).
// Builder, 10 Nov 2026.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData } from './lib/render.mjs'
import { TALK_DATA } from '../src/talk-data.js'
import { renderKept } from '../src/settings-file.js'
import { curlyQuotes } from '../src/quotes.js'
import { AI_MODE } from '../src/ai-mode.js'

const SF = TALK_DATA.keeps.settings_file

beforeEach(() => {
  globalThis.__hhHost = { request: async m => ({ 'setup.runtime_check': { ok: true, model: 'mock-small' }, 'setup.status': {} })[m] }
})

async function openSettings(initial = {}) {
  const storage = fakeStorage(initial)
  const reg = await registerPlugin(storage, fakeTimers())
  assert.equal(reg.settingsPages.length, 1)
  const page = reg.settingsPages[0]
  const view = mount(page.render().type)
  return { view, storage, page, reg }
}
// Hermes's ListRow takes the box in its `below` prop, and the Forget row its title, line and action in
// props, which the stand-in leaves as they are: the searches look there too.
const rowParts = r => [r.props.below, r.props.action, r.props.description].filter(Boolean)
const inside = view => [view.tree, ...all(view.tree, n => n.type === 'sdk:ListRow').flatMap(rowParts)]
const find = (view, what) => byData(inside(view), `settings-${what}`)
const box = view => find(view, 'box')
const type = (view, value) => box(view).props.onChange({ target: { value } })
const press = (view, what) => find(view, what).props.onClick({ preventDefault() {} })
const shown = (view, what) => text(find(view, what))
// the text of a part, with what its ListRows hold in their props (title, line, action)
const shownAll = (view, what) => {
  const node = find(view, what)
  return [text(node), ...all(node, n => n.type === 'sdk:ListRow').flatMap(r => [r.props.title, ...rowParts(r)].map(p => (typeof p === 'string' ? p : text(p))))].join(' ')
}
const PETER = { name: 'Peter', msg: 'WhatsApp', asked: ['my club has six courts'], told: true }

test('registered under Settings, Plugins: one page called Helper with the compass icon; on an older Hermes the plugin still loads without it', async () => {
  const { page } = await openSettings()
  assert.equal(page.id, 'settings')
  assert.equal(page.title, 'Helper')
  assert.equal(page.icon, 'compass')
  const old = await registerPlugin(fakeStorage(), fakeTimers(), { registerSettingsPage: undefined })
  assert.equal(old.settingsPages.length, 0)
  assert.ok(old.Page)
})

test('the page: hhcontent\'s top line, the box drawn from the stored record with Helper\'s reasons, the lines under it, Save and Undo changes, the three facts; no line about an AI', async () => {
  const { view } = await openSettings({ kept: PETER })
  const row = all(view.tree, n => n.type === 'sdk:ListRow')[0]
  assert.equal(row.props.title, SF.top_line)
  assert.equal(row.props.wide, true)
  // talk-live: a second top line only in a build with an AI step (lines_by_mode.settings_top_line_2)
  // live-v2 changes-4: the What you do line is sent, so the AI builds' second top line says so
  assert.equal(row.props.description, AI_MODE === 'no_ai_step' ? undefined : 'Only the What you do line is sent to your AI, when Helper asks it for help.')
  assert.equal(box(view).type, 'sdk:Textarea')
  assert.equal(box(view).props.value, renderKept(PETER))
  assert.match(box(view).props.value, /^Name: Peter \(Helper greets you with it\)$/m)
  assert.equal(box(view).props.placeholder, SF.empty)
  assert.equal(box(view).props.spellCheck, false)
  for (const l of SF.under_box) assert.ok(text(inside(view)).includes(curlyQuotes(l)), l)
  assert.equal(shown(view, 'save'), 'Save')
  assert.equal(shown(view, 'undo'), 'Undo changes')
  assert.equal(find(view, 'save').type, 'sdk:Button')
  assert.ok(shown(view, 'facts').includes(curlyQuotes(SF.also_tell)))
  for (const f of SF.facts) assert.ok(shown(view, 'facts').includes(curlyQuotes(f)), f)
  // no AI step: neither "Only your name goes to your AI" nor "already sent to your AI" (talk-live-2: apart from the AI
  // builds' second top line of changes-4, checked above)
  assert.doesNotMatch(text(inside(view)).split('Only the What you do line is sent to your AI, when Helper asks it for help.').join(''), /your AI/)
  // an empty record: the empty line as the box's hint, and no "Forget all of this"
  const empty = await openSettings()
  assert.equal(box(empty.view).props.value, '')
  assert.equal(find(empty.view, 'forget'), null)
})

test('Save: the box is read back by the fixed rules and written to the same record the conversation reads; the box is drawn again with Helper\'s reasons', async () => {
  const { view, storage } = await openSettings({ kept: PETER })
  type(view, 'Name: Pete\nChat app: telegram\nRemember: my club has six courts')
  press(view, 'save')
  assert.deepEqual(storage.data.get('kept'), { name: 'Pete', msg: 'Telegram', asked: ['my club has six courts'], told: true })
  assert.equal(box(view).props.value, renderKept(storage.data.get('kept')))
  assert.equal(shown(view, 'saved'), SF.saved)
})

test('a line that cannot be read: nothing saved, the box stays as typed, Helper says which line and why; a secret is never quoted back', async () => {
  const { view, storage } = await openSettings({ kept: PETER })
  type(view, 'Name: Peter\nRemember: my password is hunter22')
  press(view, 'save')
  assert.deepEqual(storage.data.get('kept'), PETER)
  assert.equal(box(view).props.value, 'Name: Peter\nRemember: my password is hunter22')
  const said = shown(view, 'refused')
  assert.match(said, /^Nothing was saved\. Line 2 looks like a password/)
  assert.doesNotMatch(said, /hunter/)
  // a line it cannot read: which line, quoted, and why
  type(view, 'Name: Peter\nPaying for an AI: maybe')
  press(view, 'save')
  assert.match(shown(view, 'refused'), /^Nothing was saved\. Helper could not read line 2:/)
  assert.ok(shown(view, 'refused').includes(curlyQuotes(SF.why.mod_value)))
  assert.deepEqual(storage.data.get('kept'), PETER)
  assert.equal(find(view, 'refused').props.role, 'status')
})

test('deleting lines asks first: "Save, and forget 2 things?"; No saves nothing and keeps the box; Yes saves', async () => {
  const { view, storage } = await openSettings({ kept: PETER })
  type(view, 'Name: Peter')
  press(view, 'save')
  assert.equal(text(find(view, 'ask').props.children[0]), 'Save, and forget 2 things?')
  assert.equal(find(view, 'save'), null, 'Save waits for the answer')
  assert.deepEqual(storage.data.get('kept'), PETER)
  press(view, 'no')
  assert.deepEqual(storage.data.get('kept'), PETER)
  assert.equal(box(view).props.value, 'Name: Peter')
  press(view, 'save')
  press(view, 'yes')
  assert.deepEqual(storage.data.get('kept'), { name: 'Peter', told: true })
  // everything deleted and saved: the record is removed whole
  type(view, '')
  press(view, 'save')
  press(view, 'yes')
  assert.equal(storage.data.has('kept'), false)
})

test('Undo changes puts the box back as stored; Save and Undo wait for a change, as in Hermes\'s own plugin settings form', async () => {
  const { view } = await openSettings({ kept: PETER })
  assert.equal(find(view, 'save').props.disabled, true)
  assert.equal(find(view, 'undo').props.disabled, true)
  type(view, 'Name: Somebody else')
  assert.equal(find(view, 'save').props.disabled, false)
  press(view, 'undo')
  assert.equal(box(view).props.value, renderKept(PETER))
  assert.equal(find(view, 'save').props.disabled, true)
  // Undo also closes an open "Forget all of this" question
  press(view, 'forget-all')
  type(view, 'Name: Pete')
  press(view, 'undo')
  assert.ok(!shownAll(view, 'forget').includes(curlyQuotes(SF.forget_all.question)))
})

test('the questions are read out when they come, and the keyboard goes to No, the answer that changes nothing', async () => {
  const { view } = await openSettings({ kept: PETER })
  type(view, 'Name: Peter')
  press(view, 'save')
  const ask = find(view, 'ask')
  assert.equal(ask.props.children[0].props.role, 'status')
  assert.equal(find(view, 'no').props.autoFocus, true)
  assert.equal(find(view, 'yes').props.autoFocus, undefined)
  press(view, 'no')
  press(view, 'forget-all')
  assert.equal(find(view, 'forget-no').props.autoFocus, true)
  assert.equal(all(find(view, 'forget'), n => n.props && n.props.role === 'status').length, 1)
})

test('"Forget all of this" asks first; Yes removes the record whole and says so; No keeps it', async () => {
  const { view, storage } = await openSettings({ kept: PETER })
  assert.ok(shownAll(view, 'forget').includes(curlyQuotes(SF.forget_all.label)))
  assert.ok(shownAll(view, 'forget').includes(curlyQuotes(SF.forget_all.under)))
  press(view, 'forget-all')
  assert.ok(shownAll(view, 'forget').includes(curlyQuotes(SF.forget_all.question)))
  press(view, 'forget-no')
  assert.deepEqual(storage.data.get('kept'), PETER)
  press(view, 'forget-all')
  press(view, 'forget-yes')
  assert.equal(storage.data.has('kept'), false)
  assert.equal(shown(view, 'forgot'), curlyQuotes(SF.forget_all.after_yes))
  assert.equal(box(view).props.value, '')
})

// talk v2 look (hhdesign's review of e86b410, section 1 point 1)
test('the bottom of the page: a thin divider, then "Forget all of this" as one of Hermes\'s own rows (title, its line under it, "Forget" as Hermes\'s underlined bold text action); the question under the row; no memory row', async () => {
  const { view } = await openSettings({ kept: PETER })
  const part = find(view, 'forget')
  assert.equal(part.props.className, 'mt-3 border-t border-(--ui-stroke-tertiary) pt-3')
  const rows = all(part, n => n.type === 'sdk:ListRow')
  assert.equal(rows.length, 1, 'one row: Hermes\'s own memory row stays out (its address is not in the plugin docs)')
  const row = rows[0].props
  assert.equal(row.title, SF.forget_all.label)
  assert.equal(row.description, curlyQuotes(SF.forget_all.under))
  assert.equal(row.wide, undefined, 'Hermes\'s ordinary row: the action beside the words on a wide page, under them on a narrow one')
  assert.equal(row.action.type, 'sdk:Button')
  assert.equal(row.action.props.variant, 'textStrong')
  // changes-18 (For builder 2): the action word comes from the data, not from a constant in the code
  assert.equal(text(row.action), SF.forget_all.action)
  assert.equal(SF.forget_all.action, 'Forget')
  assert.doesNotMatch(fs.readFileSync(new URL('../src/settings-page.js', import.meta.url), 'utf8'), /FORGET_ACTION|'Forget'/)
  assert.equal(row.action.props['aria-label'], SF.forget_all.label)
  // no filled button for Forget any more
  assert.equal(all(part, n => n.type === 'sdk:Button' && n.props.variant === 'secondary').length, 0)
  press(view, 'forget-all')
  const after = find(view, 'forget').props.children
  assert.equal(after[0].type, 'sdk:ListRow', 'the row stays first')
  assert.equal(after[1].props['data-hh'], 'settings-forget-ask', 'the question under it')
  assert.doesNotMatch(shownAll(view, 'forget'), /Memory & Context|Hermes's own memory/)
})

// talk v2 look (hhdesign's review, section 3 point 3; the words are the data's)
test('a refusal after Save: three rows (which line, the line itself in a mono chip with no quote marks, the fix); a secret gets the first row only', async () => {
  const { view } = await openSettings({ kept: PETER })
  type(view, 'Name: Peter\nPaying for an AI: "maybe" later')
  press(view, 'save')
  const part = find(view, 'refused')
  assert.equal(part.props.className, 'flex min-w-0 flex-col items-start gap-1')
  const [first, line, fix] = part.props.children
  assert.equal(first.props['data-hh'], 'refused-first')
  assert.equal(text(first), SF.read.messages.cannot_read.replace('{n}', '2'))
  assert.equal(first.props.className, 'text-[length:var(--conversation-text-font-size)] font-medium text-foreground')
  assert.equal(line.type, 'code')
  // exactly as the box holds it: no quote marks around it, and its own straight quotes stay straight
  assert.equal(text(line), 'Paying for an AI: "maybe" later')
  assert.match(line.props.className, /font-mono text-xs/)
  assert.match(line.props.className, /wrap-anywhere/)
  assert.match(line.props.className, /bg-\(--ui-bg-quinary\) px-1\.5 py-0\.5/)
  assert.equal(text(fix), SF.why.mod_value)
  assert.match(fix.props.className, /text-\(--ui-text-secondary\)/)
  // a secret: row 1 only, and the line is not on the page
  type(view, 'Name: Peter\nRemember: my password is hunter22')
  press(view, 'save')
  const s = find(view, 'refused').props.children.filter(Boolean)
  assert.equal(s.length, 1)
  assert.match(text(s[0]), /^Nothing was saved\. Line 2 looks like a password/)
  assert.doesNotMatch(text(inside(view).filter(n => n !== box(view))), /hunter/)
})

test('the settings page\'s facts include changes-12\'s "Do not type passwords here." (the data\'s words)', async () => {
  const { view } = await openSettings({ kept: PETER })
  assert.ok(SF.facts.includes('Do not type passwords here.'))
  assert.ok(shown(view, 'facts').includes('Do not type passwords here.'))
})

test('Esc inside the box does not reach Hermes (Hermes closes Settings on Esc, and what was typed would be lost)', async () => {
  const { view } = await openSettings({ kept: PETER })
  let stopped = 0
  box(view).props.onKeyDown({ key: 'Escape', stopPropagation: () => stopped++ })
  box(view).props.onKeyDown({ key: 'a', stopPropagation: () => stopped++ })
  assert.equal(stopped, 1)
})

test('the conversation reads the record again when it is put on screen: a name deleted on the settings page is gone from "what do you know about me"', async () => {
  const storage = fakeStorage({ kept: PETER })
  const reg = await registerPlugin(storage, fakeTimers())
  const talk = mount(reg.Page)
  await settle()
  const settings = mount(reg.settingsPages[0].render().type)
  type(settings, 'Chat app: WhatsApp\nRemember: my club has six courts')
  press(settings, 'save')
  press(settings, 'yes')
  assert.equal(storage.data.get('kept').name, undefined)
  // back to Helper's page: Hermes draws it fresh
  talk.unmount()
  const again = mount(reg.Page)
  const send = words => {
    const b = all(again.tree, n => n.type === 'sdk:Textarea')[0]
    b.props.onChange({ target: { value: words } })
    all(again.tree, n => n.type === 'sdk:Textarea')[0].props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  }
  send('what do you know about me')
  const rows = all(byData(byData(again.tree, 'bubble'), 'kept-rows'), n => n.type === 'li').map(n => text(n))
  assert.ok(!rows.some(r => /Peter/.test(r)), rows.join(' / '))
  assert.ok(rows.some(r => /WhatsApp/.test(r)))
  // and what the conversation writes next does not bring the old name back
  send('remember that the courts open at nine')
  assert.equal(storage.data.get('kept').name, undefined)
  assert.deepEqual(storage.data.get('kept').asked, ['my club has six courts', 'the courts open at nine'])
  assert.equal(storage.data.get('kept').msg, 'WhatsApp')
})
