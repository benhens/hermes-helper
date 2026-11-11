// The Dashboard (dash-v1, fixes of dash-v2; loom2: no Activity, no tabs, the set-up as cards) rendered from the built
// desktop/plugin.js with stand-ins for React and Hermes (tests/lib/render.mjs), for the three made-up people of
// tests/lib/dash-people.mjs: the three tiles and their waiting blocks, the reads (the tiles' only), the cards (done only
// by the person's own mark, "Start here", the count), a click on a card, the route buttons, and the rules: no AI call,
// nothing stored but the marks, every word from the data file.
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
  // (loom-fixes: a chat the person typed has a preview, the first thing typed: First chat is seen by it)
  half: [0, 1, 2, 4].map(d => ({ source: 'gui', preview: 'Made-up line ' + d, started_at: NOW - d * DAY, last_active: NOW - d * DAY, message_count: 2 })),
  all: [...Array.from({ length: 12 }, (_, d) => ({ source: 'gui', preview: 'Made-up line ' + d, started_at: NOW - d * DAY, last_active: NOW - d * DAY, message_count: 2 })), { source: 'cron', started_at: NOW - 30 * DAY, last_active: NOW - 30 * DAY, message_count: 2 }, { source: 'telegram', started_at: NOW - 9 * DAY, last_active: NOW - 9 * DAY, message_count: 2 }]
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
  return all(t, n => [D.tileNum, D.tileName, D.tileLabel].includes(n.props.className)).map(n => text(n).trim()).join(' ')
}
const dash = view => byData(view.tree, 'dashboard')
// the words as they read on screen (the stand-in renderer joins an element's parts with spaces)
const said = n => text(n).replace(/\s+/g, ' ').trim()
// the text exactly as a browser joins it (parts side by side, nothing added between them): for a command to paste
const exact = n => (n == null || typeof n === 'boolean' ? '' : Array.isArray(n) ? n.map(exact).join('') : typeof n === 'object' ? exact(n.props.children) : String(n))
// loom2: the set-up cards (each a button), in their order
const stops = view => all(dash(view), n => n.props['data-hh'] === 'card')
const stop = (view, id) => stops(view).find(s => s.props['data-card'] === id)
const tileNumber = (view, key) => {
  const t = byData(dash(view), `tile-${key}`)
  const n = byData(t, 'number')
  return n ? n.props.children : byData(t, 'wait') ? 'waiting' : 'none'
}

beforeEach(() => {
  delete globalThis.__hhHost
  delete globalThis.ResizeObserver
})

test('the top box: three tiles, bots and skills with their numbers, plugins with none (loom-fixes, Lead\'s point 14), each with Hermes\'s own icon', async () => {
  const { view } = await open('half')
  assert.deepEqual(all(byData(dash(view), 'stats'), n => /^tile-(bots|skills|plugins)$/.test(n.props['data-hh'] || '')).map(n => n.props['data-hh']), ['tile-bots', 'tile-skills', 'tile-plugins'])
  // half: 3 bots; skills: the main bot's 39 plus 3 of each other bot's own
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileNumber(view, k)), ['3', '45', 'none'])
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileSaid(view, k)), ['3 bots', '45 skills', 'Plugins See them in Capabilities'])
  assert.doesNotMatch(text(byData(dash(view), 'tile-plugins')), /\d/)
  assert.deepEqual(all(byData(dash(view), 'stats'), n => n.type === 'sdk:Codicon').map(n => [n.props.name, n.props.size]), [['hubot', 20], ['zap', 20], ['extensions', 20]])
  assert.doesNotMatch(text(dash(view)), /30 days|chats in|streak|days with a chat/i)
  // no plugins read at all (hhtech-loom-n1 1: no read gives the number Hermes's Plugins screen shows)
  assert.equal(log.filter(e => e.method === 'plugins.manage').length, 0)
})

test('loom2: one plain line under each tile says what the thing is (his Loom, 0:20 "why is it just saying Plugins, Skills, Bots?"); the plugins tile keeps "See them in Capabilities"', async () => {
  for (const who of ['just_installed', 'all']) {
    const { view } = await open(who)
    const line = k => said(byData(byData(dash(view), `tile-${k}`), 'tile-line'))
    assert.deepEqual(['bots', 'skills', 'plugins'].map(line), ['Each bot is a separate Hermes.', 'Each skill teaches Hermes one task.', 'Each plugin is an add-on for Hermes.'])
    assert.ok(all(byData(dash(view), 'stats'), n => n.props && n.props['data-hh'] === 'tile-line').every(n => n.props.className === D.tileLine))
    assert.match(text(byData(dash(view), 'tile-plugins')), /See them in Capabilities/)
  }
  // while a number is still read, the line is there already
  useHost('half')
  globalThis.__hhHost.skills = () => new Promise(() => {})
  const reg = await registerPlugin(fakeStorage(), fakeTimers())
  const view = mount(reg.Page)
  assert.equal(said(byData(byData(dash(view), 'tile-skills'), 'tile-line')), 'Each skill teaches Hermes one task.')
})

