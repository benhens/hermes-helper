// The page itself, rendered from the built desktop/plugin.js with stand-ins for React and the
// Hermes SDK (tests/lib/render.mjs): what registers, the model check on opening, the three tabs (dash-v1), the
// page's frame (the left side, Helper's window on the right, our one style sheet), the edge to
// drag, and how the page fits narrow windows. Helper's conversation is tests/talk-window.test.mjs;
// the real app run is dev/checks/talk-v1 (Xvfb). This is the offline guard for later changes.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { registerPlugin, fakeStorage, mount, settle, all, text, byData, byLabel, click } from './lib/render.mjs'
import { NO_MODEL_LINE, NO_MODEL_BOX, CANT_CHECK_LINE } from '../src/model-status.js'
import { K, T } from '../src/look.js'
import { TALK_CSS } from '../src/talk-css.js'
import { DASH_CSS } from '../src/dash-css.js'

let calls
function useHost({ runtime = { ok: true, model: 'mock-small' }, status = { provider_configured: false }, model = '' } = {}) {
  calls = []
  globalThis.__hhHost = {
    request: async (method, params, timeout) => {
      calls.push({ method, params, timeout })
      const answer = { 'setup.runtime_check': runtime, 'setup.status': status }[method]
      if (!answer) throw new Error('unexpected ' + method)
      if (answer instanceof Error) throw answer
      return answer
    },
    model
  }
}

// dash-v1: the Dashboard (the first tab) reads Hermes too, always naming the bot (profile or name); this fake
// answers none of those, so the Dashboard shows no numbers. Helper's own model check names no bot.
const helperCalls = () => calls.filter(c => !(c.params && (c.params.profile || c.params.name)))

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

test('the page\'s frame: our one style sheet first, then the left side (tabs, the open tab), then Helper\'s window on the right', async () => {
  const { view } = await open()
  const kids = page(view).props.children.filter(Boolean)
  assert.deepEqual(kids.map(k => k.props['data-hh']), ['talk-css', 'left', 'helper'])
  // loom-fixes (Lead's point 16): and hh-root, which clips (src/talk.css), so the browser cannot scroll the page sideways
  assert.equal(page(view).props.className, `${K.root} ${T.root}`)
  assert.match(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'talk.css'), 'utf8'), /\.hh-root\{overflow:clip\}/)
  assert.doesNotMatch(K.root, /(^|\s)flex-col(\s|$)/, 'a row: left side, then Helper')
  const left = kids[1]
  assert.equal(left.props.className, K.left)
  assert.deepEqual(left.props.children.map(k => k.props['data-hh']), ['header', 'body'])
  assert.deepEqual(byData(view.tree, 'body').props.children.map(k => k.props['data-hh']), ['detail'])
  // dash-v1: the open tab is the Dashboard
  assert.ok(byData(byData(view.tree, 'detail'), 'dashboard'))
  // Helper's window: a named region, last, 460 px wide, wearing our own class
  const h = kids[2]
  assert.equal(h.props.role, 'complementary')
  assert.equal(h.props['aria-label'], 'Helper')
  assert.equal(h.props.className, T.win)
  assert.deepEqual(h.props.style, { width: '460px' })
  assert.equal(h.props['data-over'], false)
})

test('Helper\'s style sheet is one <style> element inside our own page, holding the built sheet and nothing else; the Dashboard\'s is one more, inside the tab', async () => {
  const { view } = await open()
  const talk = all(view.tree, n => n.type === 'style' && n.props['data-hh'] === 'talk-css')
  assert.equal(talk.length, 1)
  assert.equal(talk[0].props.children, TALK_CSS)
  assert.equal(talk[0].props.dangerouslySetInnerHTML, undefined)
  assert.ok(all(page(view), n => n === talk[0]).length === 1, 'inside our page element, so it leaves with the page')
  // dash-v1: the Dashboard's sheet lives inside the tab, so it leaves with the tab
  const dash = all(byData(view.tree, 'dashboard'), n => n.type === 'style')
  assert.equal(dash.length, 1)
  assert.equal(dash[0].props.children, DASH_CSS)
  assert.equal(all(view.tree, n => n.type === 'style').length, 2)
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

test('model connected: one check on opening; no model name in Helper\'s window', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: true, provider: 'custom', model: 'mock-small' } })
  assert.equal(byData(view.tree, 'model-name'), null)
  assert.doesNotMatch(text(helper(view)), /Mock Small|mock-small/)
  assert.ok(all(view.tree, n => n.type === 'sdk:Textarea').length === 1)
  assert.deepEqual(helperCalls().map(c => c.method), ['setup.runtime_check'])
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
    // the name is answered all the same: it needs no model (normal-chat: its line is CHAT_HELLO, no longer F1)
    box(view).props.onChange({ target: { value: 'Peter' } })
    box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
    assert.equal(byData(helper(view), 'bubble').props['data-line'], 'CHAT_HELLO')
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
  assert.equal(helperCalls().length, 2)
  useHost({ runtime: { ok: true, model: 'm' } })
  const second = await registerPlugin()
  mount(second.Page)
  await settle()
  mount(second.Page)
  await settle()
  assert.equal(helperCalls().length, 1)
})

