// normal-chat (Pēteris's second Loom of 11 Nov 2026: "Have it as a normal chatbot. ... And he has a bunch of
// resources."): every message the person types, after the name question, goes to their own model in one call. The
// call carries Helper's instructions, the best 5 chunks of the Hermes docs for the message (simple keyword scoring,
// no outside service), the last 10 lines of the conversation and the new message. The reply is shown as written
// (chat-fix: without its marks in double square brackets, which become buttons: chatParts).
import { DOCS_CHUNKS } from './docs-data.js'
import { looksLikeKey } from './key-check.js'
import { looksSecret } from './secret-rule.js'

export const CHAT_MAX_TOKENS = 900
export const CHAT_CHUNKS = 5
export const CHAT_LAST_LINES = 10
const CHAT_LINE_CHARS = 600
const CHAT_MESSAGE_CHARS = 2000
export const CHAT_TEMPERATURE = 0.3

// The one short line after the name question (or Skip), and on a later visit's opening. No question, no picks.
export const chatHello = name => (name ? `Nice to meet you, ${name}. ` : '') + 'Ask me anything about Hermes, and I’ll tell you how.'
export const chatBack = name => `Hi again${name ? ', ' + name : ''}. Ask me anything about Hermes.`

// chat-fix (his words on build 11f4eda, 11 Nov 2026: "The answer is not friendly at all. It should help him step by
// step."): the nine set-up cards of the Dashboard, by id, with the subject the model is told for each. The ids are the
// Dashboard's own (content/dash-setup-list-v2.json; tests/chat-fix.test.mjs holds the two lists together).
export const CHAT_CARDS = [
  ['model', 'the AI model or provider Hermes thinks with: choosing one, changing it, a free one'],
  ['first_chat', 'the first chat with Hermes, trying it out'],
  ['personality', 'the personality: the short text that tells Hermes who it is and how to talk'],
  ['chat_apps', 'talking to Hermes from Telegram, Discord or another chat app on a phone'],
  ['tools_apps', 'tools (actions Hermes can take) and outside apps such as Gmail'],
  ['skills', 'skills: written know-how that teaches Hermes one task'],
  ['memory', "Hermes's built-in memory: what it remembers between chats (not memory providers such as Hindsight)"],
  ['second_bot', 'a second bot (a profile): one more separate Hermes with its own name, memory and skills'],
  ['safety', 'safety: Hermes asking first before it runs anything risky']
]
export const CHAT_QUICK_MAX = 3
// round 20:12 (point 4): each card's place in the app, the words of its first step on the Dashboard (written here,
// because this module is set up before the Dashboard's data in the built file; tests/chat-round-2012.test.mjs holds
// the two together)
const CHAT_CARD_PLACES = {
  model: 'Open Settings (Ctrl and comma; Cmd and comma on a Mac). Click Providers.',
  first_chat: 'Click New session at the top of the left list (or Ctrl+N; Cmd+N on a Mac).',
  personality: 'Click Bots at the top of the left list.',
  chat_apps: 'Click Messaging in the left list.',
  tools_apps: 'Click Capabilities in the left list, then Tools. Each group of actions has a switch.',
  skills: 'Click Capabilities in the left list, then Skills. Each skill has a switch.',
  memory: 'Nothing to switch on. Memory is on from the start.',
  second_bot: 'Click Bots at the top of the left list.',
  safety: 'Nothing to switch on. Asking first is on from the start.'
}
export const chatCardPlace = id => CHAT_CARD_PLACES[id] || ''

