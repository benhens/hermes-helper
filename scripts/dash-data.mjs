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

// loom-fixes (helper-loom-fixes-v1 point 8, dash-setup-list-v2 eb3aeba8): the path is the items with on_path true (10;
// Install is off it) and every stop on it counts. A stop the page sees for itself (marked_by page) needs a fixed rule in
// src/setup-reads.js (doneFlags); the others are marked by the person. SEEN_IDS: the stops with a rule. First chat is
// one of them by hhtech's rule (hhtech-loom-n1.md 3; Lead: where hhcontent and hhtech differ, hhtech wins), though the
// data marks it 'person': the page shows it as a self-marked stop only when Hermes has no listPersistedSessions.
export const SEEN_IDS = ['model', 'first_chat', 'personality', 'chat_apps', 'scheduled_job', 'second_bot']
export const SEEN_OVER_DATA = ['first_chat']
// Lead's words (job loom-fixes point 14): the plugins tile has no number (no read gives the one Hermes's Plugins
// screen shows, hhtech-loom-n1.md 1)
export const PLUGINS_TILE = { title: 'Plugins', line: 'See them in Capabilities' }
// The places hhtech opened from a plugin page (docs/answers/hhtech-dash-reads.md lines 25 to 28); 'new-chat' is
// host.newChat().
export const ROUTE_TARGETS = ['/settings?tab=config:model', '/messaging', '/cron', 'new-chat']
// The longest short name under a stop that fits at the narrow size (design/dash-r4/notes.md line 78).
export const MARK_MAX = 15

const pickWords = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const isText = v => typeof v === 'string' && v.trim().length > 0
// hhcontent's short wording of the plugins label (content/dash-words-v1.json variants.plugins_label, n: 3)
function shortPlugins(data) {
  const list = data.word_variants && Array.isArray(data.word_variants.plugins_label) ? data.word_variants.plugins_label : []
  const v = list.find(x => x && x.n === 3)
  return v && isText(v.one) && isText(v.many) ? v : null
}

