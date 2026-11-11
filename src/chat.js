// normal-chat (Pēteris's second Loom of 11 Nov 2026: "Have it as a normal chatbot. ... And he has a bunch of
// resources."): every message the person types, after the name question, goes to their own model in one call. The
// call carries Helper's instructions, the best 5 chunks of the Hermes docs for the message (simple keyword scoring,
// no outside service), the last 6 lines of the conversation and the new message. The reply is shown as written.
import { DOCS_CHUNKS } from './docs-data.js'
import { looksLikeKey } from './key-check.js'
import { looksSecret } from './secret-rule.js'

export const CHAT_MAX_TOKENS = 900
export const CHAT_CHUNKS = 5
export const CHAT_LAST_LINES = 6
const CHAT_LINE_CHARS = 600
const CHAT_MESSAGE_CHARS = 2000
export const CHAT_TEMPERATURE = 0.3

// The one short line after the name question (or Skip), and on a later visit's opening. No question, no picks.
export const chatHello = name => (name ? `Nice to meet you, ${name}. ` : '') + 'Ask me anything about Hermes, and I’ll tell you how.'
export const chatBack = name => `Hi again${name ? ', ' + name : ''}. Ask me anything about Hermes.`

export const CHAT_INSTRUCTIONS = `You are Helper. You live inside the Hermes Desktop app and help newcomers set up and use Hermes, an AI agent app by Nous Research.

How to answer:
- Answer the question the person actually asked, with the concrete how: the exact command to paste, or the exact place to click in the app (menu, page, button names).
- When there are several steps, give them as a numbered list, one action per step. Put commands, file names and settings in \`code\`.
- Use the doc excerpts you are given. They come from the Hermes docs. When they don't cover the question, say so in one line, give your best short answer, and point to the closest docs page.
- When the question has two readings that need different answers (for example "Claude" can mean the Claude app or Claude Code), answer the more likely one, then say in one line what to do for the other.
- Use plain words and keep it short. If you must use a technical word, explain it in a few plain words the first time.
- Don't invent commands, settings or menu names that are not in the excerpts. If you are not sure, say so.
- Never ask for an API key, password or token, and never repeat one. If the person needs a key, tell them where in the app to put it (Settings), not to send it in the chat.
- Don't greet, don't ask the person's name, and don't end with a question unless you truly need one answer to help.
- End with a line "Read more:" followed by one to three links, each taken from the URL lines of the excerpts, as markdown links [page title](URL).

Write in markdown: short paragraphs, numbered steps, \`code\` for anything to type.`

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
export function withoutNames(text, names = []) {
  let t = String(text)
  for (const n of names) {
    if (typeof n !== 'string' || !n.trim()) continue
    t = t.replace(new RegExp('(^|[^\\p{L}\\p{N}])' + chatEsc(n.trim()) + '(?=$|[^\\p{L}\\p{N}])', 'giu'), '$1[name]')
  }
  return t
}
// A message the secret rule holds back: never sent, never in a later call's lines. A key's shape (today's K1 rule),
// a long run of digits, or a secret word (password, token ...) with a value or with "is ..." after it. The rule's
// weaker steps (a "maybe" word such as key with any value, a label and a value, many plain words in a row) are left
// out here, because they hold back ordinary questions: "How do I set my API key?" is a "maybe word and a value".
const CHAT_SECRET_STEPS = ['key pattern', 'long number', 'secret word and a value', 'secret word, is, and a word']
export const chatHoldsBack = text => looksLikeKey(text) || CHAT_SECRET_STEPS.includes(looksSecret(String(text)))

// The last 6 lines of this visit, oldest first, as "Person: ..." / "Helper: ...". Lines marked send: false (the
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
