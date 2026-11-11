// last-reset (Lead, 11 Nov 15:41; docs/answers/hhtech-final-run.md "For builder" and "What Lead should not promise
// him"; Pēteris: "is there a way to full reset the plugin it dose not do that"), tested over the built page
// (desktop/plugin.js) with a stand-in for Hermes. Not skipped: it runs with the set-up conversation off (tests/) and on
// (tests/setup/), in every AI mode.
// 1. Forget all is a full reset: after "Forget all of this" / "Yes, delete it" in Settings, and after the typed way
//    ("forget everything", Yes), nothing of the person is left in storage, the met mark included, so after a restart
//    Helper greets as on a first visit and asks the name again.
// 2. The Settings row "Forget all of this" shows whenever anything of the person is stored, also when only a
//    conversation is stored and nothing is kept yet.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData, spoken } from '../lib/render.mjs'
import { aiModeSource } from '../lib/mode-loader.mjs'
import { STORED_KEYS } from '../../src/state.js'
import { TALK_DATA } from '../../src/talk-data.js'

const q = s => String(s).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()
// The keys that hold something of the person; the others (tab, helperWidth, helperHidden) are how the page is laid out
const PERSON_KEYS = ['kept', 'met', 'talk']

function useHost() {
  const host = {
    request: async (method, params) => {
      if (method === 'llm.oneshot' && params && params.instructions === 'Reply with exactly: OK') return { text: 'OK' }
      if (method === 'llm.oneshot') return { text: 'NONE' }
      if (method === 'setup.runtime_check') return { ok: true, provider: 'custom', model: 'mock-small' }
      if (method === 'setup.status') return { provider_configured: false }
      if (method === 'setup.profiles') return { profiles: [{ name: 'default', is_default: true }] }
      if (method === 'profiles.describe') return { name: params.name, soul: '' }
      if (method === 'cron.manage') return { count: 0, jobs: [] }
      if (method === 'plugins.manage') return { plugins: [] }
      throw new Error('unexpected ' + method)
    },
    profiles: () => ({ profiles: [{ name: 'default', is_default: true }] }),
    skills: () => [],
    status: () => ({ gateway_platforms: {} }),
    listPersisted: () => ({ sessions: [] })
  }
  globalThis.__hhHost = host
  return host
}
async function open(storage) {
  useHost()
  const reg = await registerPlugin(storage, fakeTimers({ hold: [12000] }), {}, src => aiModeSource(src, process.env.HELPER_AI_MODE || 'ai_writes'))
  const view = mount(reg.Page)
  await settle(12)
  return { view, reg }
}
const helper = view => byData(view.tree, 'helper')
const bubble = view => byData(helper(view), 'bubble')
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const finish = view => byData(view.tree, 'page').props.onPointerDownCapture({})
async function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  await settle(12)
  finish(view)
  await settle(12)
}
const click = node => {
  if (!node) throw new Error('nothing to click')
  node.props.onClick({ preventDefault() {} })
}
const rowParts = r => [r.props.below, r.props.action, r.props.description].filter(Boolean)
const inside = view => [view.tree, ...all(view.tree, n => n.type === 'sdk:ListRow').flatMap(rowParts)]
const inAll = (view, name) => inside(view).map(t => byData(t, name)).find(Boolean) || null
const shown = view => q(text(helper(view)))
const personKeys = storage => PERSON_KEYS.filter(k => storage.data.has(k))

