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
