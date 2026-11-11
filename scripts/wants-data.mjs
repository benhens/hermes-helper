// What the build does with hhcontent's wants data (content/helper-wants-v1.json, a copy of the
// team's file, written by their build_wants.py): checks it again, and cuts it down to what the code
// uses. A port of build_wants.py section 3 ("3. checks"), plus three checks of the Builder's own
// (marked). No file is written while wantsProblems() returns anything.
//   wantsProblems(wants, talk, skills, docs)   every reason the build must stop
//   slimWantsData(wants, skills)               only the fields src/talk.js reads
// docs: content/docs-lines-v0.23.0.json, the lines of the Hermes docs the data names (cut from the
// v0.23.0 docs by dev/checks/talk-v2-wants/docs-lines.mjs; tests/wants-data.test.mjs compares them
// with the docs when the checkout is there).
import { checkLine } from './talk-data.mjs'

const wordsOf = s => s.split(/\s+/).filter(w => /[A-Za-z0-9{]/.test(w))
// A quoted skill name: each part between hyphens counts as its own word (helper-wants-v1.md 2).
export const spaced = text => text.replace(/"[^"]*"/g, m => m.replace(/-/g, ' '))
// The longest names on the pages have four parts (build_wants.py).
const LONG_NAME = 'aaa-bbb-ccc-ddd'
export const MAX_GROUPS = 4
export const MAX_ROWS_IN_GROUP = 8
export const MAX_LABEL_WORDS = 5

// Is the quote on that line of that docs file? (build_wants.py check_source: a quote with { } is
// looked for as the page writes braces, &#123; and &#125;, when the page does.)
export function quoteProblem(id, s, docs) {
  const f = docs.files[s.file]
  if (!f) return `${id}: source file missing ${s.file}`
  const line = f.lines[String(s.line)]
  if (line === undefined) return `${id}: ${s.file} line ${s.line} is not in the docs lines file`
  const all = Object.values(f.lines).join('')
  const q = all.includes('&#123;') && s.quote.includes('{') ? s.quote.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;') : s.quote
  if (!line.includes(q)) return `${id}: quote not on ${s.file} line ${s.line}: ${s.quote.slice(0, 60)}`
  return null
}

export function wantsProblems(W, talk, skillsList, docs) {
  const fails = []
  const fail = m => fails.push(m)
  const line = (id, text, kind = 'reply') => {
    const f = checkLine(spaced(text), kind)
    if (f.length) fail(`${id}: line fails R rules: ${f.join('; ')} :: ${text}`)
  }
  const label = (id, l) => {
    const f = checkLine(l, 'label')
    if (wordsOf(l).length > MAX_LABEL_WORDS) f.push(`label over ${MAX_LABEL_WORDS} words`)
    if (f.length) fail(`${id}: label fails: ${f.join('; ')} :: ${l}`)
  }
  const source = (id, s) => {
    const p = quoteProblem(id, s, docs)
    if (p) fail(p)
  }
  const groups = W.groups || []
  const groupIds = groups.map(g => g.id)
  const byName = new Map((W.skills || []).map(s => [s.name, s]))
  const ids = new Set()
  for (const w of W.wants || []) {
    if (ids.has(w.id)) fail('id twice ' + w.id)
    ids.add(w.id)
    line(w.id, w.text)
    label(w.id, w.label)
    if (!w.sources || !w.sources.length) fail(w.id + ': no source')
    for (const s of w.sources || []) source(w.id, s)
    if (!groupIds.includes(w.group)) fail(w.id + ': unknown group')
    if (!((w.key_words || []).length || ((w.things || []).length && (w.actions || []).length))) fail(w.id + ': no way to match')
    if (!['built_in', 'built_in_tool', 'built_in_tool_off', 'built_in_skill', 'optional_skill'].includes(w.kind)) fail(`${w.id}: kind ${w.kind} is not one the wants data uses`)
    if ((w.kind || '').endsWith('_skill')) {
      const s = byName.get(w.thing)
      if (!s) fail(w.id + ': names a skill that is on neither page')
      else {
        if (!w.text.includes(`"${w.thing}"`)) fail(w.id + ': line does not name the skill as the page does')
        if ((w.kind === 'optional_skill') !== (s.kind === 'optional')) fail(w.id + ': built in / optional differs from the page')
        if (w.kind === 'optional_skill' && !s.add_id_certain) fail(w.id + ': add id not certain')
      }
      if (w.kind === 'optional_skill' && !w.text.includes('add it first')) fail(w.id + ': optional row does not say it must be added')
    }
    if ((w.text || '').toLowerCase().includes('plugin') || (w.kind || '').includes('plugin')) fail(w.id + ': names a plugin; none are listed yet')
    const n = w.next || {}
    if (n.kind === 'steps') {
      if (!(n.steps || []).length || !n.after) fail(w.id + ': clicks with no steps or no after line')
      ;[...(n.steps || []), n.after].forEach((x, j) => line(`${w.id}-step${j}`, x || ''))
    } else if (n.kind !== 'paste' || !n.paste_text) fail(w.id + ': no paste box')
    if (!n.label) fail(w.id + ': button with no label')
    if (w.kind === 'optional_skill' && n.kind !== 'steps') fail(w.id + ': optional skill without the app\'s steps')
    if (JSON.stringify(n).includes('hermes skills install')) fail(w.id + ': a command for the bot in an optional skill\'s box')
  }
  const fixed = W.fixed_lines || []
  for (const f of fixed) {
    // skill lines v1: S1 and S2 say {say}, a skill's own plain words; each skill's whole line is checked below
    if (!(['S1', 'S2'].includes(f.id) && /\{say\}/.test(f.text || ''))) line(f.id, (f.text || '').replace(/\{name\}/g, LONG_NAME), f.kind)
    if (f.text_fixed !== undefined) line(f.id + ' text_fixed', f.text_fixed.replace(/\{name\}/g, LONG_NAME), f.kind)
    for (const s of f.sources || []) source(f.id, s)
    if (f.next && f.next.kind === 'steps') {
      if (!(f.next.steps || []).length || !f.next.after) fail(f.id + ': clicks with no steps or no after line')
      ;[...(f.next.steps || []), f.next.after].forEach((x, j) => line(`${f.id}-step${j}`, (x || '').replace(/\{name\}/g, LONG_NAME)))
    }
  }
  for (const p of skillLineProblems(W)) fail(p)
  // Builder: wants fixes v1's data is there and fits the code (ordinary names are skill names; the
  // "skill for ..." pattern compiles here as in Python and catches the word after it)
  const wf1 = W.skill_name_rule_wf1
  if (!wf1) fail('skill_name_rule_wf1 is missing')
  else {
    for (const n of wf1.ordinary_names || []) if (!byName.has(n)) fail(`skill_name_rule_wf1: ordinary name ${n} is no skill`)
    let re = null
    try {
      re = new RegExp('(^|[^a-z0-9])' + wf1.skill_for_pattern)
    } catch (e) {
      fail('skill_name_rule_wf1.skill_for_pattern does not compile: ' + e.message)
    }
    if (re) {
      const m = re.exec('is there a skill for knitting')
      if (!m || m[2] !== 'knitting') fail('skill_name_rule_wf1.skill_for_pattern does not catch the word after "skill for"')
    }
    if (!Array.isArray(wf1.skill_for_not_after)) fail('skill_name_rule_wf1.skill_for_not_after is not a list')
  }
  const cn1 = fixed.find(f => f.id === 'CN1')
  if (cn1 && /cost|free/i.test(cn1.text)) fail('CN1 says something about cost')
  // Builder: every fixed line the code says is there
  for (const id of ['N2', 'G1', 'S1', 'S2', 'box-head', 'CN1']) if (!fixed.some(f => f.id === id)) fail(`fixed line ${id} is missing`)
  const T = W.topic || {}
  line('can-q', (T.question || {}).text || '', 'question')
  line('can0', (T.plain || {}).text || '')
  for (const s of (T.plain || {}).sources || []) source('can0', s)
  label('can', (T.pick || {}).label || '')
  for (const g of groups) {
    label('group ' + g.id, g.label)
    const n = (W.wants || []).filter(w => w.group === g.id).length
    if (n > MAX_ROWS_IN_GROUP) fail(`group ${g.id} has ${n} rows, over ${MAX_ROWS_IN_GROUP}`)
    if (!n) fail(`group ${g.id} has no rows`)
  }
  if (groups.length > MAX_GROUPS) fail(`${groups.length} groups: more than ${MAX_GROUPS} to pick at once`)
  // Builder: the question's answers are the groups, each once, and at most four
  const qa = (T.question && T.question.answers) || []
  if (qa.length > MAX_GROUPS) fail(`can-q has ${qa.length} answers, over ${MAX_GROUPS}`)
  if (qa.map(a => a.gives_group).sort().join() !== [...groupIds].sort().join()) fail('can-q\'s answers are not the groups, each once')
  for (const a of qa) {
    const g = groups.find(x => x.id === a.gives_group)
    if (g && g.label !== a.label) fail(`can-q: the answer "${a.label}" is labelled differently from its group`)
  }
  // the same key word, or the same thing with the same action, in two rows
  const seenKw = new Map()
  for (const w of W.wants || []) {
    for (const k of w.key_words || []) {
      if (seenKw.has(k) && seenKw.get(k) !== w.id) fail(`key word '${k}' in ${seenKw.get(k)} and ${w.id}`)
      seenKw.set(k, w.id)
    }
  }
  const rows = W.wants || []
  rows.forEach((a, i) => {
    for (const b of rows.slice(i + 1)) {
      const t = (a.things || []).filter(x => (b.things || []).includes(x))
      const ac = (a.actions || []).filter(x => (b.actions || []).includes(x))
      if (t.length && ac.length) fail(`collision ${a.id} / ${b.id}: things ${t.sort()} with actions ${ac.sort()}`)
    }
  })
  const labels = rows.map(w => w.label)
  if (new Set(labels).size !== labels.length) fail('two rows with the same label')
  // a row key word that is also a key word of a topic or a term of the talk data
  const v2 = new Map()
  for (const t of talk.topics || []) for (const k of [...(t.key_words || []), ...(t.misspellings || []), ...(t.weak_key_words || [])]) v2.set(k, t.id)
  for (const t of talk.terms || []) for (const k of t.key_words || []) v2.set(k, t.id)
  for (const w of rows) for (const k of w.key_words || []) if (v2.has(k)) fail(`${w.id}: key word '${k}' is also a key word of ${v2.get(k)}`)
  // Builder: the skills are the skills list's, the same names in the same order, each skill's own
  // words on its catalog line, and the wants pick has the same label in both files
  const list = (skillsList && skillsList.skills) || []
  if (list.map(s => s.name).join() !== (W.skills || []).map(s => s.name).join()) fail('the wants\' skills differ from content/skills-list-v1.json')
  for (const s of W.skills || []) {
    const p = quoteProblem('skill ' + s.name, { file: s.page, line: s.line, quote: s.docs_words }, docs)
    if (p) fail(p)
    if (!['built_in', 'optional'].includes(s.kind)) fail(`skill ${s.name}: kind ${s.kind}`)
  }
  const held = (talk.held_picks || {}).wants
  if (!held || held.label !== (T.pick || {}).label) fail('the wants pick is labelled differently in helper-talk-v2.json and helper-wants-v1.json')
  // Builder: a service line names a fixed line there is, or a built-in skill on the page
  for (const [service, v] of Object.entries(serviceLines(W))) {
    if (v.line === 'S1') {
      const s = byName.get(v.skill)
      if (!s || s.kind !== 'built_in') fail(`service line ${service}: ${v.skill} is not a built-in skill on the page`)
    } else if (v.line !== 'CN1') fail(`service line ${service}: ${v.line} is not CN1 or S1 (the code shows only these two)`)
    else if (!fixed.some(f => f.id === 'CN1')) fail(`service line ${service}: the fixed line CN1 is missing`)
  }
  // Builder: no {slot} shown unfilled. Helper fills only {name} and {say}, only in S1 and S2 (their line,
  // clicks and after; {say} from the skill's own say, checked in skillLineProblems); the docs box's words
  // are the docs' own and may hold braces ("{slug}").
  const slot = /\{\w+\}/
  const said = []
  for (const w of rows) said.push([w.id, w.text], [w.id, w.label], ...Object.values(pickKeysShallow(w.next || {})).flat().map(x => [w.id, x]))
  for (const f of fixed) {
    const filled = ['S1', 'S2'].includes(f.id) ? s => String(s).replace(/\{name\}/g, '').replace(/\{say\}/g, '') : s => s
    said.push([f.id, filled(f.text)], ...Object.values(pickKeysShallow(f.next || {})).flat().map(x => [f.id, filled(x)]))
    // skill lines v1: the old sentence, said when a skill's say is null; it has only {name}
    if (f.text_fixed !== undefined) said.push([f.id + ' text_fixed', String(f.text_fixed).replace(/\{name\}/g, '')])
  }
  said.push(['can-q', (T.question || {}).text || ''], ...qa.map(a => ['can-q', a.label]), ...groups.map(g => ['group ' + g.id, g.label]))
  for (const [id, s] of said) if (typeof s === 'string' && slot.test(s)) fail(`${id}: a {slot} Helper does not fill: ${s.slice(0, 60)}`)
  // Builder: a row id is not also a topic, a term or a held pick (a press goes by id)
  const taken = new Set([...(talk.topics || []).map(t => t.id), ...(talk.terms || []).map(t => t.id), ...Object.keys(talk.held_picks || {})])
  for (const w of rows) if (taken.has(w.id)) fail(`${w.id}: the same id as a topic, term or pick of helper-talk-v2.json`)
  if (docs.docs_version !== W.docs_version) fail(`the docs lines are of ${docs.docs_version}, the wants of ${W.docs_version}`)
  return fails
}

// service_lines: { Gmail: 'CN1', GitHub: 'S1 with the built-in skill github, ...' } ->
// { Gmail: { line: 'CN1' }, GitHub: { line: 'S1', skill: 'github' } }. The prose keys rule and note
// are not services.
export function serviceLines(W) {
  const out = {}
  for (const [service, v] of Object.entries(W.service_lines || {})) {
    if (service === 'rule' || service === 'note') continue
    const m = /^(S1) with the built-in skill ([a-z0-9-]+)\b/.exec(v)
    out[service] = m ? { line: m[1], skill: m[2] } : { line: v }
  }
  return out
}

const pickKeys = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))
// The words of a button: its label, text to paste, clicks and after line.
const pickKeysShallow = n => pickKeys(n, ['label', 'paste_text', 'steps', 'after'])

