// What is sent to the person's AI (talk-live row 3): the instructions and the input of each call, made from
// the texts of content/helper-talk-live-v2.json (src/live-data.js). Never anything Helper keeps, not even the
// name (input.never_sent, input.name_check; Lead, 11 Nov 00:55). tests/live-request.test.mjs keeps a name,
// answers and a "remember that ..." and finds none of them in any request, in any capitals.
import { LIVE_DATA } from './live-data.js'
import { LIVE_ROW } from './live-rows.js'
import { TALK_DATA } from './talk-data.js'
import { oneshotParams } from './model-call.js'
import { looksSecret } from './secret-rule.js'
import { workOk } from './kept.js'

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
// find-v1 (Lead, 11 Nov): the list call, in place of the first call that picked a subject word. The instructions are
// hhtech's LIST_CALL (dev/checks/hhtech-find-run/find.mjs, way W1), word for word but for "as id = title" (it ran with
// "how the line begins"; the titles are hhcontent's now), followed by the list of every fact line. It is Helper's own
// text, the same for every person and every message; what goes with it is the usual input (the lines that may be
// sent and the newest message).
const LIST_CALL = `You find the right checked line for Helper, a part of the Hermes app that explains Hermes to newcomers.
Read the person's newest message (and the conversation before it, if any). Below are Helper's checked lines, one per line, as id = title.
Reply with the ids of the lines that answer the message: at most three, the best first, separated by commas, and nothing else.
If no line answers the message, or it is ordinary talk (hello, thanks, ok), reply with only the word NONE.
If the person asks Helper to make, build, install, connect or do something for them, reply with only the word BUILD.
Lines:
`
export const LIST_MAX_TOKENS = 30
const LIST_TEXT = LIST_CALL + LIVE_DATA.list.map(l => `${l.id} = ${l.title}`).join('\n')
export const listCallText = () => LIST_TEXT
export const rowLines = ids => ids.filter(id => LIVE_ROW[id]).map(id => `[${id}] ${LIVE_ROW[id].text}`)
// live-v2 changes-4 (input.work_line): what the person does, the one kept value ever sent, as one labelled line; null
// when nothing is kept or the value fails the guard (not secret, no key, within keeps.work.limits). Never the name.
// names: the kept name and this visit's name; a value that holds one of them as a whole word, in any capitals, is
// left out (input.work_line.never: the name is never in this line; review)
export function workLine(work, names = []) {
  if (!workOk(work)) return null
  if (names.filter(n => typeof n === 'string' && n.trim()).some(n => new RegExp('(^|[^\\p{L}\\p{N}])' + lvEsc(n.trim()) + '($|[^\\p{L}\\p{N}])', 'iu').test(work))) return null
  return LV_IN.work_line.replace('{work}', () => work.replace(/\s+/g, ' ').trim())
}
// the slot {work_line} on its own line: the work line, or the slot and its line break left out
const fillWork = (text, work, names) => {
  const w = workLine(work, names)
  return w ? text.replace('{work_line}', () => w) : text.replace(/\{work_line\}\n?/, '')
}
export const writerText = (ids, work = null, names = []) => fillList(fillWork(LIVE_DATA.writer.text, work, names), 'rows', rowLines(ids))
export const pickText = (ids, work = null, names = []) => fillList(fillWork(LIVE_DATA.pick_only.text, work, names), 'rows', rowLines(ids))

// Which lines of the conversation may ever be sent, decided when they are said (the page notes it on the
// log entries): { you, helper } for the person's message and Helper's answer.
//   left out: a pasted key (K1), "remember that ..." and its RM line, what Helper keeps asked about by typing
//   (A1, A2, A4 and their Yes and No), the person's line that gave the name (the answer at "What's your
//   name?", a name typed later, a name given with a question) and Helper's line that holds that name as typed
//   (review) and an answer Helper keeps (the AI, the chat app, the service: picked or typed) with the line that
//   answers it, and a line said from what is kept ("From what I keep: ..."), which shows the kept answer
const LV_NEVER = /^(?:K1|RM\d|A1|A2|A4|A-none|A-yes|A-no|NAME_AGAIN|NAME_NEW)$/
// talk-live-2 (review): an answer to "What do you do?" that was not kept (too long, or looking secret) says about the
// person more than the one work line; it is not sent either
const LV_WORK_NOT_KEPT = /^(?:WORK_LONG|WORK_LONG_2|WORK_SECRET)$/
export function sendable(result) {
  const k = (result && result.kind) || ''
  if (LV_NEVER.test(k)) return { you: false, helper: false }
  if ((result.kept || []).some(x => x !== 'name') || result.used === 'kept') return { you: false, helper: false }
  return { you: !(k === 'F1' || result.name_taken || LV_WORK_NOT_KEPT.test(k)), helper: true }
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
    // (review) a line that looks like a secret by Helper's secret rule is never sent, also later
    if (!text || nameRes.some(re => re.test(text)) || looksSecret(text)) continue
    out.push(`${e.who === 'you' ? 'Person' : 'Helper'}: ${Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, LV_LINE_CHARS).join('')}`)
  }
  return out.slice(-LV_LAST_LINES)
}

// The input of every call: the lines, then the newest message (as the person typed it, apart from a name given
// in the same message, which the page cuts off first), cut at 1500 characters.
export function inputText(message, lines) {
  // both slots filled in one pass, so a typed "{message}" in a line is left as typed (review)
  const fill = { last_lines: lines.join('\n'), message: String(message).trim() }
  const t = (lines.length ? LV_IN.text : LV_IN.text_no_lines).replace(/\{(last_lines|message)\}/g, (m, k) => fill[k])
  return Array.from(t).slice(0, LV_IN.cut_at_chars).join('')
}

// llm.oneshot's params for one call (src/model-call.js: task helping_hand, no session, no profile)
export const liveParams = (instructions, input, maxTokens) => oneshotParams({ instructions, input, temperature: LV_IN.temperature, max_tokens: maxTokens })
