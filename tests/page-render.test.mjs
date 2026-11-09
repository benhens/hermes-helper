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

test('model connected: no model name in the message box (the sketch drops it), Ask about this step is offered', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: true, provider: 'custom', model: 'mock-small' } })
  assert.equal(byData(view.tree, 'model-name'), null)
  assert.doesNotMatch(text(helper(view)), /Mock Small|mock-small/)
  assert.ok(all(view.tree, n => n.type === 'sdk:Textarea').length === 1)
  assert.ok(byLabel(view.tree, 'Ask about this step'))
  assert.doesNotMatch(text(view.tree), /no model connected/)
  assert.deepEqual(calls.map(c => c.method), ['setup.runtime_check'])
})

test('the page never reads host.state.model (it can be one chat\'s pick)', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: true, model: 'mock-small' }, model: 'claude-x' })
  assert.doesNotMatch(text(view.tree), /claude-x/)
  assert.equal(globalThis.__hhHost.modelRead, undefined)
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
  // The reused answer is "ok": the "On step" line shows, not "Checking your model".
  assert.match(text(byData(again.tree, 'helper')), /On step 1:/)
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
const primaries = tree => all(tree, n => n.type === 'sdk:Button' && (!n.props.variant || n.props.variant === 'default') && n.props['aria-label'] !== 'Send').map(n => text(n).trim())

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

test('message box: one line that grows, no resize grip; only the box and a round send button (no model name, no microphone)', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: true, model: 'claude-opus-4-8' } })
  const box = all(view.tree, n => n.type === 'sdk:Textarea')[0]
  assert.equal(box.props.rows, 1)
  for (const c of ['field-sizing-content', 'max-h-40', 'min-h-0', 'resize-none']) assert.ok(box.props.className.split(' ').includes(c), c)
  const row = all(byData(view.tree, 'composer'), n => n.props.className === K.composerRow)[0]
  const kids = row.props.children.filter(Boolean)
  assert.equal(kids.length, 2)
  assert.equal(kids[0].props.className, K.composerInputCell)
  assert.equal(kids[1].props['aria-label'], 'Send')
  assert.ok(kids[1].props.className.split(' ').includes('sdk-primary-icon-btn'), 'Hermes\'s round send button')
  assert.match(K.composerSurface, /(^|\s)rounded-2xl(\s|$)/)
  assert.doesNotMatch(text(helper(view)), /Opus 4\.8/)
  assert.equal(all(helper(view), n => /mic/i.test(String(n.props['aria-label'] || '')) || n.props.name === 'mic').length, 0)
})

test('the sketch: "On step" line on top, the words low as plain text (no bubble), character small at the bottom right with three thought dots, just above the box', async () => {
  const { view } = await open()
  const h = helper(view)
  const kids = h.props.children.filter(Boolean)
  // top bar, body, character row, message box: in that order
  assert.equal(kids[1].props.className, K.helperBody)
  assert.equal(kids[2].props['data-hh'], 'character')
  assert.equal(kids[3].props['data-hh'], 'composer')
  const parts = kids[1].props.children.filter(Boolean)
  assert.equal(parts[0].props.role, 'status')
  assert.match(text(parts[0]), /^\s*On step 1: What you want Hermes to do\s*$/)
  assert.equal(parts.at(-1).props['data-hh'], 'helper-newest')
  assert.match(K.helperNewest, /(^|\s)mt-auto(\s|$)/)
  const say = byData(parts.at(-1), 'say')
  assert.ok(say, 'the newest words')
  assert.equal(all(say, n => n.type === 'p')[0].props.className, K.say)
  // plain text: no bubble, card or fill anywhere around the words
  assert.equal(byData(h, 'bubble'), null)
  for (const key of ['say', 'sayStack', 'helperNewest']) assert.doesNotMatch(K[key], /(^|\s)(bg-|rounded|border|shadow|p-|px-|py-)/, key)
  assert.equal(K.bubble, undefined)
  // the character row: dots first, then the character, pushed to the right
  const row = kids[2]
  assert.match(K.characterRow, /(^|\s)justify-end(\s|$)/)
  const [dots, who] = row.props.children.filter(Boolean)
  assert.equal(dots.props['data-hh'], 'thought-dots')
  assert.equal(dots.props['aria-hidden'], true)
  assert.equal(dots.props.children.length, 3)
  const sizes = dots.props.children.map(d => d.props.className.match(/(?:^|\s)size-([\d.]+)/)[1]).map(Number)
  assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b), 'the dots grow toward the character')
  const lifts = dots.props.children.map(d => Number((d.props.className.match(/(?:^|\s)mb-([\d.]+)/) || [0, 0])[1]))
  assert.deepEqual(lifts, [...lifts].sort((a, b) => b - a), 'the dots rise toward the words')
  assert.ok(all(who, n => n.props['data-hh-character']).length === 1)
  assert.ok(Number(all(who, n => n.props['data-hh-character'])[0].props.height) <= 52, 'small')
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

