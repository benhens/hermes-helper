// The Dashboard tab's fixed rules (dash-v1). Pure code, no React, no Hermes: src/dash.js reads Hermes and hands
// the answers here. No AI anywhere. What each rule reads (content/dash-setup-list-v2.json, docs/answers/
// hhtech-dash-reads.md and -reads2.md, "For builder:"):
//   install        always done: this page runs only inside an installed Hermes
//   model          setup.runtime_check { profile: main bot } says ok: true (Hermes's own free plan counts)
//   personality    profiles.describe { name: main bot }: soul is not empty and not one of Hermes's starter texts
//   chat_apps      host.status(): gateway_platforms names at least one chat app (switched on, with its key)
//   scheduled_job  cron.manage { action: 'list', profile: main bot, include_disabled: true }: at least one job
//   second_bot     profiles.list: two or more bots
// A read that failed or has not come back is "not known" (null): never shown as done, never "You are here".
import { DASH_DATA } from './dash-data.js'

/* ---------- Hermes's starter personality texts (hermes_cli/default_soul.py, Hermes v0.23.0) ---------- */
// DEFAULT_SOUL_MD and the four _LEGACY_TEMPLATE_SOULS, copied as hhtech copied them into its test page
// (hhtech-dash-reads.md 1.5); tests/dash-rules.test.mjs compares them with tests/fixtures/hermes-default-souls.json.
const STARTER_HEAD =
  "# Hermes Agent Persona\n\n<!--\nThis file defines the agent's personality and tone.\nThe agent will embody whatever you write here.\nEdit this to customize how Hermes communicates with you.\n\n"
const STARTER_TAIL = 'This file is loaded fresh each message -- no restart needed.\nDelete the contents (or this file) to use the default personality.\n-->'
const STARTER_NOW =
  'You are Hermes Agent, built by Nous Research. Be direct: match the length of your reply to the weight of the ask \u2014 a one-line question gets a one-line answer, and finished work gets a short report of what changed, what\'s verified, and what\'s left, never a replay of the process. No filler ("Great question," "I\'d be happy to"), no restating the request back, no re-summarizing what you already said, no narrating tool calls the user can see. Plain claims over adjectives; when unsure, say so plainly. Agree because it\'s right, not because the user said it. Depth is earned \u2014 give it when the user asks for detail, teaches, or the stakes demand it, not by default.'
export const STARTER_SOULS = [
  STARTER_NOW,
  STARTER_HEAD +
    'Examples:\n  - "You are a warm, playful assistant who uses kaomoji occasionally."\n  - "You are a concise technical expert. No fluff, just facts."\n  - "You speak like a friendly coworker who happens to know everything."\n\n' +
    STARTER_TAIL,
  STARTER_HEAD + STARTER_TAIL,
  'You are Hermes Agent, an intelligent AI assistant created by Nous Research. You are helpful, knowledgeable, and direct. You assist users with a wide range of tasks including answering questions, writing and editing code, analyzing information, creative work, and executing actions via your tools. You communicate clearly, admit uncertainty when appropriate, and prioritize being genuinely useful over being verbose unless otherwise directed below. Be targeted and efficient in your exploration and investigations.',
  STARTER_NOW.replaceAll('\u2014', '--')
]
// Hermes's own normalising (_normalize_soul): one kind of line end, no leading BOM, trimmed.
export const soulNormal = text => String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\ufeff/, '').trim()
const STARTER_SET = new Set(STARTER_SOULS.map(soulNormal))
export const isStarterSoul = text => STARTER_SET.has(soulNormal(text))

/* ---------- which bot ---------- */
// The bots from profiles.list ({ profiles: [{ name, is_default }] }), or null when the read gave none.
export function botRows(value) {
  const list = value && Array.isArray(value.profiles) ? value.profiles : null
  if (!list) return null
  const rows = list.filter(p => p && typeof p.name === 'string' && p.name.trim())
  return rows.length ? rows : null
}
// The main bot: the one Hermes marks as default; else the one called default; else the first.
export function mainBotName(rows) {
  if (!rows || !rows.length) return null
  const marked = rows.find(p => p.is_default === true) || rows.find(p => p.name === 'default') || rows[0]
  return marked.name
}
// The bot the app has open (host.state.profile; '' from Hermes means the default one).
export const openBotName = profile => (typeof profile === 'string' && profile.trim() ? profile.trim() : 'default')

