// How Helper answers, as plain code: hhcontent's order of steps (content/helper-talk-v2.md
// section 2.1) ported from the team's route2.py, reading hhcontent's data (src/talk-data.js, made
// by the build from content/helper-talk-v2.json). No React, no storage, no model call of its own.
// tests/talk.test.mjs replays every conversation route2.py itself ran and must get the same
// result at every turn.
//   freshVisit(stage)             what Helper knows in this visit: the stage of the opening, the
//                                 open question, what was asked and found, the name and what the
//                                 person does. Kept in page memory only; nothing is written.
//   turn(text, visit, model)      a typed message -> a result { kind, ... }
//   turnWithModel(text, visit, ask)   the same steps when a model is asked on the way (async)
//   pick, pickTopic, press, skip, sayLine   what the person picks or presses
//   lineFor(result, visit, text)  the result as the line Helper says, its answers and its button
// Not here yet (row 1 of docs/build/talk-v1-plan.md): what Helper keeps between visits. route2.py
// has those steps (keep, keep_typed, kept_need, remember, change); the places they belong are
// marked "row 1" below.
import { TALK_DATA } from './talk-data.js'
import { looksLikeKey } from './key-check.js'

const TOPICS = Object.fromEntries(TALK_DATA.topics.map(t => [t.id, t]))
const TOPIC_IDS = TALK_DATA.topics.map(t => t.id)
const TERMS = Object.fromEntries(TALK_DATA.terms.map(t => [t.id, t]))
const TERM_IDS = TALK_DATA.terms.map(t => t.id)
const BUILD = TALK_DATA.build
const OPENING = TALK_DATA.opening
const FIXED = TALK_DATA.fixed
const TOPIC_PICKS = Object.fromEntries(TALK_DATA.topic_picks.map(p => [p.gives, p]))
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
const typedWords = s => String(s).trim().split(/\s+/).filter(Boolean)
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