export const CHAT_INSTRUCTIONS = `You are Helper. You live inside the Hermes Desktop app and help a newcomer set up and use Hermes, an AI agent app by Nous Research. Talk like a patient friend who knows Hermes well: warm, plain words, never a manual.

How to answer:
- Keep every reply short: at most about 80 words. No headings, no tables, no long lists. Leave out config-file names and setting names unless the person has to type them.
- Go one step at a time. When the answer takes several steps, first say in one line what you will do together and how many steps it takes ("This takes 3 short steps. Here's the first."). Then give ONLY the first step: exactly what to click or what to type, with anything to type in \`code\`. End with a short check such as "Tell me when that's done, or tell me what you see." Give the next step in your next reply; the conversation so far shows which step they are on. If they say it didn't work, help with that step before going on.
- For "What is X?", in this order: first what it is, in one or two plain sentences. Then what it needs, if the excerpts say it needs an account, a key or money. Then where it is in the app, naming the place to click (for a card's subject, the place in that card's line below, such as "Capabilities in the left list, then Skills"). Only if the person then asks how, give the first step. Never open a "What is" answer with a terminal command, and never count the steps before giving one.
- An install is given as text the person pastes to their own bot in a chat, never as "type this in your terminal", unless it is the Do it for me action below.
- When the question has two readings that change the answer, don't assume: ask which one first, and give the choices as quick replies.
- Offer only choices the doc excerpts can answer. For Claude, that is Claude Code's setup and a Claude Code conversation, never "The Claude app". If the person asks about the Claude app, say the docs cover Claude Code only.
- Quick replies: you may end a reply with two or three choices, each in double square brackets, all together on the very last line of the reply, after the "Read more:" line, like this: [[Claude Code setup]] [[A Claude Code conversation]]. The person sees them as buttons, and a click sends that text as their message. Use them only for real choices, and use double square brackets for nothing else.
- Dashboard cards: Helper's Dashboard has nine set-up cards, each with its steps and a place for a video. Add a card only when your reply is about that card's own subject, and then end your reply with [[card:ID]] on its own line, with that card's id (one card at most). A reply about something near it gets no card: [[card:memory]] is for Hermes's built-in memory, so a reply about a memory provider such as Hindsight carries no card. Each card's id, subject and place in the app:
${CHAT_CARDS.map(([id, subject]) => `  ${id} = ${subject}. Place: ${chatCardPlace(id)}`).join('\n')}
- Do it for me: Helper can run one kind of step for the person: bringing a setup over from another agent. When that import is the step to do now and you know which agent, end your reply with [[do:import AGENT]] on its own line, where AGENT is one of claude-code, codex, cursor, openclaw. The person then sees a button "Do it for me". If Hermes's own import add-on (agent-importers, from Nous Research) is not installed yet, Helper first offers to install it: that is the one change before the preview. Then it shows a preview, and the import itself waits until they press "Import it". Tell them in one line that they can press it. Never write "nothing changes before that". For every other step, give the step to do by hand, and never write [[do:...]] for anything else.
- Use the doc excerpts you are given. They come from the Hermes docs. When they don't cover the question, say so in one line, give your best short answer, and point to the closest docs page.
- Don't invent commands, settings or menu names that are not in the excerpts. If you are not sure, say so.
- Never ask for an API key, password or token, and never repeat one. If the person needs a key, tell them where in the app to put it (Settings), not to send it in the chat.
- Don't greet and don't ask the person's name.
- Add a line "Read more:" with one or two links only on your first reply about a topic and on the last step. Take each link from the URL lines of the excerpts, as a markdown link [page title](URL).

Write in markdown: short paragraphs, \`code\` for anything to type.`

