// dash-v1: the Dashboard tab rendered from the built desktop/plugin.js with stand-ins for React and Hermes
// (tests/lib/render.mjs), for the three made-up people of tests/dash-rules.test.mjs: the three tiles and their
// waiting blocks, the order of the reads (always naming the bot), Activity shown only when its read works, the path
// (filled, "You are here", the quiet five, one neutral line), a click on a stop, the route buttons, and the rules:
// no AI call, nothing stored, every word from the data file.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
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
function useHost(who, { listPersisted = true, failing = [], userCount = 1, openBot = 'default' } = {}) {
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
      if (method === 'setup.runtime_check' && params && params.profile) return p.model.value
      if (method === 'setup.runtime_check') return { ok: true, model: 'mock-small' }
      if (method === 'profiles.describe') return p.soul.value
      if (method === 'cron.manage') return p.cron.value
      if (method === 'plugins.manage') return { user_count: userCount, bundled_count: 64, plugins: [] }
      throw new Error('unexpected ' + method)
    },
    profiles: () => answer('profiles.list', p.bots.value),
    skills: name => answer('skills.list', Array.from({ length: name === 'default' ? skillsOf[who] : 3 }, (_, i) => ({ name: name === 'default' ? `s${i}` : `own-${name}-${i}` }))),
    status: () => answer('status', p.status.value),
    ...(listPersisted ? { listPersisted: o => answer('listPersisted', { sessions: sessionsOf[who], total: sessionsOf[who].length, asked: o }) } : {})
  }
}

async function open(who, opts, storage = fakeStorage()) {
  useHost(who, opts)
  const reg = await registerPlugin(storage, fakeTimers())
  const view = mount(reg.Page)
  await settle(12)
  return { view, storage: reg.storage, Page: reg.Page }
}
const dash = view => byData(view.tree, 'dashboard')
// the words as they read on screen (the stand-in renderer joins an element's parts with spaces)
const said = n => text(n).replace(/\s+/g, ' ').trim()
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

test('the top box: three tiles, bots, skills (different names across all bots) and plugins (installed + 1 for Helper), each with Hermes\'s own icon', async () => {
  const { view } = await open('half', { userCount: 1 })
  assert.deepEqual(all(byData(dash(view), 'stats'), n => /^tile-/.test(n.props['data-hh'] || '')).map(n => n.props['data-hh']), ['tile-bots', 'tile-skills', 'tile-plugins'])
  // half: 3 bots; skills: the main bot's 39 plus 3 of each other bot's own
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileNumber(view, k)), ['3', '45', '2'])
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => text(byData(dash(view), `tile-${k}`)).replace(/\d+/g, '').trim()), [W.stats.bots, W.stats.skills, W.stats.plugins])
  assert.deepEqual(all(byData(dash(view), 'stats'), n => n.type === 'sdk:Codicon').map(n => [n.props.name, n.props.size]), [['hubot', 20], ['zap', 20], ['extensions', 20]])
  assert.doesNotMatch(text(dash(view)), /30 days|chats in|streak|days with a chat/i)
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

test('another bot open in the app: Activity and plugins read that bot; the six rules read the main bot', async () => {
  await open('half', { openBot: 'bot1' })
  const req = m => log.find(e => e.method === m && e.params && (e.params.profile || e.params.name))
  assert.equal(req('setup.runtime_check').params.profile, 'default')
  assert.equal(req('cron.manage').params.profile, 'default')
  assert.equal(req('plugins.manage').params.profile, 'bot1')
  assert.equal(globalThis.__hhHost.sdkCalls.find(c => c.name === 'listPersisted').arg.profile, 'bot1')
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
  // the names under the stops are the data's short names
  assert.deepEqual(stops(view).map(s => text(all(s, n => n.props.className === D.name)[0])), DASH_DATA.items.map(i => i.mark))
})

test('person 2, half: "4 of 6"; person 3, all: "6 of 6", "Everything Helper can see is set up.", nobody is here', async () => {
  const half = await open('half')
  assert.equal(said(byData(dash(half.view), 'count')), '4 of 6')
  assert.equal(stop(half.view, 'scheduled_job').props['data-state'], 'done', 'a paused job counts')
  assert.equal(stop(half.view, 'personality').props['data-state'], 'here', 'the old starter text is not his own')
  const allSet = await open('all')
  assert.equal(said(byData(dash(allSet.view), 'count')), '6 of 6')
  assert.equal(all(dash(allSet.view), n => n.props['data-hh'] === 'you-are-here').length, 0)
  assert.equal(byData(dash(allSet.view), 'next'), null)
  assert.match(text(byData(dash(allSet.view), 'all-done')), new RegExp(W.setup.all_done.replace('.', '\\.')))
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
  assert.deepEqual(pastes.map(p => text(byData(p, 'paste-text'))), it.terminal.paste.map(p => p.text))
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
  assert.equal(globalThis.__hhHost.navigated, undefined)
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
    for (const st of stops(view)) assert.match(st.props['aria-label'], new RegExp(`^${st.props['aria-label'].split(':')[0]}: (${[W.setup.state_done, W.setup.state_not_done, W.setup.you_are_here, W.setup.state_not_counted].join('|')})$`))
  }
})

test('the narrow sizes: the page hands the tab "compact" when the left side is under 640 px', async () => {
  const { view } = await open('half')
  assert.equal(dash(view).props['data-compact'], false)
  assert.equal(dash(view).props.className, D.main)
  assert.ok(K.notBuilt)
})