/* ---------- the six rules ---------- */
// reads: { bots, model, soul, status, cron }, each { ok: true, value } | { ok: false } | undefined (still waiting).
// Returns { install, model, personality, chat_apps, scheduled_job, second_bot }: true, false, or null (not known).
export function doneFlags(reads) {
  const got = r => (r && r.ok ? r.value : undefined)
  const known = r => !!(r && r.ok)
  const rows = known(reads.bots) ? botRows(got(reads.bots)) : null
  const soul = known(reads.soul) && got(reads.soul) && typeof got(reads.soul).soul === 'string' ? got(reads.soul).soul : null
  const platforms = known(reads.status) && got(reads.status) ? got(reads.status).gateway_platforms : undefined
  const cron = known(reads.cron) ? got(reads.cron) : null
  const jobs = cron && typeof cron === 'object' ? (Number.isInteger(cron.count) ? cron.count : Array.isArray(cron.jobs) ? cron.jobs.length : null) : null
  return {
    install: true,
    model: known(reads.model) && got(reads.model) && typeof got(reads.model) === 'object' ? got(reads.model).ok === true : null,
    personality: known(reads.soul) ? (soul === null ? null : soulNormal(soul) !== '' && !isStarterSoul(soul)) : null,
    chat_apps: known(reads.status) && got(reads.status) && typeof got(reads.status) === 'object' ? !!platforms && typeof platforms === 'object' && Object.keys(platforms).length > 0 : null,
    scheduled_job: jobs === null ? null : jobs >= 1,
    second_bot: rows ? rows.length >= 2 : null
  }
}

/* ---------- the path ---------- */
// Each of the 11 stops: 'done' (seen done: filled), 'todo' (seen, not done), 'here' (the first seen stop not done:
// "You are here"), 'unknown' (seen, but its read failed or is still out: drawn as not done, never "You are here"),
// or 'quiet' (Helper cannot see it: the smaller mark that never fills). The line itself has no state.
export function pathStates(flags, items = DASH_DATA.items) {
  const states = items.map(it => {
    if (!it.counts) return 'quiet'
    const f = flags[it.id]
    return f === true ? 'done' : f === false ? 'todo' : 'unknown'
  })
  // "You are here" only where it is known: the first counted stop not done, when every counted stop before it is
  // seen done. A stop before it that could not be read (unknown) places nobody (review, dash-v1).
  const firstOpen = states.findIndex(s => s === 'todo' || s === 'unknown')
  const here = firstOpen >= 0 && states[firstOpen] === 'todo' ? firstOpen : -1
  if (here >= 0) states[here] = 'here'
  const counted = items.filter(it => it.counts)
  const done = counted.filter(it => flags[it.id] === true).length
  return { states, here, done, total: counted.length, allDone: done === counted.length }
}

/* ---------- Activity: the days the open bot was used ---------- */
// Rows of host.listPersistedSessions that are Hermes's own work, left out: scheduled jobs (cron), the task board
// (kanban), tool and helper-agent runs, and 'local', the source Hermes's own first-run chat ("Getting started") came
// back with (hhtech-dash-reads2.md section 3). Chats with no message are left out too.
export const NOT_THE_PERSON = ['cron', 'kanban', 'tool', 'subagent', 'local']
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
// Plugins: what plugins.manage list gives as installed by the person (user_count) for the open bot, plus 1 for
// Helper itself (Helper is never in that list: hhtech-dash-icons.md point 2). A failed read: not shown, never a
// bare 1.
export function pluginCount(read) {
  if (!read || !read.ok || !read.value || typeof read.value !== 'object') return null
  const n = read.value.user_count
  return Number.isInteger(n) && n >= 0 ? n + 1 : null
}
