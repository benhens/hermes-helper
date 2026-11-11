// dash-v1: the Dashboard's fixed rules (src/dash-rules.js) on made-up people. No Hermes, no React.
//   person 1  just installed: Hermes put the main bot on the Nous free plan by itself; starter personality;
//             Hermes's own first-run chat "Getting started" (source local) and nothing else        -> 2 of 6
//   person 2  half: 3 bots, a model, the old starter personality saved with Windows line ends, Telegram switched
//             on without a token, one paused job                                                     -> 4 of 6
//   person 3  all: 30 bots, own personality, Telegram with a token, a job                               -> 6 of 6
// (the reads as hhtech saw them in the app: docs/answers/hhtech-dash-reads2.md, dev/checks/hhtech-dash-reads2/out)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathStates, chatDays, activityGrid, daysSinceUsed, lastUsedLine, dayKey, distinctSkills, pluginCount, tileWord, weeksThatFit, NOT_THE_PERSON, FIRST_RUN_TITLE, FIRST_RUN_MAX_MESSAGES } from '../src/dash-rules.js'
import { STARTER_SOULS, isStarterSoul, soulNormal, botRows, mainBotName, openBotName, doneFlags } from '../src/setup-reads.js'
import { DASH_DATA } from '../src/dash-data.js'
import { PEOPLE } from './lib/dash-people.mjs'

const ok = value => ({ ok: true, value })
const FAIL = { ok: false }
const souls = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures', 'hermes-default-souls.json'), 'utf8'))

const ids = DASH_DATA.items.map(i => i.id)
const QUIET = ['first_chat', 'tools_apps', 'skills', 'memory', 'safety']

test('the data: 11 stops in hhcontent\'s order; six counted (Chat apps counted, Lead\'s ruling), five never', () => {
  assert.deepEqual(ids, ['install', 'model', 'first_chat', 'personality', 'chat_apps', 'tools_apps', 'skills', 'memory', 'scheduled_job', 'second_bot', 'safety'])
  assert.deepEqual(DASH_DATA.items.filter(i => !i.counts).map(i => i.id), QUIET)
  assert.equal(DASH_DATA.total, 6)
})

test('Hermes\'s five starter personality texts, word for word as hermes_cli/default_soul.py (the fixture), and its normalising', () => {
  assert.deepEqual(STARTER_SOULS, souls.texts)
  for (const t of souls.texts) {
    assert.equal(isStarterSoul(t), true)
    assert.equal(isStarterSoul('\ufeff' + t.replace(/\n/g, '\r\n') + '\n\n'), true, 'BOM, Windows line ends, blank lines around')
  }
  assert.equal(isStarterSoul('You are my calm helper.'), false)
  assert.equal(soulNormal('\ufeff a\r\nb \r'), 'a\nb')
})

test('the main bot is the one Hermes marks as default; the open bot is the app\'s (empty = default)', () => {
  assert.equal(mainBotName(botRows({ profiles: [{ name: 'work' }, { name: 'home', is_default: true }] })), 'home')
  assert.equal(mainBotName(botRows({ profiles: [{ name: 'work' }, { name: 'default' }] })), 'default')
  assert.equal(mainBotName(botRows({ profiles: [{ name: 'work' }] })), 'work')
  assert.equal(botRows({ profiles: [] }), null)
  assert.equal(botRows(null), null)
  assert.equal(openBotName(''), 'default')
  assert.equal(openBotName(' work '), 'work')
})

test('person 1, just installed on Hermes\'s own free plan: 2 of 6 (Install, A model); You are here on Its personality', () => {
  const f = doneFlags(PEOPLE.just_installed)
  assert.deepEqual(f, { install: true, model: true, personality: false, chat_apps: false, scheduled_job: false, second_bot: false })
  const p = pathStates(f)
  assert.deepEqual([p.done, p.total, p.allDone], [2, 6, false])
  assert.equal(ids[p.here], 'personality')
  assert.deepEqual(p.states, ['done', 'done', 'quiet', 'here', 'todo', 'quiet', 'quiet', 'quiet', 'todo', 'todo', 'quiet'])
})

