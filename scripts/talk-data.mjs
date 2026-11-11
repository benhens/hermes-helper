// What the build does with hhcontent's talk data (content/helper-talk-v2.json, a copy of the
// team's file): checks it, and cuts it down to what the code uses.
//   talkProblems(json)   every reason the build must stop: a line with no source, a line over
//                        hhcontent's limits (R1 to R9, checkLine below), an answer that gives a
//                        need of another topic, any list of things to pick longer than five, a
//                        button of an unknown kind. No file is written while this list is not empty.
//   slimTalkData(json)   only the fields src/talk.js reads, and each line's source. Notes that
//                        name team members, the rules in prose and what is not built yet stay out
//                        of the public built file (row 13 of docs/build/talk-v1-plan.md).
// checkLine is hhcontent's check.py (dev/checks/hhcontent-talk-v2), ported;
// tests/talk-data.test.mjs compares the two on every line and on lines broken on purpose.

import fs from 'node:fs'
import path from 'node:path'

const MAX_WORDS = 25
const MAX_Q_WORDS = 12
const MAX_SENT = 14
const MAX_SENTS = 3
const MAX_LETTERS = 12
// term -> words one of which must be in the same line. talk-live (live-v2 changes-1): the list is data
// now, content/helper-talk-live-v2.json checks.gloss.list, read by check.py (R5) and check_live.py (c22)
// alike. ignore_case false: the term counts only as written (MCP); explained_by in any case. The 11
// patterns are plain enough to mean the same in JavaScript (tests/talk-data.test.mjs runs check.py's own
// findings against these on every line).
export const GLOSS_LIST = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'content', 'helper-talk-live-v2.json'), 'utf8')).checks.gloss.list
const GLOSS = GLOSS_LIST.map(g => [new RegExp(g.term, g.ignore_case ? 'i' : ''), new RegExp(g.explained_by, 'i')])
const BANNED = /\b(?:profiles?|providers?|gateways?|toolsets?|cron|sessions?|agents?|API|config\w*|yaml|CLI|terminal|command line|OAuth|LLMs?|servers?|VPS|context|prompts?|webhooks?|endpoints?|backend|daemon|runtime)\b/i
const PRODUCT = /\b(?:course|tutor|teacher|academy|chatbot|assistant|wizard|guide|lesson|quiz)\b/i
const PROMISE = /\bI(?:'ll| will| can)?\s+(?:set up|install|connect|build|create)\b/i

const wordsOf = s => s.split(/\s+/).filter(w => /[A-Za-z0-9{]/.test(w))
const sentencesOf = s => s.trim().split(/(?<=[.?:])\s+/).filter(x => wordsOf(x).length)

// kind: 'question' | 'reply' | 'opening' (the opening may say one thing and then ask: his decision).
// Returns the list of what is wrong with the line; empty = it passes.
export function checkLine(line, kind = 'reply') {
  const found = []
  const w = wordsOf(line)
  const ss = sentencesOf(line)
  const limit = kind === 'question' ? MAX_Q_WORDS : MAX_WORDS
  if (w.length > limit) found.push(`${w.length} words > ${limit}`)
  if (ss.length > MAX_SENTS) found.push(`${ss.length} sentences > ${MAX_SENTS}`)
  for (const x of ss) if (wordsOf(x).length > MAX_SENT) found.push(`sentence of ${wordsOf(x).length} words > ${MAX_SENT}`)
  if (line.split('?').length - 1 > 1) found.push('more than one question')
  if (kind === 'reply' && line.includes('?')) found.push('an answer line ends with a question')
  for (const [bad, name] of [['!', '!'], ['http', 'link'], ['www.', 'link'], ['\u2014', 'em dash'], [';', ';'], ['(', 'bracket']]) if (line.includes(bad)) found.push('has ' + name)
  for (const x of w) {
    const core = x.replace(/[^A-Za-z]/g, '')
    if (core.length > MAX_LETTERS && !x.includes('{')) found.push(`long word ${core}`)
  }
  // Hermes's own screen names in double quotes: counted as words above, not checked as terms
  const bare = line.replace(/"[^"]*"/g, '""')
  const banned = bare.match(BANNED)
  if (banned) found.push('banned term ' + banned[0])
  const used = GLOSS.filter(([term]) => term.test(bare))
  for (const [term, plain] of used) if (!plain.test(bare)) found.push('term not explained: ' + bare.match(term)[0])
  if (used.length > 1) found.push(`${used.length} Hermes terms in one line`)
  if (PRODUCT.test(bare)) found.push('product word')
  if (PROMISE.test(bare)) found.push('promises to do it')
  return found
}

const NEXT_KINDS = ['part', 'paste', 'line', 'none']
// The fixed lines the code says, and which of them show things to pick. changes-11: COST, WHERE,
// W2 (skill and plugin compared), NAME_AGAIN and NAME_NEW (a name typed on a later visit).
// builder-qs (changes-14 to 16): BACK (a later visit), the ordinary-talk lines, the "are you an AI" line of this
// build with no AI step (AI; the lines for builds that call a model stay out), WRONG, AGAIN and N1_AGAIN (no_repeat), H2.
// the kinds small_talk.how_after_rows.after may name (src/talk.js HOW_AFTER maps wants to want)
const HOW_AFTER_KINDS = ['row', 'plain', 'term', 'wants', 'COST', 'WHERE', 'written']
export const FIXED_USED = ['OPEN', 'F1', 'F2', 'F3', 'N1', 'N1a', 'N_HINT', 'TP', 'W1', 'C1', 'H1', 'H2', 'K1', 'COST', 'WHERE', 'W2', 'NAME_AGAIN', 'NAME_NEW',
  'BACK', 'HELLO', 'HELLO_SAME', 'THANKS', 'OK', 'HOW', 'WHO', 'AI', 'BYE', 'CUT', 'MEAN_NONE', 'WRONG', 'AGAIN', 'N1_AGAIN']
// changes-11 (check_json.py): W2 compares the two terms the person typed, so for W2 alone the
// two-terms rule is lifted; each term must still be explained in the line.
const LIFTED = { W2: ['2 Hermes terms in one line'] }
// The parts a fixed line's "Open ..." button may name (src/talk.js PARTS has these; a test keeps
// the two lists equal).
export const FIXED_PARTS = ['model', 'messaging', 'capabilities', 'bots']
// Row 5 of docs/build/talk-v2-plan.md (the wants: "Web, files, pictures and voice" under C1) is in
// this build (job talk-v2-wants): C1 says its full text and holds the wants pick first. With
// WANTS_BUILT false, held_picks.note: the held picks that are not topics are dropped, and C1 says
// its text_without_wants.
export const WANTS_BUILT = true
const C1_TEXT = f => (f.id === 'C1' && !WANTS_BUILT && f.text_without_wants ? f.text_without_wants : f.text)
const heldOf = (d, p) => (p.holds || []).filter(x => WANTS_BUILT || !(d.held_picks || {})[x])

// Helper's own lines about what it keeps (keeps): [id, kind, text]. They name no docs page, so
// they need no source; the word rules apply to them as to every line.
function keepLines(d) {
  const K = d.keeps || {}
  const out = []
  const add = (id, text, kind = 'reply') => text && out.push([id, kind, text])
  for (const l of (K.remember && K.remember.lines) || []) add(l.id, l.text, l.kind === 'question' ? 'question' : 'reply')
  const T = K.typed || {}
  const one = T.forget_one || {}
  for (const [what, q] of Object.entries(one.questions || {})) add('A2-' + what, q, 'question')
  add('A2-after-yes', one.after_yes)
  add('A2-after-no', one.after_no)
  add('A2-nothing', one.nothing_kept)
  const tell = K.tell || {}
  const see = tell.see || {}
  add('A1', see.see_line)
  add('A1-none', see.see_line_nothing)
  add('A1-deleted', see.see_line_deleted) // helper-builder-qs-v1.md point 3
  const all = see.delete_all || {}
  add('A4', all.question, 'question')
  add('A4-after-yes', all.after_yes)
  add('A4-after-no', all.after_no)
  add('kept-line', tell.kept_line)
  add('kept-first', tell.first_time_if_no_model_call)
  add('used-line', K.use && K.use.used_line)
  const after = K.after_settings_page_exists || {}
  add('by-hand', after.by_hand)
  const S = K.settings_file || {}
  add('settings-top', S.top_line)
  ;(S.under_box || []).forEach((x, i) => add('settings-under-' + (i + 1), x))
  add('settings-empty', S.empty)
  add('settings-cannot-read', S.cannot_read)
  for (const [k, x] of Object.entries(S.why || {})) add('settings-why-' + k, x)
  const wd = S.would_delete || {}
  add('settings-forget-n', wd.question, 'question')
  add('settings-forget-one', wd.question_one, 'question')
  add('settings-saved', S.saved)
  const fa = S.forget_all || {}
  add('settings-forget-all-under', fa.under)
  add('settings-forget-all', fa.question, 'question')
  add('settings-forget-all-with', fa.with_question)
  add('settings-forget-all-after', fa.after_yes)
  add('settings-also-tell', S.also_tell)
  ;(S.facts || []).forEach((x, i) => add('settings-fact-' + (i + 1), x))
  const M = (S.read && S.read.messages) || {}
  add('settings-secret-line', M.secret_line)
  add('settings-too-much', M.too_much)
  return out
}

// Every pre-written line the plugin can say: [id, kind, text, has a source].
export function talkLines(d) {
  const lines = []
  const add = (id, text, kind = 'reply', source = true) => lines.push({ id, kind, text, source })
  const next = n => {
    if (n && n.kind === 'line') add(n.id, n.text, 'reply', !!n.source)
  }
  for (const f of d.fixed_lines || []) {
    if (!FIXED_USED.includes(f.id)) continue
    add(f.id, C1_TEXT(f), f.kind === 'grey' ? 'reply' : f.kind)
    if (f.text_no_name) add(f.id + '-no-name', f.text_no_name, f.kind)
  }
  for (const [id, kind, text] of keepLines(d)) add(id, text, kind)
  for (const t of d.topics || []) {
    add(t.question.id, t.question.text, 'question')
    add(t.plain.id, t.plain.text, 'reply', !!t.plain.source)
    next(t.plain.next)
    for (const n of t.needs) {
      add(n.id, n.text, 'reply', !!n.source)
      next(n.next)
    }
  }
  for (const t of d.terms || []) {
    add('term-' + t.id, t.text, 'reply', !!t.source)
    next(t.next)
  }
  const where = d.parts && d.parts.bots && d.parts.bots.where_line
  if (where) add(where.id, where.text, 'reply', !!where.source)
  return lines
}

// Every list of things a person can be shown to pick from: [name, how many]. (W1's list is cut to
// max_at_once by the code.)
export function pickLists(d) {
  const lists = [['the topic picks', (d.topic_picks || []).length]]
  for (const p of d.topic_picks || []) if (p.holds) lists.push([`the picks under "${p.label}"`, p.holds.length])
  for (const t of d.topics || []) lists.push([`the answers under ${t.question.id}`, (t.question.answers || []).length])
  const K = d.keeps || {}
  for (const l of (K.remember && K.remember.lines) || []) if (l.answers) lists.push([`the answers under ${l.id}`, l.answers.length])
  const T = K.typed || {}
  if (T.forget_one) lists.push(['the answers under A2', (T.forget_one.answers || []).length])
  const all = K.tell && K.tell.see && K.tell.see.delete_all
  if (all) lists.push(['the answers under A4', (all.answers || []).length])
  const S = K.settings_file || {}
  if (S.would_delete) lists.push(['the answers under "Save, and forget"', (S.would_delete.answers || []).length])
  if (S.forget_all) lists.push(['the answers under "Forget all of this"', (S.forget_all.answers || []).length])
  return lists
}

// His words of 10 Nov, 20:05: never more than four things to pick at once.
export const MAX_TO_PICK = 4

export function talkProblems(d) {
  const problems = []
  const cap = d.answers && d.answers.max_at_once
  if (cap !== MAX_TO_PICK) problems.push(`answers.max_at_once is ${cap}, the rule is four`)
  // answers to pick only under the questions that carry them (answers.when_shown)
  const shown = (d.answers && d.answers.when_shown && d.answers.when_shown.questions) || {}
  const carries = Object.fromEntries(Object.entries(shown).map(([k, v]) => [k.split(' ')[0], v]))
  for (const t of d.topics || []) {
    const n = (t.question.answers || []).length
    // builder-qs: a typed_only topic (use, changes-14) is reached by typing only; its question carries its answers
    // (changes-14, For builder 5) though when_shown does not list it
    if (!(t.question.id in carries)) {
      if (!(t.typed_only && n)) problems.push(`${t.question.id}: not in answers.when_shown`)
    }
    else if (carries[t.question.id] && !n) problems.push(`${t.question.id}: no answers to pick, but when_shown says it carries them`)
    else if (!carries[t.question.id] && n) problems.push(`${t.question.id}: answers to pick, but when_shown says it carries none`)
  }
  const ids = new Set()
  for (const l of talkLines(d)) {
    if (ids.has(l.id)) problems.push(`line id twice: ${l.id}`)
    ids.add(l.id)
    if (!l.source) problems.push(`${l.id}: no source`)
    let found = checkLine(l.text, l.kind === 'question' ? 'question' : 'reply')
    // changes-14 (check_json.py): BACK and HELLO (kind greeting) greet and then ask, as the opening does
    if (l.kind === 'opening' || l.kind === 'greeting') found = found.filter(x => x !== 'an answer line ends with a question')
    if (LIFTED[l.id]) found = found.filter(x => !LIFTED[l.id].includes(x))
    for (const x of found) problems.push(`${l.id}: ${x}`)
  }
  for (const id of FIXED_USED) if (!(d.fixed_lines || []).some(f => f.id === id)) problems.push(`fixed line ${id} is missing`)
  // changes-18: the Forget row's action word on the settings page is the data's (the page has no word of its own)
  const fa = ((d.keeps || {}).settings_file || {}).forget_all || {}
  if (!(typeof fa.action === 'string' && fa.action.trim())) problems.push('keeps.settings_file.forget_all.action is missing')
  // changes-11: a fixed line's own button (COST, WHERE: "Open Model", "Open Messaging")
  for (const f of d.fixed_lines || []) {
    if (!FIXED_USED.includes(f.id) || !f.next) continue
    if (!NEXT_KINDS.includes(f.next.kind)) problems.push(`${f.id}: button of an unknown kind ${f.next.kind}`)
    else if (f.next.kind !== 'none' && !f.next.label) problems.push(`${f.id}: button with no label`)
    else if (f.next.kind === 'paste' && !f.next.paste_text) problems.push(`${f.id}: text to paste is empty`)
    else if (f.next.kind === 'part' && !FIXED_PARTS.includes(f.next.part)) problems.push(`${f.id}: a button to a part the plugin cannot open: ${f.next.part}`)
  }
  // changes-11: the rules the code reads as data. A pattern JavaScript cannot read would stop the
  // plugin; a word list that is missing or names no topic would quietly turn its step off.
  const topicIdsAll = (d.topics || []).map(t => t.id)
  const wi = d.what_is || {}
  try {
    // the part it catches must exist: a pattern with only (?:...) would leave nothing to look up
    if (new RegExp(wi.pattern + '|').exec('').length < 2) problems.push('what_is.pattern has no part to catch')
  } catch (e) {
    problems.push(`what_is.pattern is not a JavaScript pattern (${e.message})`)
  }
  if (!wi.words || !Object.keys(wi.words).length) problems.push('what_is.words is empty: "what is ..." would never get the explanation')
  for (const k of Object.keys(wi.words || {})) if (!topicIdsAll.includes(k)) problems.push(`what_is.words names ${k}, which is not a topic`)
  for (const k of ['cost', 'where']) if (!(d[k] && (d[k].words || []).length)) problems.push(`${k}.words is empty`)
  const termIds = (d.terms || []).map(t => t.id)
  for (const p of d.w1_pairs || []) if (!(p.terms || []).every(x => termIds.includes(x)) || (p.terms || []).length !== 2) problems.push(`w1_pairs: ${JSON.stringify(p.terms)} is not two terms`)
  const tc = (d.keeps && d.keeps.typed_change) || {}
  for (const k of ['self_words', 'question_words', 'not_words']) if (!(tc[k] || []).length) problems.push(`keeps.typed_change.${k} is empty`)
  // Builder: the key shapes (changes-10) are read as JavaScript patterns when the plugin loads. An
  // empty list would turn the key check off; a Python-only pattern would stop the whole plugin.
  const kp = (d.key_patterns && d.key_patterns.patterns) || []
  if (!kp.length) problems.push('key_patterns.patterns is empty: the key check would be off')
  for (const p of kp) {
    try {
      new RegExp(p)
    } catch (e) {
      problems.push(`key pattern is not a JavaScript pattern: ${p} (${e.message})`)
    }
  }
  // builder-qs: the lists the new steps read. Missing or empty, a step would quietly do nothing.
  const st = d.small_talk || {}
  for (const k of ['hello', 'thanks', 'ok', 'how', 'who', 'ai', 'bye', 'mean', 'wrong']) if (!((st.kinds || {})[k] || []).length) problems.push(`small_talk.kinds.${k} is empty`)
  for (const k of ['cut_question_words', 'cut_dangling', 'cut_small_words', 'no_words', 'no_means_wrong_after', 'thanks_tail']) if (!(st[k] || []).length) problems.push(`small_talk.${k} is empty`)
  // live-v2 changes-1: how_after_rows (src/talk.js reads words and after; the data's "wants" is the plugin's want)
  const har = st.how_after_rows || {}
  if (!(har.words || []).length) problems.push('small_talk.how_after_rows.words is empty')
  for (const k of har.after || []) if (!HOW_AFTER_KINDS.includes(k)) problems.push(`small_talk.how_after_rows.after names a kind the plugin does not have: ${k}`)
  if (!(har.after || []).length) problems.push('small_talk.how_after_rows.after is empty')
  const ab = st.ai_line_by_build || {}
  if (!(ab.use_now in ab) || !(d.fixed_lines || []).some(f => f.id === ab[ab.use_now])) problems.push(`small_talk.ai_line_by_build.use_now names no line: ${ab.use_now}`)
  if (ab.use_now !== 'no_ai_step') problems.push(`small_talk.ai_line_by_build.use_now is ${ab.use_now}: this build has no AI step`)
  const nr = d.no_repeat || {}
  for (const k of ['exempt', 'wrong_starts', 'wrong_anywhere']) if (!(nr[k] || []).length) problems.push(`no_repeat.${k} is empty`)
  // two lines that are not 'plain' (a line with no topic has no plain one), so noRepeat in src/talk.js always has another
  for (const k of ['talk', 'dont_know', 'answer']) if ((((nr.in_place || {})[k]) || []).filter(id => id !== 'plain').length < 2) problems.push(`no_repeat.in_place.${k} needs two lines`)
  for (const [g, ids] of Object.entries(nr.in_place || {})) for (const id of ids) if (id !== 'plain' && !FIXED_USED.includes(id)) problems.push(`no_repeat.in_place.${g} names a line the plugin does not say: ${id}`)
  if (!((nr.asked_again || {}).words || []).length) problems.push('no_repeat.asked_again.words is empty')
  for (const k of ['make_words', 'make_not_followed_by', 'make_not_when_starts', 'build_question_words', 'software_lead_ins', 'software_verbs', 'software_things', 'software_between_not']) if (!((d.build || {})[k] || []).length) problems.push(`build.${k} is empty`)
  if (!Number.isInteger((d.build || {}).software_between_max)) problems.push('build.software_between_max is not a whole number')
  if (!Object.keys((d.lonely_words || {}).words || {}).length) problems.push('lonely_words.words is empty')
  for (const k of ['name_strong_stop', 'name_new_may_follow']) if (!(((d.opening || {})[k] || {}).words || []).length) problems.push(`opening.${k}.words is empty`)
  const met = (d.keeps || {}).met || {}
  if (!met.store_key || met.value !== true) problems.push('keeps.met has no store_key or its value is not true')
  if (!((((d.keeps || {}).tell || {}).see || {}).see_line_deleted)) problems.push('keeps.tell.see.see_line_deleted is missing')
  for (const [name, count] of pickLists(d)) if (count > MAX_TO_PICK) problems.push(`over four to pick at once: ${name} has ${count}`)
  const topicIds = (d.topics || []).map(t => t.id)
  for (const t of d.topics || []) {
    const needIds = t.needs.map(n => n.id)
    const answers = t.question.answers || []
    for (const a of answers) if (!needIds.includes(a.gives)) problems.push(`${t.question.id}: the answer "${a.label}" gives ${a.gives}, which is not a need of ${t.id}`)
    for (const n of [t.plain, ...t.needs]) {
      const k = n.next && n.next.kind
      if (!NEXT_KINDS.includes(k)) problems.push(`${n.id}: button of an unknown kind ${k}`)
      if (k !== 'none' && !n.next.label) problems.push(`${n.id}: button with no label`)
      if (k === 'paste' && !n.next.paste_text) problems.push(`${n.id}: text to paste is empty`)
    }
  }
  for (const t of d.terms || []) if (!NEXT_KINDS.includes(t.next && t.next.kind)) problems.push(`term ${t.id}: button of an unknown kind`)
  // the held picks that are not topics (the wants) are checked by scripts/wants-data.mjs
  const reach = (d.topic_picks || []).flatMap(p => (p.holds ? heldOf(d, p) : [p.gives])).filter(x => !(d.held_picks || {})[x]).sort()
  // changes-14: a typed_only topic (use) is reached by no pick
  const pickable = (d.topics || []).filter(t => !t.typed_only).map(t => t.id)
  if (reach.join() !== [...pickable].sort().join()) problems.push(`the topic picks do not reach every topic exactly once: ${reach.join(' ')}`)
  for (const p of d.topic_picks || []) {
    for (const x of p.holds || []) if (!topicIds.includes(x) && !(d.held_picks || {})[x]) problems.push(`the pick "${p.label}" holds ${x}, which is not a topic`)
    if (p.holds && !(d.fixed_lines || []).some(f => f.id === p.line)) problems.push(`the pick "${p.label}" names a line that is missing: ${p.line}`)
    const t = (d.topics || []).find(x => x.id === p.gives)
    if (!p.holds && t && t.pick.label !== p.label) problems.push(`the pick for ${p.gives} is labelled differently from the topic's own pick`)
  }
  return problems
}

const pickKeys = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))
const slimNext = n => (n ? pickKeys(n, ['kind', 'label', 'part', 'paste_text', 'id', 'text', 'source']) : { kind: 'none' })
const slimAnswers = list => (list || []).map(a => pickKeys(a, ['label', 'gives']))

