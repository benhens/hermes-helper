// What the build does with hhcontent's data for Helper's AI step (content/helper-talk-live-v2.json, a copy
// of the team's file), together with the talk data and the wants it points into. talk-live row 0.
//   liveProblems(live, talk, wants, mode)  every reason the build must stop (none: an empty list)
//   slimLiveData(live, talk, wants)        what src/live-*.js read: the rows as hhtech's live.py builds
//                                          them (FACTS) plus the next lines, the subjects, the three
//                                          instruction texts, the checks' lists and the lines by mode
// The rows are made here, at build time, from the same data the no-AI turn uses, so a row's text is
// always the text code shows for it.

export const MODES = ['no_ai_step', 'ai_picks_line', 'ai_writes']
// The check ids, in the data's order (c0 to c23); src/live-checks.js runs each of them.
export const CHECK_IDS = Array.from({ length: 24 }, (_, i) => 'c' + i)
// Words no instruction text may hold (hhcontent's check_live.py: product words in an instruction).
const PRODUCT = /\b(?:chatbot|assistant|tutor|guide|course|teacher|wizard|academy)\b/i

const srcOf = x => (x.sources ? x.sources.map(s => `${s.file} line ${s.line}`).join('; ') : x.source || '')

// The rows, as hhtech's live.py FACTS (dev/checks/hhtech-live-reply/live.py lines 26 to 39), in its order:
// each topic's plain line and its needs, the terms, the wants, COST, WHERE, CN1. kw: key words (2 each),
// weak: words worth 0.5 once. title: the text the shared-words score also reads. Plus (rows.from, item 2)
// the next lines of kind line, which have no key words: they are handed only with their row or as a
// follow-up (src/live-rows.js).
export function liveRows(talk, wants) {
  const rows = []
  const fixed = Object.fromEntries((talk.fixed_lines || []).map(f => [f.id, f]))
  const wfixed = Object.fromEntries((wants.fixed_lines || []).map(f => [f.id, f]))
  const next = []
  const noteNext = (of, subject, n) => {
    if (n && n.kind === 'line') next.push({ id: n.id, subject, title: '', text: n.text, kw: [], weak: [], next_of: of })
  }
  for (const tp of talk.topics) {
    const p = tp.plain
    rows.push({ id: p.id, subject: tp.id, title: tp.label, text: p.text, kw: [...tp.key_words, ...(tp.misspellings || [])], weak: [], shows: { kind: 'plain', topic: tp.id } })
    noteNext(p.id, tp.id, p.next)
    for (const n of tp.needs) {
      rows.push({ id: n.id, subject: tp.id, title: `${tp.label}: ${n.when || ''}`, text: n.text, kw: n.key_words || [], weak: tp.key_words, shows: { kind: 'row', topic: tp.id, need: n.id } })
      noteNext(n.id, tp.id, n.next)
    }
  }
  for (const tm of talk.terms) rows.push({ id: tm.id, subject: 'words', title: tm.label, text: tm.text, kw: tm.key_words, weak: [], shows: { kind: 'term', term: tm.id } })
  for (const w of wants.wants) {
    const pairs = (w.actions || []).flatMap(a => (w.things || []).map(t => `${a} ${t}`))
    rows.push({ id: w.id, subject: w.group, title: w.label, text: w.text, kw: [...(w.key_words || []), ...pairs], weak: w.things || [], shows: { kind: 'want', row: w.id } })
  }
  rows.push({ id: 'COST', subject: 'cost', title: 'What Hermes costs', text: fixed.COST.text, kw: ['cost', 'costs', 'price', 'pay', 'free', 'money'], weak: [], shows: { kind: 'COST' } })
  rows.push({ id: 'WHERE', subject: 'cost', title: 'My computer or one that stays on', text: fixed.WHERE.text, kw: ['cloud', 'server', 'vps', 'laptop', 'always on', '24/7'], weak: [], shows: { kind: 'WHERE' } })
  rows.push({ id: 'CN1', subject: 'svc', title: 'Gmail and Google apps: Connectors', text: wfixed.CN1.text, kw: ['gmail', 'google calendar', 'google drive', 'calendar', 'drive'], weak: [], shows: { kind: 'CN1' } })
  for (const n of next) rows.push({ ...n, shows: { kind: 'extra', line: n.id } })
  return rows
}