test('narrow (800 px window, Hermes sidebar shown = 540 px page): helper folds, numbers-only steps, one-column comparison', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  const { view, storage } = await openMeasured(fakeStorage({ step: 2 })) // step 2 has the two-column comparison
  resize(view, 1180)
  assert.ok(helper(view))
  assert.equal(byData(view.tree, 'compare').props['data-columns'], 2)
  assert.ok(byData(view.tree, 'compare').props.className.split(' ').includes(K.twoColumns))
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
  assert.equal(byData(view.tree, 'compare').props['data-columns'], 1)
  assert.ok(!byData(view.tree, 'compare').props.className.split(' ').includes(K.twoColumns))
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

test('the page\'s ref functions stay the same between renders (React would detach and re-attach new ones)', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  const { view } = await openMeasured()
  const before = [byData(view.tree, 'body').props.ref, ...tabButtons(view).map(b => b.props.ref)]
  resize(view, 900)
  click(tabButtons(view)[1])
  const after = [byData(view.tree, 'body').props.ref, ...tabButtons(view).map(b => b.props.ref)]
  before.forEach((r, i) => assert.equal(after[i], r, `ref ${i}`))
})

test('tabs: Home and End; each tab points at the one tab panel, which names its tab', async () => {
  const { view, storage } = await open()
  tabButtons(view)[0].props.onKeyDown({ key: 'End', preventDefault() {} })
  assert.equal(storage.data.get('tab'), 'yours')
  tabButtons(view)[1].props.onKeyDown({ key: 'Home', preventDefault() {} })
  assert.equal(storage.data.get('tab'), 'setup')
  const panel = byData(view.tree, 'detail')
  assert.equal(panel.props.role, 'tabpanel')
  for (const t of tabButtons(view)) assert.equal(t.props['aria-controls'], panel.props.id)
  assert.equal(panel.props['aria-labelledby'], tabButtons(view)[0].props.id)
})

test('wide step: the answer cards sit two to a row (4 or 5 of them); narrow: one column', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  const { view } = await openMeasured(fakeStorage({ step: 2 }))
  resize(view, 1180)
  assert.ok(byData(view.tree, 'choices').props.className.split(' ').includes(K.twoColumns))
  resize(view, 540)
  assert.ok(!byData(view.tree, 'choices').props.className.split(' ').includes(K.twoColumns))
})

test('narrow: "Show helper" after Close opens the helper over the page in one press', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  const { view, storage } = await openMeasured(fakeStorage({ helper: 'closed' }))
  resize(view, 540)
  assert.equal(byData(view.tree, 'helper-hidden'), null)
  click(byLabel(view.tree, 'Show helper'))
  assert.equal(helper(view).props['data-over'], true)
  assert.equal(storage.data.get('helper'), 'open')
})

test('narrow: a helper the person hid opens over the page from its strip and stays saved as hidden', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  const { view, storage } = await openMeasured(fakeStorage({ helper: 'hidden' }))
  resize(view, 540)
  click(byData(view.tree, 'helper-hidden'))
  assert.equal(helper(view).props['data-over'], true)
  assert.equal(storage.data.get('helper'), 'hidden')
  click(byLabel(helper(view), 'Hide the helper'))
  resize(view, 1180)
  assert.equal(helper(view), null)
  assert.ok(byData(view.tree, 'helper-hidden'))
})

test('narrow: over the page, Escape hides it and the keyboard goes back to the strip; the message box gets it on open', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  const { view } = await openMeasured()
  resize(view, 1180)
  let focused = null
  all(view.tree, n => n.type === 'sdk:Textarea')[0].props.ref.current = { focus: () => (focused = 'box') }
  resize(view, 540)
  byData(view.tree, 'helper-hidden').props.ref.current = { focus: () => (focused = 'strip') }
  click(byData(view.tree, 'helper-hidden'))
  assert.equal(focused, 'box')
  const h = helper(view)
  assert.equal(h.props['data-over'], true)
  h.props.onKeyDown({ key: 'a', preventDefault() {} })
  assert.ok(helper(view))
  helper(view).props.onKeyDown({ key: 'Escape', preventDefault() {} })
  assert.equal(helper(view), null)
  assert.equal(focused, 'strip')
})

test('narrow: switching tabs keeps the helper the person opened over the page', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  // 700 px page: Setup is too narrow for the column (700 - 256 - 320 < 320), Your setup is not.
  const { view } = await openMeasured()
  resize(view, 700)
  click(byData(view.tree, 'helper-hidden'))
  assert.equal(helper(view).props['data-over'], true)
  click(tabButtons(view)[1])
  assert.equal(helper(view).props['data-over'], false)
  click(tabButtons(view)[0])
  assert.equal(helper(view).props['data-over'], true)
})

test('narrow, helper on the left: it lies over the page from the left edge, the strip comes first', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  const { view } = await openMeasured(fakeStorage({ side: 'left' }))
  resize(view, 540)
  assert.equal(columns(view)[0].props['data-hh'], 'helper-hidden')
  click(byData(view.tree, 'helper-hidden'))
  const cls = helper(view).props.className.split(' ')
  assert.ok(cls.includes(K.helperOverLeft))
  assert.ok(!cls.includes(K.helperOverRight))
})

test('numbers-only step list: the later steps carry their title too', async t => {
  t.after(() => delete globalThis.ResizeObserver)
  const { view } = await openMeasured()
  resize(view, 540)
  const later = all(byData(view.tree, 'steps'), n => n.props.role === 'img')
  assert.ok(later.length >= 1)
  for (const l of later) assert.match(l.props['aria-label'], /^Step \d+: \S.*, comes later$/)
})

test('Your setup: no heading repeating the tab name, just its one line', async () => {
  const { view } = await open(fakeStorage({ tab: 'yours' }))
  assert.equal(all(byData(view.tree, 'detail'), n => /^h[1-3]$/.test(n.type)).length, 0)
  assert.ok(byData(view.tree, 'yours-lead'))
})
