// The page itself, rendered from the built desktop/plugin.js with stand-ins for React and the
// Hermes SDK (tests/lib/render.mjs): what registers, the model check on opening, the two tabs, the
// page's frame (the left side, Helper's window on the right, our one style sheet), the edge to
// drag, and how the page fits narrow windows. Helper's conversation is tests/talk-window.test.mjs;
// the real app run is dev/checks/talk-v1 (Xvfb). This is the offline guard for later changes.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, mount, settle, all, text, byData, byLabel, click } from './lib/render.mjs'
import { NO_MODEL_LINE, NO_MODEL_BOX, CANT_CHECK_LINE } from '../src/model-status.js'
import { K, T } from '../src/look.js'
import { TALK_CSS } from '../src/talk-css.js'

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
const strip = view => byData(view.tree, 'helper-strip')
const grip = view => byData(view.tree, 'grip')
const page = view => byData(view.tree, 'page')
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const classes = node => node.props.className.split(' ')

beforeEach(() => {
  delete globalThis.__hhHost
  delete globalThis.ResizeObserver
})

test('registers exactly one sidebar row (Helper, compass) and one page at /helper', async () => {
  useHost()
  const { contributions } = await registerPlugin()
  assert.equal(contributions.length, 2)
  const nav = contributions.find(c => c.area === 'sidebar.nav')
  assert.deepEqual(nav.data, { path: '/helper', label: 'Helper', codicon: 'compass' })
  assert.deepEqual(contributions.find(c => c.area === 'routes').data, { path: '/helper' })
})

test('the page\'s frame: our one style sheet first, then the left side (tabs, step list, open step), then Helper\'s window on the right', async () => {
  const { view } = await open()
  const kids = page(view).props.children.filter(Boolean)
  assert.deepEqual(kids.map(k => k.props['data-hh']), ['talk-css', 'left', 'helper'])
  assert.equal(page(view).props.className, K.root)
  assert.doesNotMatch(K.root, /(^|\s)flex-col(\s|$)/, 'a row: left side, then Helper')
  const left = kids[1]
  assert.equal(left.props.className, K.left)
  assert.deepEqual(left.props.children.map(k => k.props['data-hh']), ['header', 'body'])
  assert.deepEqual(byData(view.tree, 'body').props.children.map(k => k.props['data-hh']), ['steps', 'detail'])
  // Helper's window: a named region, last, 460 px wide, wearing our own class
  const h = kids[2]
  assert.equal(h.props.role, 'complementary')
  assert.equal(h.props['aria-label'], 'Helper')
  assert.equal(h.props.className, T.win)
  assert.deepEqual(h.props.style, { width: '460px' })
  assert.equal(h.props['data-over'], false)
})

test('our style sheet is one <style> element inside our own page, holding the built sheet and nothing else', async () => {
  const { view } = await open()
  const sheets = all(view.tree, n => n.type === 'style')
  assert.equal(sheets.length, 1)
  assert.equal(sheets[0].props.children, TALK_CSS)
  assert.equal(sheets[0].props.dangerouslySetInnerHTML, undefined)
  assert.ok(all(page(view), n => n === sheets[0]).length === 1, 'inside our page element, so it leaves with the page')
  // on Your setup too, and it is the same element (same key), never added twice
  click(all(byData(view.tree, 'tabs'), n => n.props.role === 'tab')[1])
  assert.equal(all(view.tree, n => n.type === 'style').length, 1)
})

test('the old helper header is gone: no Chat log switch, no Move, Hide, Close or "Show helper", no "On step" line; in a wide window nothing puts Helper away', async () => {
  const { view } = await open()
  assert.equal(all(view.tree, n => n.type === 'sdk:Switch').length, 0)
  for (const label of ['Move to the left', 'Move to the right', 'Hide the helper', 'Close the helper', 'Show helper', 'Show the helper', 'Chat log']) assert.equal(byLabel(view.tree, label), null, label)
  assert.doesNotMatch(text(view.tree), /On step \d|Chat log|Checking your model/)
  assert.equal(strip(view), null, 'no strip in a wide window')
  assert.equal(all(helper(view), n => n.props.role === 'status').length, 0)
  // what the old header stored is not read: Helper is there and on the right whatever was saved
  const old = await open(fakeStorage({ side: 'left', helper: 'closed', chatlog: true }))
  assert.equal(page(old.view).props.children.filter(Boolean).at(-1).props['data-hh'], 'helper')
  assert.deepEqual([...old.storage.data.keys()].sort(), ['chatlog', 'helper', 'side'], 'nothing is written on opening')
})

