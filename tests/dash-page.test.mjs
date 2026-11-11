// The Dashboard tab (dash-v1, fixes of dash-v2) rendered from the built desktop/plugin.js with stand-ins for React and Hermes
// (tests/lib/render.mjs), for the three made-up people of tests/dash-rules.test.mjs: the three tiles and their
// waiting blocks, the order of the reads (always naming the bot), Activity shown only when its read works, the path
// (filled, "You are here", the quiet five, one neutral line), a click on a stop, the route buttons, and the rules:
// no AI call, nothing stored, every word from the data file.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData, click } from './lib/render.mjs'
import { DASH_DATA } from '../src/dash-data.js'
import { D, K } from '../src/look.js'
import { PEOPLE } from './lib/dash-people.mjs'

const W = DASH_DATA.words
const NOW = Date.now() / 1000
const DAY = 86400
const sessionsOf = {
  // Hermes's own first-run chat only (source local): no day of use
  just_installed: [{ source: 'local', title: 'Getting started', started_at: NOW - 600, last_active: NOW - 500, message_count: 4 }],
  half: [0, 1, 2, 4].map(d => ({ source: 'gui', started_at: NOW - d * DAY, last_active: NOW - d * DAY, message_count: 2 })),
  all: [...Array.from({ length: 12 }, (_, d) => ({ source: 'gui', started_at: NOW - d * DAY, last_active: NOW - d * DAY, message_count: 2 })), { source: 'cron', started_at: NOW - 30 * DAY, last_active: NOW - 30 * DAY, message_count: 2 }, { source: 'telegram', started_at: NOW - 9 * DAY, last_active: NOW - 9 * DAY, message_count: 2 }]
}
const skillsOf = { just_installed: 39, half: 39, all: 44 }

let log
// A made-up person's Hermes. opts: listPersisted false = a Hermes without that read; failing: names of reads that fail
// plugins: the rows of plugins.manage list (Hermes's own parts are source bundled); byBot: { name: person } gives a bot
// other than the main one its own answers
const ONE_ON = [{ name: 'advanced-delegation', source: 'user', status: 'enabled' }]
const BUNDLED = Array.from({ length: 64 }, (_, i) => ({ name: `own-${i}`, source: 'bundled', status: i < 59 ? 'enabled' : 'not enabled' }))
function useHost(who, { listPersisted = true, failing = [], plugins = ONE_ON, openBot = 'default', byBot = {}, sessions = null } = {}) {
  log = []
  const p = PEOPLE[who]
  const answer = (name, value) => {
    log.push(name)
    if (failing.includes(name)) throw new Error(`${name} failed`)
    return value
  }
  globalThis.__hhHost = {
    profile: openBot,
    request: async (method, params) => {
      log.push({ method, params })
      if (failing.includes(method)) throw new Error(`${method} failed`)
      const bot = PEOPLE[byBot[params && (params.profile || params.name)]] || p
      if (method === 'setup.runtime_check' && params && params.profile) return bot.model.value
      if (method === 'setup.runtime_check') return { ok: true, model: 'mock-small' }
      if (method === 'profiles.describe') return bot.soul.value
      if (method === 'cron.manage') return bot.cron.value
      if (method === 'plugins.manage') {
        const rows = Array.isArray(plugins) ? plugins : plugins[params.profile] || []
        return { user_count: rows.length, bundled_count: 64, plugins: [...BUNDLED, ...rows] }
      }
      throw new Error('unexpected ' + method)
    },
    profiles: () => answer('profiles.list', p.bots.value),
    skills: name => answer('skills.list', Array.from({ length: name === 'default' ? skillsOf[who] : 3 }, (_, i) => ({ name: name === 'default' ? `s${i}` : `own-${name}-${i}` }))),
    // host.status() answers for the bot the app has open
    status: () => answer('status', (PEOPLE[byBot[globalThis.__hhHost.profile]] || p).status.value),
    ...(listPersisted ? { listPersisted: o => answer('listPersisted', { sessions: sessions || sessionsOf[who], total: (sessions || sessionsOf[who]).length, asked: o }) } : {})
  }
}

async function open(who, opts, storage = fakeStorage()) {
  useHost(who, opts)
  const reg = await registerPlugin(storage, fakeTimers())
  const view = mount(reg.Page)
  await settle(12)
  return { view, storage: reg.storage, Page: reg.Page }
}
// the words of a tile as they read on screen, without what only a screen reader gets
const tileSaid = (view, key) => {
  const t = byData(dash(view), `tile-${key}`)
  return all(t, n => [D.tileNum, D.tileLabel].includes(n.props.className)).map(n => text(n).trim()).join(' ')
}
const dash = view => byData(view.tree, 'dashboard')
// the words as they read on screen (the stand-in renderer joins an element's parts with spaces)
const said = n => text(n).replace(/\s+/g, ' ').trim()
// the text exactly as a browser joins it (parts side by side, nothing added between them): for a command to paste
const exact = n => (n == null || typeof n === 'boolean' ? '' : Array.isArray(n) ? n.map(exact).join('') : typeof n === 'object' ? exact(n.props.children) : String(n))
const stops = view => all(dash(view), n => n.props['data-hh'] === 'stop')
const stop = (view, id) => stops(view).find(s => s.props['data-stop'] === id)
const tileNumber = (view, key) => {
  const t = byData(dash(view), `tile-${key}`)
  const n = byData(t, 'number')
  return n ? n.props.children : byData(t, 'wait') ? 'waiting' : 'none'
}

