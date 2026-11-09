// The page itself, rendered from the built desktop/plugin.js with stand-ins for React and the
// Hermes SDK (tests/lib/render.mjs): what shows for each model-check result, and the helper's
// Move / Hide / Close states with what they write to ctx.storage. The real app run is
// dev/checks/b1-shots (Xvfb); this is the offline guard for later changes.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, mount, settle, all, text, byData, byLabel, click } from './lib/render.mjs'
import { NO_MODEL_LINE, NO_MODEL_SMALL, NO_MODEL_PROGRESS, NO_MODEL_BOX, CANT_CHECK_LINE } from '../src/model-status.js'
import { K } from '../src/look.js'

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
  assert.equal(text(byData(view.tree, 'model-name')).trim(), 'Mock Small')
  assert.ok(all(view.tree, n => n.type === 'sdk:Textarea').length === 1)
  assert.ok(byLabel(view.tree, 'Ask about this step'))
  assert.doesNotMatch(text(view.tree), /no model connected/)
  assert.deepEqual(calls.map(c => c.method), ['setup.runtime_check'])
})

test('the name comes from runtime_check, never from host.state.model (it can be one chat\'s pick)', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: true, model: 'mock-small' }, model: 'claude-x' })
  assert.equal(text(byData(view.tree, 'model-name')).trim(), 'Mock Small')
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
  assert.equal(text(byData(again.tree, 'model-name')).trim(), 'M')
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

test('Hide: a thin full-height strip with HELPER written down it; the whole strip opens the helper', async () => {
  const { view, storage } = await open()
  click(byLabel(view.tree, 'Hide the helper'))
  assert.equal(helper(view), null)
  const hidden = byData(view.tree, 'helper-hidden')
  assert.ok(hidden)
  assert.equal(storage.data.get('helper'), 'hidden')
  // One plain button (Hermes's vertical pane tab and kanban rail are plain buttons too), labelled.
  assert.equal(hidden.type, 'button')
  assert.equal(hidden.props['aria-label'], 'Show the helper')
  assert.equal(hidden.props.className, K.strip)
  assert.match(K.strip, /(^|\s)h-full(\s|$)/)
  assert.match(K.strip, /(^|\s)w-7(\s|$)/)
  assert.equal(text(hidden).trim(), 'Helper')
  assert.match(K.stripLabel, /\[writing-mode:vertical-rl\]/)
  assert.match(K.stripLabel, /(^|\s)uppercase(\s|$)/)
  // No character in the strip; the chevron points inward (towards the page).
  assert.equal(all(hidden, n => typeof n.type === 'function' || n.type === 'svg').length, 0)
  assert.equal(all(hidden, n => n.type === 'sdk:Codicon')[0].props.name, 'chevron-left')
  click(hidden)
  assert.ok(helper(view))
  assert.equal(storage.data.get('helper'), 'open')
})

test('remembered state comes back: hidden on the left', async () => {
  const { view } = await open(fakeStorage({ side: 'left', helper: 'hidden' }))
  assert.equal(columns(view)[0].props['data-hh'], 'helper-hidden')
  assert.equal(all(byData(view.tree, 'helper-hidden'), n => n.type === 'sdk:Codicon')[0].props.name, 'chevron-right')
})

const tabButtons = view => all(byData(view.tree, 'tabs'), n => n.props.role === 'tab')

test('header: no page title, two text tabs in a tablist (Capabilities\' look), the open one underlined', async () => {
  const { view } = await open()
  const head = byData(view.tree, 'header')
  assert.equal(all(head, n => /^h[1-6]$/.test(n.type)).length, 0)
  assert.doesNotMatch(text(head), /Helping Hand/)
  assert.equal(all(view.tree, n => n.type === 'sdk:SegmentedControl').length, 0)
  assert.equal(byData(view.tree, 'tabs').props.role, 'tablist')
  const [setupTab, yoursTab] = tabButtons(view)
  assert.deepEqual([text(setupTab).trim(), text(yoursTab).trim()], ['Setup', 'Your setup'])
  assert.deepEqual([setupTab.props['aria-selected'], yoursTab.props['aria-selected']], [true, false])
  assert.deepEqual([setupTab.props.tabIndex, yoursTab.props.tabIndex], [0, -1])
  assert.equal(setupTab.props.className, `${K.textTab} ${K.textTabOn}`)
  assert.equal(yoursTab.props.className, `${K.textTab} ${K.textTabIdle}`)
  assert.equal(setupTab.props.children.props.className, K.textTabLabelOn)
  assert.match(K.textTabLabelOn, /(^|\s)underline(\s|$)/)
  assert.doesNotMatch(K.textTabLabel, /(^|\s)underline(\s|$)/)
})

