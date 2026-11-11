// What is sent to the person's AI (talk-live row 3): the instructions and the input of each call, made from
// the texts of content/helper-talk-live-v2.json (src/live-data.js). Never anything Helper keeps, not even the
// name (input.never_sent, input.name_check; Lead, 11 Nov 00:55). tests/live-request.test.mjs keeps a name,
// answers and a "remember that ..." and finds none of them in any request, in any capitals.
import { LIVE_DATA } from './live-data.js'
import { LIVE_ROW } from './live-rows.js'
import { TALK_DATA } from './talk-data.js'
import { oneshotParams } from './model-call.js'

const LV_IN = LIVE_DATA.input
const LV_FIXED = TALK_DATA.fixed
const LV_LINE_CHARS = 200
const LV_LAST_LINES = 4
// A slot such as {rows: one per line, as [id] text; or (none)} is filled with the rows, or with what follows
// "or " when there are none.
function fillList(text, slot, lines) {
  return text.replace(new RegExp('\\{' + slot + '[^}]*\\}'), m => {
    const empty = (m.match(/or (\([^)]*\))\}$/) || [, ''])[1]
    return lines.length ? lines.join('\n') : empty
  })
}
export const firstCallText = () => fillList(LIVE_DATA.first_call.text, 'subjects', LIVE_DATA.subjects.map(s => `${s.id} = ${s.title}`))
export const rowLines = ids => ids.filter(id => LIVE_ROW[id]).map(id => `[${id}] ${LIVE_ROW[id].text}`)
export const writerText = ids => fillList(LIVE_DATA.writer.text, 'rows', rowLines(ids))
export const pickText = ids => fillList(LIVE_DATA.pick_only.text, 'rows', rowLines(ids))

// Which lines of the conversation may ever be sent, decided when they are said (the page notes it on the
// log entries): { you, helper } for the person's message and Helper's answer.
//   left out: a pasted key (K1), "remember that ..." and its RM line, what Helper keeps asked about by typing
//   (A1, A2, A4 and their Yes and No), the person's line that gave the name (the answer at "What's your
//   name?", a name typed later, a name given with a question) and Helper's line that holds that name as typed
const LV_NEVER = /^(?:K1|RM\d|A1|A2|A4|A-none|A-yes|A-no|NAME_AGAIN|NAME_NEW)$/
export function sendable(result) {
  const k = (result && result.kind) || ''
  if (LV_NEVER.test(k)) return { you: false, helper: false }
  return { you: !(k === 'F1' || result.name_taken), helper: true }
}

// Helper's line as it may be sent: its shown text, and for a line that greets by name its text with no name
// (BACK and HELLO text_no_name, F2 without the name, F1 as "Nice to meet you. What do you do?").
function helperText(entry) {
  const f = LV_FIXED[entry.line]
  if (f && ['BACK', 'HELLO', 'F1', 'F2'].includes(entry.line)) return f.text_no_name || f.text.replace(/,? ?\{name\}/g, '')
  return entry.text || ''
}
const lvEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The last 4 lines of this visit that may be sent, oldest first, "Person: ..." or "Helper: ...", each cut at
// 200 characters. names: the kept name and this visit's name; a line that still holds one of them as a whole
// word, in any capitals, is left out (input.name_check).
export function lastLines(log, names = []) {
  const nameRes = names.filter(n => typeof n === 'string' && n.trim()).map(n => new RegExp('(^|[^\\p{L}\\p{N}])' + lvEsc(n.trim()) + '($|[^\\p{L}\\p{N}])', 'iu'))
  const out = []
  for (const e of log) {
    if (e.send === false) continue
    const text = e.who === 'you' ? e.text : helperText(e)
    if (!text || nameRes.some(re => re.test(text))) continue
    out.push(`${e.who === 'you' ? 'Person' : 'Helper'}: ${Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, LV_LINE_CHARS).join('')}`)
  }
  return out.slice(-LV_LAST_LINES)
}

// The input of every call: the lines, then the newest message (as the person typed it, apart from a name given
// in the same message, which the page cuts off first), cut at 1500 characters.
export function inputText(message, lines) {
  const t = lines.length ? LV_IN.text.replace('{last_lines}', () => lines.join('\n')) : LV_IN.text_no_lines
  return Array.from(t.replace('{message}', () => String(message).trim())).slice(0, LV_IN.cut_at_chars).join('')
}

// llm.oneshot's params for one call (src/model-call.js: task helping_hand, no session, no profile)
export const liveParams = (instructions, input, maxTokens) => oneshotParams({ instructions, input, temperature: LV_IN.temperature, max_tokens: maxTokens })
