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
test('after "What do you do?": "Thanks, Peter." moves up as Helper\'s line and the offer is the bubble, its two things to pick in the message box; typing still works', async () => {
  const { view } = await pastOpening('no_ai_step')
  assert.equal(olds(view).at(-1).props['data-line'], 'F2')
  assert.equal(bubbleLine(view), 'offer-general')
  assert.equal(bubbleSaid(view), 'Do you want to see what Hermes does, or pick its AI?')
  assert.deepEqual(labels(view), ['What Hermes can do', 'Which AI to use'])
  assert.ok(byData(view.tree, 'picks'), 'in the message box, as every other pick')
  assert.equal(box(view).props.placeholder, 'Or type your own question')
  send(view, 'what is a skill')
  assert.equal(bubbleLine(view), 'term-skill', 'typing while things to pick show works as before')
})

test('his example "How can I migrate?": the line, the offer under it, and each pick pressed gives its own line with the label as the person\'s message', async () => {
  for (const [label, id] of [['From another AI app', 'MIG_APP'], ['To another computer', 'MIG_PC']]) {
    const { view } = await pastOpening('no_ai_step')
    send(view, 'How can I migrate?')
    assert.equal(olds(view).at(-1).props['data-line'], 'MIG')
    assert.equal(bubbleLine(view), 'offer-move')
    assert.deepEqual(labels(view), ['From another AI app', 'To another computer'])
    press(view, label)
    assert.equal(mine(view).at(-1), label)
    assert.equal(bubbleLine(view), id)
  }
})

test('the opening of a later visit carries the offer; the don\'t-know line carries its own', async () => {
  const storage = fakeStorage()
  await pastOpening('no_ai_step', { storage })
  const { view } = await open('no_ai_step', { storage })
  finish(view)
  assert.equal(olds(view).at(-1).props['data-line'], 'BACK')
  assert.equal(bubbleLine(view), 'offer-general')
  send(view, 'can it fly a plane')
  await settle()
  assert.equal(olds(view).at(-1).props['data-line'], 'N1')
  assert.equal(bubbleLine(view), 'offer-dont_know')
  assert.deepEqual(labels(view), ['What Hermes is', 'What Hermes can do'])
})

test('"ok and how do I do that" while things to pick show: "Choose one, and I will show you how." and the same things to pick stay', async () => {
  const { view } = await pastOpening('no_ai_step')
  send(view, 'How can I migrate?')
  const before = labels(view)
  send(view, 'ok and how do I do that')
  assert.equal(bubbleLine(view), 'PICK_FIRST')
  assert.deepEqual(labels(view), before)
  press(view, 'To another computer')
  assert.equal(bubbleLine(view), 'MIG_PC')
})

/* ---------- 8 and 11: what reaches the AI ---------- */
const personLines = input => input.split('\n').filter(l => l.startsWith('Person: '))

test('point 8: Skip and a pressed pick are never sent to the AI as "Person: ..."; what the person typed is', async () => {
  const { view, host } = await open('ai_writes')
  finish(view)
  byData(view.tree, 'skip').props.onClick({ preventDefault() {} })
  finish(view)
  assert.deepEqual(mine(view), ['Skip'], 'on the page it still shows as the person\'s message')
  press(view, 'What Hermes can do')
  assert.equal(mine(view).at(-1), 'What Hermes can do')
  send(view, 'what is a skill')
  send(view, 'can it fly a kite')
  await settle()
  assert.equal(host.asks.length >= 1, true, 'a message code has no line for goes to the AI')
  for (const p of host.asks) {
    assert.doesNotMatch(p.input, /Person: Skip/)
    assert.doesNotMatch(p.input, /Person: What Hermes can do/)
  }
  assert.deepEqual(personLines(host.asks[0].input), ['Person: what is a skill'])
  assert.match(host.asks[0].input, /The person's newest message: can it fly a kite$/)
})

test('point 11: the person\'s earlier typed messages are among the last lines sent, in order', async () => {
  const { view, host } = await pastOpening('ai_writes')
  send(view, 'what is a skill')
  send(view, 'what is a plugin')
  send(view, 'can it fly a kite')
  await settle()
  assert.equal(host.asks.length >= 1, true)
  assert.deepEqual(personLines(host.asks[0].input), ['Person: what is a skill', 'Person: what is a plugin'])
})

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
test('points 7 and 16: the model check says ok but the first call fails at once: the written line, then no further call and no dots in that visit', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { oneshot: () => new Error('No LLM provider configured for task=helping_hand provider=auto. Run: hermes setup') } })
  send(view, 'can it fly a kite')
  await settle()
  assert.equal(host.asks.length, 1, 'the first call of the visit is tried (the model check said ok)')
  assert.equal(dots(view), null)
  assert.equal(olds(view).at(-1).props['data-line'], 'N1')
  for (const typed of ['tell me about goats', 'what do you mean?', 'does it juggle']) {
    send(view, typed)
    assert.equal(dots(view), null, typed + ': no dots')
    await settle()
  }
  assert.equal(host.asks.length, 1, 'no further call')
})

test('points 7 and 16: the model check says no model: no call and no dots at all', async () => {
  const { view, host } = await pastOpening('ai_writes', { host: { check: { ok: false, error: 'No usable credentials found' } } })
  for (const typed of ['can it fly a kite', 'what do you mean?', 'tell me about goats']) {
    send(view, typed)
    assert.equal(dots(view), null, typed)
    await settle()
  }
  assert.equal(host.asks.length, 0)
})