test('the skills and plugins tiles are buttons to Hermes\'s own screens (Capabilities, Skills / Plugins); the bots tile stays plain; keyboard and screen reader as a route button', async () => {
  const { view } = await open('half')
  const tile = k => byData(dash(view), `tile-${k}`)
  assert.equal(tile('bots').type, 'div')
  assert.equal(tile('bots').props.onClick, undefined)
  for (const [k, to] of [['skills', '/capabilities?tab=skills'], ['plugins', '/capabilities?tab=plugins']]) {
    const t = tile(k)
    assert.equal(t.type, 'button', k)
    assert.equal(t.props.type, 'button')
    assert.ok(t.props.className.split(' ').includes(D.tileBtn))
    t.props.onClick()
    assert.equal(globalThis.__hhHost.navigated.at(-1), to)
    // a screen reader hears where it goes (the plugins tile says it on screen)
    assert.match(text(t), /See them in Capabilities/)
  }
  // a Hermes whose door throws: nothing happens, nothing breaks
  globalThis.__hhHost.navigateThrows = true
  tile('skills').props.onClick()
})

test('a tile\'s word follows its number: "1 bot", "1 skill" for a newcomer', async () => {
  const { view } = await open('just_installed')
  assert.deepEqual(['bots', 'skills'].map(k => tileSaid(view, k)), ['1 bot', '39 skills'])
  // one skill: the singular too (a made-up Hermes whose only bot has one skill)
  useHost('just_installed')
  globalThis.__hhHost.skills = () => [{ name: 'only-one' }]
  const reg = await registerPlugin(fakeStorage(), fakeTimers())
  const one = mount(reg.Page)
  await settle(12)
  assert.equal(tileSaid(one, 'skills'), '1 skill')
})

test('a screen reader hears "Counting" while a number is still being read, and that it could not be read when its read failed; neither is drawn for the eye', async () => {
  useHost('half', { failing: ['skills.list'] })
  const reg = await registerPlugin(fakeStorage(), fakeTimers())
  const view = mount(reg.Page)
  const heard = key => all(byData(dash(view), `tile-${key}`), n => n.props.className === K.srOnly).map(n => text(n).trim())
  assert.deepEqual(['bots', 'skills'].map(heard), [[W.stats.waiting], [W.stats.waiting, '. See them in Capabilities']])
  await settle(12)
  assert.deepEqual(['bots', 'skills'].map(heard), [[], [W.stats.not_known, '. See them in Capabilities']])
  assert.equal(W.stats.not_known, 'Helper could not read this number just now.')
  assert.equal(tileSaid(view, 'skills'), 'skills', 'for the eye: the word, no number')
})

test('each number has its own waiting block until its read is back; a failed read shows no number at all', async () => {
  useHost('half')
  const host = globalThis.__hhHost
  let releaseSkills
  const slow = new Promise(r => (releaseSkills = r))
  const plain = host.skills
  host.skills = name => slow.then(() => plain(name))
  const reg = await registerPlugin(fakeStorage(), fakeTimers())
  const view = mount(reg.Page)
  // before anything is back: two waiting blocks, no numbers; the plugins tile has none to wait for
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileNumber(view, k)), ['waiting', 'waiting', 'none'])
  assert.equal(all(byData(dash(view), 'stats'), n => n.props['data-hh'] === 'wait').every(n => n.props.className === D.wait && n.props['aria-hidden'] === true), true)
  await settle(12)
  // the slow one fills in last
  assert.deepEqual(['bots', 'skills'].map(k => tileNumber(view, k)), ['3', 'waiting'])
  releaseSkills()
  await settle(6)
  assert.equal(tileNumber(view, 'skills'), '45')
  // failed reads
  const failed = await open('half', { failing: ['skills.list'] })
  assert.deepEqual(['bots', 'skills'].map(k => tileNumber(failed.view, k)), ['3', 'none'])
  const noBots = await open('half', { failing: ['profiles.list'] })
  assert.equal(tileNumber(noBots.view, 'bots'), 'none')
})

