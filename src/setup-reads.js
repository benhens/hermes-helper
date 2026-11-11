// The reads of the set-up list (content/dash-setup-list-v2.json items[].read), as fixed rules. Pure code, no React, no
// Hermes, no AI: src/setup-look.js reads Hermes and hands the answers here.
//
// One copy (dash-v2, the two branches joined): the Dashboard (src/dash.js, src/dash-rules.js) and Helper's set-up
// conversation (src/setup-look.js) both use these. They began as src/dash-rules.js of job/dash-v1 (65b108b).
// Which bot the reads name is the caller's: the set-up conversation reads the main bot, the Dashboard the bot the app
// has open.
//   install        always done: this page runs only inside an installed Hermes
//   model          setup.runtime_check { profile: main bot } says ok: true (Hermes's own free plan counts)
//   personality    profiles.describe { name: main bot }: soul is not empty and not one of Hermes's starter texts
//   chat_apps      host.status(): gateway_platforms names at least one chat app (not used by the set-up conversation)
//   scheduled_job  cron.manage { action: 'list', profile: main bot, include_disabled: true }: at least one job
//   second_bot     profiles.list: two or more bots
//   first_chat     host.listPersistedSessions for the bot: a chat with a preview, not a job's (loom-fixes, below)
// A read that failed or has not come back is "not known" (null): never shown as done.

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
    second_bot: rows ? rows.length >= 2 : null,
    // loom-fixes: undefined when there is no sessions read at all (no door in this Hermes: the person marks it)
    first_chat: reads.sessions === undefined ? undefined : known(reads.sessions) ? firstChatSeen(got(reads.sessions)) : null
  }
}


/* ---------- loom-fixes: First chat, seen ---------- */
// hhtech-loom-n1.md 3 (ran in three homes): First chat is done when a chat of the bot (host.listPersistedSessions, not in
// the SDK docs: feature-checked) has a preview, the first thing the person typed, and is not Hermes's own work (a
// scheduled job, the task board, a tool run). Hermes's first-run chat "Getting started" has an empty preview. Source
// 'local' is a chat of the person's (the typed chat in a fresh home came back as local). value: the read's answer
// ({ sessions: [...] }). Returns true, false, or null (no list in the answer).
export const NOT_A_CHAT = ['cron', 'kanban', 'tool']
export function firstChatSeen(value) {
  const rows = value && Array.isArray(value.sessions) ? value.sessions : null
  if (!rows) return null
  return rows.some(r => r && typeof r === 'object' && typeof r.preview === 'string' && r.preview.trim() !== '' && !NOT_A_CHAT.includes(String(r.source || '').toLowerCase()))
}

/* ---------- loom-fixes: "You are here", one rule for the Dashboard and for Helper ---------- */
// content/dash-setup-list-v2.json here_rule (hhcontent; Lead's point 9: Helper's next thing IS the Dashboard's "You are
// here" stop): 1. the stop Helper's set-up conversation recommended last (kept as setup_current), if it is not done;
// else 2. the first stop in path order that is not done. path: the stops' ids in order. stateOf(id): true (done, seen
// or said), false (not done), null (not known: its read failed or is still out). A stop not known is never "here": it
// then places nobody (as the Dashboard's first rule had it). All done: null.
export function hereStop(path, stateOf, current) {
  const at = current && path.includes(current) && stateOf(current) !== true ? current : path.find(id => stateOf(id) !== true)
  return at && stateOf(at) === false ? at : null
}

/* ---------- a read that always ends ---------- */
// A read that gives up after `ms` (the host's own timer, cleaned up with the plugin). A host door that throws
// instead of rejecting counts as a failed read. Every read ends as { ok: true, value } or { ok: false }.
export function makeReader(ctx) {
  return (fn, ms) =>
    new Promise(resolve => {
      let done = false
      const end = r => {
        if (done) return
        done = true
        stop()
        resolve(r)
      }
      const stop = ctx.setTimeout(() => end({ ok: false }), ms)
      Promise.resolve()
        .then(fn)
        .then(
          value => end({ ok: true, value }),
          () => end({ ok: false })
        )
    })
}
