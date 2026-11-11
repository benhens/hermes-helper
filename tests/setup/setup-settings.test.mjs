// setup-chat point 5: what the set-up conversation keeps, on Helper's settings page: the four rows with Delete, the
// button "Ask me the set-up questions again", and that saving the box or Forget all treats them rightly.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData, spoken } from '../lib/render.mjs'
import { SETUP_BUILT } from '../../src/setup-built.js'
import { setupRows } from '../../src/setup-chat.js'

const opt = { skip: !SETUP_BUILT && 'the set-up conversation is switched off in this run' }
const KEPT = { name: 'Peter', work: 'I run a tennis club', setup_new: 'new', setup_goal: 'send reminders to my members about training', setup_goal_id: 'schedule', setup_done_said: ['first_chat', 'chat_apps'], setup_current: 'scheduled_job', told: true }
function useHost() {
  globalThis.__hhHost = {
    request: async method => {
      if (method === 'setup.runtime_check') return { ok: true, model: 'mock-small' }
      if (method === 'setup.status') return { provider_configured: false }
      if (method === 'profiles.describe') return { soul: '' }
      if (method === 'cron.manage') return { count: 0, jobs: [] }
      throw new Error('unexpected ' + method)
    },
    profiles: () => ({ profiles: [{ name: 'default', is_default: true }] })
  }
}
async function openSettings(kept) {
  useHost()
  const storage = fakeStorage(kept ? { kept, met: true } : {})
  const reg = await registerPlugin(storage, fakeTimers())
  const view = mount(reg.settingsPages[0].render().type)
  await settle()
  return { view, storage, reg }
}
const rowParts = r => [r.props.below, r.props.action, r.props.description].filter(Boolean)
const inside = view => [view.tree, ...all(view.tree, n => n.type === 'sdk:ListRow').flatMap(rowParts)]
const block = view => byData(view.tree, 'settings-setup')
const rows = view => (block(view) ? all(block(view), n => n.type === 'sdk:ListRow').map(r => [r.props.title, r.props.description]) : [])
const del = (view, key) => all(inside(view), n => n.props && n.props['data-hh'] === 'settings-setup-delete' && n.props['data-key'] === key)[0]
const click = n => n.props.onClick({ preventDefault() {} })

test('the four rows, by the data\'s names, showing the label, the typed text and the things by their names', opt, async () => {
  assert.deepEqual(setupRows(KEPT), [
    ['setup_new', 'New to Hermes', "Yes, I'm new"],
    ['setup_goal', 'What you want Hermes to do', 'send reminders to my members about training'],
    ['setup_done_said', "You said you've done", 'First chat, Chat apps'],
    ['setup_current', 'Next to set up', 'Scheduled jobs']
  ])
  assert.deepEqual(setupRows({ name: 'Peter' }), [])
  const { view } = await openSettings(KEPT)
  assert.deepEqual(rows(view), [
    ['New to Hermes', 'Yes, I’m new'],
    ['What you want Hermes to do', 'send reminders to my members about training'],
    ['You said you’ve done', 'First chat, Chat apps'],
    ['Next to set up', 'Scheduled jobs']
  ])
  const again = byData(inside(view), 'settings-setup-again')
  assert.equal(text(again), 'Ask me the set-up questions again')
})

test('nothing of the set-up conversation kept: no rows and no button', opt, async () => {
  const { view } = await openSettings({ name: 'Peter' })
  assert.equal(block(view), null)
})

test('Delete on one row removes that row from what is stored, and only it', opt, async () => {
  const { view, storage } = await openSettings(KEPT)
  click(del(view, 'setup_goal'))
  const kept = storage.data.get('kept')
  assert.equal(kept.setup_goal, undefined)
  assert.equal(kept.setup_goal_id, undefined, 'the goal goes with its words')
  assert.deepEqual([kept.name, kept.work, kept.setup_new, kept.setup_done_said, kept.setup_current], ['Peter', 'I run a tennis club', 'new', ['first_chat', 'chat_apps'], 'scheduled_job'])
  assert.deepEqual(rows(view).map(r => r[0]), ['New to Hermes', 'You said you’ve done', 'Next to set up'])
})

test('"Ask me the set-up questions again": the two answers and the thing recommended go; the name, what you do and the things said done stay', opt, async () => {
  const { view, storage } = await openSettings(KEPT)
  click(byData(inside(view), 'settings-setup-again'))
  assert.deepEqual(storage.data.get('kept'), { name: 'Peter', work: 'I run a tennis club', setup_done_said: ['first_chat', 'chat_apps'], told: true })
  assert.deepEqual(rows(view), [['You said you’ve done', 'First chat, Chat apps']])
  assert.equal(byData(inside(view), 'settings-setup-again'), null, 'nothing left to ask again')
})

test('saving the box (the name changed) leaves the set-up rows as they are; Forget all removes them with the rest', opt, async () => {
  const { view, storage } = await openSettings(KEPT)
  const box = byData(inside(view), 'settings-box')
  box.props.onChange({ target: { value: box.props.value.replace('Peter', 'Pete') } })
  click(byData(inside(view), 'settings-save'))
  const kept = storage.data.get('kept')
  assert.equal(kept.name, 'Pete')
  assert.deepEqual([kept.setup_new, kept.setup_goal, kept.setup_goal_id, kept.setup_done_said, kept.setup_current], ['new', 'send reminders to my members about training', 'schedule', ['first_chat', 'chat_apps'], 'scheduled_job'])
  click(byData(inside(view), 'settings-forget-all'))
  click(byData(inside(view), 'settings-forget-yes'))
  assert.equal(storage.data.has('kept'), false)
  assert.equal(block(view), null)
})

test('after "Ask me the set-up questions again", Helper\'s window asks again when it is back on screen: "Sure, let\'s start again. Are you new to Hermes?"', opt, async () => {
  const { view, reg } = await openSettings(KEPT)
  const page = mount(reg.Page)
  await settle()
  byData(page.tree, 'page').props.onPointerDownCapture({})
  assert.equal(byData(byData(page.tree, 'helper'), 'bubble').props['data-line'], 'BACK_REC')
  click(byData(inside(view), 'settings-setup-again'))
  const back = mount(reg.Page) // Hermes draws the page fresh after Settings
  await settle()
  byData(back.tree, 'page').props.onPointerDownCapture({})
  const bubble = byData(byData(back.tree, 'helper'), 'bubble')
  // loom-fixes (the data's RESTART.then): the restart line, then the first question as its own bubble
  const olds = all(byData(back.tree, 'helper'), n => n.props['data-hh'] === 'old')
  assert.equal(olds.at(-1).props['data-line'], 'RESTART')
  assert.match(text(olds.at(-1)), /Sure, let’s start again\./)
  assert.equal(bubble.props['data-line'], 'Q_NEW')
  assert.equal(spoken(byData(bubble, 'said')).trim(), 'Are you new to Hermes?')
  assert.equal(all(back.tree, n => n.props['data-hh'] === 'answer').length, 4)
})
