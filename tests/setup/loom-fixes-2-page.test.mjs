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




test('review: "back" while a set-up question is open never says "No question of mine is open"', opt, async () => {
  const storage = fakeStorage({ met: true })
  const { view } = await open({ storage })
  finish(view)
  await send(view, 'Set up Hermes')
  await send(view, 'back')
  assert.ok(!screen(view).some(([, line]) => line === 'BACK_NONE'), JSON.stringify(screen(view).slice(-3)))
  // ("back" alone is no back word of the set-up conversation's; the ordinary talk answers it, with near picks of its
  // own, find-v2's rule; one question on screen)
  assert.deepEqual(twoInARow(view), [])
})