// The model's reply, taken apart: the words to show, and its marks in double square brackets, which are never shown.
//   [[card:<id>]]   one of the nine cards (the first known one; an unknown id is dropped)
//   [[do:import <agent>]]   the one action Helper offers to run (chatAction); any other [[do:...]] is dropped
//   [[A]] [[B]]     quick replies, at most CHAT_QUICK_MAX: on a line of their own, or at the end of the last line
// Any other pair of double brackets loses its brackets and keeps its words (a mark in the middle of a sentence stays
// part of the sentence). Text to type is left alone: a code block as src/md.js reads it (from a ``` or ~~~ line to
// the next line that starts with the same mark, or to the end) and `code` inside a line (a shell test is written
// [[ -f file ]]). The reply is the model's text, so nothing in it is trusted: a mark that only forms once another
// was taken out does nothing, and a choice that looks like a key, or that holds unseen characters, is no button.
const CHAT_MARK_ANY = /\[\[([^\n]*?)\]\]/g
const CHAT_MARK_NAMED = /\[\[\s*(card|do)\s*:([^[\]\n]*)\]\]/gi
const CHAT_MARKS_TAIL = /(?:\s*\[\[[^[\]\n`]*\]\])+\s*$/
const CHAT_MARKS_RUN = /[ \t]*\[\[[^[\]\n`]*\]\](?:[ \t]*\[\[[^[\]\n`]*\]\])+[ \t]*/g
const CHAT_QUICK_CHARS = 60
export function chatParts(reply) {
  const lines = String(reply || '').replace(/\r\n?/g, '\n').split('\n')
  let card = null
  let act = null
  const quick = []
  const typed = lines.map(() => false)
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^\s*(```|~~~)/)
    if (!fence) continue
    typed[i++] = true
    while (i < lines.length && !lines[i].trim().startsWith(fence[1])) typed[i++] = true
    if (i < lines.length) typed[i] = true
  }
  // the words of a line outside its `code`, changed by f
  const outside = (line, f) => {
    const parts = line.split('`')
    return parts.map((part, i) => (i % 2 && i < parts.length - 1 ? part : f(part))).join('`')
  }
  const named = (kind, what) => {
    const id = what.trim().toLowerCase()
    if (kind.toLowerCase() === 'card' && !card && CHAT_CARDS.some(c => c[0] === id)) card = id
    if (kind.toLowerCase() === 'do' && !act) act = chatAction(what)
  }
  const choice = words => {
    const t = words.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()
    if (!t || Array.from(t).length > CHAT_QUICK_CHARS || /^(card|do)\s*:/i.test(t) || chatHoldsBack(t)) return
    if (quick.length < CHAT_QUICK_MAX && !quick.includes(t)) quick.push(t)
  }
  // 1. the card and action marks go, wherever they are outside text to type
  const kept = []
  lines.forEach((line, i) => {
    if (typed[i]) return kept.push({ line, typed: true })
    const shown = outside(line, part => {
      let first = true
      for (;;) {
        const next = part.replace(CHAT_MARK_NAMED, (m, kind, what) => {
          if (first) named(kind, what)
          return ''
        })
        if (next === part) return part
        part = next
        first = false
      }
    })
    if (line.trim() && !shown.trim()) return
    kept.push({ line: shown, typed: false })
  })
  // 2. the choices: a line that is only marks, and the marks that end the last line
  let last = kept.length - 1
  while (last >= 0 && (kept[last].typed || !kept[last].line.trim())) last--
  const out = []
  kept.forEach((k, i) => {
    if (k.typed) return out.push(k.line)
    // round 20:12 (hhtech's point 1): a run of two or three marks is a set of choices wherever it stands in the reply
    // (mid-line, before or after "Read more"); it leaves no trace in the words
    let shown = outside(k.line, part =>
      part.replace(CHAT_MARKS_RUN, (run, at, all) => {
        for (const m of run.matchAll(CHAT_MARK_ANY)) choice(m[1])
        return all.slice(0, at).trim() && all.slice(at + run.length).trim() ? ' ' : ''
      })
    )
    if (k.line.trim() && !shown.trim()) return
    const tail = shown.match(CHAT_MARKS_TAIL)
    if (tail && (i === last || !shown.slice(0, tail.index).trim())) {
      for (const m of tail[0].matchAll(CHAT_MARK_ANY)) choice(m[1])
      shown = shown.slice(0, tail.index)
    }
    // 3. what is left of double brackets loses them
    shown = outside(shown, part => part.replace(CHAT_MARK_ANY, '$1').replace(/\[\[|\]\]/g, ''))
    if (k.line.trim() && !shown.trim()) return
    out.push(shown.replace(/\s+$/, ''))
  })
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), quick, card, ...(act ? { act } : {}) }
}

