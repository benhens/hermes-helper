// talk-live rows 3, 5, 6 and 7 on the page: the AI step with a fake Hermes (llm.oneshot answered by the test) and
// the 12 s timer held until the test fires it. The mode is set in the copy of the built file the test loads
// (tests/lib/mode-loader.mjs), so these run the same in every run of scripts/test-modes.mjs.
// talk-live-3: live-v2 changes-5 took "update" out of sch1's key words, so "how do I update hermes" finds no rows by
// words any more and goes to the first call. Where a test needs a message that code answers with N1 and that finds
// the schedule rows by words (as that one did), it now sends "send me a summary" (sch1 by words, N1 from code).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, spoken, byData } from './lib/render.mjs'
import { aiModeSource } from './lib/mode-loader.mjs'
import { LIVE_ROW } from '../src/live-rows.js'
import { TALK_DATA } from '../src/talk-data.js'
import { curlyQuotes } from '../src/quotes.js'

// A fake Hermes. oneshot(params) answers llm.oneshot: a string, an Error to throw, or a promise (a test's
// deferred). Every llm.oneshot's params are kept in host.asks.
function useHost({ oneshot = () => 'NONE', runtime = { ok: true, model: 'mock-small' } } = {}) {
  const host = {
    calls: [],
    asks: [],
    request: async (method, params) => {
      host.calls.push(method)
      if (method === 'llm.oneshot') {
        host.asks.push(params)
        const a = await oneshot(params, host.asks.length)
        if (a instanceof Error) throw a
        return { text: a }
      }
      const answer = { 'setup.runtime_check': runtime, 'setup.status': { provider_configured: false } }[method]
      if (!answer) throw new Error('unexpected ' + method)
      return answer
    }
  }
  globalThis.__hhHost = host
  return host
}
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((y, n) => {
    resolve = y
    reject = n
  })
  return { promise, resolve, reject }
}

async function open(mode, { storage = fakeStorage(), host = {} } = {}) {
  const h = useHost(host)
  const timers = fakeTimers({ hold: [12000] })
  const { Page } = await registerPlugin(storage, timers, {}, src => aiModeSource(src, mode))
  const view = mount(Page)
  await settle()
  return { view, timers, host: h, storage, Page }
}
const helper = view => byData(view.tree, 'helper')
const bubble = view => byData(helper(view), 'bubble')
// setup-chat (offer-t1, changes-8): a line that carries an offer is followed by a second bubble with the offer's
// question. line() and said() below still mean Helper's line for the message: when the bubble holds an offer, the
// line just above it. offerLine() and offerSaid() read the offer bubble itself (tests/offers-page.test.mjs has its cases).
const offerUp = view => !!bubble(view) && String(bubble(view).props['data-line']).startsWith('offer-')
const lastOld = view => all(helper(view), n => n.props['data-hh'] === 'old').at(-1)
const offerLine = view => (offerUp(view) ? bubble(view).props['data-line'] : null)
const offerSaid = view => (offerUp(view) ? spoken(byData(bubble(view), 'said')).trim() : null)
const line = view => (offerUp(view) ? lastOld(view).props['data-line'] : bubble(view) ? bubble(view).props['data-line'] : null)
const said = view => (offerUp(view) ? text(lastOld(view)).replace(/^Helper said: /, '').replace(/\s+/g, ' ').trim() : spoken(byData(bubble(view), 'said')).trim())
const dots = view => byData(helper(view), 'busy-dots')
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const finish = view => byData(view.tree, 'page').props.onPointerDownCapture({})
// last-reset: every line of the window in order (older lines, then the bubble)
const allLines = view => [...all(byData(view.tree, 'helper'), n => n.props['data-hh'] === 'old').map(n => n.props['data-line']), bubble(view) ? bubble(view).props['data-line'] : null].filter(Boolean)
const mine = view => all(helper(view), n => n.props['data-hh'] === 'me').map(n => text(n).replace(/^You said: /, '').trim())
const expression = view => (all(view.tree, n => n.props['data-expression'])[0] || { props: {} }).props['data-expression']
function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
}
async function pastOpening(mode, options) {
  const o = await open(mode, options)
  finish(o.view)
  send(o.view, 'Peter')
  finish(o.view)
  send(o.view, 'I run a tennis club')
  finish(o.view)
  return o
}
// A reply that passes every check: the row's own words (rule 7 aside), with its USED line
const goodReply = id => `${LIVE_ROW[id].text}\nUSED: ${id}`
const N1 = curlyQuotes(TALK_DATA.fixed.N1.text) // as drawn










test('the waiting dots: still and all alike under reduce motion; the label is said once (the style sheet moves the lit dot, the page is not drawn again)', async () => {
  const d = deferred()
  const { view } = await pastOpening('ai_writes', { host: { oneshot: () => d.promise } })
  send(view, 'send me a summary')
  const node = dots(view)
  assert.equal(node.props.role, 'status')
  assert.deepEqual(all(node, n => n.type === 'i').map(n => n.props.className), [undefined, undefined, undefined])
  d.resolve('NONE')
  await settle()
})

/* ---------- review fixes (the reviewer's findings 1 to 4 and 12, each reproduced first) ---------- */
const answers = view => all(view.tree, n => n.props['data-hh'] === 'answer')
const pickLabel = (view, label) => {
  finish(view)
  const a = answers(view).find(x => text(x).trim() === label)
  if (!a) throw new Error(`no pick ${label}: ${answers(view).map(x => text(x).trim())}`)
  a.props.onClick({ preventDefault() {} })
}





test('the waiting dots under reduce motion: all three still and alike (hh-still), no moving dot', async () => {
  const setting = { matches: true, addEventListener() {}, removeEventListener() {} }
  globalThis.matchMedia = () => setting
  try {
    const d = deferred()
    const { view } = await pastOpening('ai_writes', { host: { oneshot: () => d.promise } })
    send(view, 'send me a summary')
    assert.match(dots(view).props.className, /hh-still/)
    assert.doesNotMatch(dots(view).props.className, /hh-wait|hh-dots-run/)
    d.resolve('NONE')
    await settle()
  } finally {
    delete globalThis.matchMedia
  }
})
