// The Dashboard tab's fixed rules (dash-v1). Pure code, no React, no Hermes: src/dash.js reads Hermes and hands
// the answers here. No AI anywhere. What each rule reads (content/dash-setup-list-v2.json, docs/answers/
// hhtech-dash-reads.md and -reads2.md, "For builder:"):
//   install        always done: this page runs only inside an installed Hermes
//   (dash-v2: bot = the bot the app has open; Lead, 11 Nov)
//   model          setup.runtime_check { profile: bot } says ok: true (Hermes's own free plan counts)
//   personality    profiles.describe { name: bot }: soul is not empty and not one of Hermes's starter texts
//   chat_apps      host.status(): gateway_platforms names at least one chat app (switched on, with its key)
//   scheduled_job  cron.manage { action: 'list', profile: bot, include_disabled: true }: at least one job
//   second_bot     profiles.list: two or more bots
// A read that failed or has not come back is "not known" (null): never shown as done, never "You are here".
import { DASH_DATA } from './dash-data.js'
import { hereStop } from './setup-reads.js'
// dash-v2 (the two branches joined): the starter personality texts, which bot, and the six rules (doneFlags) are in
// src/setup-reads.js, the one copy the Dashboard and Helper's set-up conversation both use.

/* ---------- the path ---------- */
// loom-fixes (dash-setup-list-v2 eb3aeba8): the 10 stops on the path (Install is off it), every one counted. A stop the
// page sees (it.seen) is done when its read says so; a stop the person marks is done when they said so ("I've done this"
// here, or "I've done this already" / "It worked" in Helper's set-up conversation: the same kept list, said). A
// stop the page sees and the person said is done too (Helper's "Count it as done").
// The state of one stop: true, false, or null (its read failed or is still out). selfMarked(it): the person marks it.
export function stopState(it, flags, said, selfMarked) {
  if (said.includes(it.id)) return true
  if (selfMarked(it)) return false
  const f = flags[it.id]
  return f === true ? true : f === false ? false : null
}
// Each stop: 'done' (filled), 'todo', 'here' ("You are here", by the one shared rule, src/setup-reads.js hereStop),
// 'unknown' (its read failed or is still out: drawn as not done, never "here"). The line itself has no state.
export function pathStates(stateOf, items = DASH_DATA.items, current = null) {
  const states = items.map(it => {
    const v = stateOf(it.id)
    return v === true ? 'done' : v === false ? 'todo' : 'unknown'
  })
  const at = hereStop(items.map(it => it.id), stateOf, current)
  const here = at ? items.findIndex(it => it.id === at) : -1
  if (here >= 0) states[here] = 'here'
  const done = states.filter(s => s === 'done').length
  return { states, here, done, total: items.length, allDone: done === items.length }
}

/* ---------- Activity: the days the open bot was used ---------- */
// Rows of host.listPersistedSessions that are Hermes's own work, left out: scheduled jobs (cron), the task board
// (kanban), tool and helper-agent runs. Chats with no message are left out too.
// loom-fixes (hhtech-loom-n1 3, its correction): 'local' is no longer left out: a chat the person typed in a fresh home
// came back as local. Hermes's own first-run chat is left out by its title (below).
export const NOT_THE_PERSON = ['cron', 'kanban', 'tool', 'subagent']
// dash-v2: while Hermes is still writing that first-run chat it is not 'local' yet. Read in three brand-new homes on
// the first opening (dev/checks/dash-v2/fresh-probe-65b108b.out): source 'gui', 1 to 3 messages, title "Getting
// started"; some seconds later 'local' with 4 messages. So a fresh install showed "Last used today" (hhtech-dash-run,
// 2 of 3 homes). The field that tells it apart at once is its title (Hermes's CHAT_TITLE, agent/onboarding_text.py;
// a repeated run is "Getting started #2"): a chat with that title and no more than Hermes's own four messages is
// left out. With more messages the person has gone on in it, and it is a chat of theirs.
export const FIRST_RUN_TITLE = /^Getting started( #\d+)?$/
export const FIRST_RUN_MAX_MESSAGES = 4
const isFirstRunChat = s => typeof s.title === 'string' && FIRST_RUN_TITLE.test(s.title.trim()) && s.message_count <= FIRST_RUN_MAX_MESSAGES
// A time from a row as a Date: seconds (Hermes writes seconds); a number above 1e11 is read as milliseconds.
const dashTime = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? new Date(v > 1e11 ? v : v * 1000) : null)
// The person's own calendar day of a Date (their computer's clock), as 'YYYY-MM-DD'.
export const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// The days with a chat, each with how many chats touched it: a chat marks the day it started and the day it was
// last used (rows have no per-message dates, so the days between are not marked).
export function chatDays(sessions) {
  const days = new Map()
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s || typeof s !== 'object') continue
    if (NOT_THE_PERSON.includes(String(s.source || '').toLowerCase())) continue
    if (!(typeof s.message_count === 'number' && s.message_count > 0)) continue
    if (isFirstRunChat(s)) continue
    const first = dashTime(s.started_at)
    const last = dashTime(s.last_active) || dashTime(s.last_activity_at) || first
    const keys = new Set([first, last].filter(Boolean).map(dayKey))
    for (const k of keys) days.set(k, (days.get(k) || 0) + 1)
  }
  return days
}