beforeEach(() => {
  delete globalThis.__hhHost
  delete globalThis.ResizeObserver
})

test('the top box: three tiles, bots, skills (different names across all bots) and plugins (switched on for the open bot + 1 for Helper), each with Hermes\'s own icon', async () => {
  const { view } = await open('half')
  assert.deepEqual(all(byData(dash(view), 'stats'), n => /^tile-/.test(n.props['data-hh'] || '')).map(n => n.props['data-hh']), ['tile-bots', 'tile-skills', 'tile-plugins'])
  // half: 3 bots; skills: the main bot's 39 plus 3 of each other bot's own
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileNumber(view, k)), ['3', '45', '2'])
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileSaid(view, k)), ['3 bots', '45 skills', '2 plugins on in this bot'])
  assert.deepEqual(all(byData(dash(view), 'stats'), n => n.type === 'sdk:Codicon').map(n => [n.props.name, n.props.size]), [['hubot', 20], ['zap', 20], ['extensions', 20]])
  assert.doesNotMatch(text(dash(view)), /30 days|chats in|streak|days with a chat/i)
})

test('a tile\'s word follows its number: "1 bot", "1 plugin on in this bot" for a newcomer; a plugin that is installed but switched off is not counted', async () => {
  const off = [{ name: 'advanced-delegation', source: 'user', status: 'not enabled' }]
  const { view } = await open('just_installed', { plugins: off })
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileSaid(view, k)), ['1 bot', '39 skills', '1 plugin on in this bot'])
  const two = await open('just_installed', { plugins: [...ONE_ON, ...off, { name: 'x', source: 'user', status: 'disabled' }] })
  assert.equal(tileSaid(two.view, 'plugins'), '2 plugins on in this bot')
  // one skill: the singular too (a made-up Hermes whose only bot has one skill)
  useHost('just_installed')
  globalThis.__hhHost.skills = () => [{ name: 'only-one' }]
  const reg = await registerPlugin(fakeStorage(), fakeTimers())
  const one = mount(reg.Page)
  await settle(12)
  assert.equal(tileSaid(one, 'skills'), '1 skill')
})

test('a screen reader hears "Counting" while a number is still being read, and that it could not be read when its read failed; neither is drawn for the eye', async () => {
  useHost('half', { failing: ['plugins.manage'] })
  const reg = await registerPlugin(fakeStorage(), fakeTimers())
  const view = mount(reg.Page)
  const heard = key => all(byData(dash(view), `tile-${key}`), n => n.props.className === K.srOnly).map(n => text(n).trim())
  assert.deepEqual(['bots', 'skills', 'plugins'].map(heard), [[W.stats.waiting], [W.stats.waiting], [W.stats.waiting]])
  await settle(12)
  assert.deepEqual(['bots', 'skills', 'plugins'].map(heard), [[], [], [W.stats.not_known]])
  assert.equal(W.stats.not_known, 'Helper could not read this number just now.')
  assert.equal(tileSaid(view, 'plugins'), 'plugins on in this bot', 'for the eye: the word, no number')
})

test('each number has its own waiting block until its read is back; a failed read shows no number at all (never a bare 1 for plugins)', async () => {
  useHost('half')
  const host = globalThis.__hhHost
  let releasePlugins
  const slow = new Promise(r => (releasePlugins = r))
  const plain = host.request
  host.request = (m, p) => (m === 'plugins.manage' ? slow.then(() => plain(m, p)) : plain(m, p))
  const reg = await registerPlugin(fakeStorage(), fakeTimers())
  const view = mount(reg.Page)
  // before anything is back: three waiting blocks, no numbers
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileNumber(view, k)), ['waiting', 'waiting', 'waiting'])
  assert.equal(all(byData(dash(view), 'stats'), n => n.props['data-hh'] === 'wait').every(n => n.props.className === D.wait && n.props['aria-hidden'] === true), true)
  await settle(12)
  // the slow one fills in last
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileNumber(view, k)), ['3', '45', 'waiting'])
  releasePlugins()
  await settle(6)
  assert.equal(tileNumber(view, 'plugins'), '2')
  // failed reads
  const failed = await open('half', { failing: ['plugins.manage', 'skills.list'] })
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileNumber(failed.view, k)), ['3', 'none', 'none'])
  assert.doesNotMatch(text(byData(dash(failed.view), 'tile-plugins')), /\d/)
  const noBots = await open('half', { failing: ['profiles.list'] })
  assert.equal(tileNumber(noBots.view, 'bots'), 'none')
})

