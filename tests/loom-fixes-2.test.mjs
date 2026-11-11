// loom-fixes-2 (Lead, 11 Nov 12:50; hhtech-loom-run.md faults): tested over the built page (desktop/plugin.js).
// 1. Forget all (on Helper's settings page, and typed to Helper) also clears the kept conversation: after it and a
//    restart of Hermes, no old line comes back (hhtech: the 6 old lines came back).
// 5. The slow-AI line is not kept in the stored conversation (Lead's answer to the loom-fixes questions).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData } from './lib/render.mjs'
import { talkKeepOne } from '../src/talk-keep.js'
import { LIVE_DATA } from '../src/live-data.js'

function useHost() {
  globalThis.__hhHost = {
    request: async method => {
      const answer = {
        'setup.runtime_check': { ok: true, model: 'mock-small' },
        'setup.status': { provider_configured: false },
        'setup.profiles': { profiles: [{ name: 'default', is_default: true }] }
      }[method]
      if (!answer) throw new Error('unexpected ' + method)
      return answer
    }
  }
}
async function open(storage = fakeStorage()) {
  useHost()
  const reg = await registerPlugin(storage, fakeTimers())
  const view = mount(reg.Page)
  await settle()
  return { view, storage, reg }
}
const helper = view => byData(view.tree, 'helper')
const root = view => byData(view.tree, 'page')
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  root(view).props.onPointerDownCapture({})
}
const click = node => {
  if (!node) throw new Error('nothing to click')
  node.props.onClick({ preventDefault() {} })
}
const olds = view => all(helper(view), n => n.props['data-hh'] === 'old').map(n => text(n).replace(/\s+/g, ' ').trim())
const rowParts = r => [r.props.below, r.props.action, r.props.description].filter(Boolean)
const inside = view => [view.tree, ...all(view.tree, n => n.type === 'sdk:ListRow').flatMap(rowParts)]
const inAll = (view, name) => inside(view).map(t => byData(t, name)).find(Boolean) || null

test('point 1: Forget all on Helper\'s settings page, then Helper\'s page again, then a restart: no old line of the conversation', async () => {
  const storage = fakeStorage()
  const { view, reg } = await open(storage)
  send(view, 'Peter')
  send(view, 'I run a tennis club')
  send(view, 'hey')
  await settle()
  assert.ok(storage.data.get('talk'), 'the conversation is kept before')
  // to Settings, Helper's page: Forget all, Yes
  const settings = mount(reg.settingsPages[0].render().type)
  await settle()
  click(inAll(settings, 'settings-forget-all'))
  await settle()
  click(inAll(settings, 'settings-forget-yes'))
  await settle()
  assert.equal(storage.data.get('talk'), undefined, 'Forget all removed the kept conversation')
  // back to Helper's page in the same visit (Hermes draws it fresh): nothing written back
  const back = mount(reg.Page)
  await settle()
  assert.equal(storage.data.get('talk'), undefined, 'coming back to Helper does not write the old lines again')
  assert.deepEqual(olds(back), [], 'no old line in the window')
  // Hermes closed and opened again
  const again = await open(storage)
  assert.deepEqual(olds(again.view), [], 'no old line after a restart')
  assert.ok(!text(helper(again.view)).includes('tennis club'))
})

test('point 1: Forget all typed to Helper ("forget everything", Yes), then a restart: no old line of the conversation', async () => {
  const storage = fakeStorage()
  const { view } = await open(storage)
  send(view, 'Peter')
  send(view, 'I run a tennis club')
  await settle()
  send(view, 'forget everything')
  await settle()
  click(all(view.tree, n => (n.type === 'sdk:Button' || n.props['data-hh'] === 'answer') && text(n).trim() === 'Yes, delete it' && n.props.onClick)[0])
  root(view).props.onPointerDownCapture({})
  await settle()
  const kept = storage.data.get('kept')
  assert.ok(!kept || !kept.name, 'the kept answers went')
  // a restart
  const again = await open(storage)
  assert.deepEqual(olds(again.view), [], 'no old line after a restart')
  assert.ok(!text(helper(again.view)).includes('tennis club'))
})

test('point 5: the slow-AI line is never kept in the stored conversation', () => {
  const slow = { who: 'helper', text: LIVE_DATA.slow_ai.text, line: LIVE_DATA.slow_ai.id }
  assert.equal(talkKeepOne(slow), null)
  // control: an ordinary line of Helper's is kept
  assert.ok(talkKeepOne({ who: 'helper', text: 'Hi.', line: 'NAME_HELLO' }))
})
