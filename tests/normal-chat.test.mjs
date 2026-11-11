// normal-chat (Pēteris's second Loom of 11 Nov 2026, 2:56 to 4:53): Helper is a normal chatbot. After the name question
// every typed message goes to the person's own model in ONE llm.oneshot call carrying the message, the best doc chunks
// and the last lines; the reply is shown as written. Over the built page with a stand-in model.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { open, send, settle, finish, deferred, bubble, bubbleLine, olds, mine, dots, labels, helper, fakeStorage } from './lib/talk-page.mjs'
import { all, text } from './lib/render.mjs'
import { loadSrc } from './lib/render.mjs'

const mode = process.env.HELPER_AI_MODE || 'ai_writes'
const calls = host => host.asks.filter(p => !(p && p.instructions === 'Reply with exactly: OK'))
const shownText = node => text(node).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()
const Q = 'How can I move from Claude to Hermes?'
const REPLY = 'Use the importer.\n\n1. Open a terminal.\n2. Paste `hermes import-agent claude-code --dry-run` and press Enter.\n\nRead more: [Import from Other Agents](https://hermes-agent.nousresearch.com/docs/user-guide/import-from-other-agents)'

async function named(name = 'Peter', options = {}) {
  const o = await open(mode, options)
  finish(o.view)
  send(o.view, name)
  await settle()
  return o
}

test('a fresh first visit greets as a first visit (never "again"), asks the name, and after it says one line and asks nothing', async () => {
  const { view, host } = await open(mode)
  finish(view)
  assert.equal(bubbleLine(view), 'OPEN')
  assert.doesNotMatch(shownText(bubble(view)), /again/i)
  send(view, 'Peter')
  await settle()
  assert.equal(bubbleLine(view), 'CHAT_HELLO')
  const said = shownText(bubble(view))
  assert.match(said, /Ask me anything about Hermes/)
  assert.doesNotMatch(said, /\?\s*$/, 'no question after the name')
  assert.doesNotMatch(said, /again|new to Hermes|What do you do/i)
  assert.deepEqual(labels(view), [], 'no picks')
  assert.equal(calls(host).length, 0, 'the name question makes no call')
})

test('a later visit (met stored) opens with one short line and no picks', async () => {
  const { view } = await open(mode, { storage: fakeStorage({ met: true, kept: { name: 'Peter' } }) })
  finish(view)
  assert.equal(bubbleLine(view), 'CHAT_BACK')
  assert.match(shownText(bubble(view)), /Hi again, Peter\. Ask me anything about Hermes\./)
  assert.deepEqual(labels(view), [])
})

test('one call per message: task helping_hand, no session, 900 tokens, the message, doc chunks with their URLs and the last lines', async () => {
  const { view, host } = await named('Peter', { host: { oneshot: () => REPLY } })
  send(view, Q)
  await settle()
  const c = calls(host)
  assert.equal(c.length, 1)
  const p = c[0]
  assert.equal(p.task, 'helping_hand')
  assert.equal(p.max_tokens, 900)
  assert.equal('session_id' in p, false)
  // (chat-fix: the instructions grew with the step-by-step rules, the quick replies and the nine cards: 3,362
  // characters; the limit keeps them from growing unseen)
  // round 20:12: points 4, 5, 6 add the What-is order, each card's place line and the cards-only-where-they-fit rule:
  // 5,728 characters, so the limit is raised to 6,000 on purpose (reported)
  assert.ok(p.instructions.length < 6000, `instructions ${p.instructions.length} characters`)
  assert.match(p.input, /New message from the person:\nHow can I move from Claude to Hermes\?/)
  assert.match(p.input, /URL: https:\/\/hermes-agent\.nousresearch\.com\/docs\/user-guide\/import-from-other-agents\n/)
  assert.equal((p.input.match(/^URL: /gm) || []).length, 5, 'five chunks')
  assert.match(p.input, /hermes import-agent/, 'the chunks hold the command')
  // a second message carries the conversation so far (the first question and the reply)
  send(view, 'And Codex?')
  await settle()
  const p2 = calls(host)[1]
  assert.ok(p2, 'second call')
  assert.match(p2.input, /Person: How can I move from Claude to Hermes\?/)
  assert.match(p2.input, /Helper: Use the importer\./)
})