test('the reads: the bots first, then the path\'s own reads, then the skills, the plugins last; every read names the bot', async () => {
  await open('half', { openBot: 'default' })
  const name = e => (typeof e === 'string' ? e : e.method)
  const dashLog = log.filter(e => typeof e === 'string' || (e.params && (e.params.profile || e.params.name)))
  const order = dashLog.map(name)
  assert.equal(order[0], 'profiles.list')
  const path = ['setup.runtime_check', 'profiles.describe', 'cron.manage', 'status', 'listPersisted']
  for (const m of path) assert.ok(order.indexOf(m) > 0 && order.indexOf(m) < order.indexOf('skills.list'), m)
  assert.equal(order.at(-1), 'plugins.manage')
  assert.equal(order.filter(m => m === 'skills.list').length, 3, 'one per bot')
  const req = m => dashLog.find(e => e.method === m)
  assert.deepEqual(req('setup.runtime_check').params, { profile: 'default' })
  assert.deepEqual(req('profiles.describe').params, { name: 'default' })
  assert.deepEqual(req('cron.manage').params, { action: 'list', profile: 'default', include_disabled: true })
  assert.deepEqual(req('plugins.manage').params, { action: 'list', profile: 'default' })
  // the open bot's chats, 500 at most (the server's cap)
  const sdk = globalThis.__hhHost.sdkCalls.find(c => c.name === 'listPersisted')
  assert.deepEqual(sdk.arg, { route: null, profile: 'default', limit: 500 })
})

test('another bot open in the app (Lead, 11 Nov: the count must not mix two bots): A model, Its personality, Chat apps and Scheduled jobs read that bot, as Activity and the plugins tile do', async () => {
  // the main bot is the half person's (a model, a paused job, no personality); the open bot "bot1" has all of it
  const { view } = await open('half', { openBot: 'bot1', byBot: { bot1: 'all' }, plugins: { default: ONE_ON, bot1: [] } })
  const req = m => log.filter(e => e.method === m && e.params && (e.params.profile || e.params.name))
  for (const m of ['setup.runtime_check', 'cron.manage', 'plugins.manage']) assert.deepEqual(req(m).map(e => e.params.profile), ['bot1'], m)
  assert.deepEqual(req('profiles.describe').map(e => e.params.name), ['bot1'])
  assert.equal(globalThis.__hhHost.sdkCalls.find(c => c.name === 'listPersisted').arg.profile, 'bot1')
  // nothing at all is asked about the main bot
  assert.deepEqual(log.filter(e => e.params && (e.params.profile === 'default' || e.params.name === 'default')), [])
  // so the path shows the open bot: its own personality and its chat app are seen done (the main bot has neither)
  assert.equal(stop(view, 'personality').props['data-state'], 'done')
  assert.equal(stop(view, 'chat_apps').props['data-state'], 'done')
  assert.equal(said(byData(dash(view), 'count')), '6 of 6')
  assert.equal(tileSaid(view, 'plugins'), '1 plugin on in this bot', 'the open bot has no plugin of its own: Helper only')
  // Install and A second bot are for the whole Hermes
  assert.equal(stop(view, 'second_bot').props['data-state'], 'done')
  const main = await open('half', { openBot: 'default', byBot: { bot1: 'all' }, plugins: { default: ONE_ON, bot1: [] } })
  assert.equal(said(byData(dash(main.view), 'count')), '4 of 6')
  assert.equal(tileSaid(main.view, 'plugins'), '2 plugins on in this bot')
})

test('the open bot changes while the tab is on screen: what was read goes, and everything is read again for the new bot', async () => {
  const { view } = await open('half', { openBot: 'default', byBot: { bot1: 'all' }, plugins: { default: ONE_ON, bot1: [] } })
  assert.equal(said(byData(dash(view), 'count')), '4 of 6')
  assert.equal(tileSaid(view, 'plugins'), '2 plugins on in this bot')
  const before = log.length
  // the app opens another bot (host.state.profile); the page is drawn again
  globalThis.__hhHost.profile = 'bot1'
  click(stop(view, 'memory'))
  // at once: the old bot's numbers and count are gone
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileNumber(view, k)), ['waiting', 'waiting', 'waiting'])
  assert.equal(byData(dash(view), 'count'), null)
  await settle(12)
  const again = log.slice(before)
  assert.equal(again.filter(e => e === 'profiles.list').length, 1, 'the bots are read again')
  assert.deepEqual(again.filter(e => e.method === 'plugins.manage').map(e => e.params.profile), ['bot1'])
  assert.deepEqual(again.filter(e => e.params && e.params.profile === 'default'), [])
  assert.equal(said(byData(dash(view), 'count')), '6 of 6')
  assert.equal(tileSaid(view, 'plugins'), '1 plugin on in this bot')
  // the stop that was open stays open through it
  assert.equal(byData(dash(view), 'steps').props['data-stop'], 'memory')
})

test('Activity: GitHub\'s grid and "Last used ..."; Hermes\'s own work is not a day; a newcomer\'s first-run chat is not a day either', async () => {
  const { view } = await open('all')
  const act = byData(dash(view), 'activity')
  assert.ok(act)
  assert.equal(text(byData(act, 'last-used')), W.activity.last_used_today)
  const grid = byData(act, 'grid')
  assert.equal(grid.props['data-weeks'], 16, 'unmeasured: 16 weeks')
  const cells = grid.props.children
  assert.equal(cells.filter(c => c.props['data-level'] > 0).length, 12, '12 days of gui chats; cron left out; telegram 9 days ago is one of them')
  assert.equal(cells.filter(c => c.props.className.split(' ').includes(D.today)).length, 1)
  assert.match(text(act), new RegExp(`${W.activity.less}.*${W.activity.more}`))
  assert.doesNotMatch(text(dash(view)), /streak|days with a chat|in a row/i)
  // the newcomer: the box, an empty grid, no "Last used" line
  const n = await open('just_installed')
  const a2 = byData(dash(n.view), 'activity')
  assert.ok(a2)
  assert.equal(byData(a2, 'last-used'), null)
  assert.equal(byData(a2, 'grid').props.children.filter(c => c.props['data-level'] > 0).length, 0)
  // hhcontent's optional line for an empty Activity is not shown (Lead, 11 Nov), and is not in the built data
  assert.doesNotMatch(text(dash(n.view)), /No chats/)
  assert.equal(W.activity.no_chats, undefined)
  assert.equal(text(all(a2, x => x.props.className === D.title)[0]), "This bot's activity")
})

