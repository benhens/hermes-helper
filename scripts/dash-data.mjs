// The Dashboard tab's data: the plugin's copies of the team's content/dash-setup-list-v2.json (the 11 stops) and
// content/dash-words-v1.json (every other word, "page_words"), each as the team wrote it (dash-v2; scripts/build.mjs
// dashJoined puts the words beside the list). The build checks it here
// (with any problem the build stops and writes nothing), then cuts it down to what src/dash.js reads.
// Checks: every quote from the Hermes docs is on its named line of content/dash-docs-lines-v0.23.0.json (the same
// rule as the wants: scripts/wants-data.mjs quoteProblem); the 11 things in order; the counted ones are exactly
// the six the code has a rule for (src/dash-rules.js); every word of page_words is there; the route buttons only
// open places hhtech ran.

// Is the quote on that line of that docs file? As the wants' check (scripts/wants-data.mjs quoteProblem), with one
// addition: hhcontent read the docs in a copy whose line numbers differ in places from the tagged v0.23.0 docs the
// lines file is cut from; the lines file says where such a line is there (moved), and the quote must be on that line.
export function quoteProblem(where, s, docs) {
  const f = docs.files[s.file]
  if (!f) return `${where}: source file missing ${s.file}`
  const at = f.moved && f.moved[String(s.line)] !== undefined ? f.moved[String(s.line)] : s.line
  const line = f.lines[String(at)]
  if (line === undefined) return `${where}: ${s.file} line ${s.line} is not in the docs lines file`
  if (!line.includes(s.quote)) return `${where}: quote not on ${s.file} line ${s.line}: ${s.quote.slice(0, 60)}`
  return null
}

// The six things with a fixed rule in src/dash-rules.js (doneFlags). A seventh counted thing would need a rule.
export const COUNTED_IDS = ['install', 'model', 'personality', 'chat_apps', 'scheduled_job', 'second_bot']
// The places hhtech opened from a plugin page (docs/answers/hhtech-dash-reads.md lines 25 to 28); 'new-chat' is
// host.newChat().
export const ROUTE_TARGETS = ['/settings?tab=config:model', '/messaging', '/cron', 'new-chat']
// The longest short name under a stop that fits at the narrow size (design/dash-r4/notes.md line 78).
export const MARK_MAX = 15

const isText = v => typeof v === 'string' && v.trim().length > 0