// What src/talk.js and the settings page read of keeps: the rules as data, Helper's lines and the
// settings page's words. The notes, the reasons and the version for a build that calls a model
// (first_time, top_line_2) stay out.
function slimKeeps(K) {
  const S = K.settings_file
  return {
    answers: {
      mod: { values: K.answers.mod.values.map(v => pickKeys(v, ['need', 'value', 'typed_words', 'typed_not_with_unsure_words'])) },
      msg: { names: K.answers.msg.names },
      svc: { names: K.answers.svc.names }
    },
    things: K.things.map(t => pickKeys(t, ['id', 'kept_words'])),
    // changes-11: a chat app, service or AI the person says they use replaces the kept one
    typed_change: pickKeys(K.typed_change, ['self_words', 'question_words', 'not_words']),
    use: { used_line: K.use.used_line, used_link: { words: K.use.used_link.words } },
    tell: {
      kept_line: K.tell.kept_line,
      first_time_if_no_model_call: K.tell.first_time_if_no_model_call,
      link: { words: K.tell.link.words },
      see: {
        ...pickKeys(K.tell.see, ['see_line', 'see_line_nothing', 'see_line_deleted']),
        delete_all: { ...pickKeys(K.tell.see.delete_all, ['label', 'question', 'after_yes', 'after_no']), answers: slimAnswers(K.tell.see.delete_all.answers) },
        rows: pickKeys(K.tell.see.rows, ['name', 'mod', 'msg', 'svc', 'asked'])
      }
    },
    remember: {
      ...pickKeys(K.remember, ['lead_ins', 'request_starts', 'thing_starts_at_last_word', 'limits']),
      // changes-12/13: words (the 58) for names only; the secret rule (looks_secret, src/secret-rule.js) reads the rest
      refuse: pickKeys(K.remember.refuse, ['words', 'digits_pattern', 'secret_words', 'typo_words', 'typo_min_letters', 'maybe_words', 'link_words', 'link_within', 'after_link_not_value', 'not_secret_phrases', 'value', 'shape', 'word_run']),
      unsure: pickKeys(K.remember.unsure, ['about', 'said_to']),
      lines: K.remember.lines.map(l => ({ ...pickKeys(l, ['id', 'kind', 'text']), ...(l.answers ? { answers: slimAnswers(l.answers) } : {}) }))
    },
    typed: {
      not_when: pickKeys(K.typed.not_when, ['hermes_words', 'it_words', 'helper_words']),
      see: { key_words: K.typed.see.key_words },
      forget_one: { ...pickKeys(K.typed.forget_one, ['key_words', 'questions', 'after_yes', 'after_no', 'nothing_kept']), answers: slimAnswers(K.typed.forget_one.answers) },
      forget_all: { key_words: K.typed.forget_all.key_words }
    },
    after_settings_page_exists: pickKeys(K.after_settings_page_exists, ['button_under_see', 'by_hand']),
    // changes-14/15: the mark that Helper has said hello (its own storage key, never in the record)
    met: pickKeys(K.met, ['store_key', 'value']),
    settings_file: {
      ...pickKeys(S, ['top_line', 'box_lines', 'order', 'under_box', 'empty', 'buttons', 'cannot_read', 'why', 'saved', 'also_tell', 'facts']),
      would_delete: { ...pickKeys(S.would_delete, ['question', 'question_one']), answers: slimAnswers(S.would_delete.answers) },
      forget_all: { ...pickKeys(S.forget_all, ['label', 'action', 'under', 'question', 'with_question', 'after_yes']), answers: slimAnswers(S.forget_all.answers) },
      read: { ...pickKeys(S.read, ['labels', 'max_box_chars', 'quote_max_chars']), messages: pickKeys(S.read.messages, ['saved', 'cannot_read', 'quote', 'secret_line', 'too_much']) }
    }
  }
}