export function liveProblems(live, talk, wants, mode) {
  const problems = []
  if (!MODES.includes(mode)) problems.push(`AI_MODE is ${mode}: not one of ${MODES.join(', ')}`)
  // the data's own switches must agree with each other and with src/ai-mode.js (talk-live row 1)
  const switches = [['helper-talk-live-v2.json mode.use_now', live.mode && live.mode.use_now], ['helper-talk-v2.json small_talk.ai_line_by_build.use_now', talk.small_talk && talk.small_talk.ai_line_by_build && talk.small_talk.ai_line_by_build.use_now], ['helper-talk-v2.json keeps.disclosure_point_11.use_now', talk.keeps && talk.keeps.disclosure_point_11 && talk.keeps.disclosure_point_11.use_now]]
  for (const [where, v] of switches) if (v !== mode) problems.push(`${where} is ${v}, src/ai-mode.js AI_MODE is ${mode}: data and code disagree`)
  const rows = liveRows(talk, wants)
  const ids = rows.map(r => r.id)
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dup.length) problems.push(`two rows have the same id: ${[...new Set(dup)].join(', ')}`)
  for (const r of rows) {
    if (!r.text || /\{\w+\}/.test(r.text)) problems.push(`row ${r.id} has no text, or an unfilled {slot}: ${r.text}`)
    if (/\n/.test(r.text)) problems.push(`row ${r.id} has a line break (rows are sent one per line)`)
  }
  const nexts = rows.filter(r => r.next_of).map(r => r.id).sort()
  const want4 = ['bot1-next', 'use-more', 'use1-next', 'use3-next']
  if (JSON.stringify(nexts) !== JSON.stringify(want4)) problems.push(`the next lines handed as rows are ${nexts.join(', ')}, not the data's four (${want4.join(', ')})`)
  const subjects = ((live.subjects || {}).list || []).map(s => s.id)
  if (subjects.length !== 16) problems.push(`${subjects.length} subjects, not 16`)
  for (const s of subjects) if (!['talk', 'build', 'none'].includes(s) && !rows.some(r => r.subject === s)) problems.push(`subject ${s} has no rows`)
  for (const s of new Set(rows.map(r => r.subject))) if (!subjects.includes(s)) problems.push(`rows of ${s} belong to no subject`)
  const checks = ((live.checks || {}).list || []).map(c => c.id)
  if (JSON.stringify(checks) !== JSON.stringify(CHECK_IDS)) problems.push(`the checks are ${checks.join(', ')}, not c0 to c23 in order`)
  for (const k of ['first_call', 'writer', 'pick_only']) {
    const t = (live[k] || {}).text
    if (!t) problems.push(`${k}.text is missing`)
    else if (PRODUCT.test(t)) problems.push(`${k}.text has a product word: ${t.match(PRODUCT)[0]}`)
    else if (/\{name|Name:/.test(t)) problems.push(`${k}.text has a name slot`)
  }
  if (!/\{subjects[^}]*\}/.test((live.first_call || {}).text || '')) problems.push('first_call.text has no {subjects} slot')
  for (const k of ['writer', 'pick_only']) if (!/\{rows[^}]*\}/.test((live[k] || {}).text || '')) problems.push(`${k}.text has no {rows} slot`)
  const inp = live.input || {}
  if (!/\{last_lines\}/.test(inp.text || '') || !/\{message\}/.test(inp.text || '') || !/\{message\}/.test(inp.text_no_lines || '')) problems.push('input.text or input.text_no_lines lacks its slots')
  const pats = [...((live.checks || {}).gloss || { list: [] }).list.flatMap(g => [g.term, g.explained_by]), talk.r9_pattern, talk.r6_pattern, ...(talk.r5_terms || []).map(r => r.pattern)]
  for (const p of pats) {
    try {
      new RegExp(p)
    } catch {
      problems.push(`a pattern does not compile in JavaScript: ${p}`)
    }
  }
  const lm = live.lines_by_mode || {}
  for (const m of MODES) {
    if (!(lm.are_you_an_ai && lm.are_you_an_ai[m] && lm.are_you_an_ai[m].text)) problems.push(`lines_by_mode.are_you_an_ai.${m} is missing`)
    else if (!(talk.fixed_lines || []).some(f => f.id === lm.are_you_an_ai[m].id && f.text === lm.are_you_an_ai[m].text)) problems.push(`lines_by_mode.are_you_an_ai.${m} is not the talk data's fixed line ${lm.are_you_an_ai[m].id} word for word`)
    if (!(lm.first_time_grey && lm.first_time_grey[m] && lm.first_time_grey[m].text)) problems.push(`lines_by_mode.first_time_grey.${m} is missing`)
    if (!(lm.readme_point_11 && lm.readme_point_11[m])) problems.push(`lines_by_mode.readme_point_11.${m} is missing`)
  }
  if (lm.first_time_grey && lm.first_time_grey.no_ai_step && talk.keeps.tell.first_time_if_no_model_call !== lm.first_time_grey.no_ai_step.text) problems.push('the no-AI first-time line differs from keeps.tell.first_time_if_no_model_call')
  const fb = (live.order || {}).fallback || {}
  if (fb.seconds !== 12) problems.push(`order.fallback.seconds is ${fb.seconds}; the page's timer is built for 12`)
  if ((live.rows || {}).max_handed !== 5) problems.push('rows.max_handed is not 5')
  return problems
}

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))