// Every { file, line, quote } in the data, with where it sits, for the quote check.
export function quotesOf(data) {
  const out = []
  const walk = (v, where) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${where}[${i}]`))
    if (!v || typeof v !== 'object') return
    if (typeof v.file === 'string' && Number.isInteger(v.line) && typeof v.quote === 'string') out.push({ where, s: v })
    for (const [k, x] of Object.entries(v)) if (k !== 'builder' && k !== 'page_words') walk(x, where ? `${where}.${k}` : k)
  }
  walk(data, '')
  return out
}

export function dashProblems(data, docs) {
  const fails = []
  // docs quotes (a file under /root/... is a team file reporting what was seen in the app: checked by a test)
  for (const { where, s } of quotesOf(data)) {
    if (s.file.startsWith('/')) continue
    const p = quoteProblem(where, s, docs)
    if (p) fails.push(p)
  }
  const items = Array.isArray(data.items) ? data.items : []
  if (items.length !== 11) fails.push(`items: ${items.length}, not 11`)
  const ids = items.map(i => i.id)
  if (new Set(ids).size !== ids.length) fails.push('items: an id twice')
  items.forEach((it, k) => {
    if (it.order !== k + 1) fails.push(`${it.id}: order ${it.order} at place ${k + 1}`)
    if (!isText(it.card_name) || !isText(it.why)) fails.push(`${it.id}: card_name or why missing`)
    if (!Array.isArray(it.steps) || !it.steps.length || !it.steps.every(s => isText(s.text))) fails.push(`${it.id}: steps missing`)
    if (typeof it.counts !== 'boolean') fails.push(`${it.id}: counts is not true or false`)
    if (!Array.isArray(it.sources) || !it.sources.length) fails.push(`${it.id}: no sources`)
    if (it.terminal && !(isText(it.terminal.when) && Array.isArray(it.terminal.paste) && it.terminal.paste.every(p => isText(p.for) && isText(p.text)))) fails.push(`${it.id}: terminal block incomplete`)
    // the text to paste is what the Copy button copies: it must stand in its docs quote word for word (review, dash-v1)
    if (it.terminal && Array.isArray(it.terminal.paste))
      it.terminal.paste.forEach((p, k) => {
        if (!p.src || !isText(p.src.quote)) fails.push(`${it.id}: paste ${k + 1} has no docs quote`)
        else if (isText(p.text) && !p.src.quote.includes(p.text.trim())) fails.push(`${it.id}: paste ${k + 1} is not in its docs quote: ${p.text.slice(0, 60)}`)
      })
  })
  const counted = items.filter(i => i.counts === true).map(i => i.id)
  if (counted.join() !== COUNTED_IDS.filter(id => ids.includes(id)).join() || counted.length !== COUNTED_IDS.length) fails.push(`counted things are ${counted.join(', ')}; the code has rules for exactly ${COUNTED_IDS.join(', ')}`)

  const w = data.page_words
  if (!w || typeof w !== 'object') return [...fails, 'page_words missing']
  const need = (obj, keys, where) => keys.forEach(k => isText(obj && obj[k]) || fails.push(`page_words.${where}${k} missing`))
  need(w, ['tab_list_label', 'not_built'], '')
  need(w.tabs, ['dashboard', 'learn', 'my_setup'], 'tabs.')
  // dash-v2: the word for one (bots_one ...), and what a screen reader hears while a number waits or could not be read
  need(w.stats, ['bots', 'bots_one', 'skills', 'skills_one', 'plugins', 'plugins_one', 'not_known', 'waiting'], 'stats.')
  need(w.activity, ['title', 'last_used_today', 'last_used_one', 'last_used_n', 'less', 'more'], 'activity.')
  need(w.setup, ['title', 'count', 'you_are_here', 'next', 'open', 'all_done', 'not_counted', 'close', 'copy', 'copied', 'source', 'state_done', 'state_not_done', 'state_not_counted', 'state_not_known'], 'setup.')
  if (w.activity) {
    if (!Array.isArray(w.activity.months) || w.activity.months.length !== 12 || !w.activity.months.every(isText)) fails.push('page_words.activity.months: not 12 names')
    if (!Array.isArray(w.activity.days) || w.activity.days.length !== 7 || !w.activity.days.every(d => typeof d === 'string')) fails.push('page_words.activity.days: not 7 (Sunday first; empty for no label)')
    if (isText(w.activity.last_used_n) && !w.activity.last_used_n.includes('{n}')) fails.push('page_words.activity.last_used_n has no {n}')
  }
  if (w.setup) {
    if (isText(w.setup.count) && !(w.setup.count.includes('{n}') && w.setup.count.includes('{total}'))) fails.push('page_words.setup.count needs {n} and {total}')
    if (isText(w.setup.source) && !(w.setup.source.includes('{file}') && w.setup.source.includes('{line}'))) fails.push('page_words.setup.source needs {file} and {line}')
    // "All 6 are set up." has the number written in it (hhcontent): it must be the number of counted stops
    if (isText(w.setup.all_done)) {
      const said = w.setup.all_done.match(/\d+/)
      const counted = items.filter(i => i.counts === true).length
      if (!said) fails.push('page_words.setup.all_done does not say how many')
      else if (Number(said[0]) !== counted) fails.push(`page_words.setup.all_done says ${said[0]}; ${counted} stops are counted`)
    }
    if (isText(w.setup.not_counted) && !(data.cannot_tell_words || []).includes(w.setup.not_counted)) fails.push('page_words.setup.not_counted is not one of cannot_tell_words')
  }
  for (const id of ids) {
    const m = w.marks && w.marks[id]
    if (!isText(m)) fails.push(`page_words.marks.${id} missing`)
    else if (m.length > MARK_MAX) fails.push(`page_words.marks.${id} longer than ${MARK_MAX} characters`)
  }
  for (const r of Array.isArray(w.routes) ? w.routes : []) {
    const it = items.find(i => i.id === r.item)
    if (!it) fails.push(`route to ${r.to}: no item ${r.item}`)
    else if (!Number.isInteger(r.step) || r.step < 1 || r.step > it.steps.length) fails.push(`route on ${r.item}: no step ${r.step}`)
    if (!ROUTE_TARGETS.includes(r.to)) fails.push(`route on ${r.item}: ${r.to} is not a place hhtech ran`)
    if (!isText(r.label)) fails.push(`route on ${r.item}: no label`)
  }
  return fails
}

// What src/dash.js reads: the 11 things (no done rules or reads: those are code) and the page words.
export function slimDashData(data) {
  const w = data.page_words
  const routes = Array.isArray(w.routes) ? w.routes : []
  return {
    items: data.items.map(it => ({
      id: it.id,
      counts: it.counts,
      name: it.card_name,
      mark: w.marks[it.id],
      why: it.why,
      steps: it.steps.map((s, k) => {
        const r = routes.find(x => x.item === it.id && x.step === k + 1)
        return r ? { text: s.text, route: { label: r.label, to: r.to } } : { text: s.text }
      }),
      terminal: it.terminal ? { when: it.terminal.when, paste: it.terminal.paste.map(p => ({ for: p.for, text: p.text })) } : null,
      sources: it.sources.map(s => ({ file: s.file, line: s.line }))
    })),
    total: data.items.filter(i => i.counts).length,
    words: {
      tabs: w.tabs,
      tabListLabel: w.tab_list_label,
      notBuilt: w.not_built,
      stats: w.stats,
      // activity.no_chats (hhcontent's optional line for an empty Activity) is not shown (Lead, 11 Nov): left out
      activity: Object.fromEntries(Object.entries(w.activity).filter(([k]) => k !== 'no_chats')),
      setup: w.setup
    }
  }
}
