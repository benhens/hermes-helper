// Reading what the person's AI sent back, and the checks a written reply must pass before it is shown
// (talk-live row 4). A port of hhcontent's check_live.py (fix and run_checks, dev/checks/hhcontent-live-v2),
// with the checks c18 and c23 that need the conversation, which only the page has. The lists come from
// content/helper-talk-live-v2.json checks (src/live-data.js); the Python patterns of the talk data go through
// pyRegExp. tests/live-checks.test.mjs gives every recorded reply the flags check_live.py gives it.
// The person is never told a check failed: a failure only means the pre-written line is shown.
import { LIVE_DATA } from './live-data.js'
import { pyRegExp } from './secret-rule.js'
import { TALK_DATA } from './talk-data.js'
import { talkNorm, whichOf } from './talk.js'

const LC = LIVE_DATA.checks
const SUBJECT_IDS = LIVE_DATA.subjects.map(s => s.id)
const LC_R9 = pyRegExp(LC.r9_pattern, 'i')
const LC_R6 = pyRegExp(LC.r6_pattern, 'gi')
const LC_R8 = new RegExp('\\b(?:' + LC.r8_never.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'i')
const LC_R5 = LC.r5_patterns.map(p => pyRegExp(p, 'i'))
const GLOSS_RX = LC.gloss.map(g => [pyRegExp(g.term, g.ignore_case ? 'i' : ''), pyRegExp(g.explained_by, 'i')])
const OK_CAPS = new Set(LC.ok_caps)
const liveEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SKILL_RX = LC.skills.map(s => [s.toLowerCase(), new RegExp('(^|[^a-z0-9-])' + liveEsc(s.toLowerCase()) + '($|[^a-z0-9-])')])
const NOT_RX = Object.fromEntries(Object.entries(LC.not_words).map(([cls, ws]) => [cls, ws.map(w => new RegExp("(^|[^a-z'])" + liveEsc(w) + "($|[^a-z'])", 'g'))]))
const MONEY_RX = LC.money_words.map(m => [m, new RegExp('(^|[^a-z])' + liveEsc(m) + '($|[^a-z])')])
const ASKED_AGAIN = TALK_DATA.no_repeat.asked_again

// hhtech-weak-ai (For builder): a reply that is the model's thinking is no reply: an unclosed <think> (Hermes cuts a
// closed block itself), or text that starts with "Thinking Process" or holds "**Analyze" (a managed local server
// hands back the thinking with no tag at all). Constants: live-v2 changes-5, which would hold them as data, does not
// exist (11 Nov 04:40).
const THINK_START = /^\s*thinking process\b/i
const THINK_ANYWHERE = '**Analyze'
export function isThinking(raw) {
  const s = String(raw || '')
  const open = s.lastIndexOf('<think>')
  if (open >= 0 && s.indexOf('</think>', open) < 0) return true
  return THINK_START.test(s) || s.includes(THINK_ANYWHERE)
}

// <think>...</think> blocks, and an unclosed <think> with everything after it (a reply cut off by max_tokens
// while the model still thinks)
const cutThink = s => String(s || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '')

// first_call.read: lower case, <think> cut, the first word that is a subject id; none found: none
export function readSubject(raw) {
  const words = cutThink(raw).toLowerCase().match(/[a-z_]+/g) || []
  return words.find(w => SUBJECT_IDS.includes(w)) || 'none'
}