// ---- chat-fix part 3: "Do it for me" (his words: "Is it possible for the helper to do it and do something on his
// behalf?") ----
// Hermes lets a plugin run Hermes's own commands (host.request('cli.exec', { argv }): `hermes <argv>`, not
// interactive, gives { blocked, code, output }). Helper uses it for this short fixed list only, never for a command
// the model writes: the model can only name an action and one of the agents below; the commands are written here.
//   import <agent>: first a preview (--dry-run never touches the disk), shown in plain words; then, on a second
//   click, the import (--yes). When Hermes's import add-on is missing, installing it is the action's first step,
//   shown and confirmed the same way.
export const CHAT_AGENTS = { 'claude-code': 'Claude Code', codex: 'Codex', cursor: 'Cursor', openclaw: 'OpenClaw' }
// what the model wrote after "do:" -> the action, or null (dropped silently)
export function chatAction(what) {
  const m = String(what).trim().toLowerCase().match(/^import\s+([a-z-]+)$/)
  return m && Object.hasOwn(CHAT_AGENTS, m[1]) ? { kind: 'import', agent: m[1], state: 'offer' } : null
}
// the command of each step, as cli.exec takes it
export function chatActionArgv(step, agent) {
  if (!Object.hasOwn(CHAT_AGENTS, agent)) return null
  if (step === 'preview') return ['import-agent', agent, '--dry-run']
  if (step === 'import') return ['import-agent', agent, '--yes']
  if (step === 'plugin') return ['plugins', 'install', 'agent-importers', '--enable']
  return null
}
// the same step typed by hand in a terminal (there Hermes asks before it applies, so no --yes and no --enable)
export function chatActionTyped(step, agent) {
  const argv = chatActionArgv(step, agent)
  return argv ? 'hermes ' + argv.filter(a => a !== '--yes' && a !== '--enable').join(' ') : ''
}
// The command's output as plain lines: no colour codes, no drawn boxes, no empty lines.
export function chatActionLines(output) {
  return String(output || '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l.trim() && !/^\s*[\u2502\u250c\u2510\u2514\u2518\u256d-\u2570]/.test(l) && !/^[\s\u2500-\u257f]+$/.test(l))
}
// Hermes without its import add-on says so and names the install command (seen in Hermes v0.23.0, exit code 2)
export const chatNeedsPlugin = lines => /agent-importers/.test(lines.join('\n')) && /not loaded|plugins install/.test(lines.join('\n'))
// round 20:12: the preview found no folder of the other agent on this computer (Hermes v0.23.0: "Agent directory not found")
export const chatNoAgent = lines => /agent directory not found/i.test(lines.join('\n'))
// the last lines of a failed run, each cut short
export const chatActionTail = (lines, count = 6) => lines.slice(-count).map(l => (l.length > 200 ? l.slice(0, 200) + '…' : l.trim()))
// The things an import names, in plain words (the importer's own ids; an id not listed here is shown as it is)
const CHAT_ITEMS = {
  'claude-md': 'Your instructions (CLAUDE.md), as memory notes',
  settings: 'Settings',
  'command-allowlist': 'The commands you allowed',
  'command-denylist': 'The commands you blocked',
  'mcp-servers': 'MCP servers (outside tools)',
  skills: 'Skills'
}
// What a preview or an import printed: the things it would bring over (or brought over), how many it skipped, and
// its own summary line. Only the things' names are read; where they go (a path on the person's disk) is left out.
export function chatActionRead(lines, step) {
  const head = step === 'import' ? /Imported:\s*$/ : /Would import:\s*$/
  const section = re => {
    const at = lines.findLastIndex(l => re.test(l))
    const rows = []
    for (let i = at + 1; at >= 0 && i < lines.length && /^\s{4,}\S/.test(lines[i]); i++) rows.push(lines[i].trim().split(/\s+/)[0])
    return rows
  }
  const sum = lines.findLast(l => /^\s*Summary:/.test(l))
  return { rows: section(head).map(id => CHAT_ITEMS[id] || id.replace(/-/g, ' ')), skipped: section(/Skipped:\s*$/).length, summary: sum ? sum.replace(/^\s*Summary:\s*/, '').trim() : '' }
}
// What a later call is told about an action under one of Helper's lines: a fixed phrase, never the command's output
// (it holds paths on the person's disk)
const CHAT_ACT_TOLD = {
  plugin: ' (Helper tried to run this step for the person: Hermes needs its import add-on first, and Helper offered to install it.)',
  preview: ' (Helper ran the preview for the person and showed what would come over; the import itself has not been run yet.)',
  done: ' (Helper ran the import for the person; it is done.)',
  missing: ' (Helper tried the preview for the person: that program is not on this computer, so there is nothing to bring over.)',
  failed: ' (Helper tried to run this step for the person; the command failed, and Helper showed how to do it by hand.)'
}

// ---- the docs: words of each chunk, counted once on the first message ----
const CHAT_STOP = new Set('a an and are as at be but by can do does for from how i if in into is it its me my of on or so that the then this to was we what when where which who why will with you your hermes please want need get use using able would could should there their them they about just like also any some one'.split(' '))
// a few words people use for the same thing as the docs
const CHAT_ALSO = { move: ['migrate', 'import'], moving: ['migrate', 'import'], switch: ['migrate', 'import'], switching: ['migrate', 'import'], transfer: ['import', 'migrate'], bring: ['import'], phone: ['telegram', 'messaging'], install: ['installation', 'install'], key: ['provider', 'key'], model: ['model', 'provider'] }
const chatStem = w => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
export const chatWords = s =>
  String(s)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length > 1 && !CHAT_STOP.has(w))
    .map(chatStem)

