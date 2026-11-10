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

const MAX_WORDS = 25
const MAX_Q_WORDS = 12
const MAX_SENT = 14
const MAX_SENTS = 3
const MAX_LETTERS = 12
// term -> words one of which must be in the same line
const GLOSS = [
  [/\bmodels?\b/i, /\bAIs?\b/i],
  [/\bmemory\b/i, /\bnotes?\b|\bremembers?\b/i],
  [/\bskills?\b/i, /\bsteps\b|\bteach/i],
  [/\btools?\b/i, /\bactions?\b/i],
  [/\bplugins?\b/i, /\badd-on/i],
  [/\bMCP\b/, /\bservices?\b/i],
  [/\bbots?\b/i, /separate Hermes|\b(?:its|their) own\b/i],
  [/\bkeys?\b/i, /\bsecret\b/i],
  [/\bsubscriptions?\b/i, /\bplan\b/i],
  [/SOUL\.md/i, /\bfile\b/i]
]
const BANNED = /\b(?:profiles?|providers?|gateways?|toolsets?|cron|sessions?|tokens?|agents?|API|config\w*|yaml|CLI|terminal|command line|OAuth|LLMs?|servers?|VPS|context|prompts?|webhooks?|endpoints?|backend|daemon|runtime)\b/i
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
  for (const [term, plain] of used) if (!plain.test(bare)) found.push('term not explained: ' + bare.match(new RegExp(term.source, 'i'))[0])
  if (used.length > 1) found.push(`${used.length} Hermes terms in one line`)
  if (PRODUCT.test(bare)) found.push('product word')
  if (PROMISE.test(bare)) found.push('promises to do it')
  return found
}

const NEXT_KINDS = ['part', 'paste', 'line', 'none']
// The fixed lines the code says, and which of them show things to pick.
export const FIXED_USED = ['OPEN', 'F1', 'F2', 'F3', 'N1', 'W1', 'C1', 'H1', 'K1']

// Every pre-written line the plugin can say: [id, kind, text, has a source].
export function talkLines(d) {
  const lines = []
  const add = (id, text, kind = 'reply', source = true) => lines.push({ id, kind, text, source })
  const next = n => {
    if (n && n.kind === 'line') add(n.id, n.text, 'reply', !!n.source)
  }
  for (const f of d.fixed_lines || []) {
    if (!FIXED_USED.includes(f.id)) continue
    add(f.id, f.text, f.kind)
    if (f.text_no_name) add(f.id + '-no-name', f.text_no_name, f.kind)
  }
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

// Every list of things a person can be shown to pick from: [name, how many].
export function pickLists(d) {
  const lists = [['the topic picks', (d.topic_picks || []).length]]
  for (const p of d.topic_picks || []) if (p.holds) lists.push([`the picks under "${p.label}"`, p.holds.length])
  for (const t of d.topics || []) lists.push([`the answers under ${t.question.id}`, (t.question.answers || []).length])
  return lists
}

export function talkProblems(d) {
  const problems = []
  const cap = d.answers && d.answers.max_at_once
  if (cap !== 5) problems.push(`answers.max_at_once is ${cap}, the rule is five`)
  const ids = new Set()
  for (const l of talkLines(d)) {
    if (ids.has(l.id)) problems.push(`line id twice: ${l.id}`)
    ids.add(l.id)
    if (!l.source) problems.push(`${l.id}: no source`)
    let found = checkLine(l.text, l.kind === 'question' ? 'question' : 'reply')
    if (l.kind === 'opening') found = found.filter(x => x !== 'an answer line ends with a question')
    for (const x of found) problems.push(`${l.id}: ${x}`)
  }
  for (const id of FIXED_USED) if (!(d.fixed_lines || []).some(f => f.id === id)) problems.push(`fixed line ${id} is missing`)
  for (const [name, count] of pickLists(d)) if (count > 5) problems.push(`over five to pick at once: ${name} has ${count}`)
  const topicIds = (d.topics || []).map(t => t.id)
  for (const t of d.topics || []) {
    const needIds = t.needs.map(n => n.id)
    const answers = t.question.answers || []
    if (!answers.length) problems.push(`${t.question.id}: no answers to pick`)
    for (const a of answers) if (!needIds.includes(a.gives)) problems.push(`${t.question.id}: the answer "${a.label}" gives ${a.gives}, which is not a need of ${t.id}`)
    for (const n of [t.plain, ...t.needs]) {
      const k = n.next && n.next.kind
      if (!NEXT_KINDS.includes(k)) problems.push(`${n.id}: button of an unknown kind ${k}`)
      if (k !== 'none' && !n.next.label) problems.push(`${n.id}: button with no label`)
      if (k === 'paste' && !n.next.paste_text) problems.push(`${n.id}: text to paste is empty`)
    }
  }
  for (const t of d.terms || []) if (!NEXT_KINDS.includes(t.next && t.next.kind)) problems.push(`term ${t.id}: button of an unknown kind`)
  const reach = (d.topic_picks || []).flatMap(p => p.holds || [p.gives]).sort()
  if (reach.join() !== [...topicIds].sort().join()) problems.push(`the topic picks do not reach every topic exactly once: ${reach.join(' ')}`)
  for (const p of d.topic_picks || []) {
    if (p.holds && !(d.fixed_lines || []).some(f => f.id === p.line)) problems.push(`the pick "${p.label}" names a line that is missing: ${p.line}`)
    const t = (d.topics || []).find(x => x.id === p.gives)
    if (!p.holds && t && t.pick.label !== p.label) problems.push(`the pick for ${p.gives} is labelled differently from the topic's own pick`)
  }
  return problems
}

const pickKeys = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))
const slimNext = n => (n ? pickKeys(n, ['kind', 'label', 'part', 'paste_text', 'id', 'text', 'source']) : { kind: 'none' })

