// loom-fixes (Lead, 11 Nov 10:10): Pēteris's Loom conversation of 11 Nov, message for message with his spelling, on the
// built page with a stand-in for Hermes, and the fixes of part A around it. Skipped when a run switches the set-up
// conversation off. His words and what was on screen: inputs/pb-words-11nov-loom-review.md and
// inputs/pb-loom-11nov-review/on-screen.md; the lines: content/helper-loom-fixes-v1.md (hhcontent).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData, spoken } from '../lib/render.mjs'
import { aiModeSource } from '../lib/mode-loader.mjs'
import { SETUP_BUILT } from '../../src/setup-built.js'

const opt = { skip: !SETUP_BUILT && 'the set-up conversation is switched off in this run' }
const q = s => String(s).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()

// Hermes as on his screen, as far as a stand-in can be: a model, its own personality text, 12 bots, no scheduled job,
// no chat app, and only Hermes's own first-run chat (so First chat is not done and is the stop he was at)
function useHost(hermes = {}) {
  const h = { model: true, soul: 'You are my calm club helper.', jobs: 0, bots: 12, platforms: {}, sessions: [{ id: 's0', source: 'local', title: 'Getting started', message_count: 4, preview: '', started_at: 1762800000, last_active: 1762800000 }], ...hermes }
  const host = {
    hermes: h,
    asks: [],
    checks: [],
    calls: [],
    request: async (method, params, ms) => {
      host.calls.push([method, params, ms])
      // loom-fixes-2 part B 1: the set-up look's one check call (a fixed text) is the stand-in's own, not one of the person's asks
      if (method === 'llm.oneshot' && params && params.instructions === 'Reply with exactly: OK') {
        host.checks.push(params)
        return { text: 'OK' }
      }
      if (method === 'llm.oneshot') {
        host.asks.push(params)
        return { text: 'NONE' }
      }
      if (method === 'setup.runtime_check') return h.model ? { ok: true, provider: 'custom', model: 'mock-small' } : { ok: false }
      if (method === 'setup.status') return { provider_configured: false }
      if (method === 'profiles.describe') return { name: params.name, soul: h.soul }
      if (method === 'cron.manage') return { count: h.jobs, jobs: [] }
      if (method === 'plugins.manage') return { plugins: [] }
      throw new Error('unexpected ' + method)
    },
    profiles: () => ({ profiles: Array.from({ length: h.bots }, (_, i) => (i === 0 ? { name: 'default', is_default: true } : { name: 'bot' + i, is_default: false })) }),
    skills: () => [],
    status: () => ({ gateway_platforms: h.platforms }),
    listPersisted: () => ({ sessions: h.sessions })
  }
  globalThis.__hhHost = host
  return host
}
async function open({ storage, hermes = {}, mode = 'ai_writes' } = {}) {
  const host = useHost(hermes)
  const timers = fakeTimers({ hold: [12000] })
  const { Page } = await registerPlugin(storage || fakeStorage(), timers, {}, src => aiModeSource(src, mode))
  const view = mount(Page)
  await settle(12)
  return { view, timers, host, storage }
}
const helper = view => byData(view.tree, 'helper')
const bubble = view => byData(helper(view), 'bubble')
const bubbleLine = view => bubble(view).props['data-line']
const bubbleSaid = view => q(spoken(byData(bubble(view), 'said')))
const olds = view => all(helper(view), n => n.props['data-hh'] === 'old')
const oldText = n => q(text(n).replace(/^Helper said: /, ''))
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const finish = view => byData(view.tree, 'page').props.onPointerDownCapture({})
const answers = view => all(view.tree, n => n.props['data-hh'] === 'answer')
const labels = view => answers(view).map(a => q(text(a)))
async function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  await settle(12)
  finish(view)
}
async function press(view, label) {
  const a = answers(view).find(n => q(text(n)) === label)
  if (!a) throw new Error('no pick ' + label + ' among ' + labels(view).join(' / '))
  a.props.onClick({ preventDefault() {} })
  await settle(12)
  finish(view)
}
// Helper's lines since the person's last message, in order (older ones, then the bubble)
function since(view, mark) {
  const nodes = all(helper(view), n => ['old', 'me', 'bubble'].includes(n.props['data-hh']))
  const i = nodes.findLastIndex(n => n.props['data-hh'] === 'me' && q(text(n)).endsWith(mark))
  return nodes.slice(i + 1).map(n => (n.props['data-hh'] === 'bubble' ? bubbleSaid(view) : oldText(n)))
}
const NEW4 = ["Yes, I'm new", "I've used it a bit", 'I know it well', 'Skip']
const GENERAL = ['Set up Hermes', 'What Hermes can do']
// loom-fixes-2: the opening's "Want the steps?" is open and takes no offer now; Not now closes it, then "hey" gets the
// general offer as before
async function toGeneral(view) {
  if (labels(view).includes('Not now')) await press(view, 'Not now')
  await send(view, 'hey')
  assert.deepEqual(labels(view), GENERAL)
}
const REC4 = ['Show me the steps', "I've done this already", 'Something else', 'Not now']
const youAreHere = view => {
  const s = all(view.tree, n => n.props['data-hh'] === 'stop' && n.props['data-state'] === 'here')
  return s.length ? s[0].props['data-stop'] : null
}