test('model connected: one check on opening; no model name in Helper\'s window; Ask about this step is offered', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: true, provider: 'custom', model: 'mock-small' } })
  assert.equal(byData(view.tree, 'model-name'), null)
  assert.doesNotMatch(text(helper(view)), /Mock Small|mock-small/)
  assert.ok(all(view.tree, n => n.type === 'sdk:Textarea').length === 1)
  assert.ok(byLabel(view.tree, 'Ask about this step'))
  assert.deepEqual(calls.map(c => c.method), ['setup.runtime_check'])
})

test('the page never reads host.state.model (it can be one chat\'s pick)', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: true, model: 'mock-small' }, model: 'claude-x' })
  assert.doesNotMatch(text(view.tree), /claude-x/)
  assert.equal(globalThis.__hhHost.modelRead, undefined)
})

test('no model connected, or the check failed: the message box stays usable and Helper\'s conversation says nothing about it', async () => {
  for (const runtime of [{ ok: false }, new Error('timed out')]) {
    const { view } = await open(fakeStorage(), { runtime })
    assert.notEqual(box(view).props.disabled, true)
    assert.equal(box(view).props.placeholder, 'Reply to Helper')
    const h = text(helper(view))
    for (const line of [NO_MODEL_LINE, NO_MODEL_BOX, CANT_CHECK_LINE]) assert.ok(!h.includes(line), line)
    assert.equal(byLabel(helper(view), 'Check again'), null)
    assert.ok(byLabel(view.tree, 'Ask about this step'))
    // a message is answered all the same: picks and key words need no model
    box(view).props.onChange({ target: { value: 'Peter' } })
    box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
    assert.equal(byData(helper(view), 'bubble').props['data-line'], 'F1')
  }
})

test('the message box keeps the whole text (no 500 cut while typing: the key check needs all of it)', async () => {
  const { view } = await open()
  box(view).props.onChange({ target: { value: 'x'.repeat(700) } })
  assert.equal(box(view).props.value.length, 700)
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
  mount(second.Page)
  await settle()
  assert.equal(calls.length, 1)
})

const tabButtons = view => all(byData(view.tree, 'tabs'), n => n.props.role === 'tab')