let chatIndex = null
function chatIndexOf(chunks) {
  if (chatIndex && chatIndex.chunks === chunks) return chatIndex
  const df = new Map()
  const rows = chunks.map(([title, heading, url, text]) => {
    const tf = new Map()
    for (const w of chatWords(text)) tf.set(w, (tf.get(w) || 0) + 1)
    const head = new Set(chatWords(heading))
    const tit = new Set([...chatWords(title), ...chatWords(url.replace(/^.*\/docs\//, ''))])
    for (const w of new Set([...tf.keys(), ...head, ...tit])) df.set(w, (df.get(w) || 0) + 1)
    return { tf, head, tit }
  })
  chatIndex = { chunks, rows, df, n: chunks.length }
  return chatIndex
}

// The best `count` chunks for a message: each word of the message (and the few words people use for the same thing)
// counts by how rare it is in the docs; in the page title or address 3 times, in the heading 2 times, in the text by
// how often (at most 4). At most 3 chunks of one page. Returns [{ title, heading, url, text, score }], best first.
export function pickChunks(message, count = CHAT_CHUNKS, chunks = DOCS_CHUNKS) {
  const ix = chatIndexOf(chunks)
  const own = [...new Set(chatWords(message))]
  // "go from Claude to Hermes", "from ChatGPT to Hermes": a move from another app, which the docs call import / migrate
  const fromTo = /\bfrom\b.+\bto\b/i.test(String(message)) ? ['import', 'migrate'] : []
  const extra = [...new Set([...fromTo, ...own.flatMap(w => CHAT_ALSO[w] || [])].map(chatStem))].filter(w => !own.includes(w))
  const ask = [...own.map(w => [w, 1]), ...extra.map(w => [w, 0.5])]
  if (!ask.length) return []
  const scored = []
  ix.rows.forEach((r, i) => {
    let s = 0
    for (const [w, weight] of ask) {
      const df = ix.df.get(w)
      if (!df) continue
      const idf = Math.log(1 + ix.n / df)
      const tf = r.tf.get(w) || 0
      s += weight * idf * ((r.tit.has(w) ? 3 : 0) + (r.head.has(w) ? 2 : 0) + Math.min(tf, 4))
    }
    if (s > 0) scored.push([s, i])
  })
  scored.sort((a, b) => b[0] - a[0] || a[1] - b[1])
  // at most 3 chunks of one page, so a second page can say what the first doesn't
  const perPage = new Map()
  const best = []
  for (const x of scored) {
    const url = chunks[x[1]][2]
    if ((perPage.get(url) || 0) >= 3) continue
    perPage.set(url, (perPage.get(url) || 0) + 1)
    best.push(x)
    if (best.length === count) break
  }
  return best.map(([score, i]) => {
    const [title, heading, url, text] = chunks[i]
    return { title, heading, url, text, score }
  })
}

// ---- what is sent ----
const chatEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// The name (the kept one and this visit's) is never sent: each whole-word use, in any capitals, becomes "[name]".
// (review finding 7) each word of a name too, so "Zelda" goes when the kept name is "Zelda Smith" or "Hello! Zelda"
export function withoutNames(text, names = []) {
  let t = String(text)
  const words = names.filter(n => typeof n === 'string' && n.trim()).flatMap(n => [n.trim(), ...n.split(/[^\p{L}\p{N}'-]+/u).filter(w => Array.from(w).length >= 2)])
  for (const n of [...new Set(words)].sort((a, b) => b.length - a.length)) t = t.replace(new RegExp('(^|[^\\p{L}\\p{N}])' + chatEsc(n) + '(?=$|[^\\p{L}\\p{N}])', 'giu'), '$1[name]')
  return t
}
// A message the secret rule holds back: never sent, never in a later call's lines. A key's shape (today's K1 rule),
// a long run of digits, or a secret word (password, token ...) with a value or with "is ..." after it. The rule's
// weaker steps (a "maybe" word such as key with any value, a label and a value, many plain words in a row) are left
// out here, because they hold back ordinary questions: "How do I set my API key?" is a "maybe word and a value".
// (review finding 5) the weaker steps do hold a message back when it also has a long run of letters mixed with digits
// (12 or more, as a key or password has), such as "api key = abcd1234efgh5678"
const CHAT_SECRET_STEPS = ['key pattern', 'long number', 'secret word and a value', 'secret word, is, and a word']
const CHAT_WEAK_STEPS = ['maybe word and a value', 'label, is, and a value']
const CHAT_KEYISH = /^(?=\S*\p{N})(?=\S*\p{L})\S{12,}$/u
export function chatHoldsBack(text) {
  const t = String(text)
  if (looksLikeKey(t)) return true
  const step = looksSecret(t)
  return CHAT_SECRET_STEPS.includes(step) || (CHAT_WEAK_STEPS.includes(step) && t.split(/\s+/).some(w => CHAT_KEYISH.test(w) && !/^https?:/.test(w)))
}

// The last 10 lines of this visit, oldest first, as "Person: ..." / "Helper: ...". Lines marked send: false (the
// name question and its answer, a key's line) and secret-looking lines are left out.
export function chatLines(log, names = []) {
  const out = []
  for (const e of log) {
    if (!e || e.send === false || (e.who !== 'you' && e.who !== 'helper')) continue
    const text = typeof e.text === 'string' ? e.text.replace(/\s+/g, ' ').trim() : ''
    if (!text || chatHoldsBack(text)) continue
    const told = e.who === 'helper' && e.act && CHAT_ACT_TOLD[e.act.state] ? CHAT_ACT_TOLD[e.act.state] : ''
    out.push(`${e.who === 'you' ? 'Person' : 'Helper'}: ${withoutNames(Array.from(text).slice(0, CHAT_LINE_CHARS).join(''), names)}${told}`)
  }
  return out.slice(-CHAT_LAST_LINES)
}

export function chatInput(message, chunks, lines, names = []) {
  const parts = []
  parts.push('Doc excerpts:')
  if (!chunks.length) parts.push('(none found for this message)')
  chunks.forEach((c, i) => parts.push(`[${i + 1}] ${c.title}${c.heading && c.heading !== c.title ? ' > ' + c.heading : ''}\nURL: ${c.url}\n${c.text}`))
  parts.push('Conversation so far:\n' + (lines.length ? lines.join('\n') : '(this is the first question)'))
  parts.push('New message from the person:\n' + withoutNames(Array.from(String(message).trim()).slice(0, CHAT_MESSAGE_CHARS).join(''), names))
  return parts.join('\n\n')
}

// The params of the one llm.oneshot call (src/model-call.js oneshotParams: task helping_hand, no session_id)
export function chatCall(message, log, names = []) {
  const chunks = pickChunks(withoutNames(message, names))
  const lines = chatLines(log, names)
  return { instructions: CHAT_INSTRUCTIONS, input: chatInput(message, chunks, lines, names), temperature: CHAT_TEMPERATURE, max_tokens: CHAT_MAX_TOKENS, chunks }
}
