// The AI step of the set-up conversation's recommendation (setup-chat point 6; content/helper-setup-chat-v1.json ai).
// Only the recommendation sentence is the AI's: one call, and its reply is shown in place of the written
// "{reason} Next: {card}. {why}" only when it passes no_reply, c26, the name check and s1 to s8. On any fail, no reply
// or no answer in 12 s the written line is shown. "Want the steps?" and the four answers are always written.
// What is handed (ai.handed): what the person does, what they want, new or not, the look line, the thing with its why
// sentence, the written reason. Never the name, never the steps, nothing else that is kept.
// Pure code: src/page.js makes the call.
import { SETUP_DATA } from './setup-data.js'
import { noReply, readWritten, c26Fails } from './live-checks.js'
import { workOk } from './kept.js'
import { seenLine, recText } from './setup-chat.js'
import { liveParams } from './live-request.js'
import { ONESHOT_TIMEOUT_MS } from './model-call.js'

const SR = SETUP_DATA
export const REC_MAX_TOKENS = 120
// llm.oneshot needs an input beside the instructions; the data gives none, so one fixed sentence (Decided myself)
export const REC_INPUT = 'Write the message now.'
// The one call, asked the same way as the conversation's AI step (src/live-turn.js): task helping_hand, the live
// answers' temperature, never a session id. The page stops waiting after 12 s.
export const askRec = (request, instructions) => request('llm.oneshot', liveParams(instructions, REC_INPUT, REC_MAX_TOKENS), ONESHOT_TIMEOUT_MS)
const NOT_TOLD = '(not told)'
const srEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const srHasName = (text, names) => names.filter(n => typeof n === 'string' && n.trim()).some(n => new RegExp('(^|[^\\p{L}\\p{N}])' + srEsc(n.trim()) + '($|[^\\p{L}\\p{N}])', 'iu').test(text))
// a kept text may be sent only when it passes the keep rule again and does not hold the name
const srMaySend = (text, names) => (typeof text === 'string' && workOk(text) && !srHasName(text, names) ? text.replace(/\s+/g, ' ').trim() : NOT_TOLD)

// The instructions of the one call. rec: { item, rule, isNew, goal } of the recommendation; kept: the visit's kept
// record; seen: the look; names: the kept name and this visit's name.
export function recInstructions(rec, kept, seen, names = []) {
  const it = SR.items[rec.item]
  const a = SR.questions.Q_NEW.answers.find(x => x.id === kept.setup_new)
  const written = recText(rec.item, rec.rule, rec.isNew, rec.goal)
  const reason = written.slice(0, written.indexOf(' Next: '))
  const look = seenLine(seen, rec.goal).slice(SR.look.parts.LOOK_OPEN.length).trim()
  const slots = [
    [/\{work or \(not told\)\}/, srMaySend(kept.work, names)],
    [/\{goal kept_as, or the typed text, or \(not told\)\}/, srMaySend(kept.setup_goal, names)],
    [/\{Q_NEW kept_as or \(not told\)\}/, a && a.kept_as ? a.kept_as : NOT_TOLD],
    [/\{SEEN line without LOOK_OPEN\}/, look],
    [/\{why\}/, it.why],
    [/\{reason\}/, reason]
  ]
  let text = SR.ai.instructions.replace(/\{card\}/g, () => it.name)
  for (const [re, value] of slots) text = text.replace(re, () => value)
  return text
}

// s1 to s8 and the name check (hhcontent's build.py ai_check, the reference): the ids that fail
const SR_STEP_WORDS = ['click', 'press', 'tap', 'open', 'type', 'paste', 'scan', 'settings', 'menu', 'button', 'tab', 'ctrl', 'cmd', 'terminal', 'command']
const SR_S3 = new RegExp('\\b(?:' + SR_STEP_WORDS.join('|') + ')\\b')
const SR_S7A = /\b(i'll|i will|i can|i could|let me)\b(\W+\w+){0,3}?\W+(set|install|connect|create|make|add|build|do)\b/
const SR_S7B = /\b(set|install|connect|create|make|build|do)\w* (it |this |that |them )?(up )?for you/
export function recFlags(reply, item, name = null) {
  const r = String(reply).trim().replace(/[\u2018\u2019]/g, "'")
  const low = r.toLowerCase()
  const fails = []
  if (!SR.ai.aliases[item].some(a => low.includes(a))) fails.push('s1')
  const others = [...Object.entries(SR.ai.aliases).filter(([k]) => k !== item).flatMap(([, v]) => v), ...SR.ai.later_names]
  if (others.some(a => new RegExp('\\b' + srEsc(a)).test(low))) fails.push('s2')
  if (SR_S3.test(low) || r.includes('`') || low.includes('http') || low.includes('www')) fails.push('s3')
  const words = r.split(/\s+/).filter(Boolean).length
  const sents = r.split(/(?<=[.!?])\s+/).filter(s => s.trim()).length
  if (words > SR.ai.max_words || sents > SR.ai.max_sentences) fails.push('s4')
  if (r.includes('?')) fails.push('s5')
  if (r.includes('!')) fails.push('s6')
  if (SR_S7A.test(low) || SR_S7B.test(low)) fails.push('s7')
  if (/\d/.test(r)) fails.push('s8')
  if (name && new RegExp('\\b' + srEsc(String(name).toLowerCase()) + '\\b').test(low)) fails.push('name')
  return fails
}

// The whole reading of the reply: { text } to show in place of the written sentence, { fail } (the written line), or
// { noReply: true } (thinking text or nothing at all: the written line, and the AI step goes off as for a slow AI).
// hand: the instructions sent, for c26 (a word of the model's notes that is also in what was handed does not fail)
export function judgeRec(raw, item, names = [], hand = '') {
  if (raw == null || !String(raw).trim() || noReply(raw)) return { noReply: true }
  const { text } = readWritten(raw)
  if (!text) return { fail: 'empty' }
  const c26 = c26Fails(text, hand)
  if (c26) return { fail: 'c26 ' + c26 }
  if (srHasName(text, names)) return { fail: 'name' }
  const flags = recFlags(text, item)
  if (flags.length) return { fail: flags[0], flags }
  return { text }
}
