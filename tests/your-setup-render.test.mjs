// The "Your setup" tab rendered from the built desktop/plugin.js with stand-ins for React and the
// Hermes SDK (tests/lib/render.mjs): which reads it makes, what each card shows, the one model call,
// the bot picker, and the person's own memory test.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, mount, settle, all, text, byData, byLabel, click } from './lib/render.mjs'
import { rpcError } from './lib/fake-request.mjs'
import { DEFAULT_SOULS } from '../src/setup-cards.js'

let calls
const MOCK = {
  runtime: { ok: true, provider: 'custom', model: 'mock-small' },
  status: { provider_configured: true },
  soul: { soul: DEFAULT_SOULS[0] },
  oneshot: { text: 'OK' },
  skills: [{ name: 'a', enabled: true }, { name: 'b', enabled: true }, { name: 'c', enabled: false }],
  toolsets: [{ name: 'memory', enabled: true }, { name: 'web', enabled: true }],
  profiles: { profiles: [{ name: 'default', is_default: true }] }
}

function useHost(over = {}) {
  const h = { ...MOCK, ...over }
  calls = []
  const answer = (v, params) => {
    const a = typeof v === 'function' ? v(params) : v
    if (a instanceof Error) throw a
    return a
  }
  globalThis.__hhHost = {
    gateway: h.gateway ?? 'open',
    profile: h.profile ?? 'default',
    request: async (method, params, timeout) => {
      calls.push({ method, params, timeout })
      const table = { 'setup.runtime_check': h.runtime, 'setup.status': h.status, 'profiles.describe': h.soul, 'llm.oneshot': h.oneshot, 'free_tier.status': { label: 'Nous · free tier' } }
      if (!(method in table)) throw new Error('unexpected ' + method)
      return answer(table[method], params)
    },
    skills: p => answer(h.skills, p),
    toolsets: p => answer(h.toolsets, p),
    profiles: () => answer(h.profiles)
  }
}

async function openYours(host = {}, storage = fakeStorage({ tab: 'yours' })) {
  useHost(host)
  const reg = await registerPlugin(storage)
  globalThis.__lastReg = reg
  const view = mount(reg.Page)
  await settle(10)
  return { view, ...reg }
}

const card = (view, id) => byData(view.tree, `card-${id}`)
const status = (view, id) => card(view, id).props['data-status']
const methods = () => calls.map(c => c.method)

beforeEach(() => {
  delete globalThis.__hhHost
})

test('no reads before the tab is opened', async () => {
  useHost()
  const { Page } = await registerPlugin(fakeStorage({ tab: 'setup' }))
  mount(Page)
  await settle(10)
  assert.deepEqual(methods(), ['setup.runtime_check'])
  assert.equal(globalThis.__hhHost.sdkCalls, undefined)
})

test('a working mock home: Works, Works, Not checked yet, Not set up yet (default SOUL.md), count, Works, Not checked yet', async () => {
  const { view } = await openYours()
  assert.deepEqual(
    ['gateway', 'model', 'answers', 'soul', 'skills', 'memory', 'remember'].map(id => status(view, id)),
    ['works', 'works', 'unchecked', 'notset', 'count', 'works', 'unchecked']
  )
  assert.match(text(card(view, 'model')), /mock-small/)
  assert.match(text(card(view, 'skills')), /2 switched on/)
  // Read-only calls only, each once; the model check from page open is reused, no model call.
  assert.deepEqual(methods().sort(), ['profiles.describe', 'setup.runtime_check'])
  assert.deepEqual(calls.find(c => c.method === 'profiles.describe').params, { name: 'default' })
  assert.ok(calls.every(c => c.timeout > 0 && c.timeout <= 30000))
  assert.deepEqual(globalThis.__hhHost.sdkCalls.map(c => c.name).sort(), ['profiles', 'skills', 'toolsets'])
  assert.ok(globalThis.__hhHost.sdkCalls.filter(c => c.name !== 'profiles').every(c => c.arg === undefined))
})

