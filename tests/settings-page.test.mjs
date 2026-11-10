// Helper's page in Hermes's Settings (src/settings-page.js), rendered from the built plugin with the
// stand-ins: the box drawn from the stored record, Save with the read-back rules, the question before
// anything is forgotten, Undo changes, "Forget all of this", the Esc guard, and that the conversation
// sees the change when it is put on screen again. The read-back rules themselves are
// tests/settings-file.test.mjs (compared with hhcontent's settings_read.py).
// Builder, 10 Nov 2026.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData } from './lib/render.mjs'
import { TALK_DATA } from '../src/talk-data.js'
import { renderKept } from '../src/settings-file.js'

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
// Hermes's ListRow takes the box in its `below` prop, which the stand-in leaves as it is: the
// searches look there too.
const inside = view => [view.tree, ...all(view.tree, n => n.type === 'sdk:ListRow').map(r => r.props.below)]
const find = (view, what) => byData(inside(view), `settings-${what}`)
const box = view => find(view, 'box')
const type = (view, value) => box(view).props.onChange({ target: { value } })
const press = (view, what) => find(view, what).props.onClick({ preventDefault() {} })
const shown = (view, what) => text(find(view, what))
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
  assert.equal(box(view).type, 'sdk:Textarea')
  assert.equal(box(view).props.value, renderKept(PETER))
  assert.match(box(view).props.value, /^Name: Peter \(Helper greets you with it\)$/m)
  assert.equal(box(view).props.placeholder, SF.empty)
  assert.equal(box(view).props.spellCheck, false)
  for (const l of SF.under_box) assert.ok(text(inside(view)).includes(l), l)
  assert.equal(shown(view, 'save'), 'Save')
  assert.equal(shown(view, 'undo'), 'Undo changes')
  assert.equal(find(view, 'save').type, 'sdk:Button')
  assert.ok(shown(view, 'facts').includes(SF.also_tell))
  for (const f of SF.facts) assert.ok(shown(view, 'facts').includes(f), f)
  // no AI step: neither "Only your name goes to your AI" nor "already sent to your AI"
  assert.doesNotMatch(text(inside(view)), /your AI/)
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
  assert.ok(shown(view, 'refused').includes(SF.why.mod_value))
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
  assert.ok(!shown(view, 'forget').includes(SF.forget_all.question))
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
  assert.equal(shown(view, 'forget-all'), SF.forget_all.label)
  assert.ok(shown(view, 'forget').includes(SF.forget_all.under))
  press(view, 'forget-all')
  assert.ok(shown(view, 'forget').includes(SF.forget_all.question))
  press(view, 'forget-no')
  assert.deepEqual(storage.data.get('kept'), PETER)
  press(view, 'forget-all')
  press(view, 'forget-yes')
  assert.equal(storage.data.has('kept'), false)
  assert.equal(shown(view, 'forgot'), SF.forget_all.after_yes)
  assert.equal(box(view).props.value, '')
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