test('the reply is shown as the model wrote it: paragraphs, numbered steps, code and a link', async () => {
  const { view } = await named('Peter', { host: { oneshot: () => REPLY } })
  send(view, Q)
  await settle()
  assert.equal(bubbleLine(view), 'CHAT')
  const b = bubble(view)
  const md = all(b, n => n.props['data-hh'] === 'md')[0]
  assert.ok(md, 'drawn from markdown')
  assert.equal(all(md, n => n.type === 'ol').length, 1)
  assert.deepEqual(all(md, n => n.type === 'li').map(shownText), ['Open a terminal.', 'Paste hermes import-agent claude-code --dry-run and press Enter.'])
  assert.deepEqual(all(md, n => n.props['data-hh'] === 'md-code').map(shownText), ['hermes import-agent claude-code --dry-run'])
  const link = all(md, n => n.props['data-hh'] === 'md-link')[0]
  assert.equal(link.props.href, 'https://hermes-agent.nousresearch.com/docs/user-guide/import-from-other-agents')
  assert.match(shownText(md), /^Use the importer\./)
})

test('a message typed while a call runs waits, is shown, and is sent after the reply (never dropped, never a fixed line)', async () => {
  const first = deferred()
  const { view, host } = await named('Peter', { host: { oneshot: (p, n) => (n === 1 ? first.promise : 'Second answer.') } })
  send(view, Q)
  await settle()
  send(view, 'And from ChatGPT?')
  await settle()
  assert.equal(calls(host).length, 1, 'the second waits for the first reply')
  assert.ok(dots(view), 'typing dots while the call runs')
  assert.deepEqual(mine(view).slice(-2), [Q, 'And from ChatGPT?'], 'both messages are shown')
  first.resolve(REPLY)
  await settle(10)
  assert.equal(calls(host).length, 2, 'the waiting message is sent after the reply')
  assert.match(calls(host)[1].input, /New message from the person:\nAnd from ChatGPT\?/)
  assert.match(calls(host)[1].input, /Helper: Use the importer\./, 'with the first reply among the last lines')
  assert.equal(bubbleLine(view), 'CHAT')
  assert.match(shownText(bubble(view)), /^Second answer\.$/)
  // the first reply sits right after its own question
  const lines = all(helper(view), n => n.props['data-hh'] === 'me' || n.props['data-hh'] === 'old').map(n => n.props['data-hh'] + ':' + (n.props['data-line'] || shownText(n).replace(/^You said: /, '')))
  assert.deepEqual(lines.slice(-3), [`me:${Q}`, 'old:CHAT', 'me:And from ChatGPT?'])
})