test('hhcontent\'s corrected steps are what an opened stop shows: Its personality as hhtech clicked it, with the way back; the model stop is "A model"', async () => {
  const { view } = await open('just_installed')
  click(stop(view, 'personality'))
  const box = byData(dash(view), 'steps')
  assert.equal(box.props['aria-label'], 'Its personality')
  assert.equal(said(byData(stop(view, 'personality'), 'card-name')), 'Its personality')
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
  assert.equal(said(byData(stop(view, 'model'), 'card-name')), 'A model')
  assert.equal(said(byData(stop(view, 'model'), 'card-why')), 'The AI that does the thinking. Your app may already have a free one.')
  assert.doesNotMatch(text(dash(view)), /Pick a model/)
  // the team's marks on a step (seen / not seen) are for the team: never on the page, never in the built data
  assert.doesNotMatch(text(model), /not seen|docs words/i)
  assert.equal(JSON.stringify(DASH_DATA).includes('not_seen'), false)
  assert.equal(JSON.stringify(DASH_DATA).includes('docs words'), false)
})

test('a card that was open is still open when the person comes back: after a route button took them to Hermes\'s own screen; a closed one stays closed; nothing is stored for it', async () => {
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
  // closed by the person: closed when they come back
  click(byData(dash(back), 'close'))
  back.unmount()
  const third = mount(Page)
  await settle(12)
  assert.equal(byData(dash(third), 'steps'), null)
  assert.equal(stop(third, 'model').props['aria-expanded'], false)
  // kept for the visit only, in the page's own memory: nothing written (loom2: no tab either)
  assert.deepEqual([...storage.data.keys()], [])
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

test('route buttons open only the places hhtech ran: Model settings, a new chat, Messaging (loom2: Scheduled jobs is no card); elsewhere words only', async () => {
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
    ['model', ['Open Model settings']], ['first_chat', ['New session']], ['chat_apps', ['Open Messaging']]
  ])
  assert.deepEqual(globalThis.__hhHost.navigated, ['/settings?tab=config:model', '/messaging'])
  assert.deepEqual(globalThis.__hhHost.newChats, [null])
})

test('no AI call anywhere on the page, and nothing about the person\'s bots is stored: opening it, every card, every route', async () => {
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
  // (loom-fixes: what a screen reader hears on a tile that opens Hermes's screen: the plugins tile's own line)
  words.add('. ' + W.stats.plugins_line)
  // look: the banner's words that Lead's job gives (not in the team's data): "Helper", "<count> set up", "Open <card>"
  words.add('Helper')
  words.add('set up')
  for (const it of DASH_DATA.items) words.add(`Open ${it.name}`)
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
      assert.ok(filled === '' || words.has(s), `${who}: "${s}" is not from the data`)
    }
  }
})

test('leaving the page drops what was read; coming back reads everything again from the start (loom2: no tabs)', async () => {
  const first = await open('half')
  assert.equal(log.filter(e => e === 'profiles.list').length, 1)
  first.view.unmount()
  const view = mount(first.Page)
  // at once: waiting blocks, not the old numbers
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileNumber(view, k)), ['waiting', 'waiting', 'none'])
  await settle(12)
  assert.equal(log.filter(e => e === 'profiles.list').length, 2, 'read again')
  assert.deepEqual(['bots', 'skills', 'plugins'].map(k => tileNumber(view, k)), ['3', '45', 'none'])
})