test('header: no page title, two text tabs in a tablist (Capabilities\' look), the open one underlined; nothing else in it', async () => {
  const { view } = await open()
  const head = byData(view.tree, 'header')
  assert.equal(all(head, n => /^h[1-6]$/.test(n.type)).length, 0)
  assert.doesNotMatch(text(head), /\bHelper\b/)
  assert.equal(all(head, n => n.type === 'sdk:Button').length, 0)
  assert.equal(byData(view.tree, 'tabs').props['aria-label'], 'Helper')
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

test('tabs: Your setup hides the step list and is remembered; arrow keys move between the tabs; Helper stays where it is', async () => {
  const { view, storage } = await open()
  assert.ok(byData(view.tree, 'steps'))
  click(tabButtons(view)[1])
  assert.equal(byData(view.tree, 'steps'), null)
  assert.equal(storage.data.get('tab'), 'yours')
  assert.deepEqual(helper(view).props.style, { width: '460px' })
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

// Hermes's look: one primary (blue) button per screen; Send is the composer's own icon button.
const primaries = tree => all(tree, n => n.type === 'sdk:Button' && (!n.props.variant || n.props.variant === 'default') && n.props['aria-label'] !== 'Send').map(n => text(n).trim())

test('one primary button per screen: setup with and without a model, the failed check, Your setup; Helper\'s window adds none', async () => {
  for (const runtime of [{ ok: true, model: 'm' }, { ok: false }, new Error('down')]) {
    const { view } = await open(fakeStorage(), { runtime })
    assert.deepEqual(primaries(view.tree), ['I understand, next step'], JSON.stringify(runtime))
    assert.deepEqual(primaries(helper(view)), [])
  }
  const { view } = await open(fakeStorage({ tab: 'yours' }))
  await settle()
  assert.deepEqual(primaries(view.tree), [])
  assert.equal(byLabel(byData(view.tree, 'detail'), 'Check again').props.variant, 'secondary')
})

test('message box: one line that grows, no resize grip; the box, "Skip" while the opening asks, and a round send button (no model name, no microphone)', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: true, model: 'claude-opus-4-8' } })
  assert.equal(box(view).props.rows, 1)
  for (const c of ['field-sizing-content', 'max-h-40', 'min-h-0', 'resize-none']) assert.ok(classes(box(view)).includes(c), c)
  assert.equal(box(view).props['aria-label'], 'Message to Helper')
  const row = all(byData(view.tree, 'composer'), n => n.props.className === K.composerRow)[0]
  const kids = row.props.children.filter(Boolean)
  assert.deepEqual(kids.map(k => k.props['data-hh'] || k.props['aria-label'] || k.props.className), [K.composerInputCell, 'skip', 'Send'])
  assert.ok(classes(kids[2]).includes('sdk-primary-icon-btn'), 'Hermes\'s round send button')
  assert.match(K.composerSurface, /(^|\s)rounded-2xl(\s|$)/)
  assert.doesNotMatch(text(helper(view)), /Opus 4\.8/)
  assert.equal(all(helper(view), n => /mic/i.test(String(n.props['aria-label'] || '')) || n.props.name === 'mic').length, 0)
  // the message box is the window's last part: nothing sits under the conversation
  assert.equal(helper(view).props.children.filter(Boolean).at(-1).props['data-hh'], 'composer')
})

/* ---------- the page measures its own size (src/layout.js) ---------- */
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
function resize(view, width, height = 822) {
  const live = observers.filter(o => o.watching)
  assert.equal(live.length, 1, 'one live observer on our own page element')
  assert.equal(live[0].watching.id, 'our-page')
  live[0].cb([{ contentRect: { width, height } }])
}
async function openMeasured(storage = fakeStorage(), host) {
  fakeResizeObserver()
  const opened = await open(storage, host)
  page(opened.view).props.ref({ id: 'our-page' })
  return opened
}
const steps = view => byData(view.tree, 'steps')

/* ---------- the edge to drag ---------- */
const pointer = (x, more = {}) => ({ clientX: x, button: 0, pointerId: 1, preventDefault() {}, currentTarget: { setPointerCapture() {} }, ...more })

test('the edge to drag: a named separator on the window\'s left edge with its width, least and most; the keyboard can reach it', async () => {
  const { view } = await openMeasured()
  resize(view, 1440)
  const g = grip(view)
  assert.equal(helper(view).props.children.filter(Boolean)[0], g, 'first in the window')
  assert.equal(g.props.className, T.grip)
  assert.equal(g.props.role, 'separator')
  assert.equal(g.props['aria-orientation'], 'vertical')
  assert.equal(g.props['aria-label'], 'Width of Helper')
  assert.deepEqual([g.props['aria-valuenow'], g.props['aria-valuemin'], g.props['aria-valuemax']], [460, 360, 600])
  assert.equal(g.props.tabIndex, 0)
})

