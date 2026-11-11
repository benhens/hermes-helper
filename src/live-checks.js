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
import { WANTS_DATA } from './wants-data.js'

const LC = LIVE_DATA.checks
const LC_R9 = pyRegExp(LC.r9_pattern, 'i')
const LC_R6 = pyRegExp(LC.r6_pattern, 'gi')
const LC_R8 = new RegExp('\\b(?:' + LC.r8_never.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi')
// live changes-6 (checks.list c16.allow_c6, check_live.py c16_fails): guide and guides fail only in a sentence that
// speaks of Helper; every other product word fails as before
const C16_HELPER = pyRegExp(LC.c16_allow.speaks_of_helper, '')
export function c16Fails(reply) {
  for (const sent of String(reply).split(/(?<=[.!?])\s+/)) {
    for (const m of sent.matchAll(LC_R8)) if (!LC.c16_allow.words.includes(m[0].toLowerCase()) || C16_HELPER.test(sent)) return true
  }
  return false
}
const LC_R5 = LC.r5_patterns.map(p => pyRegExp(p, 'i'))
const GLOSS_RX = LC.gloss.map(g => [pyRegExp(g.term, g.ignore_case ? 'i' : ''), pyRegExp(g.explained_by, 'i')])
const OK_CAPS = new Set(LC.ok_caps)
const liveEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SKILL_RX = LC.skills.map(s => [s.toLowerCase(), new RegExp('(^|[^a-z0-9-])' + liveEsc(s.toLowerCase()) + '($|[^a-z0-9-])')])
const NOT_RX = Object.fromEntries(Object.entries(LC.not_words).map(([cls, ws]) => [cls, ws.map(w => new RegExp("(^|[^a-z'])" + liveEsc(w) + "($|[^a-z'])", 'g'))]))
const MONEY_RX = LC.money_words.map(m => [m, new RegExp('(^|[^a-z])' + liveEsc(m) + '($|[^a-z])')])
const ASKED_AGAIN = TALK_DATA.no_repeat.asked_again

// live-v2 changes-5, checks_c5.no_reply (it replaces talk-live-2's constants from hhtech-weak-ai): before any other
// check, the text is no reply (the same as no answer in 12 s) when, after trimming, it starts with one of starts (any
// case), holds one of holds (exact), or holds <think> with no </think>. As check_c5.py's no_reply(): a reply that
// starts with a closed <think> block counts too (talk-live-2 cut a closed block first).
const NR_STARTS = LIVE_DATA.no_reply.starts.map(s => s.toLowerCase())
const NR_HOLDS = LIVE_DATA.no_reply.holds
export function noReply(raw) {
  const s = String(raw == null ? '' : raw).trim()
  const low = s.toLowerCase()
  return NR_STARTS.some(p => low.startsWith(p)) || NR_HOLDS.some(h => s.includes(h)) || (s.includes('<think>') && !s.includes('</think>'))
}

// <think>...</think> blocks, and an unclosed <think> with everything after it (a reply cut off by max_tokens
// while the model still thinks)
const cutThink = s => String(s || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '')

// find-v1, the list call's reader (hhtech's readList, dev/checks/hhtech-find-run/find.mjs): <think> blocks cut, then
// up to three ids of the list in the order given (any case) -> { ids }; none: { word: 'BUILD' } when the word BUILD is
// there, else { word: 'NONE' }. Builder: a reply that starts with NONE or BUILD is that word, whatever follows (a
// wordy "NONE, no skill line fits" must not be read as the word line skill).
const LIST_IDS = LIVE_DATA.list.map(l => l.id)
const LIST_ID_OF = Object.fromEntries(LIST_IDS.map(id => [id.toLowerCase(), id]))
export function readList(raw) {
  const s = cutThink(raw)
  const start = (s.trim().match(/^[^A-Za-z]*(none|build)\b/i) || [])[1]
  if (start) return { word: start.toUpperCase() }
  const out = []
  // Builder (review): some ids are ordinary words (HERMES, skill, FREE, START ...), so a sentence could be read as
  // picks. A list of ids has few other words: with more than three words that are no id, the reply holds no ids.
  let other = 0
  for (const w of s.match(/[A-Za-z0-9_-]+/g) || []) {
    const id = LIST_ID_OF[w.toLowerCase()]
    if (id && !out.includes(id)) out.push(id)
    else if (!id && /[A-Za-z]/.test(w)) other++
  }
  if (out.length && other <= 3) return { ids: out.slice(0, 3) }
  return { word: /\bBUILD\b/i.test(s) ? 'BUILD' : 'NONE' }
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
  // live changes-6 (checks_c5.used_reader, check_live.py read_used): the label in any case (USED, Used, used), the last
  // one; from the label to the end of its line is the list, cut from the reply. When nothing is left after trimming
  // spaces, full stops and commas, or only the word none, there is no reply ("Used: none." is never shown). A second
  // label still in the reply fails c26.
  const usedAll = [...s.matchAll(/\bused\s*:(.*)$/gim)]
  let used = null
  if (usedAll.length) {
    const m = usedAll[usedAll.length - 1]
    used = m[1].match(/[A-Za-z_0-9-]+/g) || []
    s = (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim()
    if (/^(?:none)?$/i.test(s.replace(/^[\s.,]+|[\s.,]+$/g, ''))) s = ''
  }
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
export function c24Fails(reply, work, message, hand, forms = false) {
  const allowed = new Set([...c24Words(work), ...c24Words(message), ...c24Words(hand)])
  const handed = forms ? c24Words(hand) : null
  C24_RX.lastIndex = 0
  for (const m of String(reply).matchAll(C24_RX)) {
    const part = reply.slice(m.index + m[0].length).split(/[.,;!?]/)[0]
    for (const w of (part.match(/[A-Za-z']+/g) || []).slice(0, 3)) {
      const lw = w.toLowerCase()
      if (lw.length >= 3 && !C24_STOP.has(lw) && !allowed.has(lw.replace(/s+$/, '')) && !(handed && /(^|\s)your\s+$/i.test(m[0]) && c24SameForm(lw, handed))) return w
    }
  }
  return null
}

/* ---------- find-v1 (Lead, 11 Nov; hhtech find-run section 4): four checks dropped replies that were true to the handed lines ----------
   These four allowances are newer than hhcontent's check_live.py; talk.asCheckLive switches them off (the comparison
   with check_live.py's flags in tests/live-checks.test.mjs).
   c12  a name passes when it stands as a word in one of the person's own typed messages of this visit (talk.typed)
        AND Helper's checked data knows that word (Mac, Siri, Signal). Builder: the second half keeps today's stop for
        a name nobody checked ("Hermes works with Zorbo").
   c24  a word after "your" alone that is a form of a word in the handed lines is no guess about the person ("asks for
        your approval first" from "asks you to approve it first"); see c24SameForm.
   c22  a Hermes word needs no plain word beside it when one handed line holds the word and its plain word.
   c14  "the checked information does not mention ..." says what Helper has not checked; it is no claim about Hermes. */
const LC_KNOWN_WORDS = new Set(JSON.stringify([TALK_DATA.facts, TALK_DATA.fixed, TALK_DATA.topics, TALK_DATA.terms, TALK_DATA.chat_apps, WANTS_DATA.rows]).toLowerCase().match(/[a-z0-9]+/g))
export function c12Typed(name, typed) {
  const n = String(name).toLowerCase()
  if (!LC_KNOWN_WORDS.has(n)) return false
  const re = new RegExp('(^|[^a-z0-9])' + liveEsc(n) + '($|[^a-z0-9])')
  return (typed || []).some(m => re.test(String(m).toLowerCase()))
}
// Builder (review): the same word with another ending: both six letters or more, at most two letters apart in length,
// and the same up to the shorter one's last letter (approval / approve; not accountant / account, company / compare)
const c24SameForm = (w, allowed) => w.length >= 6 && [...allowed].some(a => {
  if (a.length < 6 || Math.abs(a.length - w.length) > 2) return false
  const n = Math.min(a.length, w.length) - 1
  return a.slice(0, n) === w.slice(0, n) && a !== w.slice(0, a.length)
})
const C14_HONEST = /\b(?:the |my |helper's )?checked (?:information|info|facts?|lines?|notes?)(?: i have| that i have)? (?:doesn't|doesnt|does not|don't|dont|do not|didn't|did not)(?: specifically| explicitly| actually| really)? (?:mention|say|cover|include|list|name|state|talk about|go into)\b/g

export function replyFlags(reply, rows, used, talk = {}) {
  const allow = !talk.asCheckLive
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
  for (const m of reply.matchAll(/(?<![.!?]\s)(?<!^)\b([A-Z][A-Za-z0-9]+)/g)) if (!OK_CAPS.has(m[1]) && !hand.includes(m[1].toLowerCase()) && !(allow && c12Typed(m[1], talk.typed))) out.push('c12 name ' + m[1])
  LC_R6.lastIndex = 0
  for (const m of reply.matchAll(LC_R6)) if (!hand.includes(m[0].toLowerCase())) out.push('c13 jargon ' + m[0])
  const hc = notClasses(hand)
  for (const cls of [...notClasses(allow ? reply.toLowerCase().replace(C14_HONEST, ' ') : reply)].filter(c => !hc.has(c)).sort()) out.push('c14 no-claim ' + cls)
  if (/http|www\.|\(/.test(reply)) out.push('c15 link or (')
  if (c16Fails(reply)) out.push('c16 product word')
  if (LC.test_phrases.some(p => low.includes(p))) out.push('c17 test')
  if (reply.includes('?') && /\?\s*$/.test(talk.lastLine || '')) out.push('c18 a second question')
  const mc = moneyCut(reply)
  for (const [m, re] of MONEY_RX) if (re.test(mc) && !hand.includes(m)) out.push('c19 money ' + m)
  const uh = (used || []).filter(u => ids.includes(u)).map(u => textOf[u]).join(' ').toLowerCase()
  if (c20Fails(uh, low)) out.push('c20 dropped only/never')
  // live changes-6 (c21.what): ordinary talk only when no row was handed, or the USED line lists nothing or only none;
  // a reply with no USED line after rows were handed gets every other check, as a reply from rows does
  if (!ids.length || (used && (!used.length || (used.length === 1 && used[0].toLowerCase() === 'none')))) {
    if (/\d/.test(reply) || reply.includes('"') || LC_R5.some(rx => rx.test(reply)) || MONEY_RX.some(([, re]) => re.test(mc))) out.push('c21 talk with a fact word')
  }
  for (const [rx, gl] of GLOSS_RX) if (rx.test(reply) && !gl.test(reply) && !(allow && rows.some(r => rx.test(r.text) && gl.test(r.text)))) out.push('c22 term unexplained ' + rx.source)
  if (talk.lastLine && sameWords(reply) === sameWords(talk.lastLine) && !whichOf(talkNorm(talk.message || ''), ASKED_AGAIN).length) out.push('c23 the same as the last line')
  // c24, after c23 (changes-4: "Run c24 after c23")
  const c24Word = c24Fails(reply, talk.work, talk.message, hand, allow)
  if (c24Word) out.push('c24 about the person ' + c24Word)
  // live-v2 changes-5: c26 and c27 after c24 (c25 has adopted: false and is not built)
  const c26Word = c26Fails(reply, hand)
  if (c26Word) out.push('c26 notes shown ' + c26Word)
  for (const id of c27Fails(reply, talk.message || '')) out.push('c27 ' + id)
  // offer-t1 (changes-8) c28, then live changes-9 c29 (only when the About them line was in the call)
  if (c28Fails(reply)) out.push('c28 ends on an invitation or a question')
  const c29Word = talk.workHanded ? c29Fails(reply, talk.work, hand) : null
  if (c29Word) out.push('c29 what the person does ' + c29Word)
  return out
}

// live-v2 changes-5 c26: the reply holds one of the words (any case): the model's own notes or an instruction label
// shown to the person. "USED" counts only in capitals, as a word (check_c5.py). Returns the word found, or null.
const C26_WORDS = LC.c26.filter(w => w !== 'USED').map(w => w.toLowerCase())
// live changes-6 (c26.skip_in_hand): a word that is also in the handed rows does not fail the reply; USED in capitals
// always fails, and so does a label still in the reply after the reader cut the last one (used_reader)
export function c26Fails(reply, hand = '') {
  const low = String(reply).toLowerCase()
  const h = String(hand).toLowerCase()
  const w = C26_WORDS.find(x => low.includes(x) && !h.includes(x))
  if (w) return w
  return /\bUSED\b/.test(reply) || /\bused\s*:/i.test(reply) ? 'USED' : null
}
// c20: a used row says only or never and the reply does not. Builder (job setup-chat point 14, hhtech-ask-run 19f; told
// to Lead): "only" also counts as kept when the reply holds the three words that follow it in the row ("only while
// Hermes is" / "It runs while Hermes is running ..."): the condition is still said. "never" must be said.
function c20Fails(usedText, low) {
  if (!/\b(only|never)\b/.test(usedText) || /\b(only|never)\b/.test(low)) return false
  if (/\bnever\b/.test(usedText)) return true
  const flat = s => s.replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ')
  const after = [...flat(usedText).matchAll(/\bonly ((?:[a-z0-9']+ ){2}[a-z0-9']+)/g)].map(m => m[1])
  return !(after.length && after.every(a => flat(low).includes(a)))
}
// offer-t1 (changes-8) c28: the reply's last sentence ends with ? or holds one of ends (any case)
export function c28Fails(reply) {
  const sents = String(reply).trim().split(/(?<=[.!?])\s+/).filter(s => s.trim())
  const last = (sents[sents.length - 1] || '').toLowerCase()
  return /\?\s*$/.test(last) || LC.c28.some(e => last.includes(e.toLowerCase()))
}
// live changes-9 c29 (check_c9.py c29): what the person does used as a step or as a fact about Hermes. Work words: runs
// of 3 letters or more in the kept line, not stop words, not on skip, not a word of the handed facts; matched whole,
// also with a final s, es or ing. Fails when a sentence with a work word also holds a step word, or holds a work word
// that is not led in (none of lead_ins among the 3 words before it, and the word before it is not a led-in work word).
const C29_STOP = new Set([...LIVE_DATA.stop_words, ...LC.c29.skip])
export function c29Fails(reply, work, hand) {
  if (!work) return null
  const hw = new Set(String(hand).toLowerCase().match(/[a-z]{3,}/g) || [])
  const ww = (String(work).toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !C29_STOP.has(w) && !hw.has(w))
  if (!ww.length) return null
  const rx = new RegExp('^(?:' + ww.map(liveEsc).join('|') + ')(?:s|es|ing)?$')
  for (const sent of String(reply).split(/(?<=[.!?])\s+/)) {
    const toks = sent.toLowerCase().match(/[a-z']+/g) || []
    const at = toks.map((t, i) => (rx.test(t) ? i : -1)).filter(i => i >= 0)
    if (!at.length) continue
    if (toks.some(t => LC.c29.step_words.includes(t))) return 'in a step sentence'
    const led = new Set()
    for (const i of at) {
      if (toks.slice(Math.max(0, i - 3), i).some(t => LC.c29.lead_ins.includes(t)) || led.has(i - 1)) led.add(i)
      else return 'not led in: ' + toks[i]
    }
  }
  return null
}
// live-v2 changes-5 c27: for each class, when the person's newest message (only that one) asks it (a word of asks, or
// the whole message one of asks_whole), the reply must hold a word of gives. Returns the failed class ids, in order.
// whole: as check_c5.py's whole(): lower case, end marks and spaces cut, then ok, okay, so, and, cool, right in front.
// A word: not next to a letter or an apostrophe (check_c5.py's hasw).
const c27Whole = t => String(t).toLowerCase().trim().replace(/[?.! ]+$/, '').replace(/^(?:(?:ok|okay|so|and|cool|right)\b[ ,]*)+/, '').trim()
const c27Has = (t, w) => new RegExp("(^|[^a-z'])" + liveEsc(w.toLowerCase()) + "($|[^a-z'])").test(String(t).toLowerCase())
// live changes-7 (c27.apostrophes): curly apostrophes in the message and in the reply are read as straight ones
const c27Apos = s => String(s).replace(/[\u2018\u2019]/g, "'")
export function c27Fails(reply, message) {
  reply = c27Apos(reply)
  message = c27Apos(message)
  const w = c27Whole(message)
  return LC.c27.filter(c => ((c.asks || []).some(x => c27Has(message, x)) || (c.asks_whole || []).includes(w)) && !c.gives.some(g => c27Has(reply, g))).map(c => c.id)
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