test('no tabs (loom2: his Loom of 11 Nov, 1:51 "take out the learn and just have this set up"): the header holds nothing, the page is the Dashboard; a stored Learn tab opens it too', async () => {
  const { view, storage } = await open()
  const head = byData(view.tree, 'header')
  assert.equal(head.props.className, K.head)
  assert.ok(!head.props.children)
  assert.equal(byData(view.tree, 'tabs'), null)
  assert.equal(all(view.tree, n => n.props && (n.props.role === 'tab' || n.props.role === 'tablist' || n.props.role === 'tabpanel')).length, 0)
  assert.doesNotMatch(text(view.tree), /\bLearn\b|Nothing here yet|My setup/)
  assert.ok(byData(byData(view.tree, 'detail'), 'dashboard'))
  assert.equal(storage.data.get('tab'), undefined, 'no tab is stored')
  for (const old of ['learn', 'setup', 'yours', 'my_setup']) {
    const again = await open(fakeStorage({ tab: old }))
    assert.ok(byData(again.view.tree, 'dashboard'), old)
    assert.doesNotMatch(text(again.view.tree), /Nothing here yet/)
  }
})

// Hermes's look: one primary (blue) button per screen; Send is the composer's own icon button.
const primaries = tree => all(tree, n => n.type === 'sdk:Button' && (!n.props.variant || n.props.variant === 'default') && n.props['aria-label'] !== 'Send').map(n => text(n).trim())

test('one primary button per screen at most: the Dashboard with and without a model, the failed check; Helper\'s window adds none', async () => {
  // look: the Dashboard has exactly one, the banner's "Open <the first card not marked>" (Hermes's default variant,
  // his pick of 11 Nov); every other button there is secondary, ghost or link
  for (const runtime of [{ ok: true, model: 'm' }, { ok: false }, new Error('down')]) {
    const { view } = await open(fakeStorage(), { runtime })
    assert.deepEqual(primaries(view.tree), ['Open Model'], JSON.stringify(runtime))
    assert.equal(byData(view.tree, 'banner-open').props.variant, 'default')
    assert.deepEqual(primaries(helper(view)), [])
  }
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
test('1440 px window with Hermes\'s sidebar (1180 px page): the Dashboard at its full sizes, Helper 460 px beside it, its edge to drag, no strip', async () => {
  const { view } = await openMeasured()
  resize(view, 1180)
  // dash-v1: no step list; the Dashboard has the left side's 720 px and hhdesign's full sizes
  assert.equal(byData(view.tree, 'steps'), null)
  assert.equal(byData(view.tree, 'dashboard').props['data-compact'], false)
  assert.deepEqual(helper(view).props.style, { width: '460px' })
  assert.ok(grip(view))
  assert.equal(strip(view), null)
  // 940 px of page: Helper still 460, the Dashboard's 480 px take the narrow sizes
  resize(view, 940)
  assert.deepEqual(helper(view).props.style, { width: '460px' })
  assert.equal(byData(view.tree, 'dashboard').props['data-compact'], true)
})


test('getting narrower, in order: Helper\'s window narrows so the open tab keeps 320 px, then Helper lies over the page', async () => {
  // dash-v1: no tab has a step list now, so Helper keeps 460 px longer and narrows to 408 px at the least
  const { view, storage } = await openMeasured()
  resize(view, 940)
  assert.equal(helper(view).props.style.width, '460px')
  assert.equal(helper(view).props['data-over'], false)
  // 1000 px window (740 px page): Helper narrows so the open tab keeps 320 px
  resize(view, 740)
  assert.equal(helper(view).props.style.width, '420px')
  assert.equal(helper(view).props['data-over'], false)
  assert.ok(grip(view), 'still beside the page, still draggable')
  assert.equal(strip(view), null)
  // 728 px of page is the least that holds both sides
  resize(view, 728)
  assert.equal(helper(view).props.style.width, '408px')
  assert.equal(helper(view).props['data-over'], false)
  resize(view, 727)
  assert.equal(helper(view).props['data-over'], true)
  assert.ok(strip(view))
  assert.equal(grip(view), null, 'no edge to drag while it lies over the page')
  // nothing of this is saved, and it all comes back when the window is wide again
  assert.deepEqual([...storage.data.keys()], [])
  resize(view, 1180)
  assert.equal(helper(view).props['data-over'], false)
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
  // dash-v1: the Dashboard under it takes the narrow sizes
  assert.equal(byData(view.tree, 'dashboard').props['data-compact'], true)
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

test('the smallest window, 400 x 620 with Hermes\'s sidebar hidden: Helper 372 px wide over the page plus the strip, the small character, the tight padding', async () => {
  const { view } = await openMeasured()
  resize(view, 400, 620)
  assert.deepEqual(helper(view).props.style, { width: '372px', right: '28px' })
  assert.equal(helper(view).props.className, `${T.win} ${T.winTight} ${T.winSmall} ${T.winOver}`)
  assert.equal(all(helper(view), n => n.props['data-hh-character'])[0].props.width, 132)
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
  const before = [page(view).props.ref]
  resize(view, 900)
  const after = [page(view).props.ref]
  before.forEach((r, i) => assert.equal(after[i], r, `ref ${i}`))
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