// The whole window after a restart is a first visit: one bubble, the first-visit greeting with the name question
function firstVisit(view) {
  assert.equal(bubble(view).props['data-line'], 'OPEN', 'the first-visit greeting')
  assert.equal(q(spoken(byData(bubble(view), 'said'))), q(TALK_DATA.fixed.OPEN.text))
  assert.match(shown(view), /What's your name\?/)
  assert.ok(!/Hi again/.test(shown(view)), 'no "Hi again"')
  assert.ok(!/Peter|tennis club|skill/.test(shown(view)), 'no old line: ' + shown(view))
  assert.equal(all(helper(view), n => n.props['data-hh'] === 'old').length, 0, 'no older line in the window')
}
// A conversation with a name, a kept answer (what he does) and a question
async function talked(storage) {
  const { view, reg } = await open(storage)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  await send(view, 'what is a skill?')
  assert.deepEqual(personKeys(storage), PERSON_KEYS, 'before the reset: kept, met and talk are stored (control)')
  assert.equal(storage.data.get('kept').name, 'Peter')
  return { view, reg }
}

test('STORED_KEYS: the keys about the person are kept, met and talk; the rest are the page\'s layout', () => {
  assert.deepEqual([...STORED_KEYS].filter(k => !['tab', 'helperWidth', 'helperHidden'].includes(k)).sort(), [...PERSON_KEYS].sort())
})

test('1. Forget all in Settings: kept, met and talk are gone; after a restart Helper greets as on a first visit and asks the name', async () => {
  const storage = fakeStorage()
  const { reg } = await talked(storage)
  const settings = mount(reg.settingsPages[0].render().type)
  await settle()
  click(inAll(settings, 'settings-forget-all'))
  await settle()
  click(inAll(settings, 'settings-forget-yes'))
  await settle()
  assert.deepEqual(personKeys(storage), [], 'nothing of the person is stored after the Yes')
  // Hermes closed and opened again right after the reset (a copy of the storage as it is now)
  const now = fakeStorage(Object.fromEntries(storage.data))
  firstVisit((await open(now)).view)
  // or: back to Helper's page in the same visit (Hermes draws it fresh): nothing is written back, and the met mark and
  // the name are not written again while he talks on
  const back = mount(reg.Page)
  await settle(12)
  assert.deepEqual(personKeys(storage), [], 'coming back to Helper writes nothing back')
  await send(back, 'hey')
  assert.ok(!storage.data.has('met'), 'the met mark is not written again in this visit')
  assert.ok(!storage.data.has('kept'), 'nothing kept again in this visit')
  // Hermes closed and opened again after that: still a first visit (the lines said after the reset may come back)
  const again = await open(storage)
  assert.equal(bubble(again.view).props['data-line'], 'OPEN', 'the first-visit greeting')
  assert.ok(!/Peter|tennis club|skill|Hi again/.test(shown(again.view)), 'no old line: ' + shown(again.view))
  // and the name is asked and kept as on a first visit
  await send(again.view, 'Anna')
  assert.equal(storage.data.get('kept').name, 'Anna')
})


test('1. the layout keys stay through Forget all (Helper hidden stays hidden: a reset forgets the person, not where he put the window)', async () => {
  const storage = fakeStorage({ tab: 'learn', helperWidth: 480 })
  const { reg } = await talked(storage)
  const settings = mount(reg.settingsPages[0].render().type)
  await settle()
  click(inAll(settings, 'settings-forget-all'))
  await settle()
  click(inAll(settings, 'settings-forget-yes'))
  await settle()
  assert.equal(storage.data.get('tab'), 'learn')
  assert.equal(storage.data.get('helperWidth'), 480)
})

test('2. the Settings row "Forget all of this" shows when only a conversation is stored (nothing kept), and its Yes removes it', async () => {
  const storage = fakeStorage()
  const { view, reg } = await open(storage)
  await send(view, 'what is a skill?')
  await send(view, 'whats honcho')
  assert.ok(storage.data.has('talk'), 'the conversation is stored (control)')
  assert.ok(!storage.data.has('kept'), 'nothing is kept (control)')
  const settings = mount(reg.settingsPages[0].render().type)
  await settle()
  assert.ok(inAll(settings, 'settings-forget-all'), 'the Forget all row is there')
  click(inAll(settings, 'settings-forget-all'))
  await settle()
  click(inAll(settings, 'settings-forget-yes'))
  await settle()
  assert.deepEqual(personKeys(storage), [])
  assert.ok(inAll(settings, 'settings-forgot'), 'the done line shows')
  const again = await open(storage)
  firstVisit(again.view)
})

test('2. with nothing stored the Settings page has no Forget all row (control)', async () => {
  useHost()
  const storage = fakeStorage()
  const reg = await registerPlugin(storage, fakeTimers(), {}, src => aiModeSource(src, process.env.HELPER_AI_MODE || 'ai_writes'))
  const settings = mount(reg.settingsPages[0].render().type)
  await settle()
  assert.equal(inAll(settings, 'settings-forget-all'), null)
})