/* ---------- loom2 point 6: a place for one video at the top of each opened card ---------- */
test('an empty address gives a quiet 16:9 box with the card\'s name and "Video coming soon" (no play button); an address gives the browser\'s own player that loads nothing before Play', async () => {
  const { view } = await open('half')
  click(stop(view, 'model'))
  const box = byData(dash(view), 'steps')
  const first = box.props.children.filter(Boolean)[1]
  assert.equal(first.props['data-hh'], 'video-soon', 'at the top of the opened card')
  assert.equal(first.props.className, D.videoSoon)
  assert.equal(said(first), 'A model Video coming soon')
  assert.equal(all(first, n => n.type === 'video' || n.type === 'sdk:Button' || n.type === 'button').length, 0)
  assert.equal(byData(box, 'video'), null)
  // the same build with an address for A model (as content/videos.json would give it)
  useHost('half')
  const VIDEO = { url: 'https://example.com/model.mp4', poster: 'https://example.com/model.jpg', captions: 'https://example.com/model.vtt' }
  const reg = await registerPlugin(fakeStorage(), fakeTimers(), {}, src => {
    const at = src.indexOf('"video": null')
    assert.ok(at > 0 && src.indexOf('"id": "model"') < at && at < src.indexOf('"id": "first_chat"'))
    return src.slice(0, at) + `"video": ${JSON.stringify(VIDEO)}` + src.slice(at + '"video": null'.length)
  })
  const v2 = mount(reg.Page)
  await settle(12)
  click(stop(v2, 'model'))
  const player = byData(byData(dash(v2), 'steps'), 'video')
  assert.equal(player.type, 'video')
  assert.equal(player.props.className, D.video)
  assert.deepEqual([player.props.src, player.props.poster, player.props.controls, player.props.preload, player.props.controlsList, player.props.disablePictureInPicture], [VIDEO.url, VIDEO.poster, true, 'none', 'nodownload', true])
  assert.equal(player.props.autoPlay, undefined)
  const track = player.props.children
  assert.deepEqual([track.type, track.props.kind, track.props.src, track.props.default], ['track', 'captions', VIDEO.captions, true])
  assert.equal(byData(byData(dash(v2), 'steps'), 'video-soon'), null)
  // another card in that build still has its quiet box
  click(stop(v2, 'memory'))
  assert.ok(byData(byData(dash(v2), 'steps'), 'video-soon'))
})

test('a video address that is not https:// is never handed to the player, also if it reached the built file', async () => {
  for (const bad of ['http://example.com/a.mp4', 'javascript:alert(1)', 'https://example.com/a b.mp4']) {
    useHost('half')
    const reg = await registerPlugin(fakeStorage(), fakeTimers(), {}, src => src.replace('"video": null', `"video": ${JSON.stringify({ url: bad, poster: '', captions: '' })}`))
    const v = mount(reg.Page)
    await settle(12)
    click(stop(v, 'model'))
    assert.equal(byData(byData(dash(v), 'steps'), 'video'), null, bad)
    assert.ok(byData(byData(dash(v), 'steps'), 'video-soon'), bad)
  }
})

/* ---------- loom2: the set-up as cards ---------- */
// His Loom of 11 Nov (1:56, "these kind of cards"; 2:13 "scheduled jobs are not part of the setup") and his words at
// 17:10 UTC: "By default no card should be shown as done, only if the person clicks Done. Otherwise it doesn't show."

const cardIds = view => stops(view).map(c => c.props['data-card'])
const NINE = ['model', 'first_chat', 'personality', 'chat_apps', 'tools_apps', 'skills', 'memory', 'second_bot', 'safety']
const stateLine = (view, id) => {
  const c = stop(view, id)
  const d = byData(c, 'card-done')
  const st = byData(c, 'start-here')
  return d ? said(d) : st ? said(st) : null
}

test('the set-up is 9 cards in the data\'s order (Install and Scheduled jobs out), right under the three tiles; no path, no line, no Next row', async () => {
  const { view } = await open('half')
  assert.deepEqual(cardIds(view), NINE)
  assert.deepEqual(DASH_DATA.items.map(i => i.id), NINE)
  // the page: the banner (look), the tiles, then Set up; nothing between (no Activity)
  const parts = dash(view).props.children.filter(Boolean).map(n => n.props['data-hh'])
  assert.deepEqual(parts, ['dash-css', 'banner', 'stats', 'setup'])
  for (const gone of ['road', 'line', 'stop', 'next', 'all-done', 'you-are-here', 'activity', 'person-note']) assert.equal(byData(dash(view), gone), null, gone)
  assert.doesNotMatch(text(dash(view)), /You are here|Next|Scheduled jobs|Helper can't see this one/)
  // each card: Hermes's icon at the tiles' 20 px, on the tiles' icon square; the name; the why sentence from the data
  for (const it of DASH_DATA.items) {
    const c = stop(view, it.id)
    assert.equal(c.type, 'button')
    assert.equal(c.props.type, 'button')
    assert.ok(c.props.className.split(' ').includes(D.scard))
    assert.equal(said(byData(c, 'card-name')), it.name)
    assert.equal(said(byData(c, 'card-why')), it.why)
    const sq = all(c, n => n.props && n.props.className === D.tileIcon)
    assert.equal(sq.length, 1, it.id)
  }
  assert.equal(said(byData(stop(view, 'first_chat'), 'card-why')), 'Ask Hermes one small thing, to see that it works.')
  assert.equal(said(byData(stop(view, 'tools_apps'), 'card-why')), 'Actions Hermes can take, and outside apps like Gmail it can use.')
})

test('no card is ever done by a read: a fresh home and a fully set-up home both say 0 of 9, "Start here" on A model, no state line on any other card', async () => {
  for (const who of ['just_installed', 'half', 'all']) {
    const { view } = await open(who)
    assert.equal(said(byData(dash(view), 'count')), '0 of 9', who)
    assert.deepEqual(stops(view).map(c => c.props['data-state']), NINE.map(() => 'todo'), who)
    assert.equal(stateLine(view, 'model'), 'Start here', who)
    for (const id of NINE.slice(1)) assert.equal(stateLine(view, id), null, `${who} ${id}`)
  }
})

test('nothing is read to decide what is done: only the bots and each bot\'s skills (the tiles\' numbers); no model, personality, jobs, chat apps or chats read', async () => {
  await open('all', { openBot: 'default' })
  // (setup.runtime_check once, with no bot named: Helper's own check whether a model answers, src/model-status.js, for
  // Helper's conversation; it is not the Dashboard's and marks nothing: the source check below)
  const methods = log.map(e => (typeof e === 'string' ? e : e.method)).filter((m, i) => !(m === 'setup.runtime_check' && !(log[i].params && log[i].params.profile)))
  assert.deepEqual([...new Set(methods)].sort(), ['profiles.list', 'skills.list'])
  assert.equal(methods.filter(m => m === 'skills.list').length, 30, 'one per bot')
  assert.equal(globalThis.__hhHost.sdkCalls.filter(c => c.name === 'listPersisted').length, 0)
  assert.equal(log.filter(e => e === 'status').length, 0)
  // and the code has none of those reads any more
  const src = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'dash.js'), 'utf8')
  assert.doesNotMatch(src, /runtime_check|profiles\.describe|cron\.manage|listPersistedSessions|host\.status|doneFlags/)
})

