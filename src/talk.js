// How Helper answers, as plain code: hhcontent's order of steps (content/helper-talk-v2.md
// section 2.1, changes-7 and changes-8) ported from the team's route2.py, reading hhcontent's data
// (src/talk-data.js, made by the build from content/helper-talk-v2.json). No React, no storage of
// its own, and no AI step: nothing here sends anything anywhere.
// tests/talk.test.mjs replays every conversation route2.py itself ran and must get the same result
// at every turn, the stored record included.
//   freshVisit(stage, kept)       what Helper knows in this visit: the stage of the opening, the
//                                 open question, what was asked and found, the name and what the
//                                 person does, and `kept`, the stored record (the only part the page
//                                 writes to storage, src/kept.js).
//   turn(text, visit)             a typed message -> a result { kind, ... }
//   pick, pickTopic, press, skip, sayLine, change, rmPick, forgetAnswer   what the person picks or presses
//   lineFor(result, visit, typed, opts)   the result as the line Helper says, its answers, its button
//                                 and the small faint lines under it
// What is kept follows hhcontent's fixed rules (JSON keeps, content/helper-keeps-v1.md): no model
// and no question decides it. Typed "what do you know about me", "forget my name" and "forget
// everything" (keeps.typed, A1, A2, A4) are not in route2.py; they are ported from hhtech's
// settings_step and hhcontent's changes-8 rule, and come straight after the remember step.
import { TALK_DATA } from './talk-data.js'
import { looksLikeKey } from './key-check.js'

const TOPICS = Object.fromEntries(TALK_DATA.topics.map(t => [t.id, t]))
const TOPIC_IDS = TALK_DATA.topics.map(t => t.id)
const TERMS = Object.fromEntries(TALK_DATA.terms.map(t => [t.id, t]))
const TERM_IDS = TALK_DATA.terms.map(t => t.id)
const BUILD = TALK_DATA.build
const OPENING = TALK_DATA.opening
const FIXED = TALK_DATA.fixed
const KEEPS = TALK_DATA.keeps
const KEEP_REMEMBER = KEEPS.remember
const KEEP_TYPED = KEEPS.typed
const TOPIC_ASKS = TALK_DATA.asks_for_topics
const TOPIC_PICKS = Object.fromEntries(TALK_DATA.topic_picks.map(p => [p.gives, p]))
const SKILL_NAMES = new Map(TALK_DATA.skills.map(s => [s.name, s]))
const NAME_FLAGS = OPENING.pattern_flags || 'iu'
const NAME_STRONG = new RegExp(OPENING.name_strong_pattern, NAME_FLAGS)
const NAME_WEAK = new RegExp(OPENING.name_weak_pattern, NAME_FLAGS)

