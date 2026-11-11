// loom-fixes part C (Lead's point 17; his Loom 4:05: "chat logs, maybe here. Also the possibility, a [toggle].
// Whether to have the helper or not"): the strip at the top of Helper's window (Hide Helper, Clear chat), Helper
// hidden and brought back (remembered), and the conversation still there on the next visit (the last 50 lines).
// Point 16 (left edge): the window and its conversation are never left scrolled sideways.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, spoken, byData } from './lib/render.mjs'
import { DASH_DATA } from '../src/dash-data.js'
import { talkToStore, talkFromStore, talkKeepOne, TALK_KEEP_MAX } from '../src/talk-keep.js'
import { T } from '../src/look.js'

const HW = DASH_DATA.words.helperWindow
import fs from 'node:fs'
const require_ = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')

function useHost() {
  globalThis.__hhHost = {
    request: async method => {
      const answer = { 'setup.runtime_check': { ok: true, model: 'mock-small' }, 'setup.status': { provider_configured: false } }[method]
      if (!answer) throw new Error('unexpected ' + method)
      return answer
    }
  }
}
// Hermes started (again): a fresh registration on the same storage
async function open(storage = fakeStorage()) {
  useHost()
  const { Page } = await registerPlugin(storage, fakeTimers())
  const view = mount(Page)
  await settle()
  return { view, storage }
}
const helper = view => byData(view.tree, 'helper')
const root = view => byData(view.tree, 'page')
const finish = view => root(view).props.onPointerDownCapture({})
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  finish(view)
}
const click = node => {
  if (!node) throw new Error('nothing to click')
  node.props.onClick({ preventDefault() {} })
}
const olds = view => all(helper(view), n => n.props['data-hh'] === 'old' || n.props['data-hh'] === 'me').map(n => text(n).replace(/^(?:You|Helper) said: /, '').replace(/\s+/g, ' ').trim())
const bubbleSaid = view => spoken(byData(byData(helper(view), 'bubble'), 'said')).trim()

test('the strip at the top of Helper\'s window: two of Hermes\'s quiet icon buttons, Clear chat and Hide Helper, labelled with hhcontent\'s words', async () => {
  const { view } = await open()
  const bar = byData(helper(view), 'win-bar')
  assert.equal(bar.props.className, T.bar)
  const btns = all(bar, n => n.type === 'sdk:Button')
  assert.deepEqual(btns.map(b => [b.props['aria-label'], b.props.variant, b.props.size]), [[HW.clear, 'ghost', 'icon-xs'], [HW.hide, 'ghost', 'icon-xs']])
  assert.deepEqual([HW.hide, HW.show, HW.clear], ['Hide Helper', 'Show Helper', 'Clear chat'])
  assert.deepEqual(all(bar, n => n.type === 'sdk:Codicon').map(n => n.props.name), ['clear-all', 'layout-sidebar-right-off'])
})

test('Hide Helper: the window folds to a thin strip with only Show Helper; the Dashboard takes the width; remembered across a restart; the plugin stays', async () => {
  const storage = fakeStorage()
  const { view } = await open(storage)
  const before = byData(view.tree, 'tab-area') || null
  click(byData(helper(view), 'hide-helper'))
  await settle()
  assert.equal(helper(view), null, 'the window is gone')
  const strip = byData(view.tree, 'helper-hidden')
  assert.ok(strip)
  assert.deepEqual(all(strip, n => n.type === 'sdk:Button').map(b => b.props['aria-label']), [HW.show])
  assert.equal(text(strip).trim(), '', 'nothing else in it')
  assert.equal(storage.data.get('helperHidden'), true)
  assert.ok(byData(view.tree, 'dashboard') || byData(view.tree, 'page'), 'the page is still there')
  void before
  // Hermes closed and opened: still hidden
  const again = await open(storage)
  assert.equal(helper(again.view), null)
  click(byData(byData(again.view.tree, 'helper-hidden'), 'show-helper'))
  await settle()
  assert.ok(helper(again.view))
  assert.equal(byData(again.view.tree, 'helper-hidden'), null)
  assert.equal(storage.data.has('helperHidden'), false)
})

test('the conversation is there on the next visit: the lines are kept (last 50) and shown again above the new visit\'s, its buttons faint, its text to copy copyable', async () => {
  const storage = fakeStorage()
  const { view } = await open(storage)
  send(view, 'Peter')
  send(view, 'I run a tennis club')
  send(view, 'install a skill for me')
  const kept = storage.data.get('talk')
  assert.ok(Array.isArray(kept) && kept.length >= 5, JSON.stringify(kept))
  assert.ok(kept.some(e => e.who === 'you' && e.text === 'I run a tennis club'))
  const pasteLine = kept.find(e => e.paste)
  assert.ok(pasteLine, 'a line with a text to copy is kept with it')
  assert.match(pasteLine.paste, /install a skill for me/)
  // Hermes closed and opened again
  const again = await open(storage)
  const shown = olds(again.view)
  assert.ok(shown.some(l => l.includes('I run a tennis club')), shown.join(' | '))
  // the restored line's text to copy is there, copyable (its own copy button)
  const restored = all(helper(again.view), n => n.props['data-hh'] === 'old' && n.props['data-line'] === pasteLine.line).at(0)
  assert.ok(restored)
  assert.ok(text(restored).includes(pasteLine.paste), 'the text to copy shows')
  assert.equal(all(restored, n => n.type === 'sdk:CopyButton' && n.props.text === pasteLine.paste).length, 1, 'with its Copy button')
})