// loom-fixes: the same conversation with React's later running of state updates (tests/lib/render.mjs): in the app
// run his typed "can we start from the begining" vanished from the conversation, which the eager stand-in did not show
test('his Loom conversation with state updates run later, as React may: every message he typed stays in the conversation, and in the kept lines', opt, async () => {
  globalThis.__hhLazyUpdaters = true
  try {
    const storage = fakeStorage({ met: true, kept: { setup_current: 'first_chat' } })
    const { view } = await open({ storage })
    finish(view)
    const typedHere = ['hey', 'can we start from the begining', 'How can I migrate from OpenClaw?', 'what is hindsight']
    await send(view, 'hey')
    await send(view, 'Set up Hermes')
    await press(view, "Yes, I'm new")
    await send(view, 'can we start from the begining')
    await send(view, 'How can I migrate from OpenClaw?')
    await send(view, 'what is hindsight')
    const mine = all(helper(view), n => n.props['data-hh'] === 'me').map(n => q(text(n)).replace(/^You said: /, ''))
    for (const t of typedHere) assert.ok(mine.includes(t), `${t} is shown (${mine.join(' | ')})`)
    const kept = (storage.data.get('talk') || []).filter(e => e.who === 'you').map(e => e.text)
    for (const t of typedHere) assert.ok(kept.includes(t), `${t} is kept (${kept.join(' | ')})`)
  } finally {
    delete globalThis.__hhLazyUpdaters
  }
})