/* ---------- matching (the same rules as route2.py: norm, hit, which, starts, cut_ignored) ---------- */
// Lower case, curly quotes to straight ones, spaces squeezed.
export function talkNorm(s) {
  return String(s).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim()
}
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordRes = new Map()
// A key word matches with no letter a to z and no digit directly before or after it.
function wordRe(p, flags = '') {
  const key = flags + '\u0000' + p
  if (!wordRes.has(key)) wordRes.set(key, new RegExp('(^|[^a-z0-9])' + escapeRe(p) + '($|[^a-z0-9])', flags))
  return wordRes.get(key)
}
const hits = (t, p) => wordRe(p).test(t)
const whichOf = (t, list) => list.filter(p => hits(t, p))
// A start counts when it is the whole message, or the next character is not a to z, 0 to 9 or '.
const startsWith = (t, list) => list.some(p => t === p || (t.startsWith(p) && /[^a-z0-9']/.test(t[p.length])))
function cutIgnored(t) {
  for (const p of TALK_DATA.ignore_phrases) t = t.replace(wordRe(p, 'g'), '$1 $2')
  return talkNorm(t)
}
// Python's str.split() and len(): words split on any space, length in characters (not UTF-16 units).
const typedWords = s => String(s).trim().split(/\s+/).filter(Boolean)
const charCount = s => Array.from(s).length
const capFirst = s => {
  const chars = Array.from(s)
  return chars.length ? chars[0].toUpperCase() + chars.slice(1).join('') : s
}

export function buildHit(text) {
  const t = cutIgnored(talkNorm(text)) // the ignore phrases are cut before this step too
  if (startsWith(t, BUILD.skip_starts) || whichOf(t, BUILD.how_phrases).length) return null // a question about how is never a request
  const w = whichOf(t, BUILD.build_words)
  if (w.length) return w[0]
  const pair = BUILD.build_pair
  const doing = whichOf(t, pair.and_one_of)
  if (hits(t, pair.must_have) && doing.length) return pair.must_have + ' + ' + doing[0]
  return null
}
const questionForm = t => t.includes('?') || startsWith(t, OPENING.question_starts)
function strongTopics(t) {
  let ids = TOPIC_IDS.filter(k => whichOf(t, TOPICS[k].key_words.concat(TOPICS[k].misspellings)).length)
  if (whichOf(t, TALK_DATA.chat_apps).length) ids = ids.filter(k => k !== 'svc')
  return ids
}
const anyTerm = t => TERM_IDS.some(k => whichOf(t, TERMS[k].key_words).length)
function needsFor(t, topic, answering) {
  let ns = TOPICS[topic].needs.filter(n => whichOf(t, n.key_words).length && (answering || !n.only_when_answering))
  if (ns.length > 1) ns = ns.filter(n => !n.only_if_no_other_need)
  return ns.map(n => n.id)
}

// Steps 4 and 5: the topic and the need, by key words.
function byCode(text, st) {
  const t = cutIgnored(talkNorm(text))
  const strong = strongTopics(t)
  const r = { topic: null, need: null, term: null, several: null, strong_one: strong.length === 1 }
  if (strong.length > 1) {
    r.several = strong
    return r
  }
  if (strong.length === 1) r.topic = strong[0]
  else {
    if (!st.pending || questionForm(t)) {
      const terms = TERM_IDS.filter(k => whichOf(t, TERMS[k].key_words).length)
      if (terms.length === 1) {
        r.term = terms[0]
        return r
      }
      if (terms.length > 1) {
        r.several = terms
        return r
      }
    }
    if (st.pending) r.topic = st.pending
    else {
      let weak = TOPIC_IDS.filter(k => whichOf(t, TOPICS[k].weak_key_words).length)
      if (whichOf(t, TALK_DATA.chat_apps).length) weak = weak.filter(k => k !== 'svc')
      // such a topic's weak words count only in a question that names Hermes
      if (!(questionForm(t) && whichOf(t, TALK_DATA.hermes_words).length)) weak = weak.filter(k => !TOPICS[k].weak_only_in_question_about_hermes)
      if (weak.length === 1) r.topic = weak[0]
    }
  }
  const topic = r.topic
  if (topic) {
    const answering = st.pending === topic
    const ns = needsFor(t, topic, answering)
    const unsure = whichOf(t, TALK_DATA.unsure_words).length > 0
    if (ns.length === 1) r.need = ns[0]
    else if (!ns.length) {
      if (topic === 'svc' && answering && !strong.length && !unsure && !t.includes('?')) r.need = 'svc1'
      else if (st.found[topic] && !unsure) r.need = st.found[topic]
    }
  }
  return r
}

/* ---------- the visit ---------- */
// stage: 'name' (Helper asked "What's your name?"), 'work' ("What do you do?"), 'open'.
// pending: the topic whose question is open. asked: topics whose question was asked in this visit.
// found: { topic: need } shown in this visit. lastq: Helper's last line was a question.
// service: the service last named, for the text to paste. kept: the stored record (keeps.storage).
// rmText: the message that led to "Do you mean me, or your own Hermes?", for the answer to it.
export function freshVisit(stage = 'open', kept = {}) {
  return { stage, pending: null, found: {}, asked: [], lastq: false, name: null, work: null, service: null, kept, rmText: null }
}
// A later visit: only the stored record is carried over. A kept name means the opening's two
// questions are not asked again (content/helper-keeps-v1.md section 4).
export const laterVisit = kept => freshVisit(kept && kept.name ? 'open' : 'name', kept || {})

/* ---------- what Helper keeps (route2.py: keep, keep_typed, kept_need, remember) ---------- */
// Writes one thing into the visit's record, and notes on the result that the faint kept line must
// show (and the first-time line, once). The page writes the record to storage after every turn.
function keep(st, out, key, value) {
  if (key === 'asked') st.kept.asked = [...(st.kept.asked || []), value]
  else st.kept[key] = value
  out.kept = [...(out.kept || []), key]
  if (!st.kept.told) {
    st.kept.told = true
    out.first = true
  }
}

// Rule 2: an answer typed to Helper's own open question, found by code's words.
function keepTyped(t, topic, need, st, out) {
  const A = KEEPS.answers
  if (t.includes('?') || !A[topic]) return
  const unsure = whichOf(t, TALK_DATA.unsure_words).length > 0
  if (topic === 'mod') {
    const v = A.mod.values.find(x => x.need === need)
    if (v && whichOf(t, v.typed_words).length && !(unsure && v.typed_not_with_unsure_words)) keep(st, out, 'mod', need)
  } else if (!unsure && !(topic === 'svc' && need !== 'svc1') && !(topic === 'msg' && need === 'msg3')) {
    const names = new Set(Object.entries(A[topic].names).filter(([w]) => hits(t, w)).map(([, n]) => n))
    if (names.has('Google Calendar')) names.delete('Google')
    if (names.size === 1) keep(st, out, topic, [...names][0])
  }
}

// keeps.use: the need a kept answer gives for this topic, or null.
export function keptNeed(topic, st) {
  const k = st.kept
  if (topic === 'mod') return k.mod || null
  if (topic === 'msg' && k.msg) return k.msg === 'Telegram' ? 'msg1' : 'msg2'
  if (topic === 'svc' && k.svc) return 'svc1'
  return null
}
// A row shown from what is kept: for a service, the kept one fills the text to paste.
function fromKept(topic, st) {
  const need = keptNeed(topic, st)
  st.found[topic] = need
  if (topic === 'svc') st.service = st.kept.svc
  return { kind: 'row', topic, need, used: 'kept' }
}

function stripLead(t) {
  const leads = [...KEEP_REMEMBER.lead_ins].sort((a, b) => b.length - a.length)
  let again = true
  while (again) {
    again = false
    for (const p of leads) {
      if (t !== p && startsWith(t, [p])) {
        t = t.slice(p.length).replace(/^[ ,.:]+/, '')
        again = true
      }
    }
  }
  return t
}

// Step 1 b: "remember that ..." said to Helper. Returns out, or null when the message is not for
// this step.
function remember(text, st, out) {
  if (st.pending === 'mem') return null // there the message is the answer about Hermes
  const raw = Array.from(String(text).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim())
  const t = stripLead(talkNorm(text))
  const rawT = t ? raw.slice(raw.length - charCount(t)).join('') : ''
  const starts = [...KEEP_REMEMBER.request_starts].sort((a, b) => b.length - a.length)
  const start = starts.find(p => t.startsWith(p) && (p.endsWith(':') || t.length === p.length || !/[a-z0-9']/.test(t[p.length])))
  if (start && !t.includes('?')) {
    const cut = KEEP_REMEMBER.thing_starts_at_last_word.includes(start) ? 'remember '.length : start.length
    const thing = Array.from(rawT).slice(cut).join('').replace(/^[\s:,-]*(?:that\b)?[\s:,-]*/i, '').trim()
    const n = typedWords(thing).length
    const lim = KEEP_REMEMBER.limits
    const asked = st.kept.asked || []
    if (n < lim.min_words) out.kind = 'RM3'
    else if (whichOf(talkNorm(thing), KEEP_REMEMBER.refuse.words).length || new RegExp(KEEP_REMEMBER.refuse.digits_pattern).test(thing)) out.kind = 'RM6'
    else if (n > lim.max_words || charCount(thing) > lim.max_chars) out.kind = 'RM5'
    else if (asked.includes(thing)) out.kind = 'RM1'
    else if (asked.length >= lim.max_things) out.kind = 'RM4'
    else {
      keep(st, out, 'asked', thing)
      out.kind = 'RM1'
      out.thing = thing
    }
    return out
  }
  const U = KEEP_REMEMBER.unsure
  const tc = cutIgnored(talkNorm(text))
  if (!st.lastq && whichOf(tc, U.about).length && whichOf(tc, U.said_to).length && !whichOf(tc, TALK_DATA.hermes_words).length) {
    out.kind = 'RM2'
    st.lastq = true
    st.rmText = text
    return out
  }
  return null
}

// Step 1 b, second half (keeps.typed): "what do you know about me" (A1), "forget my name" and the
// like (A2, one kind of thing), "forget everything" (A4). Whole phrases, no model. A2 and A4 are
// skipped for a question about Hermes (not_when, changes-8). Returns { kind, what } or null.
export function typedAboutKept(text) {
  const t = talkNorm(text)
  let s = null
  if (whichOf(t, KEEP_TYPED.see.key_words).length) s = { kind: 'A1' }
  else {
    for (const [what, words] of Object.entries(KEEP_TYPED.forget_one.key_words)) {
      if (whichOf(t, words).length) {
        s = { kind: 'A2', what }
        break
      }
    }
    if (!s && whichOf(t, KEEP_TYPED.forget_all.key_words).length) s = { kind: 'A4' }
  }
  if (s && (s.kind === 'A2' || s.kind === 'A4')) {
    const nw = KEEP_TYPED.not_when
    if (questionForm(t) && (whichOf(t, nw.hermes_words).length || (whichOf(t, nw.it_words).length && !whichOf(t, nw.helper_words).length))) return null
  }
  return s
}
export const hasKeptValues = kept => ['name', 'mod', 'msg', 'svc'].some(k => kept[k]) || (kept.asked || []).length > 0
// What A1, A2 and A4 do to the visit: A1 answers at once, A2 and A4 ask for a Yes first, and
// there is nothing to ask about when nothing like that is kept.
function aboutKept(s, st) {
  st.pending = null
  st.lastq = false
  if (s.kind === 'A1') return { kind: 'A1' }
  const there = s.kind === 'A4' ? hasKeptValues(st.kept) : s.what === 'asked' ? (st.kept.asked || []).length > 0 : !!st.kept[s.what]
  if (!there) return { kind: 'A-none' }
  st.lastq = true
  return s.kind === 'A4' ? { kind: 'A4' } : { kind: 'A2', what: s.what }
}

// changes-7: the topics show only when the person asks what they can ask (line TP).
const TP_CUTS = ['hey', 'hi', 'hello', 'ok', 'okay', 'so', 'helper', 'and']
export function asksTopics(text) {
  let t = talkNorm(text)
  let again = true
  while (again) {
    again = false
    for (const p of TP_CUTS) {
      if (t !== p && startsWith(t, [p])) {
        t = t.slice(p.length).replace(/^[ ,.:!]+/, '')
        again = true
      }
    }
  }
  t = t.replace(/[ ?!.]+$/, '') || t
  if (!(TOPIC_ASKS.whole_message.includes(t) || whichOf(t, TOPIC_ASKS.phrases).length)) return false
  const tc = cutIgnored(t)
  return !(strongTopics(tc).length || anyTerm(tc))
}

// changes-7: N1a, a skill named in a clear pattern and on no official list; N1b, a left-out skill;
// N1, everything else. null: an official skill named that way.
const SKILL_PATTERNS = [/skills? (?:called|named) "?([a-z0-9][a-z0-9 -]{0,40}?)"?(?=$|[^a-z0-9 -])/, /"([a-z0-9][a-z0-9 -]{0,40})" skills?/]
export function dontKnow(text) {
  const t = talkNorm(text)
  for (const p of SKILL_PATTERNS) {
    const m = p.exec(t)
    if (m) {
      const n = m[1].trim().replace(/ /g, '-')
      if (!SKILL_NAMES.has(n)) return 'N1a'
      if (SKILL_NAMES.get(n).left_out) return 'N1b'
      return null
    }
  }
  return 'N1'
}

function codeName(text, strongOnly = false) {
  let m = NAME_STRONG.exec(text)
  if (m) return capFirst(m[1])
  if (strongOnly) return null
  m = NAME_WEAK.exec(text)
  if (m && !OPENING.not_a_name.includes(m[1].toLowerCase())) return capFirst(m[1])
  const ws = text.match(/[^\s,.]+/g) || []
  if (ws.length >= 1 && ws.length <= OPENING.short_answer_max_words && !text.includes('?') && !/\p{Nd}/u.test(text) && !ws.some(w => OPENING.not_a_name.includes(w.toLowerCase())))
    return Array.from(capFirst(ws.join(' '))).slice(0, OPENING.name_max_chars).join('')
  return null
}

// A reply to "What's your name?" that holds a name and a question of its own: [name, the rest], or [null, null].
function nameWithMore(text) {
  const more = OPENING.name_with_more
  let m = NAME_STRONG.exec(text)
  if (!m) {
    m = NAME_WEAK.exec(text)
    if (m) {
      const w = m[1]
      const after = text.slice(m.index + m[0].length).toLowerCase()
      if (!(/^\p{Lu}/u.test(w) && !OPENING.not_a_name.includes(w.toLowerCase()) && more.after_name.some(a => after.startsWith(a)))) m = null
    }
  }
  if (!m) return [null, null]
  const rest = text.slice(m.index + m[0].length).replace(/^(?:[\s,.!:]+|and\b|here\b)+/i, '')
  const rt = cutIgnored(talkNorm(rest))
  if (!rt) return [null, null]
  const hasKey = strongTopics(rt).length > 0 || anyTerm(rt)
  return questionForm(rt) || (hasKey && !startsWith(rt, more.self_starts)) ? [capFirst(m[1]), rest] : [null, null]
}

// The service a "named service" line is about, for its text to paste: the picked answer's own, the
// name of the first of the need's key words that is in the message (the list has the longest
// first), the message itself when it was the answer to "Which service?", or the one named earlier
// in this visit.
function serviceIn(text, st, answered) {
  const need = TOPICS.svc && TOPICS.svc.needs.find(n => n.id === 'svc1')
  if (!need) return st.service
  const t = cutIgnored(talkNorm(text))
  const word = need.key_words.find(p => hits(t, p))
  if (word && need.service_names && need.service_names[word]) return need.service_names[word]
  if (answered && text.trim()) return Array.from(text.trim()).slice(0, TALK_DATA.limits.service_chars_in_paste).join('')
  return st.service
}

// One typed message -> a result. The order of steps is route2.py's turn(), with no model.
export function turn(text, st) {
  const out = {}
  const done = (kind, more = {}) => {
    Object.assign(out, { kind }, more)
    st.lastq = kind === 'question' || kind === 'W1'
    if (kind !== 'question' && kind !== 'K1') st.pending = null
    return out
  }
  // 1. a key
  if (looksLikeKey(text)) {
    out.kind = 'K1'
    return out
  }
  // 1 b. a request to Helper to remember something; then what Helper keeps, asked about by typing
  if (remember(text, st, out)) return out
  const about = typedAboutKept(text)
  if (about) return Object.assign(out, aboutKept(about, st))
  // 1 c. the person asks what they can ask
  if (asksTopics(text)) {
    st.stage = 'open'
    st.pending = null
    st.lastq = false
    out.kind = 'TP'
    return out
  }
  // 2. a request to do it
  const built = buildHit(text)
  if (built) {
    st.stage = 'open'
    return done('H1', { why: built })
  }
  const t = cutIgnored(talkNorm(text))
  // 3. the opening
  if (st.stage === 'name' || st.stage === 'work') {
    let name = null
    let ordinary
    if (st.stage === 'name') {
      const [taken, rest] = nameWithMore(text)
      const both = taken !== null
      if (both) {
        // name and question in one message: take the name, answer the rest. The opening ends
        // here, so the name is kept now (keeps rule 1).
        st.name = taken
        out.name_taken = taken
        text = rest
        keep(st, out, 'name', taken)
      }
      name = both ? null : codeName(text, true)
      ordinary = both || (!name && (strongTopics(t).length > 0 || anyTerm(t) || questionForm(t)))
      if (!name && !ordinary) name = codeName(text)
    } else ordinary = questionForm(t)
    if (!ordinary) {
      let work = null
      const n = typedWords(text).length
      if (st.stage === 'work' && n >= 1 && n <= OPENING.work_max_words) work = text.trim()
      st.name = name || st.name
      st.work = work
      if (work || st.stage === 'work') {
        st.stage = 'open'
        // the name is kept now; what the person does is used for this visit only, never kept
        if (st.name) keep(st, out, 'name', st.name)
        return done('F2', { name: st.name, work })
      }
      st.stage = 'work'
      return done('F1', { name: st.name })
    }
    st.stage = 'open'
    st.lastq = false
  }
  // a skill named in a clear pattern is looked up before the terms
  const dk = dontKnow(text)
  if (dk === 'N1a' || dk === 'N1b') return done(dk)
  // 4 and 5. the topic and the need, by key words
  const code = byCode(text, st)
  out.code = code
  const { topic, need, several } = code
  if (code.term) return done('term', { term: code.term })
  // 7. the first that fits
  if (topic && need) {
    const answered = st.pending === topic
    // keeps rule 2: only an answer to Helper's own open question, and only when code found it
    if (answered) keepTyped(t, topic, need, st, out)
    st.found[topic] = need
    if (topic === 'svc') st.service = serviceIn(text, st, answered)
    return done('row', { topic, need })
  }
  if (several) return done('W1', { buttons: several.slice(0, TALK_DATA.answers.max_at_once) })
  // keeps.use: something is kept for this topic, so its question is not asked
  if (topic && keptNeed(topic, st)) {
    const r = fromKept(topic, st)
    return done('row', { topic: r.topic, need: r.need, used: 'kept' })
  }
  if (topic && !st.lastq && !st.asked.includes(topic)) {
    st.asked.push(topic)
    const r = done('question', { topic })
    st.pending = topic
    return r
  }
  if (topic) return done('plain', { topic })
  return done(dontKnow(text) || 'skill by name')
}

/* ---------- what the person picks or presses ---------- */
// An answer picked under a topic question: its need's row at once. No key words, no model. A
// picked answer to one of the three questions is kept (keeps rule 2).
export function pick(topic, i, st) {
  const a = TOPICS[topic].question.answers[i]
  st.found[topic] = a.gives
  st.pending = null
  st.lastq = false
  if (a.service) st.service = a.service
  const out = { kind: 'row', topic, need: a.gives }
  if (topic === 'mod') keep(st, out, 'mod', a.gives)
  else if (topic === 'msg' && (a.gives === 'msg1' || a.gives === 'msg2')) keep(st, out, 'msg', a.label)
  else if (topic === 'svc' && a.service) keep(st, out, 'svc', a.service)
  return out
}

// A topic picked under TP or C1. A pick that holds several topics: line C1. Else the kept row, the
// topic's question if not asked yet, or its plain line.
export function pickTopic(topic, st) {
  const held = TOPIC_PICKS[topic]
  if (held && held.holds) {
    st.pending = null
    st.lastq = false
    return { kind: held.line, buttons: held.holds }
  }
  if (keptNeed(topic, st)) {
    const r = fromKept(topic, st)
    st.pending = null
    st.lastq = false
    return r
  }
  if (!st.asked.includes(topic) && !st.lastq) {
    st.asked.push(topic)
    st.pending = topic
    st.lastq = true
    return { kind: 'question', topic }
  }
  st.pending = null
  st.lastq = false
  return { kind: 'plain', topic }
}

// The link "Change" beside "From what I keep": the topic's question is asked again. A question
// still open is dropped for it.
export function change(topic, st) {
  if (!st.asked.includes(topic)) st.asked.push(topic)
  st.pending = topic
  st.lastq = true
  return { kind: 'question', topic }
}

// A button under "Which one do you mean?", with the message that led to it.
export function press(choice, text, st) {
  st.lastq = false
  if (TERMS[choice]) return { kind: 'term', term: choice }
  const ns = needsFor(cutIgnored(talkNorm(text)), choice, false)
  if (ns.length !== 1) return { kind: 'plain', topic: choice }
  st.found[choice] = ns[0]
  if (choice === 'svc') st.service = serviceIn(text, st, false)
  return { kind: 'row', topic: choice, need: ns[0] }
}

// An answer under "Do you mean me, or your own Hermes?" (RM2): 'helper' or 'hermes'.
export function rmPick(who, st) {
  st.lastq = false
  if (who === 'helper') return { kind: 'RM3' }
  return press('mem', st.rmText || '', st)
}

// Skip, at "What's your name?" or "What do you do?". A name given before Skip is kept now.
export function skip(st) {
  if (st.stage !== 'name' && st.stage !== 'work') return null
  st.stage = 'open'
  st.lastq = false
  st.pending = null
  const out = { kind: 'F3' }
  if (st.name) keep(st, out, 'name', st.name)
  return out
}

// A button that makes Helper say one more pre-written line.
export function sayLine(line, st) {
  st.lastq = false
  st.pending = null
  return { kind: 'extra', line }
}

// "See what I keep" pressed where Helper's settings page cannot open: the list, as for A1.
export const seeKept = st => aboutKept({ kind: 'A1' }, st)
// "Delete all of it" under that list: the A4 question.
export const askForgetAll = st => aboutKept({ kind: 'A4' }, st)

// Yes or No under "Delete your name?" (what: name, mod, msg, svc, asked) or "Delete everything I
// keep about you?" (what: 'all'). Yes deletes from the visit's record; the page then writes it.
// When nothing is left, the whole record goes, told as well (keeps.storage), so the first-time
// line shows again at the next keep. A forgotten name is not used again in this visit either.
export function forgetAnswer(what, yes, st) {
  st.lastq = false
  st.pending = null
  if (!yes) return { kind: 'A-no', what }
  if (what !== 'all') delete st.kept[what]
  if (what === 'all' || !hasKeptValues(st.kept)) for (const k of Object.keys(st.kept)) delete st.kept[k]
  if (what === 'all' || what === 'name') st.name = null
  return { kind: 'A-yes', what }
}

/* ---------- from a result to what Helper says ---------- */
const fillSlots = (text, slots) => text.replace(/\{(\w+)\}/g, (m, k) => (slots[k] != null ? String(slots[k]) : m))

// Hermes's own screens a "part" button opens: the address, and the name the button's label takes.
// Each address ran in Hermes Desktop v0.23.0 (docs/build/talk-v1-stage1.md). Bots has no address:
// a line that would end in "Open Bots" gets no button; in its place Helper says the data's line
// about where that tab is. A part that is not listed here gets nothing.
export const PARTS = {
  model: { name: 'Model', to: TALK_DATA.parts.model.navigate },
  messaging: { name: 'Messaging', to: TALK_DATA.parts.messaging.navigate },
  capabilities: { name: 'Capabilities', to: '/capabilities' },
  bots: { name: 'Bots', where: TALK_DATA.parts.bots.where_line }
}

// The lines a button can make Helper say: [id]: { text, source }.
export const EXTRA_LINES = (() => {
  const lines = {}
  const take = next => {
    if (next && next.kind === 'line') lines[next.id] = { id: next.id, text: next.text, source: next.source }
  }
  for (const t of TALK_DATA.topics) {
    take(t.plain.next)
    t.needs.forEach(n => take(n.next))
  }
  TALK_DATA.terms.forEach(t => take(t.next))
  return lines
})()

// The button under a line. topic: whose part a plain "Open ..." button means.
function nextFor(next, topic, st) {
  if (!next || next.kind === 'none') return null
  if (next.kind === 'paste') {
    const text = fillSlots(next.paste_text, { service: st.service })
    return /\{\w+\}/.test(text) ? null : { kind: 'paste', label: next.label, text }
  }
  if (next.kind === 'line') return { kind: 'line', label: next.label, line: next.id }
  if (next.kind === 'part') {
    let id = next.part || (topic && TOPICS[topic].part)
    // Helper's own page has no Memory part: the topic names the part to use instead.
    if (!PARTS[id] && topic && TOPICS[topic].part_if_no_memory_part) id = TOPICS[topic].part_if_no_memory_part
    const part = PARTS[id]
    if (!part) return null
    if (part.where) return { kind: 'where', line: part.where.id, text: part.where.text, source: part.where.source }
    return { kind: 'part', label: fillSlots(next.label, { part: part.name }), to: part.to }
  }
  return null
}

const topicPicks = () => ({ kind: 'topics', hint: TALK_DATA.answers.hint_under_topics, items: TALK_DATA.topic_picks.map(p => ({ id: p.gives, label: p.label, topic: p.gives })) })
const labelOf = id => (TOPICS[id] ? TOPICS[id].pick.label : TERMS[id].label)
const yesNo = (answers, what) => ({ kind: 'question', hint: TALK_DATA.answers.hint_under_question, items: answers.map(a => ({ id: `forget-${what}-${a.gives}`, label: a.label, forget: [what, a.gives === 'yes'] })) })

// The words for one kept thing (keeps.things[].kept_words): "Peter", "you pay for ChatGPT",
// "you use WhatsApp", "you use Gmail", or the thing as asked.
export function keptWords(key, value) {
  if (key === 'mod') {
    const v = KEEPS.answers.mod.values.find(x => x.need === value)
    return v ? v.value : String(value)
  }
  const thing = KEEPS.things.find(x => x.id === key)
  return fillSlots(thing ? thing.kept_words : '{value}', { name: value, app: value, service: value, thing: value, value })
}
// The rows of the list behind "See what I keep" (keeps.tell.see.rows), in their order.
export function keptRows(kept) {
  const R = KEEPS.tell.see.rows
  const rows = []
  if (kept.name) rows.push(fillSlots(R.name, { name: kept.name }))
  if (kept.mod) rows.push(fillSlots(R.mod, { value: keptWords('mod', kept.mod) }))
  if (kept.msg) rows.push(fillSlots(R.msg, { app: kept.msg }))
  if (kept.svc) rows.push(fillSlots(R.svc, { service: kept.svc }))
  for (const t of kept.asked || []) rows.push(fillSlots(R.asked, { thing: t }))
  return rows
}
// The faint line at every keep: "Kept: Peter." Values kept in the same moment share one line, each
// ending with a full stop. The first time anything is kept, the first-time line goes under it
// (the version for a build with no AI step).
function keptNote(result, st) {
  if (!result.kept || !result.kept.length) return null
  const words = result.kept.map(k => (k === 'asked' ? result.thing : keptWords(k, st.kept[k])))
  return { text: fillSlots(KEEPS.tell.kept_line, { kept_words: words.join('. ') }), link: KEEPS.tell.link.words, first: result.first ? KEEPS.tell.first_time_if_no_model_call : null }
}

// The opening line. On a later visit with a kept name, the opening's question is not asked: the
// same line without it (the data has no line of its own for a later visit: Questions for Lead).
export function openingLine(st = null) {
  const said = { line: 'OPEN', text: FIXED.OPEN.text, source: null, answers: null, next: null, paste: null, note: null, used: null, hint: null, rows: null }
  if (st && st.stage === 'open') return { ...said, line: 'OPEN-again', text: FIXED.OPEN.text.replace(/\s*[^.?]*\?\s*$/, '') }
  return said
}

// result: what turn, pick, pickTopic, press, skip, sayLine, change, rmPick or forgetAnswer
// returned. typed: the person's words (for the text to paste under "your own Hermes can").
// opts.settingsPage: Helper's page in Hermes's Settings exists (A1 then offers it).
// Returns { line, text, source, answers, next, paste, note, used, hint, rows }:
//   note: the faint "Kept: ..." line { text, link, first }; used: "From what I keep: ..." { text,
//   link, topic }; hint: a small faint line (N_HINT); rows: the list of kept things (A1).
export function lineFor(result, st, typed = '', opts = {}) {
  const said = (line, text, more = {}) => ({ line, text, source: null, answers: null, next: null, paste: null, note: keptNote(result, st), used: null, hint: null, rows: null, ...more })
  const named = f => (st.name ? fillSlots(f.text, { name: st.name }) : f.text_no_name || f.text)
  const dontKnowLine = id => said(id, FIXED[id].text, { hint: FIXED.N_HINT.text })
  const RM = Object.fromEntries(KEEP_REMEMBER.lines.map(l => [l.id, l]))
  const ONE = KEEP_TYPED.forget_one
  const ALL = KEEPS.tell.see.delete_all
  switch (result.kind) {
    case 'K1':
      return said('K1', FIXED.K1.text)
    case 'H1': {
      const request = Array.from(String(typed).trim()).slice(0, TALK_DATA.limits.request_chars_in_paste).join('').replace(/"/g, "'")
      return said('H1', FIXED.H1.text, { paste: fillSlots(FIXED.H1.paste_text, { request }) })
    }
    case 'F1':
      return said('F1', named(FIXED.F1))
    case 'F2':
      return said('F2', named(FIXED.F2))
    case 'F3':
      return said('F3', FIXED.F3.text)
    case 'TP':
      return said('TP', FIXED.TP.text, { answers: topicPicks() })
    case 'N1':
    case 'N1a':
    case 'N1b':
      return dontKnowLine(result.kind)
    case 'skill by name':
      // an official skill asked about by its name: the skills by name are row 5 of the plan
      return { ...dontKnowLine('N1'), line: 'N1-skill' }
    case 'W1':
      return said('W1', FIXED.W1.text, { answers: { kind: 'which', hint: TALK_DATA.answers.hint_under_question, items: result.buttons.map(id => ({ id, label: labelOf(id), which: id })) } })
    case 'term': {
      const t = TERMS[result.term]
      return said('term-' + t.id, t.text, { source: t.source, next: nextFor(t.next, null, st) })
    }
    case 'question': {
      const q = TOPICS[result.topic].question
      const answers = q.answers.length ? { kind: 'question', hint: TALK_DATA.answers.hint_under_question, items: q.answers.map((a, i) => ({ id: `${result.topic}-${i}`, label: a.label, answer: [result.topic, i] })) } : null
      return said(q.id, q.text, { answers })
    }
    case 'plain': {
      const p = TOPICS[result.topic].plain
      return said(p.id, p.text, { source: p.source, next: nextFor(p.next, result.topic, st) })
    }
    case 'row': {
      const n = TOPICS[result.topic].needs.find(x => x.id === result.need)
      const used = result.used === 'kept' ? { text: fillSlots(KEEPS.use.used_line, { kept_words: keptWords(result.topic, st.kept[result.topic]) }), link: KEEPS.use.used_link.words, topic: result.topic } : null
      return said(n.id, n.text, { source: n.source, next: nextFor(n.next, result.topic, st), used })
    }
    case 'extra': {
      const x = EXTRA_LINES[result.line]
      return said(x.id, x.text, { source: x.source })
    }
    case 'RM1':
    case 'RM3':
    case 'RM4':
    case 'RM5':
    case 'RM6':
      return said(result.kind, RM[result.kind].text)
    case 'RM2':
      return said('RM2', RM.RM2.text, { answers: { kind: 'question', hint: TALK_DATA.answers.hint_under_question, items: RM.RM2.answers.map(a => ({ id: `rm-${a.gives}`, label: a.label, rm: a.gives === 'RM3' ? 'helper' : 'hermes' })) } })
    case 'A1': {
      const rows = keptRows(st.kept)
      if (!rows.length) return said('A1-none', KEEPS.tell.see.see_line_nothing)
      // with Helper's settings page: its button, and under the list the way there by hand
      const next = opts.settingsPage ? { kind: 'settings', label: KEEPS.after_settings_page_exists.button_under_see } : { kind: 'forget-all', label: ALL.label }
      return said('A1', KEEPS.tell.see.see_line, { rows, next, hint: opts.settingsPage ? KEEPS.after_settings_page_exists.by_hand : null })
    }
    case 'A2':
      return said('A2-' + result.what, ONE.questions[result.what], { answers: yesNo(ONE.answers, result.what) })
    case 'A4':
      return said('A4', ALL.question, { answers: yesNo(ALL.answers, 'all') })
    case 'A-none':
      return said('A-none', ONE.nothing_kept)
    case 'A-yes':
      return said('A-yes', result.what === 'all' ? ALL.after_yes : ONE.after_yes)
    case 'A-no':
      return said('A-no', result.what === 'all' ? ALL.after_no : ONE.after_no)
    default: {
      // a line that shows the topics it holds ("What Hermes can do")
      const f = FIXED[result.kind]
      if (!f) return dontKnowLine('N1')
      return said(result.kind, f.text, { source: f.source || null, answers: { kind: 'pair', hint: TALK_DATA.answers.hint_under_topics, items: (result.buttons || []).map(id => ({ id, label: labelOf(id), topic: id })) } })
    }
  }
}

// The hint in the empty message box. With nothing to pick it is hhdesign's stand-in: the
// data has no words for it.
export const REPLY_HINT = 'Reply to Helper'
export const hintFor = entry => (entry && entry.answers && entry.answers.items.length ? entry.answers.hint : REPLY_HINT)
