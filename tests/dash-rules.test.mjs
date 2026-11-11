// dash-v1: the Dashboard's fixed rules (src/dash-rules.js) on made-up people. No Hermes, no React.
// loom-fixes: the path is 10 stops (Install off it), every one counted ("N of 10"); the numbers in the lines below
// are the first build's 6-stop count, kept as written then.
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
import { pathStates, stopState, chatDays, activityGrid, daysSinceUsed, lastUsedLine, dayKey, distinctSkills, tileWord, weeksThatFit, NOT_THE_PERSON, FIRST_RUN_TITLE, FIRST_RUN_MAX_MESSAGES } from '../src/dash-rules.js'
import { STARTER_SOULS, isStarterSoul, soulNormal, botRows, mainBotName, openBotName, doneFlags, hereStop, firstChatSeen, NOT_A_CHAT } from '../src/setup-reads.js'
import { DASH_DATA } from '../src/dash-data.js'
import { PEOPLE } from './lib/dash-people.mjs'

const ok = value => ({ ok: true, value })
const FAIL = { ok: false }
const souls = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures', 'hermes-default-souls.json'), 'utf8'))

const ids = DASH_DATA.items.map(i => i.id)
// loom-fixes: the stops the person marks (the page cannot see them)
const MARKED = ['tools_apps', 'skills', 'memory', 'safety']
// the state of each stop as the Dashboard works it out (src/dash.js): flags from the reads, said the person's marks
const selfMarked = it => !it.seen
const states = (f, said = [], current = null) => pathStates(id => stopState(DASH_DATA.items.find(it => it.id === id), f, said, selfMarked), DASH_DATA.items, current)