test('tabs: Your setup hides the step list and is remembered; arrow keys move between the tabs', async () => {
  const { view, storage } = await open()
  assert.ok(byData(view.tree, 'steps'))
  click(tabButtons(view)[1])
  assert.equal(byData(view.tree, 'steps'), null)
  assert.equal(storage.data.get('tab'), 'yours')
  let focused = null
  tabButtons(view)[0].props.ref({ focus: () => (focused = 'setup') })
  tabButtons(view)[1].props.onKeyDown({ key: 'ArrowRight', preventDefault() {} })
  assert.equal(storage.data.get('tab'), 'setup')
  assert.equal(focused, 'setup')
  tabButtons(view)[0].props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} })
  assert.equal(storage.data.get('tab'), 'yours')
  tabButtons(view)[1].props.onKeyDown({ key: 'a', preventDefault() {} })
  assert.equal(storage.data.get('tab'), 'yours')
})

// Hermes's look: one primary (blue) button per screen; Send is the composer's own icon button.
const primaries = tree => all(tree, n => n.type === 'sdk:Button' && !n.props.variant && n.props['aria-label'] !== 'Send').map(n => text(n).trim())

test('one primary button per screen: setup with and without a model, the failed check, Your setup', async () => {
  for (const runtime of [{ ok: true, model: 'm' }, { ok: false }, new Error('down')]) {
    const { view } = await open(fakeStorage(), { runtime })
    assert.deepEqual(primaries(view.tree), ['I understand, next step'], JSON.stringify(runtime))
    const again = byLabel(helper(view), 'Check again')
    if (again) assert.equal(again.props.variant, 'secondary')
  }
  const { view } = await open(fakeStorage({ tab: 'yours' }))
  await settle()
  assert.deepEqual(primaries(view.tree), [])
  assert.equal(byLabel(byData(view.tree, 'detail'), 'Check again').props.variant, 'secondary')
})

test('message box: one line that grows, no resize grip; model name in normal letters just before send', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: true, model: 'claude-opus-4-8' } })
  const box = all(view.tree, n => n.type === 'sdk:Textarea')[0]
  assert.equal(box.props.rows, 1)
  for (const c of ['field-sizing-content', 'max-h-40', 'min-h-0', 'resize-none']) assert.ok(box.props.className.split(' ').includes(c), c)
  const row = all(byData(view.tree, 'composer'), n => n.props.className === K.composerRow)[0]
  const kids = row.props.children.filter(Boolean)
  assert.equal(kids.length, 3)
  assert.equal(kids[0].props.className, K.composerInputCell)
  assert.equal(kids[1].props['data-hh'], 'model-name')
  assert.equal(kids[2].props['aria-label'], 'Send')
  assert.equal(text(kids[1]).trim(), 'Opus 4.8')
  assert.doesNotMatch(K.composerModel, /font-mono/)
  assert.match(K.composerModel, /(^|\s)text-xs(\s|$)/)
})

test('bubble and character sit together just above the message box (mt-auto), the "On step" line on top', async () => {
  const { view } = await open()
  const body = all(helper(view), n => n.props.className === K.helperBody)[0]
  const parts = body.props.children.filter(Boolean)
  assert.equal(parts[0].props.role, 'status')
  assert.equal(parts.at(-1).props['data-hh'], 'helper-newest')
  assert.match(K.helperNewest, /(^|\s)mt-auto(\s|$)/)
  assert.ok(byData(parts.at(-1), 'bubble'))
})

test('no line on the helper\'s edge', () => {
  for (const key of ['helper', 'helperOver']) assert.doesNotMatch(K[key], /(^|\s)border/, key)
  assert.equal(K.helperRight, undefined)
  assert.equal(K.helperLeft, undefined)
})