// pick_only.read: <think> cut, then spaces, full stops, brackets, backticks and quote marks at both ends.
// Returns { id } for a handed id, or { word: 'TALK' | 'BUILD' | 'NONE' }; anything else counts as NONE.
export function readPick(raw, ids) {
  const a = cutThink(raw).replace(/^[\s.[\]`"']+|[\s.[\]`"']+$/g, '')
  if (ids.includes(a)) return { id: a }
  const up = a.toUpperCase()
  if (up.startsWith('TALK')) return { word: 'TALK' }
  if (up.startsWith('BUILD')) return { word: 'BUILD' }
  return { word: 'NONE' }
}

// c0 and c1, the two fixes (check_live.py fix(), and writer.read for USED:). Returns { text, used }: used is
// the ids after the last USED: (null when there is none: not a failure, as run).
export function readWritten(raw) {
  let s = cutThink(raw).trim()
  const usedAll = [...s.matchAll(/USED:\s*(.*)$/gm)]
  const used = usedAll.length ? usedAll[usedAll.length - 1][1].match(/[A-Za-z_0-9-]+/g) || [] : null
  s = s.replace(/\n?\s*USED:.*$/gm, '').trim()
  // a code fence around the whole reply, then quote marks around the whole reply
  s = s.replace(/^```\w*\s*|\s*```$/g, '').trim()
  if (s.length > 1 && '"\'\u201c'.includes(s[0]) && '"\'\u201d'.includes(s[s.length - 1])) s = s.slice(1, -1).trim()
  // c1: curly quotes straight, "!" to ".", a dash between words to ", ", ";" to ","
  s = s.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/!/g, '.')
  s = s.replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/\s*;\s*/g, ', ')
  return { text: s, used }
}

// c2: the whole reply is the word NONE or BUILD (as writer.read: a reply that starts with it, any case)
export function replyWord(text) {
  const up = String(text).trim().toUpperCase()
  return up.startsWith('NONE') ? 'NONE' : up.startsWith('BUILD') ? 'BUILD' : null
}