test('dragging the edge left makes Helper wider, right narrower, between 360 and 600 px; the width is saved when the drag ends, and comes back', async () => {
  const { view, storage, Page } = await openMeasured()
  resize(view, 1440)
  const width = () => helper(view).props.style.width
  grip(view).props.onPointerDown(pointer(900))
  grip(view).props.onPointerMove(pointer(860))
  assert.equal(width(), '500px', '40 px to the left: 40 px wider')
  assert.equal(grip(view).props['aria-valuenow'], 500)
  assert.equal(storage.data.get('helperWidth'), undefined, 'not saved for every pixel of the drag')
  grip(view).props.onPointerMove(pointer(400))
  assert.equal(width(), '600px', 'never wider than 600')
  grip(view).props.onPointerMove(pointer(1200))
  assert.equal(width(), '360px', 'never narrower than 360')
  grip(view).props.onPointerMove(pointer(948))
  grip(view).props.onPointerUp(pointer(948))
  assert.equal(width(), '412px')
  assert.equal(storage.data.get('helperWidth'), 412)
  // after the drag has ended, moving the pointer does nothing
  grip(view).props.onPointerMove(pointer(700))
  assert.equal(width(), '412px')
  // a press with another mouse button starts no drag
  grip(view).props.onPointerDown(pointer(900, { button: 2 }))
  grip(view).props.onPointerMove(pointer(800))
  assert.equal(width(), '412px')
  // the next opening of the page starts from the saved width
  const again = mount(Page)
  await settle()
  assert.equal(byData(again.tree, 'helper').props.style.width, '412px')
  assert.deepEqual([...storage.data.keys()], ['helperWidth'], 'the width is the only thing the drag stored')
})

test('the edge with the keyboard: the arrow keys move it 16 px; Home is the narrowest and End the widest (the least and the most of the value it reports); saved each time', async () => {
  const { view, storage } = await openMeasured()
  resize(view, 1440)
  const key = name => grip(view).props.onKeyDown({ key: name, preventDefault() {} })
  key('ArrowLeft')
  assert.equal(helper(view).props.style.width, '476px')
  assert.equal(storage.data.get('helperWidth'), 476)
  key('ArrowRight')
  key('ArrowRight')
  assert.equal(helper(view).props.style.width, '444px')
  key('End')
  assert.equal(helper(view).props.style.width, '600px')
  assert.equal(grip(view).props['aria-valuenow'], grip(view).props['aria-valuemax'])
  key('Home')
  assert.equal(helper(view).props.style.width, '360px')
  assert.equal(grip(view).props['aria-valuenow'], grip(view).props['aria-valuemin'])
  key('ArrowRight')
  assert.equal(helper(view).props.style.width, '360px')
  key('a')
  assert.equal(storage.data.get('helperWidth'), 360)
})

/* ---------- narrow windows ---------- */
test('1440 px window with Hermes\'s sidebar (1180 px page): the full step list, Helper 460 px beside it, its edge to drag, no strip', async () => {
  const { view } = await openMeasured(fakeStorage({ step: 2 }))
  resize(view, 1180)
  assert.equal(steps(view).props['data-numbers-only'], false)
  assert.equal(steps(view).props.style.width, '256px')
  assert.deepEqual(helper(view).props.style, { width: '460px' })
  assert.ok(grip(view))
  assert.equal(strip(view), null)
  // the open step is 464 px wide there: its two-column comparison stacks into one
  assert.equal(byData(view.tree, 'compare').props['data-columns'], 1)
  // dragging Helper's window to 400 px gives the step 524 px: two columns again
  grip(view).props.onPointerDown(pointer(720))
  grip(view).props.onPointerMove(pointer(780))
  grip(view).props.onPointerUp(pointer(780))
  assert.equal(helper(view).props.style.width, '400px')
  assert.equal(byData(view.tree, 'compare').props['data-columns'], 2)
  grip(view).props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} })
  assert.equal(byData(view.tree, 'compare').props['data-columns'], 1, '416 px: one column again')
  for (let i = 0; i < 3; i++) grip(view).props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} })
  assert.equal(helper(view).props.style.width, '464px')
  // with Hermes's sidebar hidden (1440 px page) it has its two columns
  resize(view, 1440)
  assert.equal(byData(view.tree, 'compare').props['data-columns'], 2)
  assert.ok(classes(byData(view.tree, 'compare')).includes(K.twoColumns))
  assert.ok(classes(byData(view.tree, 'choices')).includes(K.twoColumns))
})

