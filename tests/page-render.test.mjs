// The page itself, rendered from the built desktop/plugin.js with stand-ins for React and the
// Hermes SDK (tests/lib/render.mjs): what shows for each model-check result, and the helper's
// Move / Hide / Close states with what they write to ctx.storage. The real app run is
// dev/checks/b1-shots (Xvfb); this is the offline guard for later changes.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, mount, settle, all, text, byData, byLabel, click } from './lib/render.mjs'
import { NO_MODEL_LINE, NO_MODEL_SMALL, NO_MODEL_PROGRESS, NO_MODEL_BOX, CANT_CHECK_LINE } from '../src/model-status.js'

let calls
function useHost({ runtime = { ok: true, model: 'mock-small' }, status = { provider_configured: false }, model = '' } = {}) {
  calls = []
  globalThis.__hhHost = {
    request: async (method, params, timeout) => {
      calls.push({ method, timeout })
      const answer = { 'setup.runtime_check': runtime, 'setup.status': status }[method]
      if (!answer) throw new Error('unexpected ' + method)
      if (answer instanceof Error) throw answer
      return answer
    },
    model
  }
}

async function open(storage, host) {
  useHost(host)
  const { Page, storage: s } = await registerPlugin(storage)
  const view = mount(Page)
  await settle()
  return { view, storage: s, Page }
}

const helper = view => byData(view.tree, 'helper')
const columns = view => byData(view.tree, 'header') && all(view.tree, n => n.props['data-hh'] === 'page')[0].props.children[1].props.children.filter(Boolean)

beforeEach(() => {
  delete globalThis.__hhHost
})

test('registers exactly one sidebar row (Helping Hand, compass) and one page at /helping-hand', async () => {
  useHost()
  const { contributions } = await registerPlugin()
  assert.equal(contributions.length, 2)
  const nav = contributions.find(c => c.area === 'sidebar.nav')
  assert.deepEqual(nav.data, { path: '/helping-hand', label: 'Helping Hand', codicon: 'compass' })
  assert.deepEqual(contributions.find(c => c.area === 'routes').data, { path: '/helping-hand' })
})

test('model connected: the model name shows in the message box, Ask about this step is offered', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: true, provider: 'custom', model: 'mock-small' } })
  assert.equal(text(byData(view.tree, 'model-name')).trim(), 'mock-small')
  assert.ok(all(view.tree, n => n.type === 'sdk:Textarea').length === 1)
  assert.ok(byLabel(view.tree, 'Ask about this step'))
  assert.doesNotMatch(text(view.tree), /no model connected/)
  assert.deepEqual(calls.map(c => c.method), ['setup.runtime_check'])
})

test('the name comes from runtime_check, never from host.state.model (it can be one chat\'s pick)', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: true, model: 'mock-small' }, model: 'claude-x' })
  assert.equal(text(byData(view.tree, 'model-name')).trim(), 'mock-small')
  assert.equal(globalThis.__hhHost.modelRead, undefined)
})

test('no name from Hermes: the message box says "your model"', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: true, model: null } })
  assert.equal(text(byData(view.tree, 'model-name')).trim(), 'your model')
})

test('no model: hhcontent\'s lines, Check again, and an empty greyed message box; no Ask button', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: false } })
  const h = text(helper(view))
  for (const line of [NO_MODEL_LINE, NO_MODEL_SMALL, NO_MODEL_PROGRESS]) assert.ok(h.includes(line), line)
  assert.ok(byLabel(helper(view), 'Check again'))
  const boxes = all(view.tree, n => n.type === 'sdk:Textarea')
  assert.equal(boxes.length, 1)
  assert.equal(boxes[0].props.disabled, true)
  assert.equal(boxes[0].props.value, '')
  assert.equal(boxes[0].props.placeholder, NO_MODEL_BOX)
  assert.equal(text(byData(view.tree, 'model-name')).trim(), '')
  assert.equal(byLabel(view.tree, 'Ask about this step'), null)
  click(byLabel(view.tree, 'Check again'))
  await settle()
  assert.deepEqual(calls.map(c => c.method), ['setup.runtime_check', 'setup.status', 'setup.runtime_check', 'setup.status'])
})

test('the message box keeps the whole text (no 500 cut while typing: the key check needs all of it)', async () => {
  const { view } = await open()
  const box = () => all(view.tree, n => n.type === 'sdk:Textarea')[0]
  box().props.onChange({ target: { value: 'x'.repeat(700) } })
  assert.equal(box().props.value.length, 700)
})

test('the check fails: "Can\'t check right now", never the no-model line', async () => {
  const { view } = await open(fakeStorage(), { runtime: new Error('timed out') })
  const h = text(helper(view))
  assert.ok(h.includes(CANT_CHECK_LINE))
  assert.ok(!h.includes(NO_MODEL_LINE))
  assert.ok(byLabel(helper(view), 'Check again'))
})

test('a failed check is asked again on the next open; a good one within 30 s is reused', async () => {
  useHost({ runtime: new Error('down') })
  const first = await registerPlugin()
  mount(first.Page)
  await settle()
  mount(first.Page)
  await settle()
  assert.equal(calls.length, 2)
  useHost({ runtime: { ok: true, model: 'm' } })
  const second = await registerPlugin()
  mount(second.Page)
  await settle()
  const again = mount(second.Page)
  await settle()
  assert.equal(calls.length, 1)
  assert.equal(text(byData(again.tree, 'model-name')).trim(), 'm')
})

test('Close: the helper goes, Show helper brings it back; remembered as closed', async () => {
  const { view, storage } = await open()
  assert.equal(helper(view).props.role, 'complementary')
  click(byLabel(view.tree, 'Close the helper'))
  assert.equal(helper(view), null)
  assert.equal(storage.data.get('helper'), 'closed')
  click(byLabel(view.tree, 'Show helper'))
  assert.ok(helper(view))
  assert.equal(storage.data.get('helper'), 'open')
})

test('Move: the helper goes to the other side and back; remembered', async () => {
  const { view, storage } = await open()
  assert.equal(columns(view).at(-1).props['data-hh'], 'helper')
  click(byLabel(view.tree, 'Move to the left'))
  assert.equal(columns(view)[0].props['data-hh'], 'helper')
  assert.equal(storage.data.get('side'), 'left')
  click(byLabel(view.tree, 'Move to the right'))
  assert.equal(columns(view).at(-1).props['data-hh'], 'helper')
})

test('Hide: a small round button at the edge, which opens the helper again', async () => {
  const { view, storage } = await open()
  click(byLabel(view.tree, 'Hide the helper'))
  assert.equal(helper(view), null)
  const hidden = byData(view.tree, 'helper-hidden')
  assert.ok(hidden)
  assert.equal(storage.data.get('helper'), 'hidden')
  const button = byLabel(hidden, 'Show the helper')
  assert.equal(button.type, 'sdk:Button')
  click(button)
  assert.ok(helper(view))
})

test('remembered state comes back: hidden on the left', async () => {
  const { view } = await open(fakeStorage({ side: 'left', helper: 'hidden' }))
  assert.equal(columns(view)[0].props['data-hh'], 'helper-hidden')
})

test('tabs: Your setup hides the step list and is remembered', async () => {
  const { view, storage } = await open()
  assert.ok(byData(view.tree, 'steps'))
  const tabs = all(view.tree, n => n.type === 'sdk:SegmentedControl')[0]
  assert.deepEqual(tabs.props.options.map(o => o.label), ['Setup', 'Your setup'])
  tabs.props.onChange('yours')
  assert.equal(byData(view.tree, 'steps'), null)
  assert.equal(storage.data.get('tab'), 'yours')
})