// How bright a day's square is: no chat, 1, 2, 3 or more.
export const dayLevel = n => (n >= 3 ? 3 : n > 0 ? n : 0)

// The grid: `weeks` columns, Sunday on top, the last column holds today; days after today are not drawn.
// months: a month's name over the first column whose Sunday is in it (not over the first or the last column).
export function activityGrid(days, today, weeks) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - (weeks - 1) * 7)
  const cells = []
  const months = []
  let prev = -1
  for (let w = 0; w < weeks; w++) {
    const sunday = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7)
    if (sunday.getMonth() !== prev && w > 0 && w < weeks - 1) months.push({ week: w, month: sunday.getMonth() })
    prev = sunday.getMonth()
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)
      if (day > today && dayKey(day) !== dayKey(today)) continue
      const key = dayKey(day)
      cells.push({ week: w, day: d, key, level: dayLevel(days.get(key) || 0), today: key === dayKey(today) })
    }
  }
  return { cells, months }
}

// "Last used": whole calendar days between the newest day with a chat and today. null = no chat at all.
export function daysSinceUsed(days, today) {
  if (!days.size) return null
  const newest = [...days.keys()].sort().pop()
  const [y, m, d] = newest.split('-').map(Number)
  const then = new Date(y, m - 1, d)
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(0, Math.round((now - then) / 86400000))
}

export function lastUsedLine(n, words = DASH_DATA.words.activity) {
  if (n === null) return null
  if (n === 0) return words.last_used_today
  if (n === 1) return words.last_used_one
  return words.last_used_n.replace('{n}', String(n))
}

// How many weeks fit a width: squares of `cell` px with `gap` px between, after the room the day names take.
export const weeksThatFit = (width, cell, gap, maxWeeks = 52) => Math.max(1, Math.min(maxWeeks, Math.floor((width + gap) / (cell + gap))))

/* ---------- the top box ---------- */
// Skills: the different skill names across all bots (one read per bot, host.skills.list). One failed read: not
// shown (a part would be too low).
export function distinctSkills(perBot) {
  if (!Array.isArray(perBot) || !perBot.length) return null
  const names = new Set()
  for (const r of perBot) {
    if (!r || !r.ok || !Array.isArray(r.value)) return null
    for (const s of r.value) if (s && typeof s.name === 'string' && s.name.trim()) names.add(s.name.trim())
  }
  return names.size
}
// A tile's word under its number (hhcontent): the number 1 takes the _one word, every other number, and a tile with
// no number yet, the plain one. narrow: at the narrow size a tile that has a short word takes it (the plugins tile:
// "plugins on in this bot" is 126 px wide and a tile has 112 px there, measured in the app; Lead, 11 Nov: then the
// short variant).
export function tileWord(key, n, words = DASH_DATA.words.stats, narrow = false) {
  const k = narrow && words[`${key}_short`] ? `${key}_short` : key
  return n === 1 ? words[`${k}_one`] : words[k]
}