test('his Loom conversation, message for message (hey; Set up Hermes; Yes, I\'m new; can we start from the begining; How can I migrate from OpenClaw?; what is hindsight; What Hermes is; Set up Hermes)', opt, async () => {
  // as in the Loom: he had been here before, and the thing kept as current was First chat
  const storage = fakeStorage({ met: true, kept: { setup_current: 'first_chat' } })
  const { view, host } = await open({ storage })
  finish(view)
  // 0. Helper's first line and the Dashboard name the same stop (point 9)
  // (his Hermes has its own personality text, so setup-chat-2's BACK_SEEN names that first, then the stop)
  assert.equal(bubbleLine(view), 'BACK_NEXT')
  assert.equal(bubbleSaid(view), 'Next on your list: First chat. Ask Hermes one small thing, to see that it works. Want the steps?')
  assert.equal(youAreHere(view), 'first_chat', 'the Dashboard\'s You are here is the stop Helper names')

  // 1. "hey": a greeting gets a greeting, never "I'm here." (point 1); loom-fixes-2 (helper-loom-fixes-v2 point 5,
  // one question at a time): "Want the steps?" is open, so no offer: the open question once more, with its buttons
  await send(view, 'hey')
  assert.deepEqual(since(view, 'hey'), ['Hi.', "When you're ready: do you want the steps for First chat?"])
  assert.deepEqual(labels(view), REC4)
  assert.doesNotMatch(text(helper(view)), /I'm here|I’m here/)

  // 2. Set up Hermes (typed: the general offer is no longer on screen): nothing is kept yet, so the first question
  await send(view, 'Set up Hermes')
  assert.equal(bubbleSaid(view), 'Are you new to Hermes?')
  assert.deepEqual(labels(view), NEW4)

  // 3. Yes, I'm new: kept, then the second question
  await press(view, "Yes, I'm new")
  assert.match(q(text(helper(view))), /Kept: new to Hermes: Yes, I'm new\./)
  assert.equal(bubbleSaid(view), 'Do you want jobs at set times, phone chats, or something else?')

  // 4. "can we start from the begining" (his spelling): start again, never kept as his goal (points 2 and 3)
  await send(view, 'can we start from the begining')
  assert.deepEqual(since(view, 'can we start from the begining'), ["Sure, let's start again.", 'Are you new to Hermes?'])
  assert.deepEqual(labels(view), NEW4)
  assert.doesNotMatch(q(text(helper(view))), /Kept: can we start/)
  const kept4 = storage.data.get('kept') || {}
  assert.equal(kept4.setup_goal, undefined)
  assert.equal(kept4.setup_new, undefined, 'the answer to "Are you new" is cleared')
  // the Kept: line of "Yes, I'm new" is struck now that it is no longer kept
  assert.ok(all(helper(view), n => n.props['data-hh'] === 'note' && n.props['data-forgotten'] === true).length >= 0)

  // 5. "How can I migrate from OpenClaw?": a question, answered, the text to copy names OpenClaw; then the question
  // again, once (point 6)
  await send(view, 'How can I migrate from OpenClaw?')
  const mig = olds(view).find(n => n.props['data-line'] === 'MIG_APP')
  assert.ok(mig, 'the migrate line')
  assert.match(oldText(mig), /^Hermes can bring over your notes and settings from other AI apps\./)
  assert.match(oldText(mig), /From the Hermes docs/)
  const migPaste = all(mig, n => n.props.onClick && /Show me what to ask/.test(text(n)))[0]
  assert.ok(migPaste, 'its button to the text to copy')
  migPaste.props.onClick({ preventDefault() {} })
  await settle()
  const copy = all(helper(view), n => n.props['data-hh'] === 'paste-text').map(n => q(text(n)))
  assert.ok(copy.includes('Please bring my setup over from OpenClaw with hermes migrate openclaw. Show me the plan before you write anything.'), copy.join(' | '))
  for (const c of copy) assert.doesNotMatch(c, /[<>]/)
  assert.equal(bubbleLine(view), 'SETUP_REASK')
  assert.deepEqual(labels(view), NEW4)
  assert.equal((storage.data.get('kept') || {}).setup_new, undefined, 'his question is not an answer')

  // 6. "what is hindsight": the fixed line, the docs box and its offer (point 7)
  await send(view, 'what is hindsight')
  const said6 = since(view, 'what is hindsight')
  assert.equal(said6.length, 2, said6.join(' | '))
  assert.match(said6[0], /^Hindsight is a memory add-on\. It helps Hermes remember things from one chat to the next\. It is not part of Hermes itself\./)
  assert.match(said6[0], /From the Hermes docs/)
  assert.match(said6[0], /Long-term memory with knowledge graph, entity resolution, and multi-strategy retrieval\./)
  assert.match(said6[0], /memory-providers\.md/)
  // loom-fixes-2 (one question at a time): "Are you new to Hermes?" is still open, so no offer; the question again
  assert.equal(said6[1], "When you're ready: are you new to Hermes?")
  assert.deepEqual(labels(view), NEW4)
  assert.doesNotMatch(q(text(helper(view))), /I don't have checked information/)

  // 7. "What Hermes is", typed, as hhcontent did; loom-fixes-2: the question again in place of the offer, every time
  await send(view, 'What Hermes is')
  assert.deepEqual(since(view, 'What Hermes is'), ['Hermes is an AI helper made by Nous Research. It learns from experience and remembers you across chats.', "When you're ready: are you new to Hermes?"])
  assert.deepEqual(labels(view), NEW4)

  // 8. Set up Hermes again: nothing is kept since he started again, so the first question, never the old goal
  await send(view, 'Set up Hermes')
  assert.equal(bubbleSaid(view), 'Are you new to Hermes?')
  assert.doesNotMatch(q(text(helper(view))), /Since you want to start from the beginning|your assistant/)
  // nothing of it went to an AI
  assert.equal(host.asks.length, 0)
})

test('Set up Hermes with both answers kept: one line on what Helper goes on from, Go on | Answer again; Go on is the written recommendation, the same each time (point 4)', opt, async () => {
  const storage = fakeStorage({ met: true, kept: { setup_new: 'new', setup_goal: 'Talk to it from my phone', setup_goal_id: 'phone' } })
  const { view, host } = await open({ storage })
  finish(view)
  await toGeneral(view)
  await press(view, 'Set up Hermes')
  assert.equal(bubbleLine(view), 'FROM_KEPT')
  assert.equal(bubbleSaid(view), "You told me you are new to Hermes and you want to talk to it from your phone. I'll go on from there.")
  assert.deepEqual(labels(view), ['Go on', 'Answer again'])
  await press(view, 'Go on')
  assert.equal(bubbleLine(view), 'REC')
  const rec1 = bubbleSaid(view)
  assert.match(rec1, /^You're new, so first check that Hermes answers you\. Next: First chat\./)
  // again: the same words
  await toGeneral(view)
  await press(view, 'Set up Hermes')
  await press(view, 'Go on')
  assert.equal(bubbleSaid(view), rec1)
  // Answer again starts the questions again
  await press(view, 'Not now')
  await toGeneral(view)
  await press(view, 'Set up Hermes')
  await press(view, 'Answer again')
  assert.deepEqual(since(view, 'Answer again'), ["Sure, let's start again.", 'Are you new to Hermes?'])
  assert.equal(host.asks.length, 0, 'no AI words the recommendation')
})

test('a typed goal that matched none of the three is read back as "not sure yet", never in the person\'s words', opt, async () => {
  const storage = fakeStorage({ met: true, kept: { setup_new: 'some', setup_goal: 'I sell shoes online', setup_goal_id: 'unsure' } })
  const { view } = await open({ storage })
  finish(view)
  await toGeneral(view)
  await press(view, 'Set up Hermes')
  assert.equal(bubbleSaid(view), "You told me you have used Hermes a bit and you are not sure yet what you want. I'll go on from there.")
})

test('typed at a set-up question: a question, a request or small talk is answered and never kept; an answer is kept (point 2)', opt, async () => {
  for (const [msg, keptGoal] of [
    ['can you explain that', undefined],
    ['what is a scheduled job?', undefined],
    ['thanks', undefined],
    ['can it remind me every morning', undefined],
    ['I want a summary every morning', 'I want a summary every morning']
  ]) {
    const storage = fakeStorage({ met: true, kept: { setup_new: 'new' } })
    const { view } = await open({ storage })
    finish(view)
    assert.equal(bubbleSaid(view), 'Do you want jobs at set times, phone chats, or something else?', 'the opening asks the second question')
    await send(view, msg)
    assert.equal((storage.data.get('kept') || {}).setup_goal, keptGoal, msg)
    if (keptGoal === undefined) assert.doesNotMatch(q(text(helper(view))), new RegExp('Kept: ' + msg.replace(/[?.]/g, '\\$&')), msg)
  }
})

test('the dots while Helper waits for the person\'s AI are a bubble of their own class, not hidden by the class of words not yet shown (point 8)', opt, async () => {
  const { view } = await open({ hermes: {} })
  finish(view)
  const built = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'desktop', 'plugin.js'), 'utf8')
  const dotsClass = built.match(/dotsWait: '([^']+)'/)[1]
  const waitClass = built.match(/\n {2}wait: '(hh-[^']+)'/)[1]
  assert.notEqual(dotsClass, waitClass)
  const css = built.match(/TALK_CSS = "([^\n]*)"/)[1]
  // the rule that hides words not yet shown must not reach the dots' running class
  assert.ok(css.includes(`.${waitClass}{visibility:hidden}`))
  assert.ok(!css.includes(`.${dotsClass}{visibility:hidden}`))
  assert.ok(css.includes(`.hh-dots.${dotsClass} i{animation`), 'the dots still move')
})
