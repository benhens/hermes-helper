// setup-chat (Lead, 11 Nov): the offers on the page, and the points found by typing into the real app.
//   note c: an offer is a second bubble under Helper's line, its things to pick in the message box, as every other pick
//   8.  a pressed button's label is not the person's words: never sent to the AI as "Person: Skip"
//   11. the person's own earlier typed messages reach the last lines sent (with the cause of hhtech's miss pinned)
//   7 and 16. with no AI that answers, a failed call turns the AI step off: no further call and no dots in that visit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData, spoken } from './lib/render.mjs'
import { aiModeSource } from './lib/mode-loader.mjs'
import { looksSecret } from '../src/secret-rule.js'

function useHost({ oneshot = () => 'NONE', check = { ok: true, model: 'mock-small' } } = {}) {
  const host = {
    asks: [],
    request: async (method, params) => {
      if (method === 'llm.oneshot') {
        host.asks.push(params)
        const a = await oneshot(params, host.asks.length)
        if (a instanceof Error) throw a
        return { text: a }
      }
      const answer = { 'setup.runtime_check': check, 'setup.status': { provider_configured: false } }[method]
      if (!answer) throw new Error('unexpected ' + method)
      return answer
    }
  }
  globalThis.__hhHost = host
  return host
}
async function open(mode, { storage = fakeStorage(), host = {} } = {}) {
  const h = useHost(host)
  const timers = fakeTimers({ hold: [12000] })
  const { Page } = await registerPlugin(storage, timers, {}, src => aiModeSource(src, mode))
  const view = mount(Page)
  await settle()
  return { view, timers, host: h, storage }
}
const helper = view => byData(view.tree, 'helper')
const bubble = view => byData(helper(view), 'bubble')
const bubbleLine = view => bubble(view).props['data-line']
const bubbleSaid = view => spoken(byData(bubble(view), 'said')).trim()
const olds = view => all(helper(view), n => n.props['data-hh'] === 'old')
const mine = view => all(helper(view), n => n.props['data-hh'] === 'me').map(n => text(n).replace(/^You said: /, '').trim())
const dots = view => byData(helper(view), 'busy-dots')
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const finish = view => byData(view.tree, 'page').props.onPointerDownCapture({})
const answers = view => all(view.tree, n => n.props['data-hh'] === 'answer')
const labels = view => answers(view).map(a => text(a).trim())
function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  finish(view)
}
function press(view, label) {
  const a = answers(view).find(n => text(n).trim() === label)
  if (!a) throw new Error('no pick ' + label + ' among ' + labels(view).join(' / '))
  a.props.onClick({ preventDefault() {} })
  finish(view)
}
async function pastOpening(mode, options) {
  const o = await open(mode, options)
  finish(o.view)
  send(o.view, 'Peter')
  send(o.view, 'I run a tennis club')
  return o
}

/* ---------- note c: the offer bubble ---------- */




/* ---------- 8 and 11: what reaches the AI ---------- */
const personLines = input => input.split('\n').filter(l => l.startsWith('Person: '))



// The cause of hhtech's miss (hhtech-ai-share, "what do you mean?" had "Person: Skip" but not his first message): his
// first message, the one about tokens, looks like a secret by Helper's secret rule (the word "tokens" and a value), and
// a line that looks like a secret is never sent. The rule is hhcontent's and is left as it is; told to Lead.
test('point 11, the cause pinned: his first message looks like a secret by the secret rule, so it is left out of the lines; "Skip" is left out now too', async () => {
  const TOKENS = "How can I make it so I use less usage? Whenever I ask a question it doesn't take as many tokens"
  assert.ok(looksSecret(TOKENS), 'the secret rule takes it for a secret (a false alarm, reported)')
  const { view, host } = await open('ai_writes')
  finish(view)
  byData(view.tree, 'skip').props.onClick({ preventDefault() {} })
  finish(view)
  send(view, TOKENS)
  send(view, 'what do you mean?')
  await settle()
  assert.equal(host.asks.length >= 1, true)
  assert.deepEqual(personLines(host.asks[0].input), [], 'neither the pressed Skip nor the message that looks like a secret')
})

/* ---------- 7 and 16: no AI that answers ---------- */

test('points 7 and 16: the model check says no model: no call and no dots at all', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { check: { ok: false, error: 'No usable credentials found' } } })
  for (const typed of ['can it fly a kite', 'what do you mean?', 'tell me about goats']) {
    send(view, typed)
    assert.equal(dots(view), null, typed)
    await settle()
  }
  assert.equal(host.asks.length, 0)
})
