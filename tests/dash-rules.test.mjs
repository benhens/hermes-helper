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
import { cardStates, cardColumns, panelAfter, CARD_MIN_PX, CARD_GAP_PX, distinctSkills, tileWord } from '../src/dash-rules.js'
import { STARTER_SOULS, isStarterSoul, soulNormal, botRows, mainBotName, openBotName, doneFlags, hereStop, firstChatSeen, NOT_A_CHAT } from '../src/setup-reads.js'
import { DASH_DATA } from '../src/dash-data.js'
import { PEOPLE } from './lib/dash-people.mjs'

const ok = value => ({ ok: true, value })
const FAIL = { ok: false }
const souls = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures', 'hermes-default-souls.json'), 'utf8'))

const ids = DASH_DATA.items.map(i => i.id)

/* ---------- loom2: the set-up cards ---------- */
test('the data: 9 cards in hhcontent\'s order (Install and Scheduled jobs out: his Loom, 2:13)', () => {
  assert.deepEqual(ids, ['model', 'first_chat', 'personality', 'chat_apps', 'tools_apps', 'skills', 'memory', 'second_bot', 'safety'])
  assert.equal(DASH_DATA.total, 9)
  // no seen marks in the built data: nothing is read to decide done
  assert.ok(DASH_DATA.items.every(it => !('seen' in it) && !('mark' in it)))
})

test('a card is done only by the person\'s mark: nothing marked is 0 of 9, Start here on the first; marks count; all marked: no Start here', () => {
  const none = cardStates([])
  assert.deepEqual([none.done, none.total, none.start], [0, 9, 0])
  assert.ok(none.states.every(x => x === 'todo'))
  assert.deepEqual(cardStates(undefined).states, none.states)
  const some = cardStates(['model', 'first_chat', 'memory'])
  assert.deepEqual([some.done, some.start], [3, ids.indexOf('personality')])
  assert.equal(some.states[ids.indexOf('memory')], 'done')
  // a stored mark for something that is no card (Scheduled jobs) counts for nothing
  assert.equal(cardStates(['scheduled_job']).done, 0)
  const all = cardStates(ids)
  assert.deepEqual([all.done, all.start], [9, -1])
})

test('columns: as many as fit with each card at least 260 px wide, 10 px apart, at least one; the panel goes after the last card of the row', () => {
  assert.deepEqual([CARD_MIN_PX, CARD_GAP_PX], [260, 10])
  assert.deepEqual([0, 260, 529, 530, 799, 800, 1069, 1070].map(w => cardColumns(w)), [1, 1, 1, 2, 2, 3, 3, 4])
  // 9 cards in 2 columns: card 3 (index 2) is in row 2, which ends at index 3; the last row (index 8) ends at 8
  assert.deepEqual([panelAfter(2, 2, 9), panelAfter(3, 2, 9), panelAfter(8, 2, 9), panelAfter(0, 1, 9), panelAfter(7, 3, 9)], [3, 3, 8, 0, 8])
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

test('"You are here" is one rule (here_rule): the stop Helper recommended last if it is not done, else the first stop not done', () => {
  // (loom2: the Dashboard no longer uses it; Helper's set-up conversation, not run in this build, still does)
  assert.equal(hereStop(ids, id => (id === 'model' ? true : false), 'memory'), 'memory')
  assert.equal(hereStop(ids, id => (id === 'model' ? true : false), 'model'), 'first_chat')
  assert.equal(hereStop(ids, () => true, 'model'), null)
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