test('getting narrower, in order: first the step list shrinks to its numbers, then Helper\'s window narrows to 360, then Helper lies over the page', async () => {
  const { view, storage } = await openMeasured(fakeStorage({ step: 2 }))
  // 1200 px window (940 px page): numbers only, Helper still 460
  resize(view, 940)
  assert.equal(steps(view).props['data-numbers-only'], true)
  assert.equal(steps(view).props.style.width, '48px')
  assert.doesNotMatch(text(steps(view)), /[A-Za-z]/)
  const rows = all(steps(view), n => n.type === 'sdk:RowButton')
  assert.ok(rows.length >= 2)
  rows.forEach((r, i) => assert.match(r.props['aria-label'], new RegExp(`^Step ${i + 1}: \\S`)))
  assert.equal(helper(view).props.style.width, '460px')
  assert.equal(helper(view).props['data-over'], false)
  assert.ok(!classes(byData(view.tree, 'choices')).includes(K.twoColumns))
  // 1000 px window (740 px page): Helper narrows so the open step keeps 320 px
  resize(view, 740)
  assert.equal(helper(view).props.style.width, '372px')
  assert.equal(helper(view).props['data-over'], false)
  assert.ok(grip(view), 'still beside the page, still draggable')
  assert.equal(strip(view), null)
  // 728 px of page is the least that holds both sides
  resize(view, 728)
  assert.equal(helper(view).props.style.width, '360px')
  assert.equal(helper(view).props['data-over'], false)
  resize(view, 727)
  assert.equal(helper(view).props['data-over'], true)
  assert.ok(strip(view))
  assert.equal(grip(view), null, 'no edge to drag while it lies over the page')
  // nothing of this is saved, and it all comes back when the window is wide again
  assert.deepEqual([...storage.data.keys()], ['step'])
  resize(view, 1180)
  assert.equal(helper(view).props['data-over'], false)
  assert.equal(steps(view).props['data-numbers-only'], false)
  assert.equal(strip(view), null)
})

test('800 px window (540 px page): Helper starts open, over the page, beside its strip at the page\'s right edge', async () => {
  const { view } = await openMeasured()
  resize(view, 540)
  const kids = page(view).props.children.filter(Boolean)
  assert.deepEqual(kids.map(k => k.props['data-hh']), ['talk-css', 'left', 'helper-strip', 'helper'])
  const h = helper(view)
  assert.equal(h.props['data-over'], true)
  assert.equal(h.props.className, `${T.win} ${T.winOver}`)
  assert.deepEqual(h.props.style, { width: '460px', right: '28px' }, 'it leaves the strip free')
  // it keeps its fill under Hermes's see-through look, where it lies on the page
  assert.equal(h.props['data-glass-opaque'], '')
  assert.match(K.root, /(^|\s)relative(\s|$)/, 'placed inside our own page')
  assert.match(TALK_CSS, /\.hh-win\.hh-over\{position:absolute;top:0;bottom:0;[^}]*z-index:20/)
  // the step list keeps its narrow layout under it
  assert.equal(steps(view).props['data-numbers-only'], true)
  assert.equal(byData(helper(view), 'bubble').props['data-line'], 'OPEN', 'the greeting is seen first')
})

test('the strip: one plain button with HELPER written down it; it folds Helper away and brings it back; nothing is saved', async () => {
  const { view, storage } = await openMeasured()
  resize(view, 540)
  const s = strip(view)
  assert.equal(s.type, 'button')
  assert.equal(s.props.className, K.strip)
  assert.match(K.strip, /(^|\s)h-full(\s|$)/)
  assert.match(K.strip, /(^|\s)w-7(\s|$)/)
  assert.equal(text(s).trim(), 'Helper')
  assert.match(K.stripLabel, /\[writing-mode:vertical-rl\]/)
  assert.match(K.stripLabel, /(^|\s)uppercase(\s|$)/)
  assert.equal(all(s, n => typeof n.type === 'function' || n.type === 'svg').length, 0, 'no character in the strip')
  // open: the strip says it hides, the chevron points out of the page
  assert.equal(s.props['aria-label'], 'Hide the helper')
  assert.equal(s.props['aria-expanded'], true)
  assert.equal(all(s, n => n.type === 'sdk:Codicon')[0].props.name, 'chevron-right')
  click(s)
  assert.equal(helper(view), null)
  assert.equal(strip(view).props['aria-label'], 'Show the helper')
  assert.equal(strip(view).props['aria-expanded'], false)
  assert.equal(all(strip(view), n => n.type === 'sdk:Codicon')[0].props.name, 'chevron-left')
  // folded: the left side has the page to itself
  assert.deepEqual(page(view).props.children.filter(Boolean).map(k => k.props['data-hh']), ['talk-css', 'left', 'helper-strip'])
  click(strip(view))
  assert.equal(helper(view).props['data-over'], true)
  assert.deepEqual([...storage.data.keys()], [])
})