test('the data: 10 stops in hhcontent\'s order (Install off the path), every one counted; four marked by the person', () => {
  assert.deepEqual(ids, ['model', 'first_chat', 'personality', 'chat_apps', 'tools_apps', 'skills', 'memory', 'scheduled_job', 'second_bot', 'safety'])
  assert.deepEqual(DASH_DATA.items.filter(i => !i.seen).map(i => i.id), MARKED)
  assert.equal(DASH_DATA.total, 10)
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

test('person 1, just installed on Hermes\'s own free plan: 1 of 10 (A model); You are here on First chat (only the first-run chat, which has no preview)', () => {
  const f = doneFlags(PEOPLE.just_installed)
  assert.deepEqual(f, { install: true, model: true, personality: false, chat_apps: false, scheduled_job: false, second_bot: false, first_chat: undefined })
  const g = { ...f, first_chat: false }
  const p = states(g)
  assert.deepEqual([p.done, p.total, p.allDone], [1, 10, false])
  assert.equal(ids[p.here], 'first_chat')
  assert.deepEqual(p.states, ['done', 'here', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo'])
})

test('person 2, half: 4 of 10 with First chat seen; You are here on Its personality', () => {
  const f = { ...doneFlags(PEOPLE.half), first_chat: true }
  assert.deepEqual([f.model, f.personality, f.chat_apps, f.scheduled_job, f.second_bot], [true, false, false, true, true])
  const p = states(f)
  assert.deepEqual([p.done, p.total], [4, 10])
  assert.equal(ids[p.here], 'personality')
})

test('person 3, all the page can see: 6 of 10; the four the person marks are not done until marked; then all 10 and nobody is here', () => {
  const f = { ...doneFlags(PEOPLE.all), first_chat: true }
  const p = states(f)
  assert.deepEqual([p.done, p.total, p.allDone], [6, 10, false])
  assert.equal(ids[p.here], 'tools_apps')
  const q = states(f, MARKED)
  assert.deepEqual([q.done, q.total, q.allDone, q.here], [10, 10, true, -1])
})

test('a mark of the person counts like a seen stop (the count goes up by one, the stop fills), and Not done yet takes it back', () => {
  const f = { ...doneFlags(PEOPLE.all), first_chat: true }
  const before = states(f)
  const marked = states(f, ['skills'])
  assert.equal(marked.done, before.done + 1)
  assert.equal(marked.states[ids.indexOf('skills')], 'done')
  assert.deepEqual(states(f, []).states, before.states)
  // a flag for a stop the person marks (no rule gives one) changes nothing: only the mark counts
  const every = Object.fromEntries(ids.map(id => [id, true]))
  assert.equal(states(every).done, 6)
  // a stop the page sees that the person told Helper is done ("Count it as done") is done too
  assert.equal(states({ ...f, second_bot: false }, ['second_bot']).states[ids.indexOf('second_bot')], 'done')
})

test('"You are here" is one rule (here_rule): the stop Helper recommended last if it is not done, else the first stop not done', () => {
  const f = { ...doneFlags(PEOPLE.half), first_chat: true }
  // Helper recommended Scheduled jobs: not done? It is done for this person, so the first not done
  assert.equal(ids[states(f, [], 'scheduled_job').here], 'personality')
  // Helper recommended Memory (not done): that is here, also with earlier stops not done
  assert.equal(ids[states(f, [], 'memory').here], 'memory')
  // the same function Helper's returning line names its stop with
  assert.equal(hereStop(ids, id => (id === 'model' ? true : false), 'memory'), 'memory')
  assert.equal(hereStop(ids, id => (id === 'model' ? true : false), 'model'), 'first_chat')
  assert.equal(hereStop(ids, () => true, 'model'), null)
})

test('done and not done in turn (r5\'s person 2): You are here on the first stop not done, past the done ones', () => {
  const f = { model: true, first_chat: true, personality: true, chat_apps: true, scheduled_job: true, second_bot: false }
  const p = states(f, ['tools_apps', 'skills', 'memory'])
  assert.equal(ids[p.here], 'second_bot')
  assert.equal(p.done, 8)
})

test('"You are here" only where it is known: a stop before it that could not be read places nobody', () => {
  const p = states({ model: null, first_chat: true, personality: false, chat_apps: false, scheduled_job: true, second_bot: false })
  assert.equal(p.here, -1)
  assert.ok(!p.states.includes('here'))
  assert.equal(p.states[ids.indexOf('personality')], 'todo')
  // once that stop is read done, the next one not done is "here"
  const q = states({ model: true, first_chat: true, personality: false, chat_apps: null, scheduled_job: true, second_bot: false })
  assert.equal(q.states[ids.indexOf('personality')], 'here')
})

test('First chat, seen (hhtech-loom-n1 3): a chat with a preview that is not a job\'s; Hermes\'s first-run chat (empty preview) is not; source local counts', () => {
  const s = rows => ({ sessions: rows })
  assert.equal(firstChatSeen(s([{ source: 'local', title: 'Getting started', preview: '', message_count: 4 }])), false)
  assert.equal(firstChatSeen(s([{ source: 'local', preview: 'Hello, this is my first real question', message_count: 2 }])), true)
  assert.equal(firstChatSeen(s([{ source: 'desktop', preview: 'Made-up line 0' }])), true)
  for (const src of ['cron', 'kanban', 'tool']) assert.equal(firstChatSeen(s([{ source: src, preview: 'job output' }])), false, src)
  assert.equal(firstChatSeen(s([{ source: 'gui', preview: '   ' }])), false)
  assert.equal(firstChatSeen({}), null)
  assert.deepEqual(NOT_A_CHAT, ['cron', 'kanban', 'tool'])
  // in the flags: undefined with no sessions read in this Hermes (the person marks it then), null when it failed
  assert.equal(doneFlags({ ...PEOPLE.all }).first_chat, undefined)
  assert.equal(doneFlags({ ...PEOPLE.all, sessions: FAIL }).first_chat, null)
  assert.equal(doneFlags({ ...PEOPLE.all, sessions: ok(s([{ source: 'telegram', preview: 'hi' }])) }).first_chat, true)
})

test('a read that failed is not known: never shown done, never "here"; the rest still read', () => {
  const p0 = { ...PEOPLE.all, model: FAIL, status: FAIL }
  const f = doneFlags(p0)
  assert.equal(f.model, null)
  assert.equal(f.chat_apps, null)
  const p = states({ ...f, first_chat: true })
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
  // loom-fixes (hhtech-loom-n1 3): source local is a chat of the person's (not left out any more)
  assert.deepEqual(NOT_THE_PERSON, ['cron', 'kanban', 'tool', 'subagent'])
  const days = chatDays([row('cron', 1), row('kanban', 2), row('tool', 3), row('subagent', 4), row('gui', 6, 6, 0)])
  assert.equal(days.size, 0)
  assert.equal(chatDays([row('local', 5)]).size, 1)
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

test('a tile\'s word follows its number: 1 takes the _one word, every other number the plain one (hhcontent\'s rule)', () => {
  const W = DASH_DATA.words.stats
  assert.deepEqual([1, 2, 0, 39].map(n => tileWord('bots', n)), ['bot', 'bots', 'bots', 'bots'])
  assert.deepEqual([1, 39].map(n => tileWord('skills', n)), ['skill', 'skills'])
  assert.deepEqual([1, 2].map(n => tileWord('plugins', n)), [W.plugins_one, W.plugins])
  assert.deepEqual([W.plugins_one, W.plugins], ['plugin on in this bot', 'plugins on in this bot'])
  // at the narrow size the plugins tile takes hhcontent's short variant (the long one runs out of its tile there:
  // measured in the app, 120 px of word in 112 px of room); bots and skills have no short word and keep theirs
  assert.deepEqual([1, 2].map(n => tileWord('plugins', n, W, true)), ['plugin, this bot', 'plugins, this bot'])
  assert.deepEqual([1, 2].map(n => tileWord('bots', n, W, true)), ['bot', 'bots'])
  assert.deepEqual([1, 39].map(n => tileWord('skills', n, W, true)), ['skill', 'skills'])
  assert.equal(tileWord('plugins', undefined, W, true), 'plugins, this bot')
  // while the number is not there (waiting, or its read failed) the plain word stands
  assert.equal(tileWord('bots', undefined), 'bots')
  assert.equal(tileWord('bots', null), 'bots')
})