test('every card shows its "Passes when" rule (skills: a count only)', async () => {
  const { view } = await openYours()
  for (const id of ['gateway', 'model', 'answers', 'soul', 'memory', 'remember']) assert.match(text(card(view, id)), /Passes when: /, id)
  assert.doesNotMatch(text(card(view, 'skills')), /Passes when/)
  assert.match(text(card(view, 'skills')), /Just a count, no pass or fail/)
})

test('Check on "The model answers": one llm.oneshot, task helping_hand, no session, 90 s; then Works', async () => {
  const { view, timers } = await openYours({ oneshot: () => new Promise(r => setTimeout(() => r({ text: 'OK.' }), 30)) })
  click(byLabel(card(view, 'answers'), 'Check'))
  await settle(2)
  assert.equal(status(view, 'answers'), 'checking')
  assert.match(text(card(view, 'answers')), /Waiting for your model, 0 s/)
  const realNow = Date.now
  const t0 = realNow()
  Date.now = () => t0 + 7000
  try {
    timers.tick()
  } finally {
    Date.now = realNow
  }
  assert.match(text(card(view, 'answers')), /Waiting for your model, 7 s/)
  await new Promise(r => setTimeout(r, 60))
  await settle()
  assert.equal(status(view, 'answers'), 'works')
  assert.match(text(card(view, 'answers')), /mock-small answered a short test in \d+\.\d seconds\./)
  const call = calls.filter(c => c.method === 'llm.oneshot')
  assert.equal(call.length, 1)
  assert.deepEqual(call[0].params, { task: 'helping_hand', instructions: 'Reply with exactly: OK', input: 'Reply with exactly: OK', temperature: 0, max_tokens: 300 })
  assert.equal(call[0].timeout, 90000)
  assert.equal(timers.intervals.size, 0) // the seconds counter stopped
})

test('no model: card 2 Not set up yet with Open step 2; card 3 cannot be pressed; no model call', async () => {
  const { view, storage } = await openYours({ runtime: { ok: false }, status: { provider_configured: false } })
  assert.equal(status(view, 'model'), 'notset')
  const check = byLabel(card(view, 'answers'), 'Check')
  assert.equal(check.props.disabled, true)
  assert.ok(!methods().includes('llm.oneshot'))
  click(byLabel(card(view, 'model'), 'Open step 2'))
  assert.equal(storage.data.get('tab'), 'setup')
  assert.equal(storage.data.get('step'), 2)
  assert.ok(byData(view.tree, 'steps'))
})