test('a brand-new install whose first-run chat Hermes is still writing (stored as gui, 1 to 3 messages, titled Getting started) shows no "Last used today" and no lit day', async () => {
  // as read in three brand-new homes on the first opening (dev/checks/dash-v2/fresh-probe-65b108b.out): 2 of 3 showed
  // "Last used today" with these rows
  for (const n of [1, 3, 4]) {
    const { view } = await open('just_installed', { sessions: [{ source: 'gui', title: 'Getting started', started_at: NOW - 15, last_active: NOW - 2, message_count: n }] })
    const act = byData(dash(view), 'activity')
    assert.ok(act, 'the box is drawn')
    assert.equal(byData(act, 'last-used'), null, `${n} messages`)
    assert.equal(byData(act, 'grid').props.children.filter(c => c.props['data-level'] > 0).length, 0)
  }
  // the person's own first chat right after it is a day of use
  const { view } = await open('just_installed', { sessions: [{ source: 'local', title: 'Getting started', started_at: NOW - 600, last_active: NOW - 500, message_count: 4 }, { source: 'gui', title: 'Plan my week', started_at: NOW - 60, last_active: NOW - 30, message_count: 2 }] })
  assert.equal(text(byData(byData(dash(view), 'activity'), 'last-used')), 'Last used today')
})


test('Activity is not shown at all when the read is missing (not in the plugin docs) or fails: no error, no made-up squares', async () => {
  for (const opts of [{ listPersisted: false }, { failing: ['listPersisted'] }]) {
    const { view } = await open('all', opts)
    assert.equal(byData(dash(view), 'activity'), null, JSON.stringify(opts))
    assert.doesNotMatch(text(dash(view)), new RegExp(W.activity.title))
    assert.ok(byData(dash(view), 'setup'), 'the rest of the tab is there')
  }
})

test('person 1, just installed: "2 of 6", Install and Model filled, You are here on Personality, the five quiet marks, Next: Its personality', async () => {
  const { view } = await open('just_installed')
  assert.equal(said(byData(dash(view), 'count')), '2 of 6')
  assert.deepEqual(stops(view).map(s => [s.props['data-stop'], s.props['data-state']]), [
    ['install', 'done'], ['model', 'done'], ['first_chat', 'quiet'], ['personality', 'here'], ['chat_apps', 'todo'], ['tools_apps', 'quiet'],
    ['skills', 'quiet'], ['memory', 'quiet'], ['scheduled_job', 'todo'], ['second_bot', 'todo'], ['safety', 'quiet']
  ])
  assert.equal(all(dash(view), n => n.props['data-hh'] === 'you-are-here').length, 1)
  assert.equal(text(byData(stop(view, 'personality'), 'you-are-here')), W.setup.you_are_here)
  const next = byData(dash(view), 'next')
  assert.match(text(next), new RegExp(`${W.setup.next}.*Its personality.*${W.setup.open}`))
  // hhdesign's review 5: "Open" is followed by Hermes's small down arrow (the steps open below, they do not lead away)
  const openNext = byData(next, 'open-next')
  assert.equal(text(openNext).trim(), 'Open')
  assert.deepEqual(all(openNext, x => x.type === 'sdk:Codicon').map(x => [x.props.name, x.props.size, x.props['aria-hidden']]), [['chevron-down', 12, true]])
  assert.equal(all(openNext, x => x.props.className === D.openChev).length, 1)
  // the names under the stops are the data's short names
  assert.deepEqual(stops(view).map(s => text(all(s, n => n.props.className === D.name)[0])), DASH_DATA.items.map(i => i.mark))
})

test('person 2, half: "4 of 6"; person 3, all: "6 of 6", "All 6 are set up.", nobody is here', async () => {
  const half = await open('half')
  assert.equal(said(byData(dash(half.view), 'count')), '4 of 6')
  assert.equal(stop(half.view, 'scheduled_job').props['data-state'], 'done', 'a paused job counts')
  assert.equal(stop(half.view, 'personality').props['data-state'], 'here', 'the old starter text is not his own')
  const allSet = await open('all')
  assert.equal(said(byData(dash(allSet.view), 'count')), '6 of 6')
  assert.equal(all(dash(allSet.view), n => n.props['data-hh'] === 'you-are-here').length, 0)
  assert.equal(byData(dash(allSet.view), 'next'), null)
  assert.equal(text(byData(dash(allSet.view), 'all-done')).trim(), 'All 6 are set up.')
  assert.deepEqual(stops(allSet.view).filter(s => s.props['data-state'] !== 'done').map(s => s.props['data-stop']), ['first_chat', 'tools_apps', 'skills', 'memory', 'safety'])
})

test('the line is one neutral line through all 11 stops, the same for every person: 10 segments, each wearing only the line\'s class', async () => {
  for (const who of ['just_installed', 'half', 'all']) {
    const { view } = await open(who)
    const segs = all(byData(dash(view), 'road'), n => n.type === 'path')
    assert.equal(segs.length, 10, who)
    for (const s of segs) {
      assert.equal(s.props.className, D.line)
      assert.equal(s.props.style, undefined)
      assert.equal(s.props.stroke, undefined)
    }
  }
})

