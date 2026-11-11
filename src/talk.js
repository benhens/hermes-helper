// How Helper answers, as plain code: hhcontent's order of steps (content/helper-talk-v2.md
// section 2.1, changes-7 and changes-8) ported from the team's route2.py, reading hhcontent's data
// (src/talk-data.js, made by the build from content/helper-talk-v2.json). No React, no storage of
// its own, and no AI step: nothing here sends anything anywhere.
// tests/talk.test.mjs replays every conversation route2.py itself ran and must get the same result
// at every turn, the stored record included.
//   freshVisit(stage, kept, met)  what Helper knows in this visit: the stage of the opening, the
//                                 open question, what was asked and found, the name and what the
//                                 person does, `kept`, the stored record (written by the page,
//                                 src/kept.js), and `met`, whether Helper has said hello before (changes-14).
//   turn(text, visit)             a typed message -> a result { kind, ... }
//   pick, pickTopic, press, skip, sayLine, change, rmPick, forgetAnswer   what the person picks or presses
//   lineFor(result, visit, typed, opts)   the result as the line Helper says, its answers, its button
//                                 and the small faint lines under it
// What is kept follows hhcontent's fixed rules (JSON keeps, content/helper-keeps-v1.md): no model
// and no question decides it. Typed "what do you know about me", "forget my name" and "forget
// everything" (keeps.typed, A1, A2, A4) are not in route2.py; they are ported from hhtech's
// settings_step and hhcontent's changes-8 rule, and come straight after the remember step.
import { TALK_DATA } from './talk-data.js'
import { WANTS_DATA } from './wants-data.js'
import { AI_MODE } from './ai-mode.js'
import { SETUP_BUILT, SETUP_AI_BUILT } from './setup-built.js'
import { openQNew } from './setup-chat.js'
import { LIVE_DATA } from './live-data.js'
import { looksLikeKey } from './key-check.js'
import { looksSecret } from './secret-rule.js'
import { hasKept, workOk, workSqueeze } from './kept.js'

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
// changes-16/17 (JSON lonely_words, route2.py lonely_ok): a listed key word counts only with one of its
// needs_one_of phrases in the message (when it has that list) and none of its not_with words. Every key-word
// list goes through it (topics, needs, weak words, the wants rows); the typed answers to Helper's own service
// question use hits(), as route2.py's hit(), and are not affected.
const LONELY = TALK_DATA.lonely_words || {}
function lonelyOk(t, p) {
  const r = LONELY[p]
  if (!r) return true
  return (!r.needs_one_of || r.needs_one_of.some(q => hits(t, q))) && !(r.not_with || []).some(q => hits(t, q))
}
export const whichOf = (t, list) => list.filter(p => hits(t, p) && lonelyOk(t, p))
// A start counts when it is the whole message, or the next character is not a to z, 0 to 9 or '.
export const startsWith = (t, list) => list.some(p => t === p || (t.startsWith(p) && /[^a-z0-9']/.test(t[p.length])))
export function cutIgnored(t) {
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

// The request step: null, the words that make it a request (H1), or { h2: words } for a question whether
// Hermes can build something (changes-16, H2).
export function buildHit(text) {
  const t = cutIgnored(talkNorm(text)) // the ignore phrases are cut before this step too
  if (startsWith(t, BUILD.skip_starts) || whichOf(t, BUILD.how_phrases).length) return null // a question about how is never a request
  // changes-16 (build.build_question_rule): "can it build ...?" is a question about Hermes
  const q = whichOf(t, BUILD.build_question_words)
  if (startsWith(t, BUILD.make_not_when_starts) && q.length) return { h2: q[0] }
  const w = whichOf(t, BUILD.build_words)
  if (w.length) return w[0]
  const pair = BUILD.build_pair
  const doing = whichOf(t, pair.and_one_of)
  if (hits(t, pair.must_have) && doing.length) return pair.must_have + ' + ' + doing[0]
  // changes-15 (build.make_words): make me ..., can you make ..., unless the next words are on
  // make_not_followed_by, or the message starts as a question about Hermes
  if (!startsWith(t, BUILD.make_not_when_starts)) {
    for (const m of BUILD.make_words) {
      const re = wordRe(m, 'g')
      re.lastIndex = 0
      let x
      while ((x = re.exec(t))) {
        // the match ends after the character that follows the words (as route2.py's m.end())
        const rest = t.slice(x.index + x[0].length).replace(/^[ ,]+/, '')
        if (rest && !startsWith(rest, BUILD.make_not_followed_by)) return m
      }
    }
  }
  return softwareHit(t) // changes-17
}
// changes-17 (build.software_rule): lead-ins cut again and again, then a software verb as the first word and a
// software thing (one or two words) after at most software_between_max words, none of them on software_between_not.
function softwareHit(t) {
  const leads = [...BUILD.software_lead_ins].sort((a, b) => b.length - a.length)
  let again = true
  while (again) {
    again = false
    for (const p of leads) {
      if (t !== p && startsWith(t, [p])) {
        t = t.slice(p.length).replace(/^[ ,]+/, '')
        again = true
      }
    }
  }
  const ws = t.match(/[a-z0-9'-]+/g) || []
  const max = BUILD.software_between_max
  if (!ws.length || !BUILD.software_verbs.includes(ws[0])) return null
  for (let i = 1; i < Math.min(ws.length, max + 3); i++) {
    const between = ws.slice(1, i)
    if (between.length > max || between.some(w => BUILD.software_between_not.includes(w))) return null
    for (const th of BUILD.software_things) {
      const n = th.split(' ').length
      if (ws.slice(i, i + n).join(' ') === th) return ws[0] + ' + ' + th
    }
  }
  return null
}
const questionForm = t => t.includes('?') || startsWith(t, OPENING.question_starts)
// changes-11 mail_on_schedule: when sch and svc both match by full key words and the message has a
// key word of sch5 (email on a schedule), only sch counts.
const SCH5_WORDS = ((TOPICS.sch && TOPICS.sch.needs) || []).filter(n => n.id === 'sch5').flatMap(n => n.key_words)
function strongTopics(t) {
  let ids = TOPIC_IDS.filter(k => whichOf(t, TOPICS[k].key_words.concat(TOPICS[k].misspellings)).length)
  if (whichOf(t, TALK_DATA.chat_apps).length) ids = ids.filter(k => k !== 'svc')
  if (ids.includes('sch') && ids.includes('svc') && whichOf(t, SCH5_WORDS).length) ids = ids.filter(k => k !== 'svc')
  return ids
}
const anyTerm = t => TERM_IDS.some(k => whichOf(t, TERMS[k].key_words).length)
function needsFor(t, topic, answering) {
  let ns = TOPICS[topic].needs.filter(n => whichOf(t, n.key_words).length && (answering || !n.only_when_answering))
  // changes-11: a need that wins over the others (sch5, email on a schedule)
  if (ns.some(n => n.wins_over_other_needs)) ns = ns.filter(n => n.wins_over_other_needs)
  if (ns.length > 1) ns = ns.filter(n => !n.only_if_no_other_need)
  return ns.map(n => n.id)
}

/* ---------- the wants (row 5): hhcontent's content/helper-wants-v1.json, as src/wants-data.js ---------- */
// The order of steps is hhtech's wants_step.py with fixes6_step.py on top of route2.py (changes-6
// fixes 2 and 3, changes-8's article before "NAME skill"); route2.py itself stops at the wants
// question. visit.wants false: the steps below do nothing, which is route2.py exactly (the tests
// replay route2.py's own conversations that way).
const WROWS = WANTS_DATA.rows
export const WANT_ROWS = Object.fromEntries(WROWS.map(r => [r.id, r]))
const WGROUPS = Object.fromEntries(WANTS_DATA.groups.map(g => [g.id, g]))
const asLabel = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const GROUP_BY_LABEL = new Map(WANTS_DATA.question.answers.map(a => [asLabel(a.label), a.gives_group]))
const WSKILLS = new Map(WANTS_DATA.skills.map(s => [s.name, s]))
const SERVICE_LINES = WANTS_DATA.service_lines
// A row matches when one of its key words is in the message, or one of its things and one of its
// actions are both in it. Whole words, as every key word (helper-wants-v1.json match_rule).
export const wantsOf = t => WROWS.filter(r => whichOf(t, r.key_words || []).length || (whichOf(t, r.things || []).length && whichOf(t, r.actions || []).length)).map(r => r.id)
// The near miss: the groups one of whose subject words is in the message.
export const nearOf = t => WANTS_DATA.groups.filter(g => whichOf(t, g.subject_words).length).map(g => g.id)
// A skill by its name only when the name and "skill" sit next to each other (changes-6 fix 3,
// changes-8): hhcontent's skill_next.py PATTERNS, word for word; {n} is the name, or the name with
// spaces for its hyphens. tests/talk-wants.test.mjs compares these with skill_next.py's own.
export const SKILL_NEXT_PATTERNS = ['(?:the|a|an|this|that) {n} skills?', 'skills? (?:called|named) \\"?{n}\\"?', 'skills? for {n}', '\\"{n}\\" skills?']
// Wants fixes v1 (helper-wants-v1.json skill_name_rule_wf1, hhcontent's wants_fixes_step.py): a name that
// is an ordinary word counts after "skill(s) for" only as the last word of the message ("is there a skill
// for shop" names shop; "skills for shop owners" names nothing). "the shop skill" still counts.
const WF1 = WANTS_DATA.skill_name_rule_wf1
const ORDINARY_NAMES = new Set(WF1.ordinary_names)
// skill_for_unknown: "skill(s) for <word>" (or "that can", "which can") where the word is not on
// skill_for_not_after ("is there a skill for me" stays the line about what a skill is)
const SKILL_FOR = new RegExp('(^|[^a-z0-9])' + WF1.skill_for_pattern)
function skillForUnknown(t) {
  const m = SKILL_FOR.exec(t)
  return !!m && !WF1.skill_for_not_after.includes(m[2])
}
const SKILL_RES = WANTS_DATA.skills.map(s => {
  const names = [...new Set([s.name, s.name.replace(/-/g, ' ')])]
  const lastOnly = p => (ORDINARY_NAMES.has(s.name) && p.startsWith('skills? for') ? '\\s*[?.!]*$' : '')
  const alts = names.flatMap(n => SKILL_NEXT_PATTERNS.map(p => p.replace(/\\"/g, '"').replace('{n}', escapeRe(n)) + lastOnly(p)))
  // A name never ends right before a hyphen, so 'a skill called "brag-slim"' names brag-slim only, not
  // brag too (the Builder's rule, in the reference since wants fixes v1: wants_fixes_step.py a).
  return [s.name, new RegExp('(^|[^a-z0-9])(?:' + alts.join('|') + ')($|[^a-z0-9-])')]
})
// The skills a message names. Where one name's match lies inside another's ('a skill called brag
// slim' is brag and brag-slim), only the longer counts (the Builder's rule, now wants_fixes_step.py b).
export function skillOf(t) {
  const found = SKILL_RES.map(([n, re]) => [n, re.exec(t)]).filter(([, m]) => m).map(([n, m]) => [n, m.index, m.index + m[0].length])
  const inside = (a, b) => a !== b && b[1] <= a[1] && a[2] <= b[2] && b[2] - b[1] > a[2] - a[1]
  return [...new Set(found.filter(a => !found.some(b => inside(a, b))).map(([n]) => n))].sort()
}
// The row a skill has, if any (a hand-written row wins over S1 and S2).
const rowOfSkill = name => WROWS.find(r => r.thing === name)
// Changes-6 fix 6: where svc's row for a named service would show, Gmail, Google Calendar and
// Google Drive get line CN1 (the app's Connectors page) and GitHub gets S1 for the built-in skill
// github. A result gets serviceLine; the rest stays as it was (found, kept, the visit).
function withServiceLine(out, st) {
  if (st.wants === false || out.topic !== 'svc' || out.need !== 'svc1') return out
  const s = SERVICE_LINES[st.service]
  if (s) out.serviceLine = s.line === 'S1' ? { line: 'S1', skill: s.skill } : { line: s.line }
  return out
}
// At most four things to pick on screen (answers.max_at_once): a longer list shows three and
// "More", which shows the next ones the same way (helper-talk-v2.json answers.more).
export function pageOf(items) {
  const max = TALK_DATA.answers.max_at_once
  if (items.length <= max) return items
  const shown = max - 1
  return [...items.slice(0, shown), { id: 'more-' + items[shown].id, label: 'More', more: items.slice(shown) }]
}

// Steps 4 and 5: the topic and the need, by key words.
function byCode(text, st) {
  const t = cutIgnored(talkNorm(text))
  let strong = strongTopics(t)
  // the rows (wants_step.py by_code2): while a topic question is open, only in a question
  let rows = st.wants === false ? [] : wantsOf(t)
  if (rows.length && st.pending && !questionForm(t)) rows = []
  // fix 2: a row takes svc off only when the svc word matched is that row's own key word or thing;
  // otherwise svc stays and the rows are not looked at
  if (rows.length && strong.includes('svc')) {
    const svcWords = whichOf(t, TOPICS.svc.key_words.concat(TOPICS.svc.misspellings))
    const owned = rows.some(id => svcWords.some(w => (WANT_ROWS[id].key_words || []).includes(w) || (WANT_ROWS[id].things || []).includes(w)))
    if (owned) strong = strong.filter(k => k !== 'svc')
    else rows = []
  }
  const r = { topic: null, need: null, term: null, several: null, strong_one: strong.length === 1, rows: null }
  if (strong.length > 1) {
    r.several = strong
    return r
  }
  if (strong.length === 1) r.topic = strong[0]
  else {
    if (rows.length) {
      r.rows = rows
      return r
    }
    if (!st.pending || questionForm(t)) {
      const terms = TERM_IDS.filter(k => whichOf(t, TERMS[k].key_words).length)
      if (terms.length === 1) {
        // wants fixes v1 (skill_for_unknown): in a question, "skill(s) for / that can ..." and a word that is
        // not on skill_for_not_after is not the line about what a skill is: turn() goes on to N2 or N1
        if (st.wants !== false && TERMS[terms[0]].key_words.includes('skill') && questionForm(t) && skillForUnknown(t)) return r
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
      if (topic === 'svc' && answering && !strong.length && !unsure && !t.includes('?') && !questionForm(t)) r.need = 'svc1' // ask-fix-t1: a question is not a service name
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
// wants: the wants steps are on (row 5); false only for replaying route2.py, which has none.
// changes-14/15: met, the mark that Helper has said hello (its own storage key, keeps.met; it outlives the
// visit and no Forget removes it); last, lastKey, lastTopic: Helper's last line in this visit (route2.py
// note_last), for ordinary talk and for never saying the same line twice; rejected: the lines the person
// called wrong in this visit (no_repeat.rejected_rule), never stored.
// live-v2 changes-3: lastAnswer, lastAnswerKey, lastByAgain: this visit's last answer line, for "again"
// (small_talk.again_rule). changes-4: keepWork, the keep rule of keeps.work (false only for replaying route2.py,
// which keeps nothing at "What do you do?"); workLong, WORK_LONG was said once at this question. aiOff: the AI step is
// off for the rest of this visit (hhtech-weak-ai; set by src/page.js). live-v2 changes-5 (set by src/page.js): aiTried,
// the visit has made its first AI call; slow, the slow-AI line SLOW_A: null, 'due' (owed after the next answer that
// may have it, src/live-turn.js slowFollows), 'said'.
export function freshVisit(stage = 'open', kept = {}, met = false) {
  return { stage, pending: null, found: {}, asked: [], lastq: false, name: null, work: null, service: null, kept, rmText: null, wants: true, met, last: null, lastKey: null, lastTopic: null, rejected: [], lastAnswer: null, lastAnswerKey: null, lastByAgain: false, keepWork: true, workLong: false, aiOff: false, aiTried: false, slow: null, lastOffer: null, lastParts: null, c9: true }
}
// A later visit: only the stored record and the met mark are carried over. met: Helper has said hello on an
// earlier visit (changes-14, keeps.met). Builder: a kept name counts as met too (route2.py writes both at F1,
// so a name never stands without met there), so a record from a build before the mark is not asked the name
// again. The window's first line, and so the stage, is opening()'s: met, BACK and no question; else OPEN.
export const laterVisit = (kept, met = false) => {
  const k = kept || {}
  const was = met === true || !!k.name
  return freshVisit(was ? 'open' : 'name', k, was)
}
// changes-14 (route2.py opening): the window opens.
export function opening(st) {
  let out
  if (st.met) {
    st.stage = 'open'
    out = { kind: 'BACK', name: st.kept.name || null }
  } else {
    st.stage = 'name'
    out = { kind: 'OPEN' }
  }
  noteLast(st, out)
  return attachOffer(out, st, null) // offer-t1: BACK carries the offer general
}
// route2.py line_key: "the same line" is the same kind, topic, need, term and buttons. Builder: also the same
// wants row, skill or group (the plugin's own lines; route2.py has none), so two different rows are two lines.
export const lineKey = o => JSON.stringify([o.kind, o.topic || null, o.need || null, o.term || null, o.buttons || [], o.row || null, o.skill || null, o.group || null])
// live-v2 changes-3 (small_talk.again_brings_back): the kinds an answer line has, in this plugin's words (the
// data's wants is this plugin's want; its "skill by name", the skills-by-name line S1 or S2, is this plugin's skill)
const AGAIN_BACK = (TALK_DATA.small_talk.again_brings_back || []).map(k => (k === 'wants' ? 'want' : k === 'skill by name' ? 'skill' : k))
// what a line brought back by "again" leaves out: its faint Kept: line and what only that moment had
const AGAIN_DROP = ['kept', 'first', 'name_taken', 'thing', 'repeat_of', 'by_again', 'code', 'work_first', 'weak_hit', 'offer']
export function noteLast(st, o) {
  if (!o) return o
  st.last = o.kind
  st.lastKey = lineKey(o)
  st.lastTopic = ['row', 'question', 'plain', 'then'].includes(o.kind) ? o.topic || null : null // live changes-6: then
  // ask-fix-t1 (route2.py last_next reads last_key's fields): the parts of Helper's last line, for its then line and its button
  st.lastParts = { kind: o.kind, topic: o.topic || null, need: o.need || null, term: o.term || null, row: o.row || null, line: o.line || o.id || null }
  st.lastByAgain = !!o.by_again
  if (AGAIN_BACK.includes(o.kind)) {
    st.lastAnswer = Object.fromEntries(Object.entries(o).filter(([k]) => !AGAIN_DROP.includes(k)))
    st.lastAnswerKey = st.lastKey
  }
  return o
}
// route2.py again_line: (1) the last answer line when it is not the line just before; (2) it once more when it
// is, unless that line was itself brought back by again (then AGAIN); (3) none: MEAN_NONE, or AGAIN after MEAN_NONE
function againLine(st) {
  const a = st.lastAnswer
  if (a && st.lastAnswerKey !== st.lastKey) return { ...a }
  if (a) return st.lastByAgain ? { kind: 'AGAIN' } : { ...a }
  return { kind: st.last === 'MEAN_NONE' ? 'AGAIN' : 'MEAN_NONE' }
}

/* ---------- what Helper keeps (route2.py: keep, keep_typed, kept_need, remember) ---------- */
// Writes one thing into the visit's record, and notes on the result that the faint kept line must
// show (and the first-time line, once). The page writes the record to storage after every turn.
function keep(st, out, key, value) {
  if (key === 'asked') st.kept.asked = [...(st.kept.asked || []), value]
  else st.kept[key] = value
  out.kept = [...(out.kept || []), key]
  // live-v2 changes-4 (keeps.tell.work_told): the first time what the person does is kept, the line that the AI is
  // told goes under the Kept: line (AI builds); shown again only after it was deleted and kept anew
  // (review: only in a build that shows that line, so a record carried into an AI build still gets it once)
  if (key === 'work' && !st.kept.told_work && LIVE_DATA.lines_by_mode.work_told[AI_MODE]) {
    st.kept.told_work = true
    out.work_first = true
  }
  if (!st.kept.told) {
    st.kept.told = true
    out.first = true
  }
}

// The names a typed answer gives (keeps.answers.<topic>.names: typed word -> name). Wants fixes v1
// (route2.py keep_typed and typed_change): a matched word inside a longer matched word does not count,
// so "one drive" is OneDrive only, not Google Drive too ("drive").
function typedNames(t, names) {
  let ws = Object.keys(names).filter(w => hits(t, w))
  ws = ws.filter(w => !ws.some(v => v !== w && hits(v, w)))
  return new Set(ws.map(w => names[w]))
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
    const names = typedNames(t, A[topic].names)
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
    else if (looksSecret(thing)) out.kind = 'RM6' // changes-12: keeps.remember.refuse.rule_12 (src/secret-rule.js), was: a refused word or 8 digits
    else if (n > lim.max_words || charCount(thing) > lim.max_chars) out.kind = 'RM5'
    // keeps.remember.same_thing (changes-10, the Builder's review fix now in route2.py): the same
    // thing in other capitals counts as kept already, as the settings page reads it.
    else if (asked.some(a => a.toLowerCase() === thing.toLowerCase())) out.kind = 'RM1'
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
const hasKeptValues = kept => hasKept(kept)
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

// changes-7: N1a, a skill named in a clear pattern and on no official list; N1, everything else.
// null: an official skill named that way (changes-19: all 186 are answered, N1b is gone).
const SKILL_PATTERNS = [/skills? (?:called|named) "?([a-z0-9][a-z0-9 -]{0,40}?)"?(?=$|[^a-z0-9 -])/, /"([a-z0-9][a-z0-9 -]{0,40})" skills?/]
export function dontKnow(text) {
  const t = talkNorm(text)
  for (const p of SKILL_PATTERNS) {
    const m = p.exec(t)
    if (m) {
      const n = m[1].trim().replace(/ /g, '-')
      if (!SKILL_NAMES.has(n)) return 'N1a'
      return null
    }
  }
  return 'N1'
}

// changes-10 (opening.name_refused, the Builder's review fix now in route2.py): a name holding a
// word Helper never keeps (keeps.remember.refuse.words, and in a name also opening
// .name_refused_words_also: pin, pins) or a key shape is no name, as a name with digits is none.
const refusedName = s => whichOf(talkNorm(s), KEEP_REMEMBER.refuse.words.concat(OPENING.name_refused_words_also || [])).length > 0 || looksLikeKey(s)
function codeName(text, strongOnly = false) {
  const name = codeNameRaw(text, strongOnly)
  return name && !refusedName(name) ? name : null
}
// helper-builder-qs-v1.md point 1 (route2.py strong_match): the first place name_strong_pattern matches, or
// null when the word it caught is on opening.not_a_name or name_strong_stop ("call me tomorrow"). No second match.
function strongMatch(text) {
  const m = NAME_STRONG.exec(text)
  if (m && (OPENING.not_a_name.includes(m[1].toLowerCase()) || OPENING.name_strong_stop.includes(m[1].toLowerCase()))) return null
  return m
}
// route2.py tail_ok: after a name typed on a later visit only spaces, . , ! and name_new_may_follow's words
const MAY_FOLLOW = [...OPENING.name_new_may_follow].sort((a, b) => b.length - a.length).map(w => new RegExp('(^|[^a-z0-9])' + escapeRe(w) + '(?=$|[^a-z0-9])', 'g'))
function tailOk(rest) {
  let t = talkNorm(rest)
  for (const re of MAY_FOLLOW) t = t.replace(re, '$1 ')
  return /^[\s.,!]*$/.test(t)
}
function codeNameRaw(text, strongOnly) {
  let m = strongMatch(text)
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
export function nameWithMore(text) {
  const more = OPENING.name_with_more
  let m = strongMatch(text)
  if (!m) {
    m = NAME_WEAK.exec(text)
    if (m) {
      const w = m[1]
      const after = text.slice(m.index + m[0].length).toLowerCase()
      if (!(/^\p{Lu}/u.test(w) && !OPENING.not_a_name.includes(w.toLowerCase()) && more.after_name.some(a => after.startsWith(a)))) m = null
    }
  }
  if (!m) return [null, null]
  if (refusedName(m[1])) return [null, null] // changes-10: opening.name_refused
  const rest = text.slice(m.index + m[0].length).replace(/^(?:[\s,.!:]+|and\b|here\b)+/i, '')
  const rt = cutIgnored(talkNorm(rest))
  if (!rt) return [null, null]
  const hasKey = strongTopics(rt).length > 0 || anyTerm(rt)
  return questionForm(rt) || (hasKey && !startsWith(rt, more.self_starts)) ? [capFirst(m[1]), rest] : [null, null]
}

/* ---------- changes-11: route2.py's steps after hhtech's run of e86b410 ---------- */
// A name typed at stage open (a later visit skips the name question): NAME_AGAIN for the kept name
// (alone, or caught by the name patterns), NAME_NEW for a clear "my name is ..." (at most six words,
// no question mark), which replaces the kept name. A single other word is not taken as a name.
// Nothing while Helper's own question is open. Returns { kind, name } or null; NAME_NEW keeps.
function nameLater(text, st, out) {
  if (st.pending || st.lastq) return null
  const kn = st.kept.name
  const raw = String(text).trim().replace(/[.!]+$/, '')
  if (kn && raw.toLowerCase() === kn.toLowerCase()) return { kind: 'NAME_AGAIN', name: kn }
  if (String(text).includes('?') || typedWords(text).length > 6) return null
  const strong = codeName(text, true)
  const m = NAME_WEAK.exec(text)
  const weak = m ? capFirst(m[1]) : null
  if (kn && [(strong || '').toLowerCase(), (weak || '').toLowerCase()].includes(kn.toLowerCase())) return { kind: 'NAME_AGAIN', name: kn }
  if (!strong) return null
  // helper-builder-qs-v1.md point 1: NAME_NEW only when the name ends the message (polite words may follow)
  const sm = strongMatch(text)
  if (!tailOk(text.slice(sm.index + sm[0].length))) return null
  keep(st, out, 'name', strong)
  st.name = strong
  return { kind: 'NAME_NEW', name: strong }
}
// "what is ..." (JSON what_is): the topic whose plain line explains the one word asked about, or null.
// Anchored at the start as Python's re.match is, whatever the data's pattern begins with.
const WHAT_IS = TALK_DATA.what_is ? new RegExp('^(?:' + TALK_DATA.what_is.pattern + ')') : null
export function whatIs(t) {
  const m = WHAT_IS && WHAT_IS.exec(t)
  if (!m) return null
  const x = m[1].replace(/^[ ?.!]+|[ ?.!]+$/g, '')
  const found = Object.entries(TALK_DATA.what_is.words).filter(([, ws]) => ws.includes(x)).map(([k]) => k)
  return found.length === 1 ? found[0] : null
}
// COST (a question with a cost word) or WHERE (a where word), when no topic and no term matched.
// Builder (not in route2.py, which has no rows; please check): a row of the wants counts as a topic
// here, so "can it keep an eye on airline ticket prices" is the prices row, not the cost line. Only
// where byCode would look at the rows: not while Helper's own question is open and the message is
// no question (there route2.py's order stands).
function fixedByWords(t, st) {
  // live-v2 changes-3 (cost.amount_rule): what something costs, asked with only price words of topic use, is COST
  const C = TALK_DATA.cost
  if ((C.amount_asks || []).length && questionForm(t) && whichOf(t, C.amount_asks).length && strongTopics(t).join() === 'use' && !anyTerm(t) && TOPICS.use && whichOf(t, TOPICS.use.key_words.concat(TOPICS.use.misspellings || [])).every(w => C.use_price_words.includes(w))) return 'COST'
  if (strongTopics(t).length || anyTerm(t)) return null
  if (st.wants !== false && wantsOf(t).length && !(st.pending && !questionForm(t))) return null
  if (questionForm(t) && whichOf(t, TALK_DATA.cost.words).length) return 'COST'
  if (whichOf(t, TALK_DATA.where.words).length) return 'WHERE'
  return null
}
// keeps.typed_change: where a row shows for a topic something is already kept for (chat app,
// service, ChatGPT or Claude), the person says of themselves that they use another one: the newest
// replaces the kept one. Not in a question, not with a not-word or an unsure word, and only when
// code finds exactly one new name.
function typedChange(t, topic, st, out) {
  const TC = KEEPS.typed_change
  if (!TC || !['msg', 'svc', 'mod'].includes(topic) || !st.kept[topic]) return
  if (t.includes('?') || questionForm(t) || whichOf(t, TC.question_words).length || whichOf(t, TC.not_words).length || whichOf(t, TALK_DATA.unsure_words).length) return
  if (!whichOf(t, TC.self_words).length) return
  let vs
  if (topic === 'mod') vs = KEEPS.answers.mod.values.filter(v => (v.need === 'mod1' || v.need === 'mod2') && whichOf(t, v.typed_words).length).map(v => v.need)
  else {
    const names = typedNames(t, KEEPS.answers[topic].names)
    if (names.has('Google Calendar')) names.delete('Google')
    vs = [...names]
  }
  if (vs.length === 1 && vs[0] !== st.kept[topic]) keep(st, out, topic, vs[0])
}
const samePair = (a, b) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000')

// The service a "named service" line is about, for its text to paste: the picked answer's own, the
// name of the first of the need's key words that is in the message (the list has the longest
// first), the message itself when it was the answer to "Which service?", or the one named earlier
// in this visit.
export function serviceIn(text, st, answered) {
  const need = TOPICS.svc && TOPICS.svc.needs.find(n => n.id === 'svc1')
  if (!need) return st.service
  const t = cutIgnored(talkNorm(text))
  const word = need.key_words.find(p => hits(t, p))
  if (word && need.service_names && need.service_names[word]) return need.service_names[word]
  if (answered && text.trim()) return Array.from(text.trim()).slice(0, TALK_DATA.limits.service_chars_in_paste).join('')
  return st.service
}

/* ---------- changes-14, -15, -17: ordinary talk, and never the same line twice ---------- */
const ST = TALK_DATA.small_talk
// talk-live: the first-time faint line under the first "Kept:" (lines_by_mode.first_time_grey, by src/ai-mode.js)
export const FIRST_TIME = LIVE_DATA.lines_by_mode.first_time_grey[AI_MODE]
// live-v2 changes-4: under the first Kept: of what the person does, in a build that calls an AI
// live changes-6: once the set-up conversation sends its two answers too, setup_told takes work_told's place
export const WORK_TOLD = LIVE_DATA.lines_by_mode[SETUP_BUILT && SETUP_AI_BUILT ? 'setup_told' : 'work_told'][AI_MODE]
// live-v2 changes-1: the kinds after which "how" is kind mean; the data's "wants" is this plugin's want
const HOW_AFTER = ST.how_after_rows.after.flatMap(k => (k === 'wants' ? ['want'] : k === 'then' ? ['then', 'rowthen'] : [k]))
const NR = TALK_DATA.no_repeat
const LETTER = /\p{L}/u
const ONE_WORD = /^(?:\p{L}|['-]){2,30}$/u
// changes-17 (opening.one_word_name): at "What's your name?" a one-word reply is the name, unless the word is
// on not_a_name or is a topic or term key word. An ending . or ! is cut off; a ? makes it a question.
function oneWordName(text, st) {
  if (st.stage !== 'name') return false
  const raw = String(text).trim().replace(/[.!]+$/, '').trim()
  if (!ONE_WORD.test(raw) || !LETTER.test(raw)) return false
  const t = cutIgnored(talkNorm(raw))
  return !OPENING.not_a_name.includes(t) && !strongTopics(t).length && !anyTerm(t)
}
// changes-17: the person says Helper was wrong (no_repeat's words; a bare no, nope or nah at the start not counted)
const saysWrong = t => whichOf(t, NR.wrong_anywhere).length > 0 || startsWith(t, NR.wrong_starts.filter(w => !ST.no_words.includes(w)))
const WEAK_ALL = TALK_DATA.topics.flatMap(x => x.weak_key_words || [])
// Step 0 b (JSON small_talk, route2.py small_talk): the kind of an ordinary message, or null. Whole messages only.
export function smallTalk(text, st) {
  if (oneWordName(text, st)) return null // Ty and Will at What's your name? are names
  let t = talkNorm(text)
  let again = true
  while (again) {
    again = false
    let t2 = t.replace(/[ ?!.,]+$/, '')
    for (const w of ST.cut_end_words) {
      if (t2.endsWith(' ' + w)) {
        t2 = t2.slice(0, -w.length).replace(/[ ,]+$/, '')
        again = true
      }
    }
    for (const w of ST.cut_start_words) {
      if (t2 !== w && startsWith(t2, [w])) {
        t2 = t2.slice(w.length).replace(/^[ ,:.]+/, '')
        again = true
      }
    }
    t = t2
  }
  const opening = st.stage === 'name' || st.stage === 'work'
  let kind = (Object.entries(ST.kinds).find(([, ws]) => ws.includes(t)) || [null])[0]
  if (kind === null) {
    // changes-17 thanks_tail: "ty so much", "thx a lot"
    for (const w of [...ST.kinds.thanks].sort((a, b) => b.length - a.length)) {
      if (startsWith(t, [w]) && ST.thanks_tail.includes(t.slice(w.length).replace(/^[ ,!.]+|[ ,!.]+$/g, ''))) {
        kind = 'thanks'
        break
      }
    }
  }
  if (kind === null && !opening) kind = greetMore(t) // live changes-6: live_c6.greet_more
  if (kind === null && !opening && !st.pending && correction(t, st)) kind = 'wrong' // live changes-6: live_c6.correction_rule
  if (kind === null) {
    const letters = /[a-z0-9]/.test(t)
    const one = /^[a-z]+$/.test(t)
    const tc = cutIgnored(t)
    const known = strongTopics(tc).length > 0 || anyTerm(tc) || whichOf(tc, WEAK_ALL).length > 0
    const ws = typedWords(t)
    if (!letters || (one && t.length === 1)) kind = 'cut' // rules a and b
    else if (!opening && saysWrong(t) && !known) kind = 'wrong' // changes-17 wrong_rule_17
    else if (!opening && !st.pending && !known) {
      // live-v2 changes-1 and -2: "how", "and", "and then" right after a line from rows is kind mean (checked just
      // before rule c; the whole message after the usual cuts, so an entry may have two words)
      if (ST.how_after_rows.words.includes(t) && HOW_AFTER.includes(st.last)) kind = 'mean'
      else if (one && ((t.length >= 2 && t.length <= 3) || ST.cut_question_words.includes(t))) kind = 'cut' // rule c
      else if (ws.length <= 4 && ST.cut_dangling.includes(ws[ws.length - 1])) kind = 'cut' // rule d
      else if (ws.length <= 3 && ws.length > 1 && OPENING.question_starts.includes(ws[0]) && ws.slice(1).every(w => ST.cut_small_words.includes(w))) kind = 'cut' // changes-17 rule e
    }
  }
  if (kind === null) return null
  // changes-15 no_rule: a bare no right after an answer, with nothing open, says the answer was wrong
  if (kind === 'ok' && ST.no_words.includes(t) && !st.pending && ST.no_means_wrong_after.includes(st.last)) kind = 'wrong'
  if (opening && !['thanks', 'how', 'who', 'ai', 'bye', 'cut'].includes(kind)) return null // at_opening
  // when_pending: the answer to Helper's question (live-v2 changes-3: again too; stuck is taken, as wrong)
  if (st.pending && (kind === 'ok' || kind === 'mean' || kind === 'again')) return null
  return kind
}
/* ---------- live changes-6 (route2.py greet_more, correction, c6_line), offer-t1 and ask-fix-t1 (offer_route, how_that, about_ok) ---------- */
const C6 = TALK_DATA.live_c6
const knownWords = tc => strongTopics(tc).length > 0 || anyTerm(tc) || whichOf(tc, WEAK_ALL).length > 0
// live_c6.greet_more: a greeting, thanks or bye with a few more words
function greetMore(t) {
  if (t.includes('?') || typedWords(t).length > 9 || knownWords(cutIgnored(t))) return null
  let first = null
  let rest = ''
  for (const k of ['hello', 'thanks', 'bye', 'ok']) {
    for (const w of [...ST.kinds[k]].sort((a, b) => b.length - a.length)) {
      if (startsWith(t, [w])) {
        first = k
        rest = t.slice(w.length)
        break
      }
    }
    if (first) break
  }
  if (!first) return null
  if (C6.greet_more.question_words.some(q => hits(rest, q))) return null
  const has = k => ST.kinds[k].some(w => w.length > 2 && hits(t, w))
  if (has('bye')) return 'bye'
  if (has('thanks')) return 'thanks'
  return first === 'ok' ? null : first
}
// live_c6.correction_rule: a correction right after a topic's plain line or its then line (or with only Helper's
// not-clear or cut-off line between), naming no other topic
function correction(t, st) {
  const la = st.lastAnswer || {}
  let topic
  if (['plain', 'then'].includes(st.last) && st.lastTopic) topic = st.lastTopic
  else if (['MEAN_NONE', 'CUT', 'CUT_SAME'].includes(st.last) && ['plain', 'then'].includes(la.kind)) topic = la.topic
  else return false
  if (!startsWith(t, NR.wrong_starts) || ST.no_words.includes(t.trim())) return false
  const tc = cutIgnored(t)
  let ts = strongTopics(tc)
  if (!ts.length) ts = TOPIC_IDS.filter(k => whichOf(tc, TOPICS[k].weak_key_words).length)
  return ts.length > 0 && ts.every(x => x === topic)
}
// live_c6: PRIV, POWER, HVC, or null
function c6Line(t) {
  if (whichOf(t, C6.privacy_words).length) return 'PRIV'
  if (whichOf(t, C6.power_words).length) return 'POWER'
  if (whichOf(t, C6.vs_names).length && whichOf(t, C6.vs_words).length) return 'HVC'
  return null
}
const THEN_W = ['how', 'and', 'and then', 'then', 'what next', 'next', 'now what', 'then what', 'what then', 'and next']
// ask-fix-t1 (about_rule): a row found by key words is final only when the message has one of its about words
const ABOUT_ROWS = TALK_DATA.about_rule.rows
const aboutOk = (t, need) => !ABOUT_ROWS[need] || whichOf(t, ABOUT_ROWS[need]).length > 0
// offer-t1 and ask-fix-t1 (route2.py offer_route): the kind of a new line, 'ROW:<need>', or null. tw: cut, normed message
const OW = TALK_DATA.offer_words
function offerRoute(tw) {
  const t = tw.replace(/[ ?!.]+$/, '')
  const has = k => whichOf(t, OW[k]).length > 0
  if (has('migrate') || (has('computer') && /\b(?:move|moving|migrate|transfer|copy)\b/.test(t))) {
    if (has('computer')) return 'MIG_PC'
    if (has('listed_apps')) return 'MIG_APP'
    if (has('chatgpt_names')) return 'MIG_CHATGPT'
    if (has('not_listed_apps')) return 'MIG_NOT_LISTED'
    return 'MIG'
  }
  const m = WHAT_IS && WHAT_IS.exec(t)
  if (m && OW.agent_what.includes(m[1].replace(/^[ ?.!]+|[ ?.!]+$/g, ''))) return 'AGENT'
  if (has('key')) return has('key_where') ? 'KEY_WHERE' : startsWith(t, OW.key_what_starts) ? 'KEY_WHAT' : 'KEY'
  if (has('personality')) return 'PERSONALITY'
  if (has('stuck_more')) return 'STUCK'
  if (has('free')) return 'FREE'
  if (has('model_change')) return 'MODEL_CHANGE'
  if (has('model_for') && hits(t, 'for')) return 'MODEL_FOR'
  if (has('own_ai') && whichOf(t, ABOUT_ROWS.mod3).length) return 'ROW:mod3'
  if (has('skill_add')) return 'SKILL_ADD'
  if (has('plugin_which')) return 'PLUGIN_WHICH'
  if (has('plugin_add')) return 'PLUGIN_ADD'
  if (has('coding_ask')) return 'CODING'
  if (has('what_hermes_any')) return 'HERMES'
  if (knownWords(t)) return null // a strong, weak or term key word: the topics answer it
  if (has('laptop_off')) return 'ROW:msg3'
  if (OW.what_hermes.includes(t)) return 'HERMES'
  if (has('update')) return 'UPDATE'
  if (has('safe')) return 'SAFE'
  if (has('start')) return 'START'
  return null
}
// ask-fix-t1 (small_talk.how_that, route2.py last_next and how_that): "ok and how do I do that", by Helper's last line
const HT = ST.how_that
const HT_CUT = new RegExp('^(?:(?:' + HT.cut_first.map(escapeRe).join('|') + ')\\b[ ,]*)+(?=\\S)')
// the then line and the button (next) of Helper's last line: [then or null, next or null]
function lastNext(st) {
  const p = st.lastParts || {}
  if (p.kind === 'row') {
    const n = TOPICS[p.topic].needs.find(x => x.id === p.need)
    return [n.then || null, n.next || null]
  }
  if (p.kind === 'plain') return [TOPICS[p.topic].plain.then || null, TOPICS[p.topic].plain.next || null]
  if (p.kind === 'term') return [null, TERMS[p.term].next || null]
  // Builder: a row of the wants (route2.py has none) with text to paste counts as a line whose button is a paste box
  if (p.kind === 'want' && WANT_ROWS[p.row] && WANT_ROWS[p.row].next && WANT_ROWS[p.row].next.kind === 'paste') return [null, { kind: 'paste', label: WANT_ROWS[p.row].next.label, paste_text: WANT_ROWS[p.row].next.paste_text }]
  if (FIXED[p.kind]) return [null, FIXED[p.kind].next || null]
  return [null, null]
}
function howThat(text, st) {
  let t = talkNorm(text).replace(/[ ?!.,]+$/, '')
  t = t.replace(HT_CUT, '').trim() || t
  if (!HT.phrases.includes(t)) return null
  // (1) the things to pick stay
  if (st.pending || st.lastq || st.lastOffer || ['TP', 'W1', 'W2', 'C1', 'can-q'].includes(st.last)) return { kind: 'PICK_FIRST', same_picks: true }
  const [then, nx] = lastNext(st)
  const p = st.lastParts || {}
  if (then) {
    st.pending = null
    return p.kind === 'row' ? { kind: 'rowthen', topic: p.topic, need: p.need } : { kind: 'then', topic: p.topic }
  }
  if (nx && nx.kind === 'line') return { kind: 'nextline', of: p.kind, topic: p.topic, need: p.need, term: p.term, text: nx.text, id: nx.id }
  if (nx && nx.kind === 'paste') return { kind: 'HOW_PASTE', label: nx.label, button: nx, topic: p.topic }
  if (nx && nx.kind === 'part') return { kind: 'HOW_PART', label: nx.label, button: nx, topic: p.topic }
  return null
}
// live changes-9 (not in route2.py): a next line's second wording (use1-next-mean), by the next line's id
const NEXT_MEAN = Object.fromEntries(TALK_DATA.topics.flatMap(t => [t.plain.next, ...t.needs.map(n => n.next)]).filter(n => n && n.mean).map(n => [n.id, n.mean]))

/* ---------- offer-t1 (JSON offers; route2.py offer_set, attach_offer, press_offer) ---------- */
const OF = TALK_DATA.offers
// the offer a line carries: a fixed line's own, or keeps.work.offer_t1's (WORK_LONG_2, WORK_SECRET)
const offerOfLine = kind => (FIXED[kind] && FIXED[kind].offer) || (KEEPS.work.offers || {})[kind] || null
// [set id, question text, pick ids]
function offerSet(sid, prevTopic = null) {
  const S = OF.sets
  if (sid === 'after_topic') {
    const bt = S.after_topic.by_topic
    if (prevTopic && bt[prevTopic]) {
      const [a, b] = bt[prevTopic]
      return ['after_topic:' + prevTopic, S.after_topic.template.replace('{say1}', OF.things[a].say).replace('{say2}', OF.things[b].say), [a, b]]
    }
    sid = 'general'
  }
  const s = S[sid]
  if (!SETUP_BUILT && s.text_no_setup) return [sid, s.text_no_setup, s.picks_no_setup]
  return [sid, s.text, s.picks]
}
// A line with an offer gets it (o.offer: { set, text, picks }); never the same set twice in a row (its instead set).
// prevTopic: the topic of Helper's last answer before this line, for after_topic.
export function attachOffer(o, st, prevTopic = null) {
  const of = o && !setupOpens(o.kind, st) && offerOfLine(o.kind)
  if (!of) {
    st.lastOffer = null
    return o
  }
  let [sid, text, picks] = offerSet(of, prevTopic)
  if (sid === st.lastOffer) [sid, text, picks] = offerSet(sid.startsWith('after_topic:') ? OF.sets.after_topic.instead : OF.sets[sid].instead)
  o.offer = { set: sid, text, picks }
  st.lastOffer = sid
  return o
}
// setup-chat: with the set-up conversation built, the four lines that end the opening (F2, F3, WORK_SECRET,
// WORK_LONG_2) ask Q_NEW in place of their offer, until that question has been answered or is kept
const SETUP_OPENERS = ['F2', 'F3', 'WORK_SECRET', 'WORK_LONG_2']
const setupOpens = (kind, st) => SETUP_BUILT && SETUP_OPENERS.includes(kind) && !st.kept.setup_new && !(st.setup && st.setup.newAnswered)
// An offer by its set id, as a line carries it (the set-up conversation's NOT_NOW, ALL_DONE and BACK end with one)
export function offerSaid(sid, st) {
  let [id, text, picks] = offerSet(sid)
  if (id === st.lastOffer) [id, text, picks] = offerSet(OF.sets[id].instead)
  st.lastOffer = id
  return { set: id, text, answers: { kind: 'offer', hint: OF.hint, items: picks.map(p => ({ id: 'offer-' + p, label: OF.things[p].label, offer: p })) } }
}
// whether a thing picked under an offer starts the set-up conversation (offers.things.setup)
export const offerIsSetup = thing => OF.things[thing].gives.kind === 'setup_chat'
// the message holds a key word of a topic or a Hermes term
export const hasTopicWord = text => knownWords(cutIgnored(talkNorm(text)))
// Every offer question this build can show: [set id, text, pick ids] (tests; the after_topic sets by topic)
export const offerSets = () => [...Object.keys(OF.sets).filter(k => k !== 'after_topic').map(k => offerSet(k)), ...Object.keys(OF.sets.after_topic.by_topic).map(t => offerSet('after_topic', t))]

// The fixed line for a small-talk kind: [line, the name for HELLO or the topic for a plain line].
function smallLine(kind, st) {
  const name = st.name || st.kept.name || null
  if (kind === 'hello') return [st.lastq || ['BACK', 'HELLO', 'HELLO_SAME'].includes(st.last) ? 'HELLO_SAME' : 'HELLO', name]
  if (kind === 'ai') return [LIVE_DATA.lines_by_mode.are_you_an_ai[AI_MODE], null] // talk-live: AI, AI_PICK or AI_WRITES
  if (kind === 'mean' && (st.last === 'then' || st.last === 'rowthen')) return ['MEAN_NONE', null] // live changes-6
  if (kind === 'mean') return st.lastTopic && st.last !== 'plain' ? ['plain', st.lastTopic] : ['MEAN_NONE', null]
  return [{ thanks: 'THANKS', ok: 'OK', how: 'HOW', who: 'WHO', bye: 'BYE', cut: 'CUT', wrong: 'WRONG', stuck: 'STUCK' }[kind], null] // changes-3: stuck
}
// Builder: the plugin's own kinds that route2.py does not have, kept out of no_repeat like the data's exempt
// ones: a skill named by name (changes-15's own words: "a skill named by name") and what Helper keeps, asked
// by typing (A1, A2, A4: the person's own record, or a Yes/No question that must be asked each time).
const EXEMPT_ALSO = ['skill', 'A1', 'A2', 'A4', 'A-none']
// changes-15 (JSON no_repeat, route2.py no_repeat): never the same line twice in a row in answer to typed
// messages, and never a line the person just called wrong in this visit. The line in its place drops the open
// question and keeps any "Kept:" line the original carried. live-v2 (no_repeat.asked_again): a message that
// asks for it again in so many words gets the same line.
function noRepeat(out, st, text) {
  const k = out.kind
  // live-v2 changes-3: what "again" brings back is final
  if (out.by_again) {
    st.rejected = []
    return out
  }
  const t = talkNorm(text)
  const saidWrong = startsWith(t, NR.wrong_starts) || whichOf(t, NR.wrong_anywhere).length > 0
  if (saidWrong && st.lastKey) st.rejected.push(st.lastKey)
  if (!saidWrong && whichOf(t, NR.asked_again).length) {
    st.rejected = []
    return out
  }
  const avoid = [st.lastKey, ...st.rejected]
  if (NR.exempt.includes(k) || EXEMPT_ALSO.includes(k) || !avoid.includes(lineKey(out))) {
    if (!saidWrong) st.rejected = []
    return out
  }
  const group = (Object.entries(NR.groups).find(([, ks]) => ks.includes(k)) || ['answer'])[0]
  const cands = []
  for (const c of NR.in_place[group]) {
    if (c === 'plain') {
      if (out.topic) cands.push({ kind: 'plain', topic: out.topic })
    } else if (c === 'ai_line') cands.push({ kind: LIVE_DATA.lines_by_mode.are_you_an_ai[AI_MODE] }) // changes-3: group who
    else if (c === 'HELLO') cands.push({ kind: 'HELLO', name: st.name || st.kept.name || null }) // changes-3: with the name
    else cands.push({ kind: c })
  }
  const next = cands.find(x => !avoid.includes(lineKey(x))) || cands.find(x => lineKey(x) !== st.lastKey)
  // no other line to say (not possible with today's data: every in_place group has two lines that are not
  // 'plain'): the line as chosen, rather than a crash
  if (!next) return out
  for (const x of ['kept', 'first', 'name_taken', 'thing', 'work_first']) if (x in out) next[x] = out[x]
  next.repeat_of = k
  st.pending = null
  st.lastq = false
  return next
}

/* ---------- live-v2 changes-4: what the person does (keeps.work) ---------- */
const WORK = KEEPS.work
const workEnd = s => s.replace(/[.!\s]+$/, '')
const workWhole = t => t.replace(/[ ?!.,]+$/, '').trim()
// Steps 2 to 7 at "What do you do?". Returns { kind, more } for a line of this step, or null when the message is
// to be answered as an ordinary message (a question, or a topic or term word that does not start like "I run").
function workStep(text, t, st, out) {
  if (questionForm(t)) return null // 2
  if ((strongTopics(t).length || anyTerm(t)) && !startsWith(t, OPENING.name_with_more.self_starts)) return null // 3
  const whole = workWhole(talkNorm(text))
  st.stage = 'open'
  // 4 (review: "change what I do" typed again at WORK_ASK is no answer either)
  if (Object.values(ST.kinds).some(ws => ws.includes(whole)) || WORK.non_answers.includes(whole) || WORK.non_answers.includes(talkNorm(text).trim()) || WORK.typed_change.ask_again_words.includes(whole)) return { kind: 'F3' }
  if (looksSecret(text)) return { kind: 'WORK_SECRET' } // 5
  const value = workEnd(workSqueeze(text))
  if (!workOk(value, { withSecretRule: false })) {
    // 6: too long; the first time the question stays open
    if (!st.workLong) {
      st.workLong = true
      st.stage = 'work'
      return { kind: 'WORK_LONG' }
    }
    st.workLong = false
    return { kind: 'WORK_LONG_2' }
  }
  st.workLong = false
  keep(st, out, 'work', value) // 7
  st.work = value
  if (st.name && st.kept.name !== st.name) keep(st, out, 'name', st.name)
  // (review: after WORK_ASK on a later visit the name is the kept one)
  return { kind: 'F2', more: { name: st.name || st.kept.name || null, work: value } }
}
// keeps.work.typed_change: "I'm a teacher now" replaces (or keeps) what the person does; "change what I do" asks
// WORK_ASK, and the reply goes through workStep. Returns { kind, more } or null.
function workChange(text, st, out) {
  const TC = WORK.typed_change
  const whole = workWhole(talkNorm(text))
  if (TC.ask_again_words.includes(whole)) {
    st.stage = 'work'
    st.workLong = false
    st.pending = null
    return { kind: 'WORK_ASK' }
  }
  const raw = workSqueeze(String(text).replace(/[\u2018\u2019]/g, "'"))
  let t = stripLead(talkNorm(raw))
  if (startsWith(t, ['actually'])) t = t.slice('actually'.length).replace(/^[ ,]+/, '')
  if (!startsWith(t, TC.starts) || !whichOf(t, TC.now_words).length) return null
  // (the rule names keeps.typed_change.not_words; changes-4's own list is not_with: review, both count)
  if (t.includes('?') || questionForm(t) || whichOf(t, TC.not_with).length || whichOf(t, KEEPS.typed_change.not_words).length || strongTopics(t).length || anyTerm(t)) return null
  // the value: the message as typed, from where t starts, with end marks and the now-word at its end cut
  let value = workEnd(Array.from(raw).slice(Array.from(raw).length - charCount(t)).join(''))
  const nowAtEnd = [...TC.now_words].sort((a, b) => b.length - a.length).find(w => value.toLowerCase().endsWith(' ' + w))
  if (nowAtEnd) value = workEnd(value.slice(0, value.length - nowAtEnd.length).replace(/[ ,]+$/, ''))
  if (!value || looksSecret(text) || !workOk(value)) return null
  keep(st, out, 'work', value)
  return { kind: 'F2', more: { name: st.name || st.kept.name || null, work: value } }
}

// One typed message -> a result (route2.py turn, changes-14's wrapper): the steps below, then no_repeat; met
// is set when the opening ends here, and the line is noted as Helper's last.
export function turn(text, st) {
  return turnParts(text, st).out
}
// talk-live: the same, with the result before no_repeat as well (pre, a copy), which decides whether the AI
// step is asked (src/live-turn.js goesToAi); out is the line shown when it is not, and the fallback when it is.
export function turnParts(text, st) {
  const wasOpening = st.stage === 'name' || st.stage === 'work'
  const prevTopic = st.lastTopic // offer-t1: the topic of Helper's last line, for offers.sets.after_topic
  const steps = turnSteps(text, st)
  const pre = { ...steps }
  if (steps.kind === 'PICK_FIRST') return { pre, out: steps } // ask-fix-t1: nothing changes, the same things to pick stay
  const out = noRepeat(steps, st, text)
  if (wasOpening && st.stage === 'open') st.met = true // keeps.met.written_when: the opening ended, by any route
  noteLast(st, out)
  return { pre, out: attachOffer(out, st, prevTopic) }
}
// The order of steps is route2.py's _turn(), with no model.
function turnSteps(text, st) {
  const out = {}
  const openAtStart = st.stage === 'open'
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
  // ask-fix-t1 (small_talk.how_that): "ok and how do I do that", first at stage open, before small talk and any AI call
  if (st.stage === 'open') {
    const hw = howThat(text, st)
    if (hw) return Object.assign(out, hw)
  }
  // 0 b. ordinary talk (changes-14): hello, thanks, ok, cut off, "what do you mean", "that's wrong" ...
  const sk = smallTalk(text, st)
  // ask-fix-t1 (mean_rule_ask_fix_t1): the mean words themselves right after a word line with a mean field
  if (sk === 'mean' && st.last === 'term' && TERMS[st.lastParts.term].mean && ST.kinds.mean.some(w => w.length > 4 && hits(talkNorm(text), w))) {
    st.stage = 'open'
    return done('termmean', { term: st.lastParts.term })
  }
  // live-v2 changes-3 (small_talk.again_rule): this visit's last answer line again, or AGAIN or MEAN_NONE
  if (sk === 'again') {
    st.stage = 'open'
    const { kind, ...more } = againLine(st)
    return done(kind, { ...more, by_again: true })
  }
  if (sk === 'mean') {
    const bare = talkNorm(text).replace(/[ ?!.]+$/, '')
    const w = bare.replace(/^(?:(?:ok|okay|so|and|cool|right)\b[ ,]*)+(?=\S)/, '').trim() || bare
    const thenWord = THEN_W.includes(w) || THEN_W.includes(bare)
    // live changes-6 (then_rule): the then words right after a plain line that has a then line
    if (thenWord && st.last === 'plain' && st.lastTopic && TOPICS[st.lastTopic].plain.then) {
      st.stage = 'open'
      return done('then', { topic: st.lastTopic })
    }
    // live changes-9 (not in route2.py; st.c9 false only for replaying it): the then words right after a row with a then
    // line (msg1), and right after a topic's then line when one row of that topic has one (msg0-then, then msg1-then)
    if (st.c9 !== false && thenWord && st.last === 'row') {
      const n = TOPICS[st.lastParts.topic].needs.find(x => x.id === st.lastParts.need)
      if (n && n.then) return done('rowthen', { topic: st.lastParts.topic, need: n.id })
    }
    if (st.c9 !== false && thenWord && st.last === 'then' && st.lastTopic) {
      const ns = TOPICS[st.lastTopic].needs.filter(x => x.then)
      if (ns.length === 1) return done('rowthen', { topic: st.lastTopic, need: ns[0].id })
    }
    // live changes-9: kind mean right after a next line with a second wording (use1-next, use3-next)
    if (st.c9 !== false && ['extra', 'nextline'].includes(st.last) && NEXT_MEAN[st.lastParts.line]) return done('nextmean', { id: NEXT_MEAN[st.lastParts.line].id })
  }
  if (sk) {
    const [line, x] = smallLine(sk, st)
    st.stage = 'open'
    if (line === 'plain') return done('plain', { topic: x, why: 'what do you mean' })
    return line === 'HELLO' ? done(line, { name: x }) : done(line)
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
  if (built && built.h2) {
    st.stage = 'open'
    return done('H2', { why: built.h2 }) // changes-16
  }
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
      // changes-17: a one-word name ("Will") is not a question
      ordinary = both || (!name && (strongTopics(t).length > 0 || anyTerm(t) || questionForm(t)) && !oneWordName(text, st))
      if (!name && !ordinary) name = codeName(text)
      if (name && oneWordName(text, st)) name = capFirst(String(text).trim().replace(/[.!]+$/, '').trim()) // "Ty!" is Ty
    } else if (st.keepWork !== false) {
      // live-v2 changes-4: the reply to "What do you do?" (keeps.work steps 2 to 7; step 1, a key, is above)
      const w = workStep(text, t, st, out)
      if (w) return done(w.kind, w.more)
      ordinary = true
    } else ordinary = questionForm(t)
    if (!ordinary) {
      let work = null
      const n = typedWords(text).length
      if (st.stage === 'work' && n >= 1 && n <= OPENING.work_max_words) work = text.trim()
      st.name = name || st.name
      st.work = work
      if (work || st.stage === 'work') {
        st.stage = 'open'
        // changes-15: the name was written at F1 already; only a name new here would be written now. What the
        // person does is used for this visit only, never kept.
        if (st.name && st.kept.name !== st.name) keep(st, out, 'name', st.name)
        return done('F2', { name: st.name, work })
      }
      // changes-15: met and the name are written as soon as the name question is answered; the first
      // "Kept:" line shows under F1
      st.stage = 'work'
      st.met = true
      if (st.name) keep(st, out, 'name', st.name)
      return done('F1', { name: st.name })
    }
    st.stage = 'open'
    st.lastq = false
  }
  // a skill by its name, next to "skill" (changes-6 fix 3): before the topics, so "is there a
  // github skill" gets the skill, not the service question. A row for that skill wins; else S1
  // (built in) or S2 (optional, with the clicks to add it); changes-19: no skill is left out.
  if (st.wants !== false) {
    // The Builder's rule, in the reference since wants fixes v1 (wants_fixes_step.py c): a group's own label typed as it is on its
    // button ("pictures and video") is that group, as if picked; else "I don't know that one" (N2).
    // Only when the conversation was already open as the message came, as the reference has it. The
    // reference checks it first, before "remember that ..." and the other early steps; here it stays at
    // its old place, after them: none of the four labels reaches those steps (tests/talk-wf1.test.mjs).
    const group = openAtStart ? GROUP_BY_LABEL.get(asLabel(cutIgnored(talkNorm(text)))) : null
    if (group) return done('G1', { group, buttons: pickGroupSteps(group, st).buttons })
    const sk = skillOf(cutIgnored(talkNorm(text)))
    if (sk.length === 1) {
      const row = rowOfSkill(sk[0])
      if (row) return done('want', { row: row.id })
      return done('skill', { skill: sk[0] })
    }
  }
  // a skill named in a clear pattern is looked up before the terms
  const dk = dontKnow(text)
  if (dk === 'N1a') return done(dk)
  // changes-11, in route2.py's order: a name on a later visit, "what is ...", cost, where
  if (st.stage === 'open') {
    // live-v2 changes-4 (keeps.work.typed_change and ask_again): what the person does, said again by typing
    if (st.keepWork !== false) {
      const wc = workChange(text, st, out)
      if (wc) return done(wc.kind, wc.more)
    }
    const nl = nameLater(text, st, out)
    if (nl) return done(nl.kind, { name: nl.name })
    const tw = cutIgnored(talkNorm(text))
    // offer-t1: offer_words, new lines from the docs; ask-fix-t1 (offer_words.pending_rule): while a question is open,
    // only a message in question form, and never FREE or a row
    let orr = offerRoute(tw)
    if (st.pending && !(orr && questionForm(tw) && orr !== 'FREE' && !orr.startsWith('ROW:'))) orr = null
    if (orr && orr.startsWith('ROW:')) return done('row', { topic: orr.slice(4, 7), need: orr.slice(4) })
    if (orr) return done(orr)
    const wi = whatIs(tw)
    if (wi) return done('plain', { topic: wi, why: 'what is' })
    // live changes-6: PRIV, POWER, HVC; not as the answer to Helper's own question
    const c6 = st.pending ? null : c6Line(tw)
    if (c6) return done(c6)
    const fx = fixedByWords(tw, st)
    if (fx) return done(fx)
  }
  // 4 and 5. the topic and the need, by key words
  const code = byCode(text, st)
  out.code = code
  const { topic, several } = code
  let { need } = code
  // live changes-6 (mod3_guard): mod3 is not the answer when the message names a hosted or free AI
  if (need === 'mod3' && whichOf(t, C6.hosted_words).length) need = code.need = null
  // ask-fix-t1 (about_rule): a key word alone never shows the row (a weak hit)
  if (need && topic && st.pending !== topic && !aboutOk(t, need)) {
    out.weak_hit = need
    need = code.need = null
  }
  // the rows: one is shown; two or more, "Which one do you mean?" with their labels (three and
  // "More" when over four; wants_step.py shows the first four)
  if (code.rows) return code.rows.length === 1 ? done('want', { row: code.rows[0] }) : done('W1', { buttons: code.rows })
  if (code.term) return done('term', { term: code.term })
  // changes-11: two terms that are a pair (skill and plugin) get W2, which compares them
  if (several && (TALK_DATA.w1_pairs || []).some(p => samePair(p.terms, several))) return done('W2', { buttons: several })
  // 7. the first that fits
  if (topic && need) {
    const answered = st.pending === topic
    // keeps rule 2: only an answer to Helper's own open question, and only when code found it;
    // changes-11 (keeps.typed_change): otherwise the newest thing said may replace the kept one
    if (answered) keepTyped(t, topic, need, st, out)
    else typedChange(t, topic, st, out)
    st.found[topic] = need
    if (topic === 'svc') st.service = serviceIn(text, st, answered)
    return withServiceLine(done('row', { topic, need }), st)
  }
  if (several) return done('W1', { buttons: several.slice(0, TALK_DATA.answers.max_at_once) })
  // ask-fix-t1 (about_rule.weak_hit_then.no_ai): the topic's own question again, also when it was asked before; only if
  // that question was Helper's last line, the don't-know line. A kept answer is not shown for a weak hit.
  if (out.weak_hit && topic) {
    if (TOPICS[topic].question.answers.length && st.lastKey !== lineKey({ kind: 'question', topic })) {
      if (!st.asked.includes(topic)) st.asked.push(topic)
      const r = done('question', { topic })
      st.pending = topic
      return r
    }
    return done('N1')
  }
  // keeps.use: something is kept for this topic, so its question is not asked
  if (topic && keptNeed(topic, st)) {
    const r = fromKept(topic, st)
    return withServiceLine(done('row', { topic: r.topic, need: r.need, used: 'kept' }), st)
  }
  if (topic && !st.lastq && !st.asked.includes(topic)) {
    st.asked.push(topic)
    const r = done('question', { topic })
    st.pending = topic
    return r
  }
  if (topic) return done('plain', { topic })
  // the near miss: no row, but a subject word of exactly one group: N2 with that group's rows
  if (st.wants !== false) {
    const g = nearOf(t)
    if (g.length === 1) return done('N2', { group: g[0] })
  }
  return done(dontKnow(text) || 'skill by name')
}

/* ---------- what the person picks or presses ---------- */
// An answer picked under a topic question: its need's row at once. No key words, no model. A
// picked answer to one of the three questions is kept (keeps rule 2).
function pickSteps(topic, i, st) {
  const a = TOPICS[topic].question.answers[i]
  st.found[topic] = a.gives
  st.pending = null
  st.lastq = false
  if (a.service) st.service = a.service
  const out = { kind: 'row', topic, need: a.gives }
  if (topic === 'mod') keep(st, out, 'mod', a.gives)
  else if (topic === 'msg' && (a.gives === 'msg1' || a.gives === 'msg2')) keep(st, out, 'msg', a.label)
  else if (topic === 'svc' && a.service) keep(st, out, 'svc', a.service)
  return withServiceLine(out, st)
}

// A topic picked under TP or C1. A pick that holds several topics: line C1. Else the kept row, the
// topic's question if not asked yet, or its plain line. The held pick "Web, files, pictures and
// voice" (held_picks.wants, changes-9): the wants question can-q at once, its four groups to pick
// (route2.py pick_topic).
function pickTopicSteps(topic, st) {
  if (TALK_DATA.held_picks && TALK_DATA.held_picks.includes(topic)) {
    st.pending = null
    st.lastq = false
    return { kind: 'can-q', buttons: WANTS_DATA.groups.map(g => g.id) }
  }
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
    return withServiceLine(r, st)
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
function changeSteps(topic, st) {
  if (!st.asked.includes(topic)) st.asked.push(topic)
  st.pending = topic
  st.lastq = true
  return { kind: 'question', topic }
}

// A button under "Which one do you mean?", with the message that led to it. A row's button: that
// row.
function pressSteps(choice, text, st) {
  st.lastq = false
  if (WANT_ROWS[choice]) return pickWantSteps(choice, st)
  if (TERMS[choice]) return { kind: 'term', term: choice }
  const ns = needsFor(cutIgnored(talkNorm(text)), choice, false)
  if (ns.length !== 1) return { kind: 'plain', topic: choice }
  st.found[choice] = ns[0]
  if (choice === 'svc') st.service = serviceIn(text, st, false)
  return withServiceLine({ kind: 'row', topic: choice, need: ns[0] }, st)
}

// A group picked under "What do you want Hermes to do?": line G1 with the group's rows to pick.
// Not a question, so lastq stays false (helper-wants-v1.md 6.3).
function pickGroupSteps(group, st) {
  st.pending = null
  st.lastq = false
  return { kind: 'G1', group, buttons: WROWS.filter(r => r.group === group).map(r => r.id) }
}
// A row picked (under G1, N2 or "Which one do you mean?"): its line and its button. No key words.
function pickWantSteps(id, st) {
  st.pending = null
  st.lastq = false
  return { kind: 'want', row: id }
}

// An answer under "Do you mean me, or your own Hermes?" (RM2): 'helper' or 'hermes'.
function rmPickSteps(who, st) {
  st.lastq = false
  if (who === 'helper') return { kind: 'RM3' }
  return pressSteps('mem', st.rmText || '', st)
}

// Skip, at "What's your name?" or "What do you do?". A name given before Skip is kept now.
// changes-14: a pressed Skip is remembered (met). changes-15: a name given before Skip was written at F1.
export function skip(st) {
  if (st.stage !== 'name' && st.stage !== 'work') return null
  st.stage = 'open'
  st.lastq = false
  st.pending = null
  st.met = true
  const out = { kind: 'F3' }
  noteLast(st, out)
  if (st.name && st.kept.name !== st.name) keep(st, out, 'name', st.name)
  return attachOffer(out, st, null) // offer-t1: F3 carries the offer general
}

// A button that makes Helper say one more pre-written line.
function sayLineSteps(line, st) {
  st.lastq = false
  st.pending = null
  return { kind: 'extra', line }
}

// offer-t1 (route2.py press_offer): a thing picked under an offer, by its id only, never by key words.
// ask-fix-t1 point 8 (not in route2.py): a pick of the pay offer (ChatGPT, Claude, Neither, I want it free) is kept
// as a picked answer to the model question is.
export function pressOffer(thing, st) {
  const g = OF.things[thing].gives
  const prevTopic = st.lastTopic
  let o
  if (g.kind === 'topic_pick') o = pickTopicSteps(g.id, st)
  else if (g.kind === 'term') o = { kind: 'term', term: g.id }
  else if (g.kind === 'row') {
    o = { kind: 'row', topic: g.id.slice(0, 3), need: g.id }
    if (thing.startsWith('pay_')) {
      st.found.mod = g.id
      keep(st, o, 'mod', g.id)
    }
  } else if (g.kind === 'setup_chat') o = { kind: 'SETUP_' + g.id }
  else o = { kind: g.id }
  noteLast(st, o)
  return attachOffer(o, st, prevTopic)
}

// "See what I keep" pressed where Helper's settings page cannot open: the list, as for A1.
export const seeKept = st => noteLast(st, aboutKept({ kind: 'A1' }, st))
// "Delete all of it" under that list: the A4 question.
export const askForgetAll = st => noteLast(st, aboutKept({ kind: 'A4' }, st))

// Yes or No under "Delete your name?" (what: name, mod, msg, svc, asked) or "Delete everything I
// keep about you?" (what: 'all'). Yes deletes from the visit's record; the page then writes it.
// When nothing is left, the whole record goes, told as well (keeps.storage), so the first-time
// line shows again at the next keep. A forgotten name is not used again in this visit either.
function forgetAnswerSteps(what, yes, st) {
  st.lastq = false
  st.pending = null
  if (!yes) return { kind: 'A-no', what }
  if (what !== 'all') delete st.kept[what]
  if (what === 'work') delete st.kept.told_work // changes-4: told again when kept anew
  if (what === 'all' || !hasKeptValues(st.kept)) for (const k of Object.keys(st.kept)) delete st.kept[k]
  if (what === 'all' || what === 'name') st.name = null
  return { kind: 'A-yes', what }
}

// changes-14/15 (route2.py conv: note_last after a pick or a button): Helper's last line, whatever led to it.
// Every pick and button below notes its line; st is each one's last argument.
const noted = fn => (...a) => noteLast(a[a.length - 1], fn(...a))
export const pick = noted(pickSteps)
export const pickTopic = noted(pickTopicSteps)
export const change = noted(changeSteps)
export const press = noted(pressSteps)
export const pickGroup = noted(pickGroupSteps)
export const pickWant = noted(pickWantSteps)
export const rmPick = noted(rmPickSteps)
export const sayLine = noted(sayLineSteps)
export const forgetAnswer = noted(forgetAnswerSteps)

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
  Object.values(FIXED).forEach(f => take(f.next)) // ask-fix-t1: PRIV-next, SAFE-next
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
const labelOf = id => (TOPICS[id] ? TOPICS[id].pick.label : WANT_ROWS[id] ? WANT_ROWS[id].label : TALK_DATA.held_labels[id] || TERMS[id].label)
const yesNo = (answers, what) => ({ kind: 'question', hint: TALK_DATA.answers.hint_under_question, items: answers.map(a => ({ id: `forget-${what}-${a.gives}`, label: a.label, forget: [what, a.gives === 'yes'] })) })
// A group's rows to pick (under G1 and N2), three and "More" when over four.
const rowPicks = (ids, kind) => ({ kind, hint: TALK_DATA.answers.hint_under_question, items: pageOf(ids.map(id => ({ id, label: WANT_ROWS[id].label, want: id }))) })
// A row's button: "Show me what to ask" (text to paste) or, for an optional skill, "Show me how to
// add it" (the app's clicks, then the line that it works from the next new chat).
function wantNext(n, name) {
  if (n.kind === 'steps') return { kind: 'steps', label: n.label, steps: n.steps.map(s => fillSlots(s, { name })), after: fillSlots(n.after, { name }) }
  return { kind: 'paste', label: n.label, text: n.paste_text }
}
// A source as the talk data writes it: "file line N" (or "lines" for several of one file).
const sourceText = sources => (sources || []).map(s => `${s.file} line ${s.line}`).join('; ') || null
// S1 or S2 for a skill with no row of its own: Helper's fixed line, the box "From the Hermes docs"
// with the page's own words (not Helper's voice), and for an optional skill the clicks to add it.
// Skill lines v1 (content/helper-skill-lines-v1.md): the line says "It teaches Hermes to {say}", the
// skill's own plain words; a skill whose say is null gets the old sentence, kept as text_fixed.
function skillLine(name, said) {
  const s = WSKILLS.get(name)
  const f = WANTS_DATA.fixed[s.kind === 'optional' ? 'S2' : 'S1']
  const text = s.say != null && /\{say\}/.test(f.text) ? fillSlots(f.text, { name, say: s.say }) : fillSlots(f.text_fixed !== undefined ? f.text_fixed : f.text, { name })
  const docs = { head: WANTS_DATA.fixed['box-head'].text, words: s.docs_words, source: `${s.page} line ${s.line}` }
  return said(s.kind === 'optional' ? 'S2' : 'S1', text, { source: docs.source, docs, next: f.next ? wantNext(f.next, name) : null })
}

// The words for one kept thing (keeps.things[].kept_words): "Peter", "you pay for ChatGPT",
// "you use WhatsApp", "you use Gmail", or the thing as asked.
export function keptWords(key, value) {
  if (key === 'mod') {
    const v = KEEPS.answers.mod.values.find(x => x.need === value)
    return v ? v.value : String(value)
  }
  const thing = KEEPS.things.find(x => x.id === key)
  return fillSlots(thing ? thing.kept_words : '{value}', { name: value, app: value, service: value, thing: value, work: value, value })
}
// The rows of the list behind "See what I keep" (keeps.tell.see.rows), in their order.
export function keptRows(kept) {
  const R = KEEPS.tell.see.rows
  const rows = []
  if (kept.name) rows.push(fillSlots(R.name, { name: kept.name }))
  if (kept.work) rows.push(fillSlots(R.work, { work: kept.work })) // changes-4: second, after the name
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
  // items: what this line says was kept, [key, value] each, so the page can mark the line once
  // that is no longer kept (forgotten, or replaced by a newer one)
  const items = result.kept.map(k => [k, k === 'asked' ? result.thing : st.kept[k]])
  // workTold: changes-4's line that the AI is told what the person does (lines_by_mode.work_told; none with no AI step)
  return { text: fillSlots(KEEPS.tell.kept_line, { kept_words: words.join('. ') }), link: KEEPS.tell.link.words, first: result.first ? FIRST_TIME : null, ...(result.work_first && WORK_TOLD ? { workTold: WORK_TOLD } : {}), items }
}
// Is one thing a faint line named still kept, as it was then? In any capitals (a name saved again
// as "anna" on the settings page is still Anna; "asked" things count the same way in the remember
// step and on the settings page).
export function stillKept(kept, [key, value]) {
  const same = a => String(a).toLowerCase() === String(value).toLowerCase()
  if (key === 'asked') return (kept.asked || []).some(same)
  return kept[key] != null && same(kept[key])
}
// A faint line (note: "Kept: ...", or used: "From what I keep: ...") that is no longer true: none
// of what it named is kept any more. (A line names one thing in all but one rare case, a name and
// a typed change in one message; such a line is struck once both are gone.) A thing kept again
// later makes its old line true again, and it is no longer struck.
export function noteForgotten(note, kept) {
  if (!note || !kept) return false
  const items = note.items || (note.topic ? [[note.topic, note.value]] : [])
  return items.length > 0 && !items.some(item => stillKept(kept, item))
}

// The opening line. changes-14 (keeps.met): when the window opens on a visit whose met mark is set, Helper says
// BACK ("Hi again, {name}. What would you like Hermes to help you with?", or without the name) and asks no
// opening question; else OPEN with "What's your name?". With no visit: OPEN's line (for the tests).
export function openingLine(st = null) {
  if (!st) return lineFor({ kind: 'OPEN' }, freshVisit('name'))
  return lineFor(opening(st), st)
}

// result: what turn, pick, pickTopic, press, skip, sayLine, change, rmPick or forgetAnswer
// returned. typed: the person's words (for the text to paste under "your own Hermes can").
// opts.settingsPage: Helper's page in Hermes's Settings exists (A1 then offers it). opts.keptShown: the
// conversation shows that something was kept (keptWasShown; A1 with nothing kept then says it was deleted).
// Returns { line, text, source, answers, next, paste, note, used, hint, rows, docs }:
//   docs: the box "From the Hermes docs" { head, words, source } (S1, S2), the page's own words;
//   next may also be { kind: 'steps', label, steps, after } (the clicks to add an optional skill);
//   an answer to pick may be { more: [the next ones] } ("More", three at a time, src/page.js).
//   note: the faint "Kept: ..." line { text, link, first }; used: "From what I keep: ..." { text,
//   link, topic }; hint: a small faint line (N_HINT); rows: the list of kept things (A1).
// live-v2 changes-2 (keeps.tell.see.see_line_deleted_when): whether this conversation shows that something was kept:
// a faint "Kept:" or "From what I keep:" line, a kept row in the list, or the "Done." line of a delete (all, or one
// thing). Only what this conversation shows counts, never the met mark, so every visit answers alike.
export function keptWasShown(log) {
  const done = [KEEPS.tell.see.delete_all.after_yes, KEEP_TYPED.forget_one.after_yes]
  return log.some(e => e.who === 'helper' && !!(e.note || e.used || (e.rows && e.rows.length) || done.includes(e.text)))
}
// setup-chat: the text and the Q_NEW answers of a line that opens the set-up conversation
const setupOpener = (kind, st) => {
  const q = openQNew(kind, st)
  return [q.text, { answers: q.answers }]
}
export function lineFor(result, st, typed = '', opts = {}) {
  // asTyped: the person's own name as filled into the line, for the view to leave as typed (src/quotes.js)
  const asTyped = [st.name, result.name].filter(s => typeof s === 'string' && /['"]/.test(s))
  // offer-t1: the offer a line carries, shown by the page as a second bubble with its things to pick
  const offer = result.offer ? { set: result.offer.set, text: result.offer.text, answers: { kind: 'offer', hint: OF.hint, items: result.offer.picks.map(id => ({ id: 'offer-' + id, label: OF.things[id].label, offer: id })) } } : null
  const said = (line, text, more = {}) => ({ line, text, source: null, answers: null, next: null, paste: null, note: keptNote(result, st), used: null, hint: null, rows: null, docs: null, ...(offer ? { offer } : {}), ...(asTyped.length ? { asTyped } : {}), ...more })
  const named = f => (st.name ? fillSlots(f.text, { name: st.name }) : f.text_no_name || f.text)
  // offer-t1: the faint hint N_HINT is no longer shown; the offer dont_know takes its place
  const dontKnowLine = id => said(id, FIXED[id].text)
  const RM = Object.fromEntries(KEEP_REMEMBER.lines.map(l => [l.id, l]))
  const ONE = KEEP_TYPED.forget_one
  const ALL = KEEPS.tell.see.delete_all
  switch (result.kind) {
    case 'K1':
      return said('K1', FIXED.K1.text)
    case 'H1':
    case 'H2': {
      // changes-16: H2 ("can it build ...?") has its own text to paste, filled the same way as H1's
      const request = Array.from(String(typed).trim()).slice(0, TALK_DATA.limits.request_chars_in_paste).join('').replace(/"/g, "'")
      return said(result.kind, FIXED[result.kind].text, { source: FIXED[result.kind].source || null, paste: fillSlots(FIXED[result.kind].paste_text, { request }) })
    }
    case 'OPEN':
      return said('OPEN', FIXED.OPEN.text)
    // changes-14: a later visit (BACK) and a hello greet by the kept name, or without one
    case 'BACK':
    case 'HELLO': {
      const f = FIXED[result.kind]
      return said(result.kind, result.name ? fillSlots(f.text, { name: result.name }) : f.text_no_name || f.text)
    }
    // changes-14/15: ordinary talk and the lines no_repeat puts in place of a repeat: one line, nothing to pick
    case 'HELLO_SAME':
    case 'THANKS':
    case 'OK':
    case 'HOW':
    case 'WHO':
    case 'AI':
    case 'AI_PICK':
    case 'AI_WRITES':
    case 'BYE':
    case 'CUT':
    case 'MEAN_NONE':
    case 'WRONG':
    case 'AGAIN':
    // live-v2 changes-3: each kind's own line in place of a repeat, and STUCK
    case 'OK_SAME':
    case 'THANKS_SAME':
    case 'HOW_SAME':
    case 'BYE_SAME':
    case 'CUT_SAME':
    case 'WRONG_SAME':
    case 'STUCK':
    case 'STUCK_SAME':
      return said(result.kind, FIXED[result.kind].text)
    // live-v2 changes-4: what the person does, not kept (a secret, too long) or asked again
    case 'WORK_SECRET':
    case 'WORK_LONG':
    case 'WORK_LONG_2':
    case 'WORK_ASK': {
      if (setupOpens(result.kind, st)) return said(result.kind, ...setupOpener(result.kind, st))
      return said(result.kind, WORK.lines[result.kind])
    }
    case 'F1':
      return said('F1', named(FIXED.F1))
    case 'F2':
      if (setupOpens('F2', st)) return said('F2', ...setupOpener('F2', st))
      // talk-live-2: on a later visit (WORK_ASK, a typed change) the result carries the kept name
      return said('F2', result.name && !st.name ? fillSlots(FIXED.F2.text, { name: result.name }) : named(FIXED.F2))
    case 'F3':
      if (setupOpens('F3', st)) return said('F3', ...setupOpener('F3', st))
      return said('F3', FIXED.F3.text)
    case 'TP':
      return said('TP', FIXED.TP.text, { answers: topicPicks() })
    case 'N1':
    case 'N1a':
    case 'N1_AGAIN': // changes-15: in place of a second don't-know line, the faint hint under it as under N1
      return dontKnowLine(result.kind)
    case 'skill by name':
      // an official skill asked about by its name that the skill step did not settle (two at once)
      return { ...dontKnowLine('N1'), line: 'N1-skill' }
    case 'W1': {
      const items = result.buttons.map(id => ({ id, label: labelOf(id), which: id }))
      return said('W1', FIXED.W1.text, { answers: { kind: 'which', hint: TALK_DATA.answers.hint_under_question, items: pageOf(items) } })
    }
    // changes-11: skill and plugin compared, then the same two picks as under W1
    case 'W2': {
      const items = result.buttons.map(id => ({ id, label: labelOf(id), which: id }))
      return said('W2', FIXED.W2.text, { source: FIXED.W2.source || null, answers: { kind: 'which', hint: TALK_DATA.answers.hint_under_question, items: pageOf(items) } })
    }
    // changes-11: the cost line and where to run Hermes, each with its "Open ..." button
    case 'COST':
    case 'WHERE':
      return said(result.kind, FIXED[result.kind].text, { source: FIXED[result.kind].source || null, next: nextFor(FIXED[result.kind].next, null, st) })
    // changes-11: a name typed on a later visit
    case 'NAME_AGAIN':
    case 'NAME_NEW':
      return said(result.kind, fillSlots(FIXED[result.kind].text, { name: result.name }))
    case 'can-q': {
      const q = WANTS_DATA.question
      return said('can-q', q.text, { answers: { kind: 'question', hint: TALK_DATA.answers.hint_under_question, items: q.answers.map(a => ({ id: 'group-' + a.gives_group, label: a.label, group: a.gives_group })) } })
    }
    case 'G1':
      return said('G1', WANTS_DATA.fixed.G1.text, { answers: rowPicks(result.buttons, 'rows') })
    case 'N2':
      return said('N2', WANTS_DATA.fixed.N2.text, { answers: rowPicks(WROWS.filter(r => r.group === result.group).map(r => r.id), 'rows') })
    // talk-live: a reply the person's AI wrote (ai_writes): its words only, no source, nothing to pick
    case 'written':
      return said('written', result.text)
    // talk-live: the Connectors line picked by the person's AI (ai_picks_line), as a row shows it
    case 'CN1':
      return said('CN1', WANTS_DATA.fixed.CN1.text, { source: sourceText(WANTS_DATA.fixed.CN1.sources) })
    case 'want': {
      const r = WANT_ROWS[result.row]
      return said(r.id, r.text, { source: sourceText(r.sources), next: wantNext(r.next, r.thing) })
    }
    case 'skill':
      return skillLine(result.skill, said)
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
      const used = result.used === 'kept' ? { text: fillSlots(KEEPS.use.used_line, { kept_words: keptWords(result.topic, st.kept[result.topic]) }), link: KEEPS.use.used_link.words, topic: result.topic, value: st.kept[result.topic] } : null
      // changes-6 fix 6: Gmail, Google Calendar, Google Drive: CN1; GitHub: the github skill (S1)
      if (result.serviceLine && result.serviceLine.line === 'S1') return { ...skillLine(result.serviceLine.skill, said), used }
      if (result.serviceLine) {
        const f = WANTS_DATA.fixed[result.serviceLine.line]
        // changes-16: CN2 names the service it was asked about ({service}: Google Calendar or Google Drive)
        return said(result.serviceLine.line, fillSlots(f.text, { service: st.service }), { source: sourceText(f.sources), used })
      }
      return said(n.id, n.text, { source: n.source, next: nextFor(n.next, result.topic, st), used })
    }
    case 'extra': {
      const x = EXTRA_LINES[result.line]
      return said(x.id, x.text, { source: x.source })
    }
    // live changes-6 and -9: a then line (msg0-then, msg1-then); ask-fix-t1: the text of the last line's button, a word
    // line's second wording with the word line's button; live changes-9: a next line's second wording
    case 'then': {
      const x = TOPICS[result.topic].plain.then
      return said(x.id, x.text, { source: x.source || null })
    }
    case 'rowthen': {
      const x = TOPICS[result.topic].needs.find(n => n.id === result.need).then
      return said(x.id, x.text, { source: x.source || null })
    }
    case 'nextline':
      return said(result.id, result.text, { source: (EXTRA_LINES[result.id] || {}).source || null })
    case 'termmean': {
      const t = TERMS[result.term]
      return said(t.mean.id, t.mean.text, { source: t.mean.source || null, next: nextFor(t.next, null, st) })
    }
    case 'nextmean': {
      const x = Object.values(NEXT_MEAN).find(m => m.id === result.id)
      return said(x.id, x.text, { source: x.source || null })
    }
    // ask-fix-t1: the same things to pick stay under it (the page shows the last line's again)
    case 'PICK_FIRST':
      return said('PICK_FIRST', FIXED.PICK_FIRST.text, { samePicks: true })
    // ask-fix-t1: the last line's button again, named in the line
    case 'HOW_PASTE':
    case 'HOW_PART': {
      const next = nextFor(result.button, result.topic || null, st)
      return said(result.kind, fillSlots(FIXED[result.kind].text, { label: next && next.label ? next.label : result.label }), { next })
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
      // live-v2 changes-2: nothing kept, and this conversation shows something was kept (opts.keptShown, from the
      // page's keptWasShown): it was deleted. Else nothing was kept yet.
      if (!rows.length) return opts.keptShown ? said('A1-deleted', KEEPS.tell.see.see_line_deleted) : said('A1-none', KEEPS.tell.see.see_line_nothing)
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
      // live changes-6, offer-t1, ask-fix-t1: a fixed line from the docs (PRIV, MIG, KEY ...), with its button if it has one
      if (!result.buttons) return said(result.kind, f.text, { source: f.source || null, next: nextFor(f.next, null, st) })
      return said(result.kind, f.text, { source: f.source || null, answers: { kind: 'pair', hint: TALK_DATA.answers.hint_under_topics, items: (result.buttons || []).map(id => ({ id, label: labelOf(id), topic: id })) } })
    }
  }
}

// The hint in the empty message box. With nothing to pick it is hhdesign's stand-in: the
// data has no words for it.
export const REPLY_HINT = 'Reply to Helper'
export const hintFor = entry => (entry && entry.answers && entry.answers.items.length ? entry.answers.hint : REPLY_HINT)