test('model chosen but broken: card 2 Needs a fix', async () => {
  const { view } = await openYours({ runtime: { ok: false, error: 'No usable credentials found for openrouter.' }, status: { provider_configured: true } })
  assert.equal(status(view, 'model'), 'fix')
  assert.match(text(card(view, 'model')), /A model is chosen, but Hermes can't use it/)
})

test('the readiness check fails: card 2 Can\'t check right now, Check again asks again', async () => {
  const { view } = await openYours({ runtime: new Error('request timed out') })
  assert.equal(status(view, 'model'), 'cant')
  const before = methods().filter(m => m === 'setup.runtime_check').length
  click(byLabel(card(view, 'model'), 'Check again'))
  await settle(10)
  assert.equal(methods().filter(m => m === 'setup.runtime_check').length, before + 1)
})

test('card 3 with 5030 "not ready": the countdown line, then one retry, then Works', async () => {
  let n = 0
  const { view } = await openYours({
    oneshot: () => (n++ === 0 ? rpcError(5030, 'one-shot generation failed: No LLM provider configured for task=helping_hand provider=auto') : { text: 'OK' })
  })
  const { timers } = globalThis.__lastReg
  click(byLabel(card(view, 'answers'), 'Check'))
  await settle(3)
  assert.match(text(card(view, 'answers')), /Your model isn't ready to answer yet\. I'll try again in \d+ seconds\./)
  assert.equal(n, 1) // no second call before the countdown ends
  await settle(200)
  assert.equal(status(view, 'answers'), 'works')
  assert.equal(n, 2)
  assert.equal(timers.delays.filter(ms => ms === 1000).length, 60)
})

test('card 3 with a wrong key: Needs a fix, the key line, Try again', async () => {
  const { view } = await openYours({ oneshot: rpcError(5030, "one-shot generation failed: Error code: 401 - {'error': 'Incorrect API key provided'}") })
  click(byLabel(card(view, 'answers'), 'Check'))
  await settle(10)
  assert.equal(status(view, 'answers'), 'fix')
  assert.match(text(card(view, 'answers')), /didn't accept your key or sign-in/)
  assert.ok(byLabel(card(view, 'answers'), 'Try again'))
  assert.doesNotMatch(text(view.tree), /restart/i)
})

test('card 4: own SOUL.md = Works; a failed read = Can\'t check right now (never "Not set up yet"); Check again re-reads', async () => {
  let own = await openYours({ soul: { soul: 'You are Ziggy.' } })
  assert.equal(status(own.view, 'soul'), 'works')
  let fail = true
  const { view } = await openYours({ soul: () => (fail ? rpcError(5063, 'boom') : { soul: '' }) })
  assert.equal(status(view, 'soul'), 'cant')
  fail = false
  click(byLabel(card(view, 'soul'), 'Check again'))
  await settle(10)
  assert.equal(status(view, 'soul'), 'notset')
})

test('card 6: memory off = Needs a fix with the text to paste and a Copy button', async () => {
  const { view } = await openYours({ toolsets: [{ name: 'memory', enabled: false }] })
  assert.equal(status(view, 'memory'), 'fix')
  const copy = all(card(view, 'memory'), n => n.type === 'sdk:CopyButton')[0]
  assert.equal(copy.props.text, 'Please switch my memory on and tell me how to check it worked.')
})

test('skills or toolsets never answer: Can\'t check right now after 30 s (host timer)', async () => {
  const { view, timers } = await openYours({ skills: () => new Promise(() => {}), toolsets: () => new Promise(() => {}) })
  await settle(5)
  assert.equal(status(view, 'skills'), 'checking') // still waiting: the 30 s limit hasn't passed
  assert.equal(status(view, 'memory'), 'checking')
  // profiles.list, skills and toolsets each have their own 30 s limit.
  assert.equal(timers.delays.filter(ms => ms === 30000).length, 3)
  timers.fireLong()
  await settle(5)
  assert.equal(status(view, 'skills'), 'cant')
  assert.equal(status(view, 'memory'), 'cant')
})

test('card 7: It didn\'t = Needs a fix with three reasons; It said 7Q4 = Works; kept per bot in storage', async () => {
  const storage = fakeStorage({ tab: 'yours' })
  const { view } = await openYours({}, storage)
  click(byLabel(card(view, 'remember'), "It didn't"))
  assert.equal(status(view, 'remember'), 'fix')
  assert.equal(all(card(view, 'remember'), n => n.type === 'li').length, 3 + 3)
  assert.deepEqual(storage.data.get('remember'), { default: 'no' })
  click(byLabel(card(view, 'remember'), 'It said 7Q4'))
  assert.equal(status(view, 'remember'), 'works')
  const again = await openYours({}, storage)
  assert.equal(status(again.view, 'remember'), 'works')
  const texts = all(card(view, 'remember'), n => n.type === 'sdk:CopyButton').map(n => n.props.text)
  assert.deepEqual(texts, ['Use the memory tool to save this exact note: Helping Hand test 7Q4.', 'What is the Helping Hand test note?'])
})

test('two bots: a picker; the other bot\'s cards read with its name and say "for work"', async () => {
  const { view } = await openYours({
    profiles: { profiles: [{ name: 'default', is_default: true }, { name: 'work' }] },
    soul: p => ({ soul: p.name === 'work' ? 'You are Work Bot.' : DEFAULT_SOULS[0] }),
    runtime: p => (p.profile === 'work' ? { ok: false } : { ok: true, model: 'mock-small' })
  })
  const picker = byData(view.tree, 'bot-picker')
  assert.ok(picker)
  assert.match(text(picker), /2 bots on this Hermes/)
  assert.match(text(card(view, 'soul')), /Personality file \(SOUL\.md\) for default/)
  const select = all(picker, n => n.type === 'sdk:Select')[0]
  select.props.onValueChange('work')
  await settle(10)
  assert.match(text(card(view, 'soul')), /for work/)
  assert.equal(status(view, 'soul'), 'works')
  assert.equal(status(view, 'model'), 'fix')
  assert.deepEqual(calls.filter(c => c.method === 'setup.runtime_check').at(-1).params, { profile: 'work' })
  assert.deepEqual(calls.filter(c => c.method === 'profiles.describe').at(-1).params, { name: 'work' })
  assert.ok(globalThis.__hhHost.sdkCalls.some(c => c.name === 'skills' && c.arg === 'work'))
  assert.ok(globalThis.__hhHost.sdkCalls.some(c => c.name === 'toolsets' && c.arg === 'work'))
  assert.equal(byLabel(card(view, 'answers'), 'Check').props.disabled, true) // work has no model
})

test('two bots: card 3 for the other bot sends its profile with the model call', async () => {
  const { view } = await openYours({ profiles: { profiles: [{ name: 'default' }, { name: 'work' }] } })
  all(byData(view.tree, 'bot-picker'), n => n.type === 'sdk:Select')[0].props.onValueChange('work')
  await settle(10)
  click(byLabel(card(view, 'answers'), 'Check'))
  await settle(10)
  assert.equal(calls.filter(c => c.method === 'llm.oneshot')[0].params.profile, 'work')
})

test('one bot: no picker, plain titles', async () => {
  const { view } = await openYours()
  assert.equal(byData(view.tree, 'bot-picker'), null)
  assert.equal(card(view, 'soul').props['aria-label'], 'Personality file (SOUL.md)')
})

test('Hermes not connected: card 1 Needs a fix', async () => {
  const { view } = await openYours({ gateway: 'connecting' })
  assert.equal(status(view, 'gateway'), 'fix')
})

test('the page\'s Check again re-reads every card except the model call and the memory test', async () => {
  const { view } = await openYours()
  const before = calls.length
  const sdkBefore = globalThis.__hhHost.sdkCalls.length
  const again = all(view.tree, n => n.type === 'sdk:Button' && text(n).trim() === 'Check again').at(-1)
  click(again)
  await settle(10)
  const added = calls.slice(before).map(c => c.method).sort()
  assert.deepEqual(added, ['profiles.describe', 'setup.runtime_check'])
  assert.equal(globalThis.__hhHost.sdkCalls.length - sdkBefore, 3)
})

test('opening the tab later reuses the page\'s fresh model check: runtime_check is asked once', async () => {
  useHost()
  const { Page } = await registerPlugin(fakeStorage({ tab: 'setup' }))
  const view = mount(Page)
  await settle(10)
  all(view.tree, n => n.type === 'sdk:SegmentedControl')[0].props.onChange('yours')
  await settle(10)
  assert.equal(methods().filter(m => m === 'setup.runtime_check').length, 1)
  assert.equal(status(view, 'model'), 'works')
})

/* ---- added after code review ---- */

test('Hermes switches to another bot while the tab is open: the old answers go, the new bot is read', async () => {
  const { view } = await openYours({
    profiles: { profiles: [{ name: 'default' }, { name: 'work' }] },
    soul: p => ({ soul: p.name === 'work' ? 'You are Work Bot.' : DEFAULT_SOULS[0] })
  })
  assert.equal(status(view, 'soul'), 'notset')
  globalThis.__hhHost.profile = 'work'
  // Any re-render reads the new running bot (in Hermes the atom change re-renders the page).
  all(view.tree, n => n.type === 'sdk:Switch')[0].props.onCheckedChange(false)
  await settle(10)
  assert.equal(status(view, 'soul'), 'works')
  assert.deepEqual(calls.filter(c => c.method === 'profiles.describe').at(-1).params, { name: 'work' })
  // work is now the running bot: its reads carry no profile.
  assert.equal(globalThis.__hhHost.sdkCalls.filter(c => c.name === 'skills').at(-1).arg, undefined)
  for (const id of ['soul', 'skills', 'memory']) assert.notEqual(status(view, id), 'checking', id)
})

test('Check again while another bot is shown and the bot list fails: that bot stays on screen', async () => {
  let listFails = false
  const { view } = await openYours({
    profiles: () => (listFails ? rpcError(5061, 'down') : { profiles: [{ name: 'default' }, { name: 'work' }] }),
    soul: p => ({ soul: p.name === 'work' ? 'You are Work Bot.' : '' })
  })
  all(byData(view.tree, 'bot-picker'), n => n.type === 'sdk:Select')[0].props.onValueChange('work')
  await settle(10)
  listFails = true
  click(all(view.tree, n => n.type === 'sdk:Button' && text(n).trim() === 'Check again').at(-1))
  await settle(10)
  assert.match(text(card(view, 'soul')), /for work/)
  assert.equal(status(view, 'soul'), 'works')
})

test('a host call that throws instead of rejecting: that card says Can\'t check, the others still load', async () => {
  useHost()
  globalThis.__hhHost.skills = () => {
    throw new Error('sync boom')
  }
  const reg = await registerPlugin(fakeStorage({ tab: 'yours' }))
  const view = mount(reg.Page)
  await settle(10)
  assert.equal(status(view, 'skills'), 'cant')
  assert.equal(status(view, 'memory'), 'works')
  assert.equal(status(view, 'soul'), 'notset')
})

test('another bot on the free tier: its name comes from free_tier.status for that bot', async () => {
  const { view } = await openYours({
    profiles: { profiles: [{ name: 'default' }, { name: 'guest' }] },
    runtime: p => (p.profile === 'guest' ? { ok: true, model: null, free_tier_route: true } : { ok: true, model: 'mock-small' })
  })
  all(byData(view.tree, 'bot-picker'), n => n.type === 'sdk:Select')[0].props.onValueChange('guest')
  await settle(10)
  assert.match(text(card(view, 'model')), /Nous · free tier/)
  assert.deepEqual(calls.filter(c => c.method === 'free_tier.status').at(-1).params, { profile: 'guest' })
})

test('profiles.describe answers soul: null: Can\'t check right now, not "Not set up yet"', async () => {
  const { view } = await openYours({ soul: { soul: null } })
  assert.equal(status(view, 'soul'), 'cant')
})

test('card 3 after card 2 turns not-ok: the Try again button can\'t be pressed', async () => {
  let broken = false
  const { view } = await openYours({
    oneshot: rpcError(5030, 'one-shot generation failed: Connection error.'),
    runtime: () => (broken ? { ok: false } : { ok: true, model: 'mock-small' })
  })
  click(byLabel(card(view, 'answers'), 'Check'))
  await settle(10)
  assert.equal(byLabel(card(view, 'answers'), 'Try again').props.disabled, false)
  broken = true
  click(all(view.tree, n => n.type === 'sdk:Button' && text(n).trim() === 'Check again').at(-1))
  await settle(10)
  assert.equal(status(view, 'model'), 'fix')
  const button = byLabel(card(view, 'answers'), 'Check')
  assert.equal(button.props.disabled, true) // the old answer was dropped by Check again
})