function notClasses(text) {
  let t = String(text).toLowerCase()
  for (const p of LC.not_cut_first) t = t.split(p).join(' ')
  const found = new Set()
  for (const cls of ['no_have', 'cannot', 'does_not', 'is_not', 'not']) {
    for (const re of NOT_RX[cls]) {
      re.lastIndex = 0
      if (re.test(t)) {
        found.add(cls)
        re.lastIndex = 0
        t = t.replace(re, ' ')
      }
    }
  }
  return found
}
const moneyCut = s => {
  let t = String(s).toLowerCase()
  for (const p of LC.money_cut_first) t = t.split(p).join(' ')
  return t
}
// c23's "the same words": lower case, marks dropped, spaces squeezed
const sameWords = s => talkNorm(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()

// The checks c3 to c23 on a reply after c0 and c1 (check_live.py run_checks, in the data's order). Every
// failed check is listed (the turn shows the fallback when the list is not empty).
//   rows: the rows handed, [{ id, text }]; used: the ids after USED: (or null)
//   talk: { lastLine: Helper's last line as shown, message: the person's newest message } for c18 and c23
// live-v2 changes-4, c24: a claim about the person beyond what was kept (checks.list c24, apply_c4_check.py
// c24_fails): after each "you run", "as a", "your" ... up to 3 words in the same sentence part; a word of 3 letters
// or more that is not a stop word, not on person_ok, and (with or without a final s) not a word of what was kept, of
// the person's newest message or of the rows handed fails. Returns the first such word, or null.
const C24_RX = new RegExp(LC.c24.person_pattern, 'gi')
const C24_STOP = new Set([...LIVE_DATA.stop_words, ...LC.c24.person_ok])
const c24Words = s => new Set((String(s || '').toLowerCase().match(/[a-z']+/g) || []).map(w => w.replace(/s+$/, '')))
export function c24Fails(reply, work, message, hand) {
  const allowed = new Set([...c24Words(work), ...c24Words(message), ...c24Words(hand)])
  C24_RX.lastIndex = 0
  for (const m of String(reply).matchAll(C24_RX)) {
    const part = reply.slice(m.index + m[0].length).split(/[.,;!?]/)[0]
    for (const w of (part.match(/[A-Za-z']+/g) || []).slice(0, 3)) {
      const lw = w.toLowerCase()
      if (lw.length >= 3 && !C24_STOP.has(lw) && !allowed.has(lw.replace(/s+$/, ''))) return w
    }
  }
  return null
}

export function replyFlags(reply, rows, used, talk = {}) {
  const ids = rows.map(r => r.id)
  const textOf = Object.fromEntries(rows.map(r => [r.id, r.text]))
  const hand = rows.map(r => r.text).join(' ').toLowerCase()
  const out = []
  if (used && used.some(u => !ids.includes(u) && u.toLowerCase() !== 'none')) out.push('c3 USED not handed')
  const nw = (reply.match(/\S+/g) || []).length
  const ns = reply.trim().split(/(?<=[.!?])\s+/).filter(s => s.trim()).length
  if (nw > LC.max_words) out.push(`c4 words ${nw}`)
  if (ns > LC.max_sentences) out.push(`c5 sentences ${ns}`)
  if (reply.split('?').length - 1 > 1) out.push('c6 two ?')
  if (LC_R9.test(reply)) out.push('c7 offer')
  for (const n of reply.match(/\b\d[\d.,:]*\b/g) || []) if (!hand.includes(n.toLowerCase())) out.push('c8 number ' + n)
  for (const m of reply.matchAll(/"([^"]{2,40})"/g)) if (!hand.includes(m[1].toLowerCase())) out.push('c9 quoted ' + m[1])
  for (const m of reply.matchAll(/`([^`]+)`|(?:^|\s)(\/[a-z][a-z-]+)|\b(hermes [a-z]+ [a-z-]+)/g)) {
    const c = m[1] || m[2] || m[3]
    if (!hand.includes(c.toLowerCase())) out.push('c10 command ' + c)
  }
  const low = reply.toLowerCase()
  for (const [s, re] of SKILL_RX) if (re.test(low) && !hand.includes(s)) out.push('c11 skill ' + s)
  for (const m of reply.matchAll(/(?<![.!?]\s)(?<!^)\b([A-Z][A-Za-z0-9]+)/g)) if (!OK_CAPS.has(m[1]) && !hand.includes(m[1].toLowerCase())) out.push('c12 name ' + m[1])
  LC_R6.lastIndex = 0
  for (const m of reply.matchAll(LC_R6)) if (!hand.includes(m[0].toLowerCase())) out.push('c13 jargon ' + m[0])
  const hc = notClasses(hand)
  for (const cls of [...notClasses(reply)].filter(c => !hc.has(c)).sort()) out.push('c14 no-claim ' + cls)
  if (/http|www\.|\(/.test(reply)) out.push('c15 link or (')
  if (LC_R8.test(reply)) out.push('c16 product word')
  if (LC.test_phrases.some(p => low.includes(p))) out.push('c17 test')
  if (reply.includes('?') && /\?\s*$/.test(talk.lastLine || '')) out.push('c18 a second question')
  const mc = moneyCut(reply)
  for (const [m, re] of MONEY_RX) if (re.test(mc) && !hand.includes(m)) out.push('c19 money ' + m)
  const uh = (used || []).filter(u => ids.includes(u)).map(u => textOf[u]).join(' ').toLowerCase()
  if (/\b(only|never)\b/.test(uh) && !/\b(only|never)\b/.test(low)) out.push('c20 dropped only/never')
  if (!ids.length || !used || !used.length || (used.length === 1 && used[0].toLowerCase() === 'none')) {
    if (/\d/.test(reply) || reply.includes('"') || LC_R5.some(rx => rx.test(reply)) || MONEY_RX.some(([, re]) => re.test(mc))) out.push('c21 talk with a fact word')
  }
  for (const [rx, gl] of GLOSS_RX) if (rx.test(reply) && !gl.test(reply)) out.push('c22 term unexplained ' + rx.source)
  if (talk.lastLine && sameWords(reply) === sameWords(talk.lastLine) && !whichOf(talkNorm(talk.message || ''), ASKED_AGAIN).length) out.push('c23 the same as the last line')
  // c24, after c23 (changes-4: "Run c24 after c23")
  const who = c24Fails(reply, talk.work, talk.message, hand)
  if (who) out.push('c24 about the person ' + who)
  return out
}

// The whole reading of a written reply: { word: 'NONE' | 'BUILD' } (c2), { fail } (empty after c0, or the
// first failed check), or { text, used } that may be shown.
export function judgeWritten(raw, rows, talk = {}) {
  const { text, used } = readWritten(raw)
  if (!text) return { fail: 'c0 empty' }
  const word = replyWord(text)
  if (word) return { word }
  const flags = replyFlags(text, rows, used, talk)
  if (flags.length) return { fail: flags[0], flags }
  return { text, used: used || [] }
}