test('person 2, half: 4 of 6 (the paused job counts, the Windows-line-end starter text does not, Telegram without a token does not)', () => {
  const f = doneFlags(PEOPLE.half)
  assert.deepEqual(f, { install: true, model: true, personality: false, chat_apps: false, scheduled_job: true, second_bot: true })
  const p = pathStates(f)
  assert.deepEqual([p.done, p.total], [4, 6])
  assert.equal(ids[p.here], 'personality')
  assert.deepEqual(p.states, ['done', 'done', 'quiet', 'here', 'todo', 'quiet', 'quiet', 'quiet', 'done', 'done', 'quiet'])
})

test('person 3, all: 6 of 6 (Telegram with a token counts even while it is down); nobody is "here"', () => {
  const f = doneFlags(PEOPLE.all)
  assert.ok(Object.values(f).every(v => v === true))
  const p = pathStates(f)
  assert.deepEqual([p.done, p.total, p.allDone, p.here], [6, 6, true, -1])
  assert.deepEqual(p.states.map((s, i) => [ids[i], s]).filter(([, s]) => s !== 'done').map(([id]) => id), QUIET)
})

test('done and not done in turn (r5\'s person 2): You are here on the first seen stop not done, past the done ones', () => {
  const f = { install: true, model: true, personality: true, chat_apps: true, scheduled_job: true, second_bot: false }
  const p = pathStates(f)
  assert.equal(ids[p.here], 'second_bot')
  assert.equal(p.done, 5)
})

test('the five Helper cannot see are never done, never "here", never counted: also when every read says yes', () => {
  for (const person of Object.values(PEOPLE)) {
    const p = pathStates(doneFlags(person))
    for (const id of QUIET) assert.equal(p.states[ids.indexOf(id)], 'quiet', id)
    assert.ok(p.here === -1 || !QUIET.includes(ids[p.here]))
  }
})

test('the five stay quiet whatever the flags say: a flag for one of them (no rule gives one) changes nothing', () => {
  const every = Object.fromEntries(ids.map(id => [id, true]))
  const p = pathStates(every)
  for (const id of QUIET) assert.equal(p.states[ids.indexOf(id)], 'quiet', id)
  assert.deepEqual([p.done, p.total], [6, 6])
})

test('"You are here" only where it is known: a stop before it that could not be read places nobody', () => {
  const p = pathStates({ install: true, model: null, personality: false, chat_apps: false, scheduled_job: true, second_bot: false })
  assert.equal(p.here, -1)
  assert.ok(!p.states.includes('here'))
  assert.equal(p.states[ids.indexOf('personality')], 'todo')
  // once that stop is read done, the next one not done is "here"
  const q = pathStates({ install: true, model: true, personality: false, chat_apps: null, scheduled_job: true, second_bot: false })
  assert.equal(q.states[ids.indexOf('personality')], 'here')
})

test('a read that failed is not known: never shown done, never "here", not counted; the rest still read', () => {
  const p0 = { ...PEOPLE.all, model: FAIL, status: FAIL }
  const f = doneFlags(p0)
  assert.equal(f.model, null)
  assert.equal(f.chat_apps, null)
  const p = pathStates(f)
  assert.equal(p.states[ids.indexOf('model')], 'unknown')
  assert.equal(p.here, -1)
  assert.deepEqual([p.done, p.allDone], [4, false])
  // answers of the wrong shape are not known either
  assert.equal(doneFlags({ ...PEOPLE.all, soul: ok({}) }).personality, null)
  assert.equal(doneFlags({ ...PEOPLE.all, cron: ok({}) }).scheduled_job, null)
  assert.equal(doneFlags({ ...PEOPLE.all, bots: ok({ profiles: [] }) }).second_bot, null)
  // an empty SOUL.md is not done
  assert.equal(doneFlags({ ...PEOPLE.all, soul: ok({ soul: '  \n' }) }).personality, false)
  // runtime_check ok false: not done
  assert.equal(doneFlags({ ...PEOPLE.all, model: ok({ ok: false }) }).model, false)
})

/* ---------- Activity ---------- */
const TODAY = new Date(2026, 10, 11, 15, 0) // Wed 11 Nov 2026, 15:00 on the person's clock
const at = (daysAgo, h = 10) => new Date(2026, 10, 11 - daysAgo, h, 0).getTime() / 1000
const row = (source, startedAgo, lastAgo = startedAgo, n = 2) => ({ source, started_at: at(startedAgo), last_active: at(lastAgo, 11), message_count: n })