export function slimLiveData(live, talk, wants) {
  const lm = live.lines_by_mode
  const byMode = f => Object.fromEntries(MODES.map(m => [m, f(m)]))
  return {
    seconds: live.order.fallback.seconds,
    code_answers: live.code_answers.kinds,
    go_to_ai: live.code_answers.go_to_ai,
    follow_up: { phrases: live.follow_up.phrases },
    rows: liveRows(talk, wants).map(r => pick(r, ['id', 'subject', 'title', 'text', 'kw', 'weak', 'next_of', 'shows'])),
    stop_words: live.rows.stop_words.split(/\s+/).filter(Boolean),
    max_handed: live.rows.max_handed,
    subjects: live.subjects.list.map(s => ({ id: s.id, title: s.title })),
    input: pick(live.input, ['text', 'text_no_lines', 'cut_at_chars', 'temperature']),
    first_call: { text: live.first_call.text, max_tokens: live.first_call.max_tokens },
    writer: { text: live.writer.text, max_tokens: live.writer.max_tokens },
    pick_only: { text: live.pick_only.text, max_tokens: live.pick_only.max_tokens },
    checks: {
      ...pick(live.checks, ['ok_caps', 'not_words', 'not_cut_first', 'test_phrases', 'money_cut_first', 'money_words']),
      max_words: live.checks.list.find(c => c.id === 'c4').max,
      max_sentences: live.checks.list.find(c => c.id === 'c5').max,
      gloss: live.checks.gloss.list,
      r9_pattern: talk.r9_pattern,
      r6_pattern: talk.r6_pattern,
      r8_never: talk.r8_never,
      r5_patterns: talk.r5_terms.map(r => r.pattern),
      skills: wants.skills.map(s => s.name).filter(n => n.length > 3)
    },
    lines_by_mode: {
      are_you_an_ai: byMode(m => lm.are_you_an_ai[m].id),
      first_time_grey: byMode(m => lm.first_time_grey[m].text),
      settings_top_line_2: byMode(m => lm.settings_top_line_2[m] || null)
    }
  }
}