test('before the path\'s reads are back: no count, nobody here, the counted stops wait as not done', async () => {
  useHost('all')
  const host = globalThis.__hhHost
  let release
  const hold = new Promise(r => (release = r))
  const plain = host.request
  host.request = (m, p) => (m === 'cron.manage' ? hold.then(() => plain(m, p)) : plain(m, p))
  const reg = await registerPlugin(fakeStorage(), fakeTimers())
  const view = mount(reg.Page)
  await settle(8)
  assert.equal(byData(dash(view), 'count'), null)
  assert.equal(all(dash(view), n => n.props['data-hh'] === 'you-are-here').length, 0)
  assert.ok(stops(view).every(s => ['todo', 'quiet'].includes(s.props['data-state'])))
  release()
  await settle(8)
  assert.equal(said(byData(dash(view), 'count')), '6 of 6')
})

test('a click on a stop opens it under the path: its sentence, its numbered steps, the docs file and line, the text to paste with Copy; again or the close button closes it', async () => {
  const { view } = await open('half')
  click(stop(view, 'install'))
  const box = byData(dash(view), 'steps')
  const it = DASH_DATA.items[0]
  assert.equal(box.props['data-stop'], 'install')
  assert.equal(stop(view, 'install').props['aria-expanded'], true)
  assert.ok(stop(view, 'install').props.className.split(' ').includes(D.sel))
  assert.match(text(box), new RegExp(it.why.replace(/[.]/g, '\\.')))
  const ol = all(box, n => n.type === 'ol')[0]
  assert.deepEqual(ol.props.children.map(li => text(li).trim()), it.steps.map(s => s.text))
  assert.deepEqual(all(box, n => n.props['data-hh'] === 'source').map(n => text(n)), ['getting-started/quickstart.md, line 53', 'guides/team-telegram-assistant.md, line 27'])
  const pastes = all(box, n => n.props['data-hh'] === 'paste')
  assert.deepEqual(pastes.map(p => exact(byData(p, 'paste-text'))), it.terminal.paste.map(p => p.text))
  // each word of a command is kept whole (it may break only at its spaces): the words, in order, each in its own span
  for (const [k, p] of pastes.entries()) assert.deepEqual(all(byData(p, 'paste-text'), n => n.props.className === D.word).map(exact), it.terminal.paste[k].text.split(' '))
  // a web address may break only after its last "/"
  assert.deepEqual(all(byData(pastes[0], 'paste-text'), n => n.type === 'wbr').length, 1)
  assert.deepEqual(all(byData(pastes[0], 'paste-text'), n => n.props.className === D.word && Array.isArray(n.props.children)).map(n => n.props.children[0]), ['https://hermes-agent.nousresearch.com/'])
  assert.deepEqual(pastes.map(p => all(p, n => n.type === 'sdk:CopyButton')[0].props.text), it.terminal.paste.map(p => p.text))
  assert.equal(byData(box, 'not-counted'), null, 'Install is counted')
  click(stop(view, 'install'))
  assert.equal(byData(dash(view), 'steps'), null)
  click(stop(view, 'memory'))
  assert.equal(text(byData(byData(dash(view), 'steps'), 'not-counted')), W.setup.not_counted)
  click(byData(dash(view), 'close'))
  assert.equal(byData(dash(view), 'steps'), null)
  // "Open" on the Next line opens the stop it names
  click(byData(dash(view), 'open-next'))
  assert.equal(byData(dash(view), 'steps').props['data-stop'], 'personality')
})

test('hhcontent\'s corrected steps are what an opened stop shows: Its personality as hhtech clicked it, with the way back; the model stop is "A model"', async () => {
  const { view } = await open('just_installed')
  click(stop(view, 'personality'))
  const box = byData(dash(view), 'steps')
  assert.equal(text(all(box, n => n.type === 'h3')[0]), 'Its personality')
  assert.deepEqual(all(box, n => n.type === 'ol')[0].props.children.map(li => text(li).trim()), [
    'Click Bots at the top of the left list.',
    'Right-click your main bot, then click "Edit…".',
    'Click the button "Advanced — model, skills, toolsets, SOUL.md".',
    'The big box under the skills list is SOUL.md. Write who your bot is and how it talks.',
    'Click Save. To come back: click Sessions at the top of the left list, then Helper.'
  ])
  assert.doesNotMatch(text(box), /Edit Profile/)
  click(stop(view, 'model'))
  const model = byData(dash(view), 'steps')
  assert.equal(text(all(model, n => n.type === 'h3')[0]), 'A model')
  assert.match(text(model), /The AI that does the thinking\. Your app may already have a free one\./)
  assert.doesNotMatch(text(dash(view)), /Pick a model/)
  // the team's marks on a step (seen / not seen) are for the team: never on the page, never in the built data
  assert.doesNotMatch(text(model), /not seen|docs words/i)
  assert.equal(JSON.stringify(DASH_DATA).includes('not_seen'), false)
  assert.equal(JSON.stringify(DASH_DATA).includes('docs words'), false)
})

