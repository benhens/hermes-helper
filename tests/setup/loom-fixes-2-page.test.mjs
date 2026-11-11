// loom-fixes-2 (Lead, 11 Nov 12:50 and 14:15; content/helper-loom-fixes-v2.md points 2, 4, 5, 6 and 7) on the built
// page with a stand-in for Hermes: one question of Helper's on screen at a time, "go back" while a set-up question is
// open and with nothing open, "hey" at the name question, the open bot named when Helper can't see a thing, the
// migrate box. Skipped when a run switches the set-up conversation off.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData, spoken } from '../lib/render.mjs'
import { aiModeSource } from '../lib/mode-loader.mjs'
import { SETUP_BUILT } from '../../src/setup-built.js'

const opt = { skip: !SETUP_BUILT && 'the set-up conversation is switched off in this run' }
const q = s => String(s).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()

function useHost(hermes = {}) {
  const h = { model: true, soul: 'You are my calm club helper.', jobs: 0, bots: 12, platforms: {}, sessions: [{ id: 's0', source: 'local', title: 'Getting started', message_count: 4, preview: '', started_at: 1762800000, last_active: 1762800000 }], ...hermes }
  const host = {
    hermes: h,
    asks: [],
    checks: [],
    request: async (method, params) => {
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
// the conversation as on screen: [who, line id, text], Helper's older lines, the person's, then the bubble
function screen(view) {
  return all(helper(view), n => ['old', 'me', 'bubble'].includes(n.props['data-hh'])).map(n => {
    if (n.props['data-hh'] === 'me') return ['you', null, q(text(n))]
    if (n.props['data-hh'] === 'bubble') return ['helper', n.props['data-line'], bubbleSaid(view)]
    return ['helper', n.props['data-line'], oldText(n)]
  })
}
// the rule of the job (point 2): never two of Helper's question bubbles in a row without the person's line between
const isQuestion = ([who, , said]) => who === 'helper' && /\?$/.test(said)
function twoInARow(view) {
  const s = screen(view)
  const bad = []
  for (let i = 1; i < s.length; i++) if (isQuestion(s[i - 1]) && isQuestion(s[i])) bad.push(`${s[i - 1][1]} then ${s[i][1]}: ${s[i - 1][2]} | ${s[i][2]}`)
  return bad
}
const NEW4 = ["Yes, I'm new", "I've used it a bit", 'I know it well', 'Skip']
const GOAL4 = ['Do things at set times', 'Talk to it from my phone', 'Several bots, one per job', 'Not sure yet']
const REASK_NEW = "When you're ready: are you new to Hermes?"

test('the check bites: two of Helper\'s questions in a row are found', () => {
  const fake = { tree: null }
  const s = [['helper', 'a', 'Do you want X?'], ['helper', 'b', "When you're ready: are you new to Hermes?"]]
  const bad = []
  for (let i = 1; i < s.length; i++) if (isQuestion(s[i - 1]) && isQuestion(s[i])) bad.push(i)
  assert.deepEqual(bad, [1])
  assert.equal(fake.tree, null)
})

test('his Loom conversation once more: never two of Helper\'s questions in a row', opt, async () => {
  const storage = fakeStorage({ met: true, kept: { setup_current: 'first_chat' } })
  const { view } = await open({ storage })
  finish(view)
  for (const step of [['send', 'hey'], ['send', 'Set up Hermes'], ['press', "Yes, I'm new"], ['send', 'can we start from the begining'], ['send', 'How can I migrate from OpenClaw?'], ['send', 'what is hindsight'], ['send', 'What Hermes is'], ['send', 'Set up Hermes']]) {
    await (step[0] === 'send' ? send(view, step[1]) : press(view, step[1]))
    assert.deepEqual(twoInARow(view), [], `after ${step[1]}`)
  }
})

test('three typed questions while "Are you new to Hermes?" is open: each answered with no offer, then the question again with its buttons, every time; nothing kept', opt, async () => {
  const storage = fakeStorage({ met: true })
  const { view } = await open({ storage })
  finish(view)
  await send(view, 'Set up Hermes')
  assert.equal(bubbleSaid(view), 'Are you new to Hermes?')
  for (const m of ['whats honcho', 'do i need to pay for hermes', 'what is a skill?']) {
    await send(view, m)
    assert.equal(bubbleSaid(view), REASK_NEW, m)
    assert.deepEqual(labels(view), NEW4, m)
    assert.deepEqual(twoInARow(view), [], m)
    assert.equal((storage.data.get('kept') || {}).setup_new, undefined, m)
  }
})

test('"How can I migrate?" at a set-up question keeps its own picks (find-v2 wins over the one-question rule), then the question comes back after the pick; one question on screen throughout', opt, async () => {
  const storage = fakeStorage({ met: true, kept: { setup_new: 'new' } })
  const { view } = await open({ storage })
  finish(view)
  assert.deepEqual(labels(view), GOAL4)
  await send(view, 'How can I migrate?')
  assert.deepEqual(labels(view), ['From another AI app', 'To another computer'])
  assert.deepEqual(twoInARow(view), [])
  await press(view, 'To another computer')
  assert.equal(bubbleLine(view), 'SETUP_REASK_GOAL')
  assert.deepEqual(labels(view), GOAL4)
  assert.deepEqual(twoInARow(view), [])
})

test('"go back" at the second question: "Back one question." and the first question with its buttons; at the first: "This is my first set-up question ..." and the question again; the earlier answer stays kept', opt, async () => {
  const storage = fakeStorage({ met: true })
  const { view } = await open({ storage })
  finish(view)
  await send(view, 'Set up Hermes')
  await press(view, "Yes, I'm new")
  assert.deepEqual(labels(view), GOAL4)
  await send(view, 'undo that, go back one')
  const s = screen(view).slice(-2).map(x => [x[1], x[2]])
  assert.deepEqual(s, [['BACK_ONE', 'Back one question.'], ['Q_NEW', 'Are you new to Hermes?']])
  assert.deepEqual(labels(view), NEW4)
  assert.equal(storage.data.get('kept').setup_new, 'new', 'the earlier answer stays kept until a new pick')
  await send(view, 'go back')
  assert.deepEqual(screen(view).slice(-2).map(x => [x[1], x[2]]), [['BACK_FIRST', 'This is my first set-up question, so there is nothing before it.'], ['SETUP_REASK', REASK_NEW]])
  assert.deepEqual(labels(view), NEW4)
  assert.deepEqual(twoInARow(view), [])
})

test('"go back" at step 2 of a thing\'s steps: step 1 again with its buttons', opt, async () => {
  const storage = fakeStorage({ met: true, kept: { setup_new: 'well', setup_goal: 'remind me of things', setup_goal_id: 'schedule' } })
  const { view } = await open({ storage, hermes: { jobs: 0 } })
  finish(view)
  // the opening names the next thing with "Want the steps?"
  await press(view, 'Show me the steps')
  assert.match(bubbleSaid(view), /^Step 1 of \d+: /)
  const step1 = bubbleSaid(view)
  await press(view, 'Done')
  assert.match(bubbleSaid(view), /^Step 2 of \d+: /)
  await send(view, 'previous step')
  assert.equal(bubbleLine(view), 'STEP_BACK')
  assert.equal(bubbleSaid(view), step1.replace(/^Step 1/, 'Back to step 1'))
})

test('back words with nothing of Helper\'s open: "No question of mine is open ..." with the general offer; "can hermes undo a change" still gets the checkpoints line', opt, async () => {
  const storage = fakeStorage({ met: true, kept: { setup_current: 'first_chat' } })
  const { view } = await open({ storage })
  finish(view)
  await press(view, 'Not now')
  await send(view, 'undo that, go back one')
  const s = screen(view).slice(-2)
  assert.deepEqual([s[0][1], s[0][2]], ['BACK_NONE', 'No question of mine is open, so there is nothing to go back to.'])
  assert.equal(s[1][2], 'Do you want to set up Hermes, or see what it does?')
  await send(view, 'can hermes undo a change')
  assert.notEqual(screen(view).slice(-2)[0][1], 'BACK_NONE')
})

test('a first visit, "hey" at "What\'s your name?": "Hi." and the name question again as its own bubble; nothing kept, the name still taken next', opt, async () => {
  const storage = fakeStorage()
  const { view } = await open({ storage })
  finish(view)
  assert.match(bubbleSaid(view), /What's your name\?$/)
  await send(view, 'hey')
  const s = screen(view).slice(-2).map(x => [x[1], x[2]])
  assert.deepEqual(s, [['NAME_HELLO', 'Hi.'], ['ASK_NAME', "What's your name?"]])
  assert.deepEqual(labels(view), [])
  assert.deepEqual(twoInARow(view), [])
  assert.equal((storage.data.get('kept') || {}).name, undefined)
  await send(view, 'Anna')
  assert.equal((storage.data.get('kept') || {}).name, 'Anna')
})

test('point 7: a thing Helper cannot see after "It worked": the open bot is named (the look\'s bot, here the one marked default)', opt, async () => {
  const storage = fakeStorage({ met: true, kept: { setup_new: 'well', setup_goal: 'remind me of things', setup_goal_id: 'schedule' } })
  const { view } = await open({ storage, hermes: { jobs: 0 } })
  finish(view)
  await press(view, 'Show me the steps')
  while (labels(view).includes('Done')) await press(view, 'Done')
  await press(view, 'It worked')
  assert.equal(bubbleLine(view), 'NOT_SEEN')
  assert.equal(bubbleSaid(view), "I can't see it yet. I only look at the bot that is open in Hermes now, default.")
})