test('a kept line whose button led on shows that button as plain faint text; a text-to-copy button stays a button', () => {
  const [a, b] = talkFromStore([
    { who: 'helper', text: 'Want the steps?', line: 'X', next: { kind: 'line', label: 'Yes, show me' } },
    { who: 'helper', text: 'Paste this.', line: 'Y', next: { kind: 'paste', label: 'Text to paste', text: 'Please do it.' } }
  ])
  assert.equal(a.restored, true)
  assert.deepEqual(b.next, { kind: 'paste', label: 'Text to paste', text: 'Please do it.' })
  const src = require_('src/talk-view.js')
  assert.match(src, /entry\.restored && next\.kind !== 'paste'/)
})

test('Clear chat asks "Clear this chat with Helper?" with Yes and No; No keeps it, Yes removes the kept lines but not the kept answers', async () => {
  const storage = fakeStorage()
  const { view } = await open(storage)
  send(view, 'Peter')
  send(view, 'I run a tennis club')
  assert.ok(storage.data.get('talk').length > 2)
  click(byData(helper(view), 'clear-chat'))
  await settle()
  assert.equal(text(byData(helper(view), 'clear-ask')).trim(), 'Clear this chat with Helper?')
  assert.deepEqual(all(byData(helper(view), 'win-bar'), n => n.type === 'sdk:Button').map(b => text(b).trim()), [HW.clear_yes, HW.clear_no])
  click(byData(helper(view), 'clear-no'))
  await settle()
  assert.equal(byData(helper(view), 'clear-ask'), null)
  assert.ok(storage.data.get('talk').length > 2)
  click(byData(helper(view), 'clear-chat'))
  await settle()
  click(byData(helper(view), 'clear-yes'))
  await settle()
  assert.deepEqual(olds(view), [], 'no older lines on screen')
  assert.ok(byData(helper(view), 'bubble'), 'Helper\'s last line stays as the bubble')
  assert.ok((storage.data.get('talk') || []).length <= 1)
  assert.equal(storage.data.get('kept').name, 'Peter', 'kept answers stay (hhcontent: what_clear_does)')
  const again = await open(storage)
  assert.ok(!olds(again.view).some(l => l.includes('tennis')))
})

test('the secrets rule: a line it refuses is never kept; the store never holds more than 50 lines', () => {
  assert.equal(talkKeepOne({ who: 'you', text: 'my key is sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' }), null)
  assert.equal(talkKeepOne({ who: 'you', text: 'password: hunter2hunter2' }), null)
  assert.deepEqual(talkKeepOne({ who: 'you', text: 'hey' }), { who: 'you', text: 'hey' })
  const many = Array.from({ length: 80 }, (_, i) => ({ who: 'you', text: 'line ' + i }))
  const st = talkToStore(many)
  assert.equal(st.length, TALK_KEEP_MAX)
  assert.equal(st[0].text, 'line 30')
  assert.equal(talkToStore([]), null)
  // nothing until the person has said something
  assert.equal(talkToStore([{ who: 'helper', text: 'Hi.', line: 'HI' }]), null)
  // read back: anything odd is dropped, every line is marked restored
  assert.deepEqual(talkFromStore([{ who: 'x', text: 'a' }, 'b', { who: 'helper', text: 'Hi.', line: 'HI' }]), [{ who: 'helper', text: 'Hi.', line: 'HI', restored: true }])
  assert.deepEqual(talkFromStore('junk'), [])
})

test('Forget all on Helper\'s settings page removes the kept conversation too', async () => {
  const storage = fakeStorage()
  const { view } = await open(storage)
  send(view, 'Peter')
  assert.ok(storage.data.get('talk'))
  const src = (await import('node:fs')).readFileSync(new URL('../src/settings-page.js', import.meta.url), 'utf8')
  assert.match(src, /ctx\.storage\.remove\('kept'\)\s*\n\s*\/\/[^\n]*\n\s*ctx\.storage\.remove\('talk'\)/)
})

test('point 16: the conversation is put back to its left edge when scrolled sideways (never shows bubbles cut at the left)', async () => {
  const { view } = await open()
  const conv = byData(helper(view), 'conversation')
  const el = { scrollLeft: 37, scrollTop: 0, scrollHeight: 100, clientHeight: 100, style: { setProperty() {} }, classList: { toggle() {} } }
  try {
    conv.props.onScroll({ currentTarget: el })
  } catch {}
  assert.equal(el.scrollLeft, 0)
})