// Section 4.3: the checks on a model's answer. All must pass, else null and code's own result is used.
export function checkModelAnswer(raw) {
  let s = String(raw ?? '').trim()
  const fenced = s.match(/^```[a-z]*\n([\s\S]*)\n```$/)
  if (fenced) s = fenced[1]
  let j
  try {
    j = JSON.parse(s)
  } catch {
    return null
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null
  if (TALK_DATA.model.fields.some(k => typeof j[k] !== 'string')) return null
  if (!TALK_DATA.model.topic_ids.includes(j.topic)) return null
  if (TOPICS[j.topic]) {
    if (j.need && !TOPICS[j.topic].needs.some(n => n.id === j.need)) return null
  } else if (j.need) return null
  if (j.name && !/^[\p{L}'-]{1,30}$/u.test(j.name)) return null
  if (j.work && (typedWords(j.work).length > OPENING.work_max_words || Array.from(j.work).length > OPENING.work_max_chars)) return null
  if (looksLikeKey(j.name) || looksLikeKey(j.work)) return null
  return j
}

/* ---------- the visit ---------- */
// stage: 'name' (Helper asked "What's your name?"), 'work' ("What do you do?"), 'open'.
// pending: the topic whose question is open. asked: topics whose question was asked in this visit.
// found: { topic: need } shown in this visit. lastq: Helper's last line was a question.
// service: the service last named, for the text to paste.
export function freshVisit(stage = 'open') {
  return { stage, pending: null, found: {}, asked: [], lastq: false, name: null, work: null, service: null }
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
// name for the first key word in the message (the list has the longest first), the message itself
// when it was the answer to "Which service?", or the one named earlier in this visit.
function serviceIn(text, st, answered) {
  const need = TOPICS.svc && TOPICS.svc.needs.find(n => n.id === 'svc1')
  if (!need) return st.service
  const t = cutIgnored(talkNorm(text))
  const word = need.key_words.find(p => hits(t, p))
  if (word && need.service_names && need.service_names[word]) return need.service_names[word]
  if (answered && text.trim()) return Array.from(text.trim()).slice(0, TALK_DATA.limits.service_chars_in_paste).join('')
  return st.service
}

// One typed message, as steps that stop where a model would be asked: the generator hands out the
// message and takes the model's raw answer back, so the same steps run with and without waiting.
function* turnSteps(text, st, hasModel) {
  const out = { calls: 0 }
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
  // (row 1: step 1 b, a request to Helper to remember something, comes here)
  // 2. a request to do it
  const built = buildHit(text)
  if (built) {
    st.stage = 'open'
    return done('H1', { why: built })
  }
  const t = cutIgnored(talkNorm(text))
  let mj = null
  let asked = false
  // 3. the opening
  if (st.stage === 'name' || st.stage === 'work') {
    let name = null
    let ordinary
    if (st.stage === 'name') {
      const [taken, rest] = nameWithMore(text)
      const both = taken !== null
      if (both) {
        // name and question in one message: take the name, answer the rest (row 1: the name is written here)
        st.name = taken
        out.name_taken = taken
        text = rest
      }
      name = both ? null : codeName(text, true)
      ordinary = both || (!name && (strongTopics(t).length > 0 || anyTerm(t) || questionForm(t)))
      if (!name && !ordinary) name = codeName(text)
    } else ordinary = questionForm(t)
    if (!ordinary) {
      let work = null
      const n = typedWords(text).length
      if (st.stage === 'work' && n >= 1 && n <= OPENING.work_max_words) work = text.trim()
      if (hasModel) {
        out.calls = 1
        asked = true
        mj = checkModelAnswer(yield text)
        if (mj) {
          name = name || mj.name || null
          if (mj.work) work = mj.work
          else if (mj.topic !== 'none' && !name) {
            // the model says it is a question after all
            work = null
            ordinary = true
          }
        }
      }
      if (!ordinary) {
        st.name = name || st.name
        st.work = work
        if (work || st.stage === 'work') {
          st.stage = 'open'
          // (row 1: the name and what the person does are written here)
          return done('F2', { name: st.name, work })
        }
        st.stage = 'work'
        return done('F1', { name: st.name })
      }
    }
    st.stage = 'open'
    st.lastq = false
  }
  // 4 and 5. the topic and the need, by key words
  const code = byCode(text, st)
  out.code = code
  let { topic, need, several } = code
  const answered = !!st.pending && st.pending === topic
  if (code.term) return done('term', { term: code.term })
  // 6. the model, when code did not find both. It is asked once per message.
  if (!(topic && need)) {
    if (hasModel && !asked) {
      out.calls = 1
      mj = checkModelAnswer(yield text)
    }
    if (mj && code.strong_one) {
      // a topic found by a full key word is final; the model may only add a need of that topic
      if (mj.topic === topic && mj.need) need = mj.need
    } else if (mj && mj.topic === 'build') {
      // a request the build words missed. Never for a how-question: then the answer is dropped
      if (!(startsWith(t, BUILD.skip_starts) || whichOf(t, BUILD.how_phrases).length)) {
        st.stage = 'open'
        return done('H1', { why: 'model: build' })
      }
    } else if (mj) {
      several = null
      if (TERMS[mj.topic]) return done('term', { term: mj.topic })
      topic = mj.topic === 'none' ? null : mj.topic
      need = mj.need || null
    }
  }
  // 7. the first that fits
  if (topic && need) {
    // (row 1: an answer typed to Helper's own open question is kept here)
    st.found[topic] = need
    if (topic === 'svc') st.service = serviceIn(text, st, answered && code.need === need)
    return done('row', { topic, need })
  }
  if (several) return done('W1', { buttons: several.slice(0, TALK_DATA.answers.max_at_once) })
  // (row 1: something kept for this topic is used here, and its question is not asked)
  if (topic && !st.lastq && !st.asked.includes(topic)) {
    st.asked.push(topic)
    const r = done('question', { topic })
    st.pending = topic
    return r
  }
  if (topic) return done('plain', { topic })
  return done('N1')
}

// model: null, or a function (text, visit) -> the model's raw answer, used at once (tests, and the
// scripted answers). A model that throws counts as no answer.
export function turn(text, st, model = null) {
  const steps = turnSteps(text, st, !!model)
  let step = steps.next()
  while (!step.done) {
    let raw
    try {
      raw = model(step.value, st)
    } catch {
      raw = undefined
    }
    step = steps.next(raw)
  }
  return step.value
}

// ask: an async function (text, visit) -> the model's raw answer, or nothing when the call failed.
// onAsk is told when the wait begins (the page shows the three dots then).
export async function turnWithModel(text, st, ask, onAsk = () => {}) {
  const steps = turnSteps(text, st, !!ask)
  let step = steps.next()
  while (!step.done) {
    let raw
    onAsk()
    try {
      raw = await ask(step.value, st)
    } catch {
      raw = undefined
    }
    step = steps.next(raw)
  }
  return step.value
}

// True when a typed message would reach the model step: so the page knows before it waits.
export function turnNeedsModel(text, st) {
  const copy = { ...st, found: { ...st.found }, asked: [...st.asked] }
  return !turnSteps(text, copy, true).next().done
}

/* ---------- what the person picks or presses ---------- */
// An answer picked under a topic question: its need's row at once. No key words, no model.
export function pick(topic, i, st) {
  const a = TOPICS[topic].question.answers[i]
  st.found[topic] = a.gives
  st.pending = null
  st.lastq = false
  if (a.service) st.service = a.service
  // (row 1: a picked answer to one of the three questions is kept here)
  return { kind: 'row', topic, need: a.gives }
}

// A topic picked under the line after the opening, the no-answer line or the "can do" line.
export function pickTopic(topic, st) {
  const held = TOPIC_PICKS[topic]
  if (held && held.holds) {
    st.pending = null
    st.lastq = false
    return { kind: held.line, buttons: held.holds }
  }
  // (row 1: something kept for this topic gives its row here)
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

// Skip, at "What's your name?" or "What do you do?".
export function skip(st) {
  if (st.stage !== 'name' && st.stage !== 'work') return null
  st.stage = 'open'
  st.lastq = false
  st.pending = null
  // (row 1: a name given before Skip is written here)
  return { kind: 'F3' }
}

// A button that makes Helper say one more pre-written line.
export function sayLine(line, st) {
  st.lastq = false
  st.pending = null
  return { kind: 'extra', line }
}

/* ---------- from a result to what Helper says ---------- */
const fillSlots = (text, slots) => text.replace(/\{(\w+)\}/g, (m, k) => (slots[k] != null ? String(slots[k]) : m))

// Hermes's own screens a "part" button opens (row 3 of the plan): the address, and the name the
// button's label takes. Each address ran in Hermes Desktop v0.23.0 (docs/build/talk-v1-stage1.md).
// Bots has no address: no call opens Hermes's Bots tab. A line that would end in "Open Bots" gets
// no button; in its place Helper says the data's line about where that tab is. A part that is not
// listed here gets nothing.
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

// The opening line.
export function openingLine() {
  return { line: 'OPEN', text: FIXED.OPEN.text, answers: null, next: null, paste: null, source: null }
}

// result: what turn, pick, pickTopic, press, skip or sayLine returned. typed: the person's words
// (for the text to paste under "your own Hermes can").
// Returns { line, text, source, answers, next, paste }.
export function lineFor(result, st, typed = '') {
  const said = (line, text, more = {}) => ({ line, text, source: null, answers: null, next: null, paste: null, ...more })
  const named = f => (st.name ? fillSlots(f.text, { name: st.name }) : f.text_no_name || f.text)
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
      return said('F2', named(FIXED.F2), { answers: topicPicks() })
    case 'F3':
      return said('F3', FIXED.F3.text, { answers: topicPicks() })
    case 'N1':
      return said('N1', FIXED.N1.text, { answers: topicPicks() })
    case 'W1':
      return said('W1', FIXED.W1.text, { answers: { kind: 'which', hint: TALK_DATA.answers.hint_under_question, items: result.buttons.map(id => ({ id, label: labelOf(id), which: id })) } })
    case 'term': {
      const t = TERMS[result.term]
      return said('term-' + t.id, t.text, { source: t.source, next: nextFor(t.next, null, st) })
    }
    case 'question': {
      const q = TOPICS[result.topic].question
      return said(q.id, q.text, { answers: { kind: 'question', hint: TALK_DATA.answers.hint_under_question, items: q.answers.map((a, i) => ({ id: `${result.topic}-${i}`, label: a.label, answer: [result.topic, i] })) } })
    }
    case 'plain': {
      const p = TOPICS[result.topic].plain
      return said(p.id, p.text, { source: p.source, next: nextFor(p.next, result.topic, st) })
    }
    case 'row': {
      const n = TOPICS[result.topic].needs.find(x => x.id === result.need)
      return said(n.id, n.text, { source: n.source, next: nextFor(n.next, result.topic, st) })
    }
    case 'extra': {
      const x = EXTRA_LINES[result.line]
      return said(x.id, x.text, { source: x.source })
    }
    default: {
      // a line that shows the topics it holds ("What Hermes can do")
      const f = FIXED[result.kind]
      if (!f) return said('N1', FIXED.N1.text, { answers: topicPicks() })
      return said(result.kind, f.text, { source: f.source || null, answers: { kind: 'pair', hint: TALK_DATA.answers.hint_under_topics, items: (result.buttons || []).map(id => ({ id, label: labelOf(id), topic: id })) } })
    }
  }
}

// The hint in the empty message box. With nothing to pick it is hhdesign's stand-in: the
// data has no words for it.
export const REPLY_HINT = 'Reply to Helper'
export const hintFor = entry => (entry && entry.answers && entry.answers.items.length ? entry.answers.hint : REPLY_HINT)