test('folded, then the window widens: Helper is back as its column; narrow again: it is open', async () => {
  const { view } = await openMeasured()
  resize(view, 540)
  click(strip(view))
  assert.equal(helper(view), null)
  resize(view, 1180)
  assert.equal(helper(view).props['data-over'], false)
  assert.equal(strip(view), null)
  resize(view, 540)
  assert.equal(helper(view).props['data-over'], true)
})

test('"Ask about this step" brings a folded Helper back, with the keyboard in the message box', async () => {
  const { view } = await openMeasured()
  resize(view, 540)
  click(strip(view))
  assert.equal(helper(view), null)
  click(byLabel(view.tree, 'Ask about this step'))
  assert.equal(helper(view).props['data-over'], true)
})

test('over the page: Escape folds it and the keyboard goes back to the strip; brought back, the message box has it', async () => {
  const { view } = await openMeasured()
  resize(view, 540)
  let focused = null
  box(view).props.ref.current = { focus: () => (focused = 'box') }
  strip(view).props.ref.current = { focus: () => (focused = 'strip') }
  helper(view).props.onKeyDown({ key: 'a', preventDefault() {} })
  assert.ok(helper(view))
  helper(view).props.onKeyDown({ key: 'Escape', preventDefault() {} })
  assert.equal(helper(view), null)
  assert.equal(focused, 'strip')
  click(strip(view))
  box(view).props.ref.current = { focus: () => (focused = 'box') }
  click(strip(view))
  click(strip(view))
  assert.equal(focused, 'box')
  // beside the page (a wide window) Escape does nothing to it
  resize(view, 1180)
  assert.equal(helper(view).props.onKeyDown, undefined)
})

test('switching tabs never moves Helper between its column and over the page (one threshold for both tabs)', async () => {
  const { view } = await openMeasured()
  for (const [width, over] of [[700, true], [727, true], [728, false], [900, false]]) {
    resize(view, width)
    click(tabButtons(view)[0])
    assert.equal(helper(view).props['data-over'], over, `setup at ${width}`)
    click(tabButtons(view)[1])
    assert.equal(helper(view).props['data-over'], over, `your setup at ${width}`)
  }
})

test('the smallest window, 400 x 620 with Hermes\'s sidebar hidden: Helper 372 px wide over the page plus the strip, the small character, the tight padding', async () => {
  const { view } = await openMeasured()
  resize(view, 400, 620)
  assert.deepEqual(helper(view).props.style, { width: '372px', right: '28px' })
  assert.equal(helper(view).props.className, `${T.win} ${T.winTight} ${T.winSmall} ${T.winOver}`)
  assert.equal(all(helper(view), n => n.props['data-hh-character'])[0].props.width, 132)
})

test('Your setup at 1100 px (840 px page): cards in one column beside Helper; wide: two columns', async () => {
  const { view } = await openMeasured(fakeStorage({ tab: 'yours' }))
  resize(view, 840)
  assert.equal(helper(view).props['data-over'], false)
  assert.equal(byData(view.tree, 'cards').props['data-columns'], 1)
  assert.ok(!classes(byData(view.tree, 'cards')).includes(K.twoColumns))
  resize(view, 1180)
  assert.equal(byData(view.tree, 'cards').props['data-columns'], 2)
  assert.ok(classes(byData(view.tree, 'cards')).includes(K.twoColumns))
})

test('the page measures its own outer element, width and height; unmount: React calls the ref with null, which stops the observer', async () => {
  const { view } = await openMeasured()
  resize(view, 900, 500)
  assert.equal(page(view).props['data-width'], 900)
  assert.equal(page(view).props['data-height'], 500)
  page(view).props.ref(null)
  assert.equal(observers.filter(o => o.watching).length, 0)
})

