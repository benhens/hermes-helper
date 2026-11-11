// The reads of the set-up list (content/dash-setup-list-v2.json items[].read), as fixed rules. Pure code, no React, no
// Hermes, no AI: src/setup-look.js reads Hermes and hands the answers here.
//
// setup-chat (Lead, 11 Nov: "If the Dashboard job built these reads already, use that code, do not write them twice"):
// everything between the two marks below is src/dash-rules.js of the branch job/dash-v1 (commit 65b108b), line for
// line, unchanged. It is a copy only because that branch is not on main yet, and its copy of the list is older than the
// team's. When job/dash-v1 is merged, src/dash-rules.js should import these from here, so there is one copy.
//   install        always done: this page runs only inside an installed Hermes
//   model          setup.runtime_check { profile: main bot } says ok: true (Hermes's own free plan counts)
//   personality    profiles.describe { name: main bot }: soul is not empty and not one of Hermes's starter texts
//   chat_apps      host.status(): gateway_platforms names at least one chat app (not used by the set-up conversation)
//   scheduled_job  cron.manage { action: 'list', profile: main bot, include_disabled: true }: at least one job
//   second_bot     profiles.list: two or more bots
// A read that failed or has not come back is "not known" (null): never shown as done.

/* ===== from job/dash-v1 src/dash-rules.js, unchanged ===== */
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

/* ===== end of the copy ===== */