test('Done is the person\'s: every card has a Done button; pressed, the card says Done, the count goes up, "Start here" moves on, the button reads Not done yet; kept with Helper\'s marks', async () => {
  const { view, storage } = await open('just_installed')
  for (const id of NINE) {
    click(stop(view, id))
    const mark = byData(byData(dash(view), 'steps'), 'mark')
    assert.equal(mark.type, 'sdk:Button', id)
    assert.equal(mark.props.variant, 'secondary')
    assert.equal(said(mark), 'Done', id)
    assert.equal(mark.props['data-marked'], false)
    click(stop(view, id))
  }
  // mark A model and Its personality
  for (const id of ['model', 'personality']) {
    click(stop(view, id))
    click(byData(byData(dash(view), 'steps'), 'mark'))
    assert.equal(said(byData(byData(dash(view), 'steps'), 'mark')), 'Not done yet')
    click(stop(view, id))
  }
  assert.equal(said(byData(dash(view), 'count')), '2 of 9')
  assert.equal(stop(view, 'model').props['data-state'], 'done')
  assert.ok(stop(view, 'model').props.className.split(' ').includes(D.done))
  assert.equal(stateLine(view, 'model'), 'Done')
  assert.equal(stateLine(view, 'personality'), 'Done')
  assert.equal(stateLine(view, 'first_chat'), 'Start here')
  assert.equal(all(dash(view), n => n.props && n.props['data-hh'] === 'start-here').length, 1, 'one Start here')
  // kept as Helper keeps the person's marks (the record 'kept', setup_done_said)
  assert.deepEqual(storage.data.get('kept').setup_done_said, ['model', 'personality'])
  // taken back
  click(stop(view, 'model'))
  click(byData(byData(dash(view), 'steps'), 'mark'))
  assert.equal(said(byData(dash(view), 'count')), '1 of 9')
  assert.equal(stateLine(view, 'model'), 'Start here')
  assert.deepEqual(storage.data.get('kept').setup_done_said, ['personality'])
})

test('all 9 marked: 9 of 9, every card says Done, no "Start here"; a mark comes back after a restart (A model\'s too)', async () => {
  const all9 = fakeStorage({ kept: { setup_done_said: [...NINE] } })
  const { view } = await open('half', {}, all9)
  assert.equal(said(byData(dash(view), 'count')), '9 of 9')
  for (const id of NINE) assert.equal(stateLine(view, id), 'Done', id)
  assert.equal(byData(dash(view), 'start-here'), null)
  // a stored mark the page does not know (Scheduled jobs, from Helper's older set-up talk) counts for nothing here
  const old = fakeStorage({ kept: { setup_done_said: ['scheduled_job', 'model'] } })
  const back = await open('half', {}, old)
  assert.equal(said(byData(dash(back.view), 'count')), '1 of 9')
  assert.equal(stateLine(back.view, 'model'), 'Done')
  assert.equal(stateLine(back.view, 'first_chat'), 'Start here')
})