// Every { file, line, quote } in the data, with where it sits, for the quote check.
export function quotesOf(data) {
  const out = []
  const walk = (v, where) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${where}[${i}]`))
    if (!v || typeof v !== 'object') return
    if (typeof v.file === 'string' && Number.isInteger(v.line) && typeof v.quote === 'string') out.push({ where, s: v })
    for (const [k, x] of Object.entries(v)) if (k !== 'builder' && k !== 'page_words' && k !== 'word_variants') walk(x, where ? `${where}.${k}` : k)
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
  const path = items.filter(i => i.on_path === true)
  if (path.length !== 10) fails.push(`the path has ${path.length} stops, not 10`)
  for (const it of items) if (typeof it.on_path !== 'boolean') fails.push(`${it.id}: on_path is not true or false`)
  for (const it of path) if (!['page', 'person'].includes(it.marked_by)) fails.push(`${it.id}: marked_by is not page or person`)
  const byPage = path.filter(i => i.marked_by === 'page').map(i => i.id)
  const seen = [...new Set([...byPage, ...SEEN_OVER_DATA])]
  if (seen.slice().sort().join() !== SEEN_IDS.slice().sort().join()) fails.push(`stops the page sees are ${seen.join(', ')}; the code has rules for exactly ${SEEN_IDS.join(', ')}`)

  const w = data.page_words
  if (!w || typeof w !== 'object') return [...fails, 'page_words missing']
  const need = (obj, keys, where) => keys.forEach(k => isText(obj && obj[k]) || fails.push(`page_words.${where}${k} missing`))
  need(w, ['tab_list_label', 'not_built'], '')
  need(w.tabs, ['dashboard', 'learn'], 'tabs.')
  // loom-fixes: My setup is out (his words, Loom 3:22): two tabs
  if (w.tabs && Object.keys(w.tabs).join() !== 'dashboard,learn') fails.push('page_words.tabs: not exactly Dashboard and Learn')
  need(w.helper_window, ['hide', 'show', 'clear', 'clear_ask', 'clear_yes', 'clear_no'], 'helper_window.')
  // dash-v2: the word for one (bots_one ...), and what a screen reader hears while a number waits or could not be read
  need(w.stats, ['bots', 'bots_one', 'skills', 'skills_one', 'plugins', 'plugins_one', 'not_known', 'waiting'], 'stats.')
  // the plugins label's short variant, for the narrow size (hhcontent's variant 3; Lead, 11 Nov)
  if (!shortPlugins(data)) fails.push('word_variants: no short variant (n: 3) of the plugins label with its word for one and for many')
  need(w.setup, ['title', 'count', 'you_are_here', 'next', 'open', 'all_done', 'close', 'copy', 'copied', 'source', 'state_done', 'state_not_done', 'state_not_known', 'mark_done', 'mark_undo', 'person_note', 'state_said_done'], 'setup.')
  if (w.setup) {
    if (isText(w.setup.count) && !(w.setup.count.includes('{n}') && w.setup.count.includes('{total}'))) fails.push('page_words.setup.count needs {n} and {total}')
    if (isText(w.setup.source) && !(w.setup.source.includes('{file}') && w.setup.source.includes('{line}'))) fails.push('page_words.setup.source needs {file} and {line}')
    // "All 10 are set up." has the number written in it (hhcontent): it must be the number of stops on the path
    if (isText(w.setup.all_done)) {
      const said = w.setup.all_done.match(/\d+/)
      if (!said) fails.push('page_words.setup.all_done does not say how many')
      else if (Number(said[0]) !== path.length) fails.push(`page_words.setup.all_done says ${said[0]}; the path has ${path.length} stops`)
    }
    if (isText(w.setup.person_note) && !(data.cannot_tell_words || []).includes(w.setup.person_note)) fails.push('page_words.setup.person_note is not one of cannot_tell_words')
  }
  for (const id of path.map(i => i.id)) {
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

// loom2 (Lead's job builder-loom2-dash, his second Loom of 11 Nov): the cards are the stops on the path less Scheduled
// jobs ("scheduled jobs are not part of the setup", 2:13): 9 cards. The data keeps its 10; the cut is made here.
export const CARDS_OUT = ['scheduled_job']
// Lead's words for this job, not yet in hhcontent's words file (a line Lead rules on goes in here, not into the plugin's
// copy, which is pinned to the team's checksum): the label on the first card not marked, in place of "You are here";
// the word on a card the person marked; the button that marks it (his words, 17:10 UTC: "only if the person clicks
// Done"), in place of "I've done this". Once the team's file has them, these are the same words and change nothing.
export const LOOM2_WORDS = { start_here: 'Start here', state_done: 'Done', mark_done: 'Done' }
// loom2 point 4 (his Loom, 0:20 "why is it just saying Plugins, Skills, Bots? Why?"): one plain line under each tile, as
// Lead wrote them: bots from the second-bot card's sentence, skills from the skills card's, plugins from
// content/helper-talk-v2.json fixed_lines 63 ("A plugin is an add-on.")
export const TILE_LINES = { bots: 'Each bot is a separate Hermes.', skills: 'Each skill teaches Hermes one task.', plugins: 'Each plugin is an add-on for Hermes.' }

// What src/dash.js reads: the cards (no done rules or reads: since loom2 nothing is read for them) and the page words.
export function slimDashData(data) {
  const w = data.page_words
  const routes = Array.isArray(w.routes) ? w.routes : []
  return {
    // loom2: the 9 cards (the path's stops less Scheduled jobs), in the data's order; every one is marked by the person
    items: data.items.filter(it => it.on_path === true && !CARDS_OUT.includes(it.id)).map(it => ({
      id: it.id,
      name: it.card_name,
      why: it.why,
      steps: it.steps.map((s, k) => {
        const r = routes.find(x => x.item === it.id && x.step === k + 1)
        return r ? { text: s.text, route: { label: r.label, to: r.to } } : { text: s.text }
      }),
      terminal: it.terminal ? { when: it.terminal.when, paste: it.terminal.paste.map(p => ({ for: p.for, text: p.text })) } : null,
      sources: it.sources.map(s => ({ file: s.file, line: s.line }))
    })),
    total: data.items.filter(i => i.on_path === true && !CARDS_OUT.includes(i.id)).length,
    // the path's 10 stops in order, for Helper's set-up conversation only (src/setup-chat.js: its "next" stop, as before
    // loom2; that conversation does not run in this build)
    path: data.items.filter(i => i.on_path === true).map(i => i.id),
    words: {
      // loom2: no tabs (Learn is out, his Loom of 11 Nov, 1:51): the tab names and Learn's line are not built in
      stats: { ...w.stats, lines: TILE_LINES, plugins_short_one: shortPlugins(data).one, plugins_short: shortPlugins(data).many, plugins_title: PLUGINS_TILE.title, plugins_line: PLUGINS_TILE.line },
      helperWindow: pickWords(w.helper_window, ['hide', 'show', 'clear', 'clear_ask', 'clear_yes', 'clear_no']),
      // loom2: Activity is out (his Loom of 11 Nov, 0:05 "just take it out"): its words are not built in
      // loom2: no path, so no "You are here", Next, Open, all done line or seen states; no "Helper can't see this one"
      setup: { ...pickWords(w.setup, ['title', 'count', 'close', 'copy', 'copied', 'source', 'mark_undo']), ...LOOM2_WORDS }
    }
  }
}