test('a failed call shows the failed-call line (src/model-call.js failLines) with Try again', async () => {
  const { failLines } = await loadSrc('model-call.js')
  const { view, host } = await named('Peter', { host: { oneshot: () => new Error('boom') } })
  send(view, Q)
  await settle(10)
  assert.equal(calls(host).length, 1)
  assert.equal(bubbleLine(view), 'CHAT_FAILED')
  assert.match(shownText(bubble(view)), new RegExp(failLines('other', 'card').join(' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.ok(all(bubble(view), n => n.props['data-kind'] === 'retry').length, 'Try again button')
})

test('a message that looks like a key makes no call and gets the key line', async () => {
  const { view, host } = await named('Peter', { host: { oneshot: () => REPLY } })
  send(view, 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD')
  await settle()
  assert.equal(calls(host).length, 0)
  assert.equal(bubbleLine(view), 'K1')
  assert.ok(!mine(view).some(m => m.includes('sk-proj')), 'never shown back')
})

test('the name never appears in a request: not the answer to the name question, not in a later message, not in the lines', async () => {
  const { view, host } = await named('Zelda', { host: { oneshot: () => 'Sure, Zelda. Step one.' } })
  send(view, 'Hi, Zelda here. How do I connect Telegram?')
  await settle()
  send(view, 'thanks zelda says')
  await settle()
  assert.equal(calls(host).length, 2)
  for (const p of calls(host)) {
    assert.doesNotMatch(p.input, /zelda/i)
    assert.doesNotMatch(p.instructions, /zelda/i)
  }
})

test('a question typed in place of the name ends the opening and goes to the model', async () => {
  const { view, host } = await open(mode, { host: { oneshot: () => REPLY } })
  finish(view)
  send(view, Q)
  await settle()
  assert.equal(calls(host).length, 1)
  assert.equal(bubbleLine(view), 'CHAT')
})

test('no model set up: no call, the no-model line', async () => {
  const { view, host } = await named('Peter', { host: { oneshot: () => REPLY, check: { ok: false, configured: false } } })
  send(view, Q)
  await settle()
  assert.equal(calls(host).length, 0)
  assert.equal(bubbleLine(view), 'CHAT_NO_MODEL')
})

// ---- after the review (each was found by the reviewer of 9aeb488) ----
import { click, byData } from './lib/render.mjs'

test('review 2: Clear chat while a call runs and a second message waits: the cleared message gets no reply; the waiting one is answered', async () => {
  const first = deferred()
  const { view, host } = await named('Peter', { host: { oneshot: (p, n) => (n === 1 ? first.promise : 'Second answer.') } })
  send(view, Q)
  await settle()
  send(view, 'And from ChatGPT?')
  await settle()
  click(byData(helper(view), 'clear-chat'))
  await settle()
  click(byData(helper(view), 'clear-yes'))
  await settle()
  first.resolve(REPLY)
  await settle(10)
  assert.equal(calls(host).length, 2, 'the waiting message is still sent')
  assert.equal(bubbleLine(view), 'CHAT')
  assert.match(shownText(bubble(view)), /^Second answer\.$/)
  assert.ok(!olds(view).some(o => /importer/.test(shownText(o))), 'the cleared question\'s reply is not shown')
})

test('review 1: a question typed in place of the name is never among a later call\'s lines', async () => {
  const { view, host } = await open(mode, { host: { oneshot: () => 'Answer.' } })
  finish(view)
  send(view, 'Zelda. how do I connect telegram?')
  await settle()
  send(view, 'and discord?')
  await settle()
  assert.equal(calls(host).length, 2)
  assert.doesNotMatch(calls(host)[1].input, /zelda/i)
})

test('review 3: "forget everything" typed gets Helper\'s own Yes / No, no call', async () => {
  const { view, host } = await named('Peter', { host: { oneshot: () => REPLY } })
  send(view, 'forget everything')
  await settle()
  assert.equal(calls(host).length, 0)
  assert.ok(labels(view).length >= 2, `Yes / No to pick (${labels(view).join(' / ')})`)
})

test('review 5: "api key = abcd1234efgh5678" makes no call; "How do I set my API key?" does', async () => {
  const { view, host } = await named('Peter', { host: { oneshot: () => 'Answer.' } })
  send(view, 'api key = abcd1234efgh5678')
  await settle()
  assert.equal(calls(host).length, 0)
  send(view, 'How do I set my API key?')
  await settle()
  assert.equal(calls(host).length, 1)
})

test('review 4: a link to anything but the Hermes docs is shown as its words only, with no address', async () => {
  const { view } = await named('Peter', { host: { oneshot: () => 'See [this page](https://example.com/x) and [the docs](https://hermes-agent.nousresearch.com/docs/user-guide/sessions).' } })
  send(view, Q)
  await settle()
  const links = all(bubble(view), n => n.props['data-hh'] === 'md-link')
  assert.deepEqual(links.map(l => l.props.href), ['https://hermes-agent.nousresearch.com/docs/user-guide/sessions'])
  assert.match(shownText(bubble(view)), /See this page and the docs ?\./)
  assert.ok(!all(bubble(view), n => n.props && n.props.href === 'https://example.com/x').length)
})

test('review 2: a waiting message that Clear chat took away is not sent', async () => {
  const first = deferred()
  const { view, host } = await named('Peter', { host: { oneshot: (p, n) => (n === 1 ? first.promise : 'Later answer.') } })
  send(view, Q)
  await settle()
  send(view, 'And from ChatGPT?')
  await settle()
  send(view, 'And from Cursor?')
  await settle()
  click(byData(helper(view), 'clear-chat'))
  await settle()
  click(byData(helper(view), 'clear-yes'))
  await settle()
  first.resolve(REPLY)
  await settle(10)
  assert.equal(calls(host).length, 2, 'the first call, then only the message still on screen')
  assert.match(calls(host)[1].input, /New message from the person:\nAnd from Cursor\?/)
})
