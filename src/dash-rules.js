// The Dashboard's fixed rules (dash-v1; loom2: the set-up cards). Pure code, no React, no Hermes: src/dash.js reads
// Hermes and hands the answers here. No AI anywhere.
import { DASH_DATA } from './dash-data.js'

/* ---------- loom2: the set-up cards ---------- */
// His words (17:10 UTC, on Lead's plan): "By default no card should be shown as done, only if the person clicks Done.
// Otherwise it doesn't show." So nothing is read to decide it: a card is 'done' when the person marked it (the kept
// list setup_done_said), else 'todo'. start: the first card not marked ("Start here"), -1 when all are marked.
// done: how many are marked; total: how many cards (the count "{n} of {total}").
export function cardStates(said, items = DASH_DATA.items) {
  const marked = new Set(Array.isArray(said) ? said : [])
  const states = items.map(it => (marked.has(it.id) ? 'done' : 'todo'))
  return { states, start: states.indexOf('todo'), done: states.filter(x => x === 'done').length, total: items.length }
}
// As many columns as fit with each card at least CARD_MIN_PX wide, CARD_GAP_PX apart; at least one.
export const CARD_MIN_PX = 260
export const CARD_GAP_PX = 10
export const cardColumns = (width, min = CARD_MIN_PX, gap = CARD_GAP_PX) => Math.max(1, Math.floor((width + gap) / (min + gap)))
// An opened card's panel goes after the last card of its row (index of that card), full width.
export const panelAfter = (index, columns, count) => Math.min(count, (Math.floor(index / columns) + 1) * columns) - 1

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