test('a stop that was open is still open when the person comes back: after a route button took them to Hermes\'s own screen, and after another tab; a closed one stays closed; nothing is stored for it', async () => {
  const { view, Page, storage } = await open('half')
  click(stop(view, 'model'))
  const route = all(byData(dash(view), 'steps'), n => n.props['data-hh'] === 'route')[0]
  assert.equal(text(route), 'Open Model settings')
  route.props.onClick()
  assert.deepEqual(globalThis.__hhHost.navigated, ['/settings?tab=config:model'])
  // Hermes shows its Settings: our page is taken down, and built again when the person comes back
  view.unmount()
  const back = mount(Page)
  await settle(12)
  const box = byData(dash(back), 'steps')
  assert.ok(box, 'the steps are there again')
  assert.equal(box.props['data-stop'], 'model')
  assert.equal(stop(back, 'model').props['aria-expanded'], true)
  assert.equal(all(box, n => n.type === 'ol')[0].props.children.length, 5)
  assert.equal(byData(dash(back), 'next'), null, 'the Next row gives way to the opened stop, as before')
  // another tab and back
  click(all(byData(back.tree, 'tabs'), n => n.props.role === 'tab')[1])
  await settle(4)
  click(all(byData(back.tree, 'tabs'), n => n.props.role === 'tab')[0])
  await settle(12)
  assert.equal(byData(dash(back), 'steps').props['data-stop'], 'model')
  // closed by the person: closed when they come back
  click(byData(dash(back), 'close'))
  back.unmount()
  const third = mount(Page)
  await settle(12)
  assert.equal(byData(dash(third), 'steps'), null)
  assert.ok(byData(dash(third), 'next'))
  // kept for the visit only, in the page's own memory: nothing written but the tab the person chose (as before)
  assert.deepEqual([...storage.data.keys()], ['tab'])
  assert.equal(storage.data.get('tab'), 'dashboard')
})

test('a source tag opens its docs page in the browser (ctx.os), never inside Hermes, and only the official docs', async () => {
  const opened = []
  useHost('half')
  const reg = await registerPlugin(fakeStorage(), fakeTimers(), { os: { openExternal: u => opened.push(u) } })
  const view = mount(reg.Page)
  await settle(12)
  click(stop(view, 'personality'))
  const tags = all(byData(dash(view), 'steps'), n => n.props['data-hh'] === 'source')
  tags[0].props.onClick({ preventDefault() {} })
  assert.deepEqual(opened, ['https://hermes-agent.nousresearch.com/docs/user-guide/features/personality'])
  // a middle click too
  let prevented = false
  tags[0].props.onAuxClick({ preventDefault: () => (prevented = true) })
  assert.equal(prevented, true)
  assert.equal(opened.length, 2)
  assert.equal(globalThis.__hhHost.navigated, undefined)
})

test('the docs door (the source tags and Helper\'s "Open the Quickstart") hands the browser only an address of the official Hermes docs; anything else, or a Hermes without that door, does nothing', async () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'dash.js'), 'utf8')
  const body = src.slice(src.indexOf('export const HERMES_DOCS_BASE'), src.indexOf('export function makeDashboard'))
  const { HERMES_DOCS_BASE, isHermesDocsUrl, openHermesDocs } = await import('data:text/javascript,' + encodeURIComponent(body))
  assert.equal(HERMES_DOCS_BASE, 'https://hermes-agent.nousresearch.com/docs/')
  const opened = []
  const ctx = { os: { openExternal: u => opened.push(u) } }
  for (const bad of ['https://hermes-agent.nousresearch.com/docs/../x', 'https://hermes-agent.nousresearch.com/docs/..\\..\\x', 'https://hermes-agent.nousresearch.com/docs/%2e%2e/x', 'https://user@hermes-agent.nousresearch.com/docs/x', 'https://hermes-agent.nousresearch.com:8443/docs/x', 'https://example.com/docs/', 'http://hermes-agent.nousresearch.com/docs/x', 'https://hermes-agent.nousresearch.com.evil.example/docs/x', 'javascript:alert(1)', 'https://hermes-agent.nousresearch.com/docs/x" onclick="y', '', null, undefined, 42]) {
    assert.equal(isHermesDocsUrl(bad), false, String(bad))
    openHermesDocs(ctx, bad)
  }
  assert.deepEqual(opened, [])
  openHermesDocs(ctx, 'https://hermes-agent.nousresearch.com/docs/getting-started/quickstart')
  assert.deepEqual(opened, ['https://hermes-agent.nousresearch.com/docs/getting-started/quickstart'])
  // no door, a door that throws, a door whose promise fails: nothing breaks
  openHermesDocs({}, HERMES_DOCS_BASE + 'x')
  openHermesDocs({ os: { openExternal: () => { throw new Error('no') } } }, HERMES_DOCS_BASE + 'x')
  openHermesDocs({ os: { openExternal: () => Promise.reject(new Error('no')) } }, HERMES_DOCS_BASE + 'x')
  await settle(2)
  // and the built file holds that same door, used by both
  const built = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'desktop', 'plugin.js'), 'utf8')
  assert.equal(built.split('openExternal(').length - 1, 1, 'one place in the whole plugin hands an address to the browser')
  assert.ok(built.includes(body.replace(/^export /gm, '').trim()))
})