// skills: content/skills-list-v1.json (the official skills), for the don't-know line N1a (changes-19: none left out).
export function slimTalkData(d, skills = { skills: [] }) {
  const fixed = {}
  for (const f of d.fixed_lines) if (FIXED_USED.includes(f.id)) fixed[f.id] = { ...pickKeys(f, ['text', 'text_no_name', 'paste_text', 'source']), ...(f.next ? { next: slimNext(f.next) } : {}), text: C1_TEXT(f) }
  return {
    docs_version: d.docs_version,
    limits: pickKeys(d.limits, ['request_chars_in_paste', 'service_chars_in_paste']),
    answers: pickKeys(d.answers, ['max_at_once', 'hint_under_question', 'hint_under_topics']),
    fixed,
    opening: {
      ...pickKeys(d.opening, ['name_strong_pattern', 'name_weak_pattern', 'pattern_flags', 'short_answer_max_words', 'name_max_chars', 'not_a_name', 'question_starts', 'work_max_words', 'work_max_chars', 'name_refused_words_also']),
      name_with_more: pickKeys(d.opening.name_with_more, ['after_name', 'self_starts']),
      // helper-builder-qs-v1.md point 1: ordinary words caught after "call me" are no name; what may follow a later name
      name_strong_stop: d.opening.name_strong_stop.words,
      name_new_may_follow: d.opening.name_new_may_follow.words
    },
    // changes-10: the K1 key shapes, one list for the message box, "remember that ..." and the
    // settings page (src/key-check.js)
    key_patterns: d.key_patterns.patterns,
    // changes-15 (make me ...), changes-16 (H2: can it build ...?), changes-17 (write/code a script ...)
    build: pickKeys(d.build, ['skip_starts', 'how_phrases', 'build_words', 'build_pair', 'make_words', 'make_not_followed_by', 'make_not_when_starts', 'build_question_words',
      'software_lead_ins', 'software_verbs', 'software_things', 'software_between_max', 'software_between_not']),
    // changes-14 (ordinary talk, with changes-15 and -17), changes-15 (never the same line twice), changes-16/17 (a word that needs a second word)
    // small_talk.ai_line: the one line this build says to "are you an AI" (ai_line_by_build[use_now]; the build
    // stops unless use_now is the no-AI one), so neither the other builds' lines nor the note go public
    small_talk: { ...pickKeys(d.small_talk, ['cut_end_words', 'cut_start_words', 'kinds', 'cut_question_words', 'cut_dangling', 'cut_small_words', 'no_words', 'no_means_wrong_after', 'thanks_tail']), how_after_rows: pickKeys(d.small_talk.how_after_rows, ['words', 'after']), ai_line: d.small_talk.ai_line_by_build[d.small_talk.ai_line_by_build.use_now] },
    no_repeat: { ...pickKeys(d.no_repeat, ['exempt', 'groups', 'in_place', 'wrong_starts', 'wrong_anywhere']), asked_again: d.no_repeat.asked_again.words },
    lonely_words: Object.fromEntries(Object.entries(d.lonely_words.words).map(([w, r]) => [w, pickKeys(r, ['needs_one_of', 'not_with'])])),
    ignore_phrases: d.ignore_phrases,
    unsure_words: d.unsure_words,
    chat_apps: d.chat_apps,
    hermes_words: d.hermes_words,
    asks_for_topics: pickKeys(d.asks_for_topics, ['phrases', 'whole_message']),
    // changes-11: "what is ..." gets the explanation; the cost and where lines; the term pairs W2 compares
    what_is: pickKeys(d.what_is, ['pattern', 'words']),
    cost: { words: d.cost.words },
    where: { words: d.where.words },
    w1_pairs: (d.w1_pairs || []).map(p => pickKeys(p, ['terms', 'line'])),
    topic_picks: d.topic_picks.map(p => ({ ...pickKeys(p, ['label', 'gives', 'line']), ...(p.holds ? { holds: heldOf(d, p) } : {}) })),
    // the held picks that are not topics (changes-9: wants), each with its label
    held_picks: Object.keys(d.held_picks || {}).filter(k => k !== 'note' && WANTS_BUILT),
    held_labels: Object.fromEntries(Object.entries(d.held_picks || {}).filter(([k]) => k !== 'note' && WANTS_BUILT).map(([k, v]) => [k, v.label])),
    topics: d.topics.map(t => ({
      ...pickKeys(t, ['id', 'part', 'part_if_no_memory_part', 'key_words', 'misspellings', 'weak_key_words', 'weak_only_in_question_about_hermes', 'typed_only']),
      pick: pickKeys(t.pick, ['label']),
      question: { id: t.question.id, text: t.question.text, answers: (t.question.answers || []).map(a => pickKeys(a, ['label', 'gives', 'service'])) },
      plain: { ...pickKeys(t.plain, ['id', 'text', 'source']), next: slimNext(t.plain.next) },
      needs: t.needs.map(n => ({
        ...pickKeys(n, ['id', 'key_words', 'only_when_answering', 'only_if_no_other_need', 'wins_over_other_needs', 'service_names', 'text', 'source']),
        next: slimNext(n.next)
      }))
    })),
    terms: d.terms.map(t => ({ ...pickKeys(t, ['id', 'label', 'key_words', 'text', 'source']), next: slimNext(t.next) })),
    parts: {
      model: { navigate: d.parts.model.hermes_button.navigate },
      messaging: { navigate: d.parts.messaging.hermes_button.navigate },
      bots: { where_line: pickKeys(d.parts.bots.where_line, ['id', 'text', 'source']) }
    },
    keeps: slimKeeps(d.keeps),
    skills: (skills.skills || []).map(s => ({ name: s.name }))
  }
}