test('Hermes\'s own first-run chat ("Getting started", source local) is not a day of use: a newcomer has no day and no "Last used"', () => {
  const days = chatDays([{ source: 'local', title: 'Getting started', started_at: at(0), last_active: at(0), message_count: 4 }])
  assert.equal(days.size, 0)
  assert.equal(daysSinceUsed(days, TODAY), null)
  assert.equal(lastUsedLine(daysSinceUsed(days, TODAY)), null)
  const g = activityGrid(days, TODAY, 16)
  assert.ok(g.cells.every(c => c.level === 0))
})

test('the first-run chat while Hermes is still writing it (dash-v2; seen in brand-new homes: source gui, 1 to 3 messages, then local with 4): left out by its title, so a fresh install has no day of use', () => {
  const first = (source, n, title = 'Getting started') => ({ source, title, started_at: at(0), last_active: at(0), message_count: n })
  for (const n of [1, 2, 3, 4]) assert.equal(chatDays([first('gui', n)]).size, 0, `gui, ${n} messages`)
  assert.equal(chatDays([first('desktop', 2)]).size, 0)
  // a later run of the first-run chat is "Getting started #2" (Hermes numbers a repeated title)
  assert.equal(chatDays([first('gui', 3, 'Getting started #2')]).size, 0)
  assert.deepEqual([FIRST_RUN_TITLE.test('Getting started'), FIRST_RUN_TITLE.test('Getting started #12'), FIRST_RUN_TITLE.test('Getting started with Telegram'), FIRST_RUN_TITLE.test('getting started')], [true, true, false, false])
  assert.equal(FIRST_RUN_MAX_MESSAGES, 4)
  // the person went on in that chat (more than Hermes's own four messages), or has a chat of their own: a day of use
  assert.equal(chatDays([first('gui', 5)]).size, 1)
  assert.equal(chatDays([first('gui', 2, 'Getting started with Telegram')]).size, 1)
  assert.equal(chatDays([first('gui', 2, null)]).size, 1)
  assert.equal(lastUsedLine(daysSinceUsed(chatDays([first('gui', 3), first('gui', 2, 'Plan my week')]), TODAY)), 'Last used today')
})

test('Hermes\'s own work is left out (scheduled jobs, the task board, tools, helper agents), and chats with no message', () => {
  assert.deepEqual(NOT_THE_PERSON, ['cron', 'kanban', 'tool', 'subagent', 'local'])
  const days = chatDays([row('cron', 1), row('kanban', 2), row('tool', 3), row('subagent', 4), row('local', 5), row('gui', 6, 6, 0)])
  assert.equal(days.size, 0)
  const mine = chatDays([row('gui', 1), row('desktop', 2), row('telegram', 3), row('cli', 4), row('discord', 5)])
  assert.equal(mine.size, 5)
})

test('a chat marks the day it started and the day it was last used, not the days between; counts per day', () => {
  const days = chatDays([row('gui', 5, 0), row('gui', 0), row('telegram', 0)])
  assert.deepEqual([...days.keys()].sort(), [dayKey(new Date(2026, 10, 6)), dayKey(new Date(2026, 10, 11))])
  assert.equal(days.get(dayKey(new Date(2026, 10, 11))), 3)
  assert.equal(days.get(dayKey(new Date(2026, 10, 6))), 1)
  // a row with no last_active falls back to last_activity_at, then to its start
  const d2 = chatDays([{ source: 'gui', started_at: at(3), last_activity_at: at(1), message_count: 1 }, { source: 'gui', started_at: at(9), message_count: 1 }])
  assert.equal(d2.size, 3)
})

test('"Last used": today, yesterday, or N days ago, by calendar days on the person\'s clock', () => {
  assert.equal(lastUsedLine(daysSinceUsed(chatDays([row('gui', 0)]), TODAY)), 'Last used today')
  assert.equal(lastUsedLine(daysSinceUsed(chatDays([row('gui', 1)]), TODAY)), 'Last used yesterday')
  assert.equal(lastUsedLine(daysSinceUsed(chatDays([row('gui', 12), row('gui', 30)]), TODAY)), 'Last used 12 days ago')
  // a chat at 23:30 yesterday is yesterday, though fewer than 24 hours ago
  const late = [{ source: 'gui', started_at: new Date(2026, 10, 10, 23, 30).getTime() / 1000, message_count: 1 }]
  assert.equal(daysSinceUsed(chatDays(late), TODAY), 1)
})