test('route buttons open only the places hhtech ran: Model settings, a new chat, Messaging, Scheduled jobs; elsewhere words only', async () => {
  const { view } = await open('half')
  const routes = {}
  for (const it of DASH_DATA.items) {
    click(stop(view, it.id))
    routes[it.id] = all(byData(dash(view), 'steps'), n => n.props['data-hh'] === 'route').map(b => text(b))
    for (const b of all(byData(dash(view), 'steps'), n => n.props['data-hh'] === 'route')) {
      assert.equal(b.type, 'sdk:Button')
      assert.equal(b.props.variant, 'secondary')
      b.props.onClick()
    }
    click(stop(view, it.id))
  }
  assert.deepEqual(Object.entries(routes).filter(([, r]) => r.length).map(([id, r]) => [id, r]), [
    ['model', ['Open Model settings']], ['first_chat', ['New session']], ['chat_apps', ['Open Messaging']], ['scheduled_job', ['Open Scheduled jobs']]
  ])
  assert.deepEqual(globalThis.__hhHost.navigated, ['/settings?tab=config:model', '/messaging', '/cron'])
  assert.deepEqual(globalThis.__hhHost.newChats, [null])
})

test('no AI call anywhere on the tab, and nothing about the person\'s bots is stored: opening it, every stop, every route', async () => {
  const { view, storage } = await open('all')
  for (const it of DASH_DATA.items) {
    click(stop(view, it.id))
    for (const b of all(byData(dash(view), 'steps'), n => n.props['data-hh'] === 'route')) b.props.onClick()
  }
  await settle(6)
  assert.equal(log.filter(e => e.method === 'llm.oneshot').length, 0)
  assert.deepEqual([...storage.data.keys()], [], 'nothing written')
})

test('every word on the tab comes from the data file (src/dash-data.js); numbers are the reads\'', async () => {
  const words = new Set()
  const walk = v => (typeof v === 'string' ? words.add(v) : v && typeof v === 'object' ? Object.values(v).forEach(walk) : null)
  walk(DASH_DATA)
  for (const it of DASH_DATA.items) for (const s of it.sources) words.add(W.setup.source.replace('{file}', s.file).replace('{line}', s.line))
  for (const who of ['just_installed', 'half', 'all']) {
    const { view } = await open(who)
    // open every stop once, so its words are drawn too
    const shown = []
    const collect = node => {
      if (node == null || typeof node === 'boolean') return
      if (Array.isArray(node)) return node.forEach(collect)
      if (typeof node !== 'object') return shown.push(String(node))
      if (node.type === 'style') return
      // a command to paste is drawn word by word (each kept whole): it is read as its whole text
      if (node.props['data-hh'] === 'paste-text') return shown.push(exact(node))
      collect(node.props.children)
    }
    collect(dash(view))
    for (const it of DASH_DATA.items) {
      click(stop(view, it.id))
      collect(byData(dash(view), 'steps'))
      click(stop(view, it.id))
    }
    for (const s of shown.map(x => x.trim()).filter(Boolean)) {
      const filled = s.replace(/^\d+$/, '').replace(/^of \d+$/, '')
      assert.ok(filled === '' || words.has(s) || /^Last used \d+ days ago$/.test(s), `${who}: "${s}" is not from the data`)
    }
    // and the labels a screen reader hears
    for (const st of stops(view)) assert.match(st.props['aria-label'], new RegExp(`^${st.props['aria-label'].split(':')[0]}: (${[W.setup.state_done, W.setup.state_not_done, W.setup.state_not_known, W.setup.you_are_here, W.setup.state_not_counted].join('|')})$`))
  }
})

test('the narrow sizes: under 640 px of left side the tab takes hhdesign\'s narrow sizes; a stop\'s name gets the room to the next stop on its side', async () => {
  const observers = []
  globalThis.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb
      observers.push(this)
    }
    observe(el) {
      this.watching = el
    }
    disconnect() {
      this.watching = null
    }
  }
  const { view } = await open('half')
  const fire = (id, width, height = 822) => observers.filter(o => o.watching && o.watching.id === id).forEach(o => o.cb([{ contentRect: { width, height } }]))
  byData(view.tree, 'page').props.ref({ id: 'our-page' })
  byData(dash(view), 'road').props.ref({ id: 'road' })
  fire('our-page', 1180)
  fire('road', 688)
  await settle(4)
  assert.equal(dash(view).props['data-compact'], false)
  assert.equal(tileSaid(view, 'plugins'), '2 plugins on in this bot', 'wide: hhcontent\'s recommended word')
  assert.equal(dash(view).props.className, D.main)
  const label = id => all(stop(view, id), n => n.props.className === D.label)[0]
  assert.equal(label('personality').props.style, undefined, 'wide: a name keeps its one line')
  // 940 px of page: the left side is 480 px
  fire('our-page', 940)
  fire('road', 448)
  await settle(4)
  assert.equal(dash(view).props['data-compact'], true)
  // narrow: the plugins tile takes hhcontent's short variant (Lead, 11 Nov), the other two keep their word
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileSaid(view, k)), ['3 bots', '45 skills', '2 plugins, this bot'])
  assert.equal(dash(view).props.className, `${D.main} ${D.compact}`)
  // the room: two gaps between stops (11 stops on 448 px less 16 px each side), less 8 px
  const room = Math.floor((2 * (448 - 32)) / 10) - 8
  for (const st of stops(view)) assert.deepEqual(all(st, n => n.props.className === D.label)[0].props.style, { width: `${room}px` }, st.props['data-stop'])
})