export function slimTalkData(d) {
  const fixed = {}
  for (const f of d.fixed_lines) if (FIXED_USED.includes(f.id)) fixed[f.id] = pickKeys(f, ['kind', 'text', 'text_no_name', 'answers', 'paste_text', 'source'])
  return {
    docs_version: d.docs_version,
    limits: pickKeys(d.limits, ['request_chars_in_paste', 'service_chars_in_paste']),
    answers: pickKeys(d.answers, ['max_at_once', 'hint_under_question', 'hint_under_topics']),
    fixed,
    opening: {
      ...pickKeys(d.opening, ['name_strong_pattern', 'name_weak_pattern', 'pattern_flags', 'short_answer_max_words', 'name_max_chars', 'not_a_name', 'question_starts', 'work_max_words', 'work_max_chars']),
      name_with_more: pickKeys(d.opening.name_with_more, ['after_name', 'self_starts'])
    },
    build: pickKeys(d.build, ['skip_starts', 'how_phrases', 'build_words', 'build_pair']),
    ignore_phrases: d.ignore_phrases,
    unsure_words: d.unsure_words,
    chat_apps: d.chat_apps,
    hermes_words: d.hermes_words,
    topic_picks: d.topic_picks.map(p => pickKeys(p, ['label', 'gives', 'holds', 'line'])),
    topics: d.topics.map(t => ({
      ...pickKeys(t, ['id', 'part', 'part_if_no_memory_part', 'model_hint', 'key_words', 'misspellings', 'weak_key_words', 'weak_only_in_question_about_hermes']),
      pick: pickKeys(t.pick, ['label']),
      question: { id: t.question.id, text: t.question.text, answers: t.question.answers.map(a => pickKeys(a, ['label', 'gives', 'service'])) },
      plain: { ...pickKeys(t.plain, ['id', 'text', 'source']), next: slimNext(t.plain.next) },
      needs: t.needs.map(n => ({
        ...pickKeys(n, ['id', 'model_hint', 'key_words', 'only_when_answering', 'only_if_no_other_need', 'service_names', 'text', 'source']),
        next: slimNext(n.next)
      }))
    })),
    terms: d.terms.map(t => ({ ...pickKeys(t, ['id', 'label', 'model_hint', 'key_words', 'text', 'source']), next: slimNext(t.next) })),
    parts: {
      model: { navigate: d.parts.model.hermes_button.navigate },
      messaging: { navigate: d.parts.messaging.hermes_button.navigate },
      bots: { where_line: pickKeys(d.parts.bots.where_line, ['id', 'text', 'source']) }
    },
    model: pickKeys(d.model, ['max_tokens', 'topic_ids', 'fields'])
  }
}