test('a click on a card opens it full width under its row (one open at a time); a second click or the close button closes it', async () => {
  const { view } = await open('half')
  // not measured: 2 columns
  assert.equal(byData(dash(view), 'cards').props['data-columns'], 2)
  assert.deepEqual(byData(dash(view), 'cards').props.style, { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px' })
  const order = () => byData(dash(view), 'cards').props.children.filter(Boolean).map(n => n.props['data-card'] || n.props['data-hh'])
  click(stop(view, 'personality'))
  // personality is card 3: row 2 is personality and chat_apps; the panel goes after chat_apps
  assert.deepEqual(order(), ['model', 'first_chat', 'personality', 'chat_apps', 'steps', 'tools_apps', 'skills', 'memory', 'second_bot', 'safety'])
  const box = byData(dash(view), 'steps')
  assert.deepEqual(box.props.style, { gridColumn: '1 / -1' })
  assert.equal(stop(view, 'personality').props['aria-expanded'], true)
  assert.equal(stop(view, 'personality').props['aria-controls'], box.props.id)
  assert.ok(stop(view, 'personality').props.className.split(' ').includes(D.sel))
  // the pointer: over the middle of the first column
  assert.equal(all(box, n => n.props && n.props.className === D.caret)[0].props.style.left, 'calc(25% - 7px)')
  // another card: one open at a time
  click(stop(view, 'safety'))
  assert.deepEqual(order(), ['model', 'first_chat', 'personality', 'chat_apps', 'tools_apps', 'skills', 'memory', 'second_bot', 'safety', 'steps'])
  assert.equal(all(dash(view), n => n.props && n.props['data-hh'] === 'steps').length, 1)
  // a second click closes it
  click(stop(view, 'safety'))
  assert.equal(byData(dash(view), 'steps'), null)
  click(stop(view, 'chat_apps'))
  click(byData(dash(view), 'close'))
  assert.equal(byData(dash(view), 'steps'), null)
  // what an opened card holds: the steps, the text to paste with Copy, Done, the sources
  click(stop(view, 'chat_apps'))
  const open2 = byData(dash(view), 'steps')
  assert.ok(all(open2, n => n.type === 'ol')[0].props.children.length >= 2)
  assert.ok(byData(open2, 'terminal'))
  assert.ok(all(open2, n => n.type === 'sdk:CopyButton').length >= 1)
  assert.ok(byData(open2, 'mark'))
  assert.ok(all(open2, n => n.props && n.props['data-hh'] === 'source').length >= 1)
})

test('as many columns as fit with each card at least 260 px wide: 1 at 400 px, 2 at about 600, 3 at 820 and more; the panel follows the row', async () => {
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
  byData(dash(view), 'cards').props.ref({ id: 'cards' })
  const fire = width => observers.filter(o => o.watching && o.watching.id === 'cards').forEach(o => o.cb([{ contentRect: { width, height: 500 } }]))
  for (const [width, cols] of [[336, 1], [529, 1], [530, 2], [656, 2], [799, 2], [800, 3], [1116, 4]]) {
    fire(width)
    await settle(2)
    assert.equal(byData(dash(view), 'cards').props['data-columns'], cols, `${width} px`)
  }
  fire(800)
  await settle(2)
  click(stop(view, 'first_chat'))
  const order = byData(dash(view), 'cards').props.children.filter(Boolean).map(n => n.props['data-card'] || n.props['data-hh'])
  assert.deepEqual(order.slice(0, 4), ['model', 'first_chat', 'personality', 'steps'])
  assert.equal(all(byData(dash(view), 'steps'), n => n.props && n.props.className === D.caret)[0].props.style.left, `calc(${(1.5 * 100) / 3}% - 7px)`)
})

test('the open bot changes while the page is on screen: the numbers are read again; the marks and the open card stay', async () => {
  const storage = fakeStorage({ kept: { setup_done_said: ['memory'] } })
  const { view } = await open('half', { openBot: 'default' }, storage)
  click(stop(view, 'memory'))
  const before = log.length
  globalThis.__hhHost.profile = 'bot1'
  click(stop(view, 'memory'))
  click(stop(view, 'memory'))
  assert.deepEqual(['bots', 'skills'].map(k => tileNumber(view, k)), ['waiting', 'waiting'])
  await settle(12)
  assert.equal(log.slice(before).filter(e => e === 'profiles.list').length, 1, 'the bots are read again')
  assert.deepEqual(['bots', 'skills'].map(k => tileNumber(view, k)), ['3', '45'])
  assert.equal(said(byData(dash(view), 'count')), '1 of 9')
  assert.equal(byData(dash(view), 'steps').props['data-stop'], 'memory')
})

test('a read that comes back late, after the page was left, is dropped: the page opens waiting again', async () => {
  useHost('half')
  const host = globalThis.__hhHost
  const plain = host.skills
  const held = []
  host.skills = name => new Promise(r => held.push(() => r(plain(name))))
  const reg = await registerPlugin(fakeStorage(), fakeTimers())
  const view = mount(reg.Page)
  await settle(12)
  assert.equal(tileNumber(view, 'skills'), 'waiting')
  view.unmount()
  held.forEach(f => f())
  await settle(6)
  const again = mount(reg.Page)
  assert.equal(tileNumber(again, 'skills'), 'waiting')
})

/* ---------- look (his words of 11 Nov, 18:20 UTC): the Dashboard as Hermes's own Capabilities page ---------- */
const banner = view => byData(dash(view), 'banner')
const classesOf = n => String(n.props.className || '').split(' ')
// Hermes's order (catalog-card.tsx CARD_ACCENTS): blue, orange, purple, green, red, cyan, yellow
const ACCENTS = [D.acc0, D.acc1, D.acc2, D.acc3, D.acc4, D.acc5, D.acc6]
const accentsOf = n => classesOf(n).filter(c => ACCENTS.includes(c))

test('look: a banner on top of the Dashboard, above the three tiles: "Helper", the count as a sentence, the first card not marked (its name and its why-line), and one main button that opens it', async () => {
  const { view } = await open('half')
  const parts = dash(view).props.children.filter(Boolean).map(n => n.props['data-hh'])
  assert.deepEqual(parts.slice(0, 3), ['dash-css', 'banner', 'stats'])
  const b = banner(view)
  assert.ok(classesOf(b).includes(D.banner))
  for (const part of ['banner-eyebrow', 'banner-title', 'banner-line', 'banner-open', 'banner-art', 'banner-character']) assert.ok(byData(b, part), part)
  assert.equal(said(byData(b, 'banner-eyebrow')), 'Helper')
  assert.equal(said(byData(b, 'banner-title')), '0 of 9 set up')
  assert.equal(byData(b, 'banner-title').type, 'h2')
  const first = DASH_DATA.items[0]
  assert.equal(said(byData(b, 'banner-line')), `${first.name} ${first.why}`)
  assert.equal(byData(b, 'banner-line').props['data-card'], 'model')
  const go = byData(b, 'banner-open')
  assert.equal(go.type, 'sdk:Button')
  assert.equal(go.props.variant, 'default')
  assert.equal(said(go), `Open ${first.name}`)
  assert.equal(all(b, n => n.type === 'sdk:Button').length, 1, 'one button in the banner')
  // the picture is for the eye only: two fields of dots, no image, and Helper's character in front, 224 px wide
  const art = byData(b, 'banner-art')
  assert.equal(art.props['aria-hidden'], true)
  assert.deepEqual(art.props.children.map(n => n.props.className), [D.bannerDots, D.bannerDots2])
  const figure = byData(b, 'banner-character')
  assert.equal(figure.props['aria-hidden'], true)
  const drawn = all(figure, n => n.props && n.props['data-hh-character'])
  assert.equal(drawn.length, 1)
  assert.equal(drawn[0].props.width, 224)
  assert.equal(drawn[0].props['data-expression'], 'resting')
  assert.equal(drawn[0].props['aria-hidden'], true)
  assert.equal(drawn[0].props['data-rising'], undefined)
  // its eyes hear the pointer from the Dashboard's own box
  assert.equal(typeof dash(view).props.onPointerMove, 'function')
  assert.equal(typeof dash(view).props.onPointerLeave, 'function')
  dash(view).props.onPointerMove({ clientX: 10, clientY: 10 })
  dash(view).props.onPointerLeave()
})

test('look: the banner\'s title is the count for no marks, some and all; its line and button name the first card not marked, and are gone when all are marked', async () => {
  const some = await open('half', {}, fakeStorage({ kept: { setup_done_said: ['model', 'first_chat', 'chat_apps', 'memory'] } }))
  assert.equal(said(byData(banner(some.view), 'banner-title')), '4 of 9 set up')
  const next = DASH_DATA.items.find(it => it.id === 'personality')
  assert.equal(said(byData(banner(some.view), 'banner-line')), `${next.name} ${next.why}`)
  assert.equal(said(byData(banner(some.view), 'banner-open')), `Open ${next.name}`)
  assert.equal(byData(banner(some.view), 'banner-open').props['data-card'], 'personality')
  // all marked: the count sentence (the data has no all-done sentence for 9 cards), no line, no button
  const done = await open('half', {}, fakeStorage({ kept: { setup_done_said: [...NINE] } }))
  assert.equal(said(byData(banner(done.view), 'banner-title')), '9 of 9 set up')
  assert.equal(byData(banner(done.view), 'banner-line'), null)
  assert.equal(byData(banner(done.view), 'banner-open'), null)
  assert.equal(all(banner(done.view), n => n.type === 'sdk:Button').length, 0)
  // a mark moves the banner on
  const { view } = await open('just_installed')
  click(stop(view, 'model'))
  click(byData(byData(dash(view), 'steps'), 'mark'))
  assert.equal(said(byData(banner(view), 'banner-title')), '1 of 9 set up')
  assert.equal(byData(banner(view), 'banner-open').props['data-card'], 'first_chat')
})

test('look: the banner\'s button opens its card as a click on the card does (the same panel under its row); a second press leaves it open', async () => {
  const { view } = await open('half', {}, fakeStorage({ kept: { setup_done_said: ['model'] } }))
  assert.equal(byData(dash(view), 'steps'), null)
  click(byData(banner(view), 'banner-open'))
  await settle(2)
  assert.equal(stop(view, 'first_chat').props['aria-expanded'], true)
  assert.ok(classesOf(stop(view, 'first_chat')).includes(D.sel))
  assert.equal(byData(dash(view), 'steps').props['data-stop'], 'first_chat')
  assert.equal(all(dash(view), n => n.props && n.props['data-hh'] === 'steps').length, 1)
  click(byData(banner(view), 'banner-open'))
  await settle(2)
  assert.equal(byData(dash(view), 'steps').props['data-stop'], 'first_chat', 'still open')
  // the card itself still closes it
  click(stop(view, 'first_chat'))
  assert.equal(byData(dash(view), 'steps'), null)
})

test('look: each of the 12 boxes carries its own accent class in Hermes\'s order (tile 1 to 3, then card 1 to 9 carrying on the count); the opened panel carries its card\'s accent', async () => {
  const { view } = await open('half')
  const tiles = ['bots', 'skills', 'plugins'].map(k => byData(dash(view), `tile-${k}`))
  const boxes = [...tiles, ...stops(view)]
  assert.equal(boxes.length, 12)
  boxes.forEach((box, i) => assert.deepEqual(accentsOf(box), [ACCENTS[i % 7]], `box ${i + 1}`))
  assert.deepEqual(boxes.map(b => ACCENTS.indexOf(accentsOf(b)[0])), [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4])
  // marking or opening a card does not change its accent
  for (const [i, id] of NINE.entries()) {
    click(stop(view, id))
    const panel = byData(dash(view), 'steps')
    assert.ok(classesOf(panel).includes(D.steps), id)
    assert.deepEqual(accentsOf(panel), [ACCENTS[(3 + i) % 7]], id)
    assert.deepEqual(accentsOf(stop(view, id)), accentsOf(panel), id)
    click(stop(view, id))
  }
  // nothing else on the Dashboard wears an accent class
  assert.equal(all(dash(view), n => n.props && accentsOf(n).length > 0).length, 12)
})

test('look: the head under the tiles is a section heading "Set up" and no longer repeats the count (the count is the banner\'s title)', async () => {
  const { view } = await open('half', {}, fakeStorage({ kept: { setup_done_said: ['model', 'memory'] } }))
  const setup = byData(dash(view), 'setup')
  const head = setup.props.children.filter(Boolean)[0]
  assert.equal(head.props.className, D.head)
  const kids = [].concat(head.props.children).filter(Boolean)
  assert.equal(kids.length, 1)
  assert.equal(kids[0].type, 'h2')
  assert.equal(kids[0].props.className, D.title)
  assert.equal(said(kids[0]), 'Set up')
  assert.equal(said(head), 'Set up')
  assert.doesNotMatch(said(head), /\d/)
  // the one count on the Dashboard sits in the banner's title
  const counts = all(dash(view), n => n.props && n.props['data-hh'] === 'count')
  assert.equal(counts.length, 1)
  assert.equal(said(counts[0]), '2 of 9')
  assert.equal(all(byData(banner(view), 'banner-title'), n => n.props && n.props['data-hh'] === 'count').length, 1)
  assert.equal(byData(setup, 'count'), null)
})