test('a read that comes back late, after the app opened another bot or the tab was left, is dropped: it never shows under the new bot', async () => {
  useHost('half', { openBot: 'default', byBot: { bot1: 'all' }, plugins: { default: ONE_ON, bot1: [] } })
  const host = globalThis.__hhHost
  const plain = host.request
  const held = []
  // every plugins read waits until the test lets it go
  host.request = (m, p) => (m === 'plugins.manage' ? new Promise(r => held.push(() => r(plain(m, p)))) : plain(m, p))
  const reg = await registerPlugin(fakeStorage(), fakeTimers())
  const view = mount(reg.Page)
  await settle(12)
  assert.equal(tileNumber(view, 'plugins'), 'waiting')
  assert.equal(held.length, 1)
  // the app opens bot1 while the main bot's plugins read is still out
  host.profile = 'bot1'
  click(stop(view, 'memory'))
  await settle(12)
  assert.equal(held.length, 2, 'bot1\'s own plugins read is out too')
  // the main bot's answer (2) comes back now: it is not shown under bot1
  held[0]()
  await settle(6)
  assert.equal(tileNumber(view, 'plugins'), 'waiting', 'the old bot\'s number is dropped')
  held[1]()
  await settle(6)
  assert.equal(tileSaid(view, 'plugins'), '1 plugin on in this bot')
  // and after the tab is left: a late answer changes nothing, and the tab opens with waiting blocks
  host.profile = 'default'
  click(stop(view, 'memory'))
  await settle(12)
  assert.equal(held.length, 3)
  click(all(byData(view.tree, 'tabs'), n => n.props.role === 'tab')[1])
  held[2]()
  await settle(6)
  click(all(byData(view.tree, 'tabs'), n => n.props.role === 'tab')[0])
  assert.equal(tileNumber(view, 'plugins'), 'waiting')
})

test('the app gives no name for the open bot (an empty profile): the bot Hermes marks as default is read, by its own name', async () => {
  useHost('half', { openBot: '' })
  const host = globalThis.__hhHost
  host.profiles = () => ({ profiles: [{ name: 'home', is_default: true }, { name: 'work', is_default: false }] })
  const reg = await registerPlugin(fakeStorage(), fakeTimers())
  const view = mount(reg.Page)
  await settle(12)
  const named = log.filter(e => typeof e === 'object' && e.params && (e.params.profile || e.params.name))
  assert.deepEqual([...new Set(named.map(e => e.params.profile || e.params.name))], ['home'])
  assert.equal(host.sdkCalls.find(c => c.name === 'listPersisted').arg.profile, 'home')
  assert.equal(said(byData(dash(view), 'count')), '4 of 6')
  // and when the list of bots could not be read either: Hermes's own name for it, "default"
  const { view: v2 } = await open('half', { openBot: '', failing: ['profiles.list'] })
  const named2 = log.filter(e => typeof e === 'object' && e.params && (e.params.profile || e.params.name))
  assert.deepEqual([...new Set(named2.map(e => e.params.profile || e.params.name))], ['default'])
  assert.equal(stop(v2, 'model').props['data-state'], 'done')
})

test('the bots read failed: the open bot is still read by its own name (the app says which bot is open); only A second bot is unknown, and nobody is placed after it', async () => {
  const { view } = await open('all', { failing: ['profiles.list'], openBot: 'bot1' })
  const named = log.filter(e => typeof e === 'object' && e.params && (e.params.profile || e.params.name))
  assert.deepEqual([...new Set(named.map(e => e.params.profile || e.params.name))], ['bot1'], 'never another bot')
  for (const id of ['model', 'personality', 'chat_apps', 'scheduled_job']) assert.equal(stop(view, id).props['data-state'], 'done', id)
  assert.equal(stop(view, 'second_bot').props['data-state'], 'unknown')
  assert.match(stop(view, 'second_bot').props['aria-label'], new RegExp(`: ${W.setup.state_not_known}$`))
  assert.equal(W.setup.state_not_known, 'Helper could not check this one just now')
  assert.equal(said(byData(dash(view), 'count')), '5 of 6')
  assert.equal(byData(dash(view), 'all-done'), null, 'not "All 6 are set up." while one could not be read')
  assert.deepEqual(all(dash(view), n => n.props['data-hh'] === 'you-are-here'), [])
  // a stop before the first one not done could not be read: nobody is placed "here"
  const half = await open('half', { failing: ['setup.runtime_check'] })
  assert.equal(stop(half.view, 'model').props['data-state'], 'unknown')
  assert.deepEqual(all(dash(half.view), n => n.props['data-hh'] === 'you-are-here'), [])
})

test('leaving the tab drops what was read; opening it again reads everything again from the start', async () => {
  const { view } = await open('half')
  assert.equal(log.filter(e => e === 'profiles.list').length, 1)
  const tabs = all(byData(view.tree, 'tabs'), n => n.props.role === 'tab')
  click(tabs[1])
  await settle(6)
  assert.equal(byData(view.tree, 'dashboard'), null)
  click(all(byData(view.tree, 'tabs'), n => n.props.role === 'tab')[0])
  // at once: waiting blocks, not the old numbers
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileNumber(view, k)), ['waiting', 'waiting', 'waiting'])
  await settle(12)
  assert.equal(log.filter(e => e === 'profiles.list').length, 2, 'read again')
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileNumber(view, k)), ['3', '45', '2'])
})