/* ---------- narrow windows: the page measures its own width (src/layout.js) ---------- */
let observers
function fakeResizeObserver() {
  observers = []
  globalThis.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb
      this.watching = null
      observers.push(this)
    }
    observe(el) {
      this.watching = el
    }
    disconnect() {
      this.watching = null
    }
  }
}
function resize(view, width) {
  const live = observers.filter(o => o.watching)
  assert.equal(live.length, 1, 'one live observer on our own page element')
  assert.equal(live[0].watching.id, 'our-body')
  live[0].cb([{ contentRect: { width } }])
}
async function openMeasured(storage = fakeStorage(), host) {
  fakeResizeObserver()
  const opened = await open(storage, host)
  byData(opened.view.tree, 'body').props.ref({ id: 'our-body' })
  return opened
}

test('narrow (800 px window, Hermes sidebar shown = 540 px page): helper folds, numbers-only steps, one-column facts', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  const { view, storage } = await openMeasured(fakeStorage({ step: 2 })) // step 2 has the two facts
  resize(view, 1180)
  assert.ok(helper(view))
  assert.equal(byData(view.tree, 'facts').props['data-columns'], 2)
  assert.ok(byData(view.tree, 'facts').props.className.split(' ').includes(K.twoColumns))
  resize(view, 540)
  assert.equal(helper(view), null)
  const strip = byData(view.tree, 'helper-hidden')
  assert.equal(strip.props['data-folded'], true)
  assert.equal(byData(view.tree, 'steps').props['data-numbers-only'], true)
  assert.equal(byData(view.tree, 'steps').props.style.width, '48px')
  assert.doesNotMatch(text(byData(view.tree, 'steps')), /[A-Za-z]/)
  const rows = all(byData(view.tree, 'steps'), n => n.type === 'sdk:RowButton')
  assert.ok(rows.length >= 2)
  rows.forEach((r, i) => assert.match(r.props['aria-label'], new RegExp(`^Step ${i + 1}: \\S`)))
  assert.equal(byData(view.tree, 'facts').props['data-columns'], 1)
  assert.ok(!byData(view.tree, 'facts').props.className.split(' ').includes(K.twoColumns))
  // Nothing saved: the person's choice is still "open", and it comes back when wider.
  assert.equal(storage.data.get('helper'), undefined)
  resize(view, 1180)
  assert.ok(helper(view))
  assert.equal(byData(view.tree, 'steps').props['data-numbers-only'], false)
})

test('narrow: pressing the folded strip opens the helper over the page; Hide folds it back, nothing saved', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  const { view, storage } = await openMeasured()
  resize(view, 540)
  click(byData(view.tree, 'helper-hidden'))
  const h = helper(view)
  assert.ok(h)
  assert.equal(h.props['data-over'], true)
  for (const c of K.helperOver.split(' ')) assert.ok(h.props.className.split(' ').includes(c), c)
  assert.equal(h.props.style.width, '320px')
  // the step list and open step keep their narrow layout under it
  assert.equal(byData(view.tree, 'steps').props['data-numbers-only'], true)
  click(byLabel(h, 'Hide the helper'))
  assert.equal(helper(view), null)
  assert.ok(byData(view.tree, 'helper-hidden'))
  assert.equal(storage.data.get('helper'), undefined)
  // over the page, then the window widens: back in its column
  click(byData(view.tree, 'helper-hidden'))
  resize(view, 1180)
  assert.equal(helper(view).props['data-over'], false)
})

test('narrow: "Ask about this step" opens the helper over the page too', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  const { view } = await openMeasured()
  resize(view, 540)
  click(byLabel(view.tree, 'Ask about this step'))
  assert.equal(helper(view).props['data-over'], true)
})

test('Your setup at 1100 px (840 px page): cards in one column, helper stays open; wide: two columns', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  const { view } = await openMeasured(fakeStorage({ tab: 'yours' }))
  resize(view, 840)
  assert.ok(helper(view))
  assert.equal(byData(view.tree, 'cards').props['data-columns'], 1)
  assert.ok(!byData(view.tree, 'cards').props.className.split(' ').includes(K.twoColumns))
  resize(view, 1180)
  assert.equal(byData(view.tree, 'cards').props['data-columns'], 2)
  assert.ok(byData(view.tree, 'cards').props.className.split(' ').includes(K.twoColumns))
})

test('unmount: React calls the ref with null, which stops the observer', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  const { view } = await openMeasured()
  byData(view.tree, 'body').props.ref(null)
  assert.equal(observers.filter(o => o.watching).length, 0)
})
