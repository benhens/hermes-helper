// Which of Helper's checked rows the person's AI is handed (talk-live row 2): hhtech's live.py score, by_words
// and rank_in (dev/checks/hhtech-live-reply/live.py lines 45 to 57), the follow-up rule and the next lines of
// content/helper-talk-live-v2.json (follow_up, rows). Never more than 5 rows, never a whole list.
// No React, no requests: tests/live-rows.test.mjs compares the ids with live.py's on the same data.
import { LIVE_DATA } from './live-data.js'
import { talkNorm, whichOf } from './talk.js'

export const LIVE_ROWS = LIVE_DATA.rows
export const LIVE_ROW = Object.fromEntries(LIVE_ROWS.map(r => [r.id, r]))
// the rows word matching and the subjects rank (the next lines have no key words of their own)
// (find-v1: nor the rows that are there only so the list call's picks can be handed, list_only)
const SCORED = LIVE_ROWS.filter(r => !r.next_of && !r.list_only)
// find-v1: the list call's list, every fact line once as { id, title }
export const LIST_LINES = LIVE_DATA.list
// a row's next lines: its button's line, its then line (live changes-6 and -9) and, on a follow-up only, its second
// wording (ask-fix-t1 skill-mean, plugin-mean; live changes-9 use1-next-mean); a next line may have one of its own
const NEXT_OF = {}
for (const r of LIVE_ROWS.filter(x => x.next_of)) (NEXT_OF[r.next_of] = NEXT_OF[r.next_of] || []).push(r)
const STOP = new Set(LIVE_DATA.stop_words)
export const MAX_HANDED = LIVE_DATA.max_handed

// live.py words(): the words of 3 letters or more that are not stop words, lower case
const liveWords = s => new Set((String(s).toLowerCase().match(/[a-z0-9']+/g) || []).filter(w => !STOP.has(w) && w.length > 2))

// live.py score(): 2 for each key word found, 0.5 if any weak word is found, 0.5 for each word shared
// with the row's text and title
export function rowScore(text, row) {
  const t = talkNorm(text)
  let s = 2 * whichOf(t, row.kw).length + 0.5 * Math.min(1, whichOf(t, row.weak).length)
  const mine = liveWords(text)
  for (const w of liveWords(row.text + ' ' + row.title)) if (mine.has(w)) s += 0.5
  return s
}

// live.py by_words(): every row scored, best first (Python sorts the (score, id) pairs from the top, so of
// two rows with the same score the greater id comes first), the first 4, those with 2 or more
export function byWords(text, k = 4) {
  const scored = SCORED.map(r => [rowScore(text, r), r.id])
  scored.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
  return scored.slice(0, k).filter(([s]) => s >= 2).map(([, id]) => id)
}

// live.py rank_in(): a subject's rows by the same score, best first, rows with the same score in the data's
// order; the first 5, score 0 included
export function rankIn(text, subject, k = MAX_HANDED) {
  const rows = SCORED.filter(r => r.subject === subject).map(r => [rowScore(text, r), r.id])
  rows.sort((a, b) => b[0] - a[0])
  return rows.slice(0, k).map(([, id]) => id)
}

// rows.from item 2: a next line is handed with its row, right after it; then cut at 5
// followUp: the message is a follow-up, so the second wordings are handed too
export function withNext(ids, followUp = false) {
  const out = []
  const add = id => {
    if (!out.includes(id)) out.push(id)
    for (const n of NEXT_OF[id] || []) if (followUp || !n.follow_only) add(n.id)
  }
  ids.forEach(add)
  return out.slice(0, MAX_HANDED)
}

// The row of a line code showed, from the visit's note of Helper's last line (src/talk.js lineKey: kind, topic,
// need, term, buttons, row, ...). null: a line that came from no row.
export function rowOfKey(key) {
  if (!key) return null
  let k
  try {
    k = JSON.parse(key)
  } catch {
    return null
  }
  if (!Array.isArray(k)) return null
  const [kind, topic, need, term, , row] = k
  // live changes-6 and -9, ask-fix-t1: a then line, a word line's second wording and the text of a line's button
  // came from the row they belong to
  const id = kind === 'row' || kind === 'rowthen' ? need : kind === 'termmean' ? term : kind === 'nextline' ? need || term || (LIVE_ROWS.find(r => r.shows.kind === 'plain' && r.shows.topic === topic) || {}).id : kind === 'plain' || kind === 'then' ? (LIVE_ROWS.find(r => r.shows.kind === 'plain' && r.shows.topic === topic) || {}).id : kind === 'term' ? term : kind === 'want' ? row : kind === 'fact' ? need : ['COST', 'WHERE', 'CN1'].includes(kind) || (LIVE_ROW[kind] && LIVE_ROW[kind].list_only) ? kind : null
  return id && LIVE_ROW[id] ? id : null
}

// follow_up.rule: the kinds of Helper's last line that came from rows. The data says wants; the plugin's kind
// is want. written: a reply the AI wrote that used rows.
// find-v1: a fact line from the docs and a fixed line that is a row now (MIG_APP, SAFE, HERMES ...) came from rows too
const FROM_ROWS = ['row', 'plain', 'term', 'want', 'COST', 'WHERE', 'written', 'then', 'rowthen', 'termmean', 'nextline', 'fact', ...LIVE_ROWS.filter(r => r.list_only && r.subject === 'fixed').map(r => r.id)]
const FOLLOW_CUT = ['ok', 'okay', 'so', 'and', 'cool', 'right']
const PHRASES = LIVE_DATA.follow_up.phrases
// the whole message, end marks and the lead words ok, okay, so, and, cool, right cut, is one of the phrases
export function isFollowPhrase(text) {
  const bare = s => s.replace(/[ ?!.,]+$/, '').trim()
  let t = bare(talkNorm(text))
  if (PHRASES.includes(t)) return true
  for (;;) {
    const w = FOLLOW_CUT.find(c => t.startsWith(c + ' ') || t.startsWith(c + ','))
    if (!w) return false
    t = t.slice(w.length).replace(/^[ ,]+/, '')
    if (PHRASES.includes(bare(t))) return true
  }
}

// Whether a message is a follow-up (follow_up.rule): Helper's last line came from rows, and the no-AI turn
// found ordinary talk of kind mean (plain with why "what do you mean", or MEAN_NONE) or kind stuck, or the message
// is a phrase.
// before: the visit's note of Helper's last line as it was before this message ({ last, lastKey, liveRows }).
export function isFollowUp(text, pre, before) {
  const fromRows = before.last === 'written' ? !!(before.liveRows && before.liveRows.ids.length) : FROM_ROWS.includes(before.last)
  if (!fromRows) return false
  const mean = pre.kind === 'MEAN_NONE' || (pre.kind === 'plain' && pre.why === 'what do you mean')
  // live-v2 changes-3: kind stuck ("that didn't work") is a follow-up too
  const stuck = pre.kind === 'STUCK' || pre.kind === 'STUCK_SAME'
  return mean || stuck || isFollowPhrase(text)
}

// follow_up.rows: the rows handed for the person's previous message, in the same order, each with its next
// line; if that message got a line from code, the row of that line with its next line. At most 5.
export function followRows(before) {
  if (before.liveRows && before.liveRows.key === before.lastKey) return withNext(before.liveRows.ids, true)
  const id = rowOfKey(before.lastKey)
  return id ? withNext([id], true) : []
}

// What a handed row shows when the AI picks it (pick_only.read): the result code would give for that row.
export function resultOfRow(id) {
  const r = LIVE_ROW[id]
  return r ? { ...r.shows } : null
}