test('the page\'s ref functions stay the same between renders (React would detach and re-attach new ones)', async () => {
  const { view } = await openMeasured()
  const before = [page(view).props.ref, ...tabButtons(view).map(b => b.props.ref)]
  resize(view, 900)
  click(tabButtons(view)[1])
  const after = [page(view).props.ref, ...tabButtons(view).map(b => b.props.ref)]
  before.forEach((r, i) => assert.equal(after[i], r, `ref ${i}`))
})

test('numbers-only step list: the later steps carry their title too', async () => {
  const { view } = await openMeasured()
  resize(view, 540)
  const later = all(steps(view), n => n.props.role === 'img')
  assert.ok(later.length >= 1)
  for (const l of later) assert.match(l.props['aria-label'], /^Step \d+: \S.*, comes later$/)
})

test('Your setup: no heading repeating the tab name, just its one line', async () => {
  const { view } = await open(fakeStorage({ tab: 'yours' }))
  assert.equal(all(byData(view.tree, 'detail'), n => /^h[1-3]$/.test(n.type)).length, 0)
  assert.ok(byData(view.tree, 'yours-lead'))
})

/* ---------- the edge: what is not a drag ---------- */
test('a press on the edge that does not move it saves nothing; in a window that squeezes Helper, neither it nor a "wider" arrow key touches the remembered width', async () => {
  const { view, storage } = await openMeasured()
  resize(view, 1180)
  grip(view).props.onPointerDown(pointer(720))
  grip(view).props.onPointerUp(pointer(720))
  assert.equal(helper(view).props.style.width, '460px')
  assert.equal(storage.data.has('helperWidth'), false)
  // 740 px of page: Helper is drawn narrower than the remembered 460
  resize(view, 740)
  const squeezed = helper(view).props.style.width
  assert.notEqual(squeezed, '460px')
  assert.ok(grip(view), 'the edge is still there')
  grip(view).props.onPointerDown(pointer(368))
  grip(view).props.onPointerUp(pointer(368))
  assert.equal(storage.data.has('helperWidth'), false)
  // an arrow key that would make it wider changes nothing on screen, so it saves nothing
  grip(view).props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} })
  assert.equal(storage.data.has('helperWidth'), false)
  assert.equal(helper(view).props.style.width, squeezed)
  resize(view, 1180)
  assert.equal(helper(view).props.style.width, '460px', 'the wide window gets the remembered width back')
})

test('a drag the system cancels, or whose pointer is lost, puts the width back and saves nothing; the "lost pointer" that follows a normal end undoes nothing', async () => {
  const { view, storage } = await openMeasured()
  resize(view, 1180)
  const width = () => helper(view).props.style.width
  for (const end of ['onPointerCancel', 'onLostPointerCapture']) {
    grip(view).props.onPointerDown(pointer(720))
    grip(view).props.onPointerMove(pointer(660))
    assert.equal(width(), '520px')
    // the event carries a place, as a real one does; it is not where the drag ended
    grip(view).props[end](pointer(0))
    assert.equal(width(), '460px', end)
    assert.equal(storage.data.has('helperWidth'), false, end)
    grip(view).props.onPointerMove(pointer(600))
    assert.equal(width(), '460px', 'the drag is over')
  }
  // a normal end is saved; the browser's "lost pointer" event after it changes nothing
  grip(view).props.onPointerDown(pointer(720))
  grip(view).props.onPointerMove(pointer(660))
  grip(view).props.onPointerUp(pointer(660))
  grip(view).props.onLostPointerCapture(pointer(0))
  assert.equal(width(), '520px')
  assert.equal(storage.data.get('helperWidth'), 520)
  // an end that names no place is not a width either
  grip(view).props.onPointerDown(pointer(660))
  grip(view).props.onPointerMove(pointer(700))
  grip(view).props.onPointerUp({})
  assert.equal(width(), '520px')
  assert.equal(storage.data.get('helperWidth'), 520)
})

test('a narrow window opens with Helper shown, lying over the page: it is not folded away until the person folds it', async () => {
  const { view } = await openMeasured()
  resize(view, 540)
  assert.ok(helper(view), 'Helper is on screen')
  assert.ok(helper(view).props.className.split(' ').includes(T.winOver))
})