test('the grid: GitHub\'s, Sunday on top, the last column holds today and nothing after it; a square\'s brightness by chats that day', () => {
  const days = chatDays([row('gui', 0), row('gui', 0), row('gui', 0), row('gui', 1), row('gui', 1), row('gui', 7)])
  const g = activityGrid(days, TODAY, 16)
  const last = g.cells.filter(c => c.week === 15)
  assert.deepEqual(last.map(c => c.day), [0, 1, 2, 3], 'Sun to Wed: today is a Wednesday')
  assert.equal(g.cells.length, 15 * 7 + 4)
  const today = g.cells.find(c => c.today)
  assert.deepEqual([today.week, today.day, today.level], [15, 3, 3])
  assert.equal(g.cells.find(c => c.key === dayKey(new Date(2026, 10, 10))).level, 2)
  assert.equal(g.cells.find(c => c.key === dayKey(new Date(2026, 10, 4))).level, 1)
  assert.equal(g.cells.filter(c => c.today).length, 1)
  // month names over the first column whose Sunday is in that month
  const names = g.months.map(m => [m.week, m.month])
  assert.ok(names.length >= 3)
  for (const [w, m] of names) assert.equal(new Date(2026, 10, 8 - (15 - w) * 7).getMonth(), m)
})

test('as many weeks as fit (hhdesign r6: 40 at 1180 px), at least one, at most a year', () => {
  assert.equal(weeksThatFit(398, 8, 2), 40)
  assert.equal(weeksThatFit(0, 8, 2), 1)
  assert.equal(weeksThatFit(5000, 8, 2), 52)
})

/* ---------- the top box ---------- */
test('skills: the different skill names across all bots; one bot\'s read failed: no number', () => {
  const a = ok([{ name: 'github' }, { name: 'dspy' }])
  const b = ok([{ name: 'github' }, { name: 'maps' }])
  assert.equal(distinctSkills([a, b]), 3)
  assert.equal(distinctSkills([a, ok([])]), 2)
  assert.equal(distinctSkills([a, FAIL]), null)
  assert.equal(distinctSkills([]), null)
})

test('plugins: only the plugins switched on for the open bot, plus 1 for Helper; installed but switched off is not counted; a failed read: no number, never a bare 1', () => {
  const row = (source, status) => ({ name: 'x', source, status })
  // Hermes's own parts (source bundled) are never the person's plugins
  assert.equal(pluginCount(ok({ user_count: 0, bundled_count: 64, plugins: [row('bundled', 'enabled'), row('bundled', 'not enabled')] })), 1)
  // hhtech's home 3: one catalog plugin "installed but not enabled" was counted before; now only Helper
  assert.equal(pluginCount(ok({ user_count: 1, plugins: [row('bundled', 'enabled'), row('user', 'not enabled')] })), 1)
  assert.equal(pluginCount(ok({ user_count: 1, plugins: [row('user', 'disabled')] })), 1)
  assert.equal(pluginCount(ok({ user_count: 1, plugins: [row('user', 'enabled')] })), 2)
  assert.equal(pluginCount(ok({ user_count: 3, plugins: [row('user', 'enabled'), row('git', 'enabled'), row('user', 'not enabled'), row('bundled', 'enabled')] })), 3)
  assert.equal(pluginCount(FAIL), null)
  assert.equal(pluginCount(ok({ user_count: 2 })), null, 'no rows to read the switches from: not shown')
  assert.equal(pluginCount(ok({ plugins: 'x' })), null)
  assert.equal(pluginCount(undefined), null)
})

test('a tile\'s word follows its number: 1 takes the _one word, every other number the plain one (hhcontent\'s rule)', () => {
  const W = DASH_DATA.words.stats
  assert.deepEqual([1, 2, 0, 39].map(n => tileWord('bots', n)), ['bot', 'bots', 'bots', 'bots'])
  assert.deepEqual([1, 39].map(n => tileWord('skills', n)), ['skill', 'skills'])
  assert.deepEqual([1, 2].map(n => tileWord('plugins', n)), [W.plugins_one, W.plugins])
  assert.deepEqual([W.plugins_one, W.plugins], ['plugin on in this bot', 'plugins on in this bot'])
  // while the number is not there (waiting, or its read failed) the plain word stands
  assert.equal(tileWord('bots', undefined), 'bots')
  assert.equal(tileWord('bots', null), 'bots')
})
