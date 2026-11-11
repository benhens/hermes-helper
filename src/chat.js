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
  ['memory', 'memory: what Hermes remembers between chats, and memory providers such as Hindsight'],
  ['second_bot', 'a second bot (a profile): one more separate Hermes with its own name, memory and skills'],
  ['safety', 'safety: Hermes asking first before it runs anything risky']
]
export const CHAT_QUICK_MAX = 3

export const CHAT_INSTRUCTIONS = `You are Helper. You live inside the Hermes Desktop app and help a newcomer set up and use Hermes, an AI agent app by Nous Research. Talk like a patient friend who knows Hermes well: warm, plain words, never a manual.

How to answer:
- Keep every reply short: at most about 80 words. No headings, no tables, no long lists. Leave out config-file names and setting names unless the person has to type them.
- Go one step at a time. When the answer takes several steps, first say in one line what you will do together and how many steps it takes ("This takes 3 short steps. Here's the first."). Then give ONLY the first step: exactly what to click or what to type, with anything to type in \`code\`. End with a short check such as "Tell me when that's done, or tell me what you see." Give the next step in your next reply; the conversation so far shows which step they are on. If they say it didn't work, help with that step before going on.
- For "What is X?": say what it is in one or two plain sentences, then where it is in the app (the exact place to click), then what to do first.
- When the question has two readings that change the answer (for example "Claude" can mean the Claude app or Claude Code), don't assume: ask which one first, and give the choices as quick replies.
- Quick replies: you may end a reply with up to three choices on one last line, each in double square brackets, like this: [[Claude Code]] [[The Claude app]]. The person sees them as buttons, and a click sends that text as their message. Use them only for real choices, and use double square brackets for nothing else.
- Dashboard cards: Helper's Dashboard has nine set-up cards, each with its steps and a place for a video. When the question is about one of these subjects, end your reply with [[card:ID]] on its own line, with that card's id (one card at most):
${CHAT_CARDS.map(([id, subject]) => `  ${id} = ${subject}`).join('\n')}
- Use the doc excerpts you are given. They come from the Hermes docs. When they don't cover the question, say so in one line, give your best short answer, and point to the closest docs page.
- Don't invent commands, settings or menu names that are not in the excerpts. If you are not sure, say so.
- Never ask for an API key, password or token, and never repeat one. If the person needs a key, tell them where in the app to put it (Settings), not to send it in the chat.
- Don't greet and don't ask the person's name.
- Add a line "Read more:" with one or two links only on your first reply about a topic and on the last step. Take each link from the URL lines of the excerpts, as a markdown link [page title](URL).

Write in markdown: short paragraphs, \`code\` for anything to type.`

// The model's reply, taken apart: the words to show, and its marks in double square brackets, which are never shown.
//   [[card:<id>]]            one of the nine cards (the first known one; an unknown id is dropped)
//   [[do:...]]               an action Helper offers to run; dropped here
//   [[A]] [[B]] at a line's end   quick replies, at most three: buttons under the reply
// Any other pair of double brackets in the words loses its brackets and keeps its words. Text to type is left alone:
// a code block between \`\`\` lines, and \`code\` inside a line (a shell test is written [[ -f file ]]).
const CHAT_MARK = /\[\[([^\[\]\n]{1,80})\]\]/g
export function chatParts(reply) {
  let card = null
  const quick = []
  let fenced = false
  const out = []
  for (const line of String(reply || '').split('\n')) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced
      out.push(line)
      continue
    }
    if (fenced) {
      out.push(line)
      continue
    }
    let l = line.replace(/\[\[\s*(card|do)\s*:([^\[\]\n]{0,80})\]\]/gi, (m, kind, what) => {
      const id = what.trim().toLowerCase()
      if (kind.toLowerCase() === 'card' && !card && CHAT_CARDS.some(c => c[0] === id)) card = id
      return ''
    })
    const tail = l.match(/(?:\s*\[\[[^\[\]\n`]{1,80}\]\])+\s*$/)
    if (tail) {
      for (const m of tail[0].matchAll(CHAT_MARK)) {
        const t = m[1].replace(/\s+/g, ' ').trim()
        if (t && quick.length < CHAT_QUICK_MAX && !quick.includes(t)) quick.push(t)
      }
      l = l.slice(0, tail.index)
    }
    l = l
      .split('`')
      .map((part, i) => (i % 2 ? part : part.replace(CHAT_MARK, '$1')))
      .join('`')
    // a line that held only marks is gone with them
    if (line.trim() && !l.trim()) continue
    out.push(l.replace(/\s+$/, ''))
  }
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), quick, card }
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
    out.push(`${e.who === 'you' ? 'Person' : 'Helper'}: ${withoutNames(Array.from(text).slice(0, CHAT_LINE_CHARS).join(''), names)}`)
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