// Skill lines v1 (content/helper-skill-lines-v1.md): S1 and S2 say "It teaches Hermes to {say}", where
// {say} is the skill's own say; a skill whose say is null gets the old sentence, kept as text_fixed.
// skillSentence gives the line as src/talk.js says it ({name} filled with name; tests compare the two).
export const SAY_SENTENCE_MAX = 18
export function skillSentence(W, s, name = s.name) {
  const f = (W.fixed_lines || []).find(x => x.id === (s.kind === 'optional' ? 'S2' : 'S1'))
  if (!f) return null
  if (s.say != null && /\{say\}/.test(f.text)) return f.text.replace(/\{name\}/g, name).replace(/\{say\}/g, s.say)
  return (f.text_fixed !== undefined ? f.text_fixed : f.text).replace(/\{name\}/g, name)
}
// hhcontent's own check of these lines (dev/checks/hhcontent-skill-lines/apply_sl1.py), ported: the whole
// line with {name} left in (one word, as check.py always counted it) passes every R rule, except that the
// sentence "It teaches Hermes to ..." may have up to 18 words (4 fixed words and the plain part); the
// plain part alone, with a capital first letter, passes every rule (so at most 14 words). Builder's own:
// a say ends with a full stop (the template has none after {say}) and holds no {slot}; a skill with no say
// needs its line's text_fixed; text_fixed holds no slot but {name}.
export function skillLineProblems(W) {
  const out = []
  for (const s of W.skills || []) {
    const id = s.kind === 'optional' ? 'S2' : 'S1'
    const f = (W.fixed_lines || []).find(x => x.id === id)
    if (!f) continue // "fixed line S1 is missing" says it
    const usesSay = /\{say\}/.test(f.text || '')
    if (s.say == null) {
      if (usesSay && f.text_fixed === undefined) out.push(`skill ${s.name}: no say, and ${id} has no text_fixed to say instead`)
      continue
    }
    if (typeof s.say !== 'string' || !s.say.trim()) {
      out.push(`skill ${s.name}: say is not words`)
      continue
    }
    if (!usesSay) continue // the data's S line does not say it
    if (/\{\w+\}/.test(s.say)) out.push(`skill ${s.name}: say holds a {slot}: ${s.say}`)
    if (!/\.$/.test(s.say)) out.push(`skill ${s.name}: say does not end with a full stop: ${s.say}`)
    const whole = skillSentence(W, s, '{name}')
    const teach = whole.slice(whole.indexOf('It teaches Hermes to'))
    const teachWords = teach.split(/\s+/).filter(w => /[A-Za-z0-9{]/.test(w)).length
    const bent = `sentence of ${teachWords} words > 14`
    const f1 = checkLine(whole).filter(x => !(whole.includes('It teaches Hermes to') && teachWords <= SAY_SENTENCE_MAX && x === bent))
    const f2 = checkLine(s.say[0].toUpperCase() + s.say.slice(1)).map(x => 'plain part: ' + x)
    if (f1.length || f2.length) out.push(`skill ${s.name}: ${id} line fails: ${[...f1, ...f2].join('; ')} :: ${whole}`)
  }
  return out
}

// What src/talk.js reads. Each skill carries left_out from the skills list (the five marked left
// out get N1b, as before); a skill's own words are shown only in the box "From the Hermes docs".
export function slimWantsData(W, skillsList) {
  const left = new Set(((skillsList && skillsList.skills) || []).filter(s => s.left_out).map(s => s.name))
  const fixed = Object.fromEntries(
    W.fixed_lines
      .filter(f => ['N2', 'G1', 'S1', 'S2', 'box-head', 'CN1'].includes(f.id))
      .map(f => [f.id, { ...pickKeys(f, ['text', 'text_fixed', 'sources']), ...(f.next ? { next: pickKeys(f.next, ['kind', 'label', 'steps', 'after']) } : {}) }])
  )
  const wf1 = W.skill_name_rule_wf1 || {}
  return {
    docs_version: W.docs_version,
    pick: { label: W.topic.pick.label },
    question: { text: W.topic.question.text, answers: W.topic.question.answers.map(a => pickKeys(a, ['label', 'gives_group'])) },
    groups: W.groups.map(g => pickKeys(g, ['id', 'label', 'subject_words'])),
    rows: W.wants.map(w => ({
      ...pickKeys(w, ['id', 'group', 'label', 'kind', 'thing', 'key_words', 'things', 'actions', 'text', 'sources']),
      next: pickKeys(w.next, ['kind', 'label', 'paste_text', 'steps', 'after'])
    })),
    fixed,
    service_lines: serviceLines(W),
    // wants fixes v1 (content/helper-wants-fixes-v1.md): ordinary-word skill names count after "skill(s) for"
    // only as the last word; "a skill for <a word Helper has nothing for>" in a question is not the term line
    skill_name_rule_wf1: {
      ordinary_names: wf1.ordinary_names || [],
      skill_for_pattern: wf1.skill_for_pattern || null,
      skill_for_not_after: wf1.skill_for_not_after || []
    },
    skills: W.skills.map(s => ({ ...pickKeys(s, ['name', 'kind', 'say', 'docs_words', 'page', 'line']), ...(left.has(s.name) ? { left_out: true } : {}) }))
  }
}
