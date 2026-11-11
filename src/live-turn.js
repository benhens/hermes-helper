// One typed message with the AI step (talk-live rows 5 and 6). No React, and every request and clock is passed
// in, so the tests drive time (as src/model-call.js). The order is content/helper-talk-live-v2.json order.steps:
//   1. the no-AI turn runs first, exactly as before (src/talk.js turnParts); its line is the fallback, and what
//      it keeps is kept at once;
//   2. code's own answers are shown with no call (liveWhyNot);
//   3. a follow-up gets the rows of the person's previous message; 4. else word matching; 5. else the first
//      call picks a subject;
//   6. the writer call (ai_writes) or the pick call (ai_picks_line), then the checks;
//   7. the chosen line is noted as Helper's last line (liveApply).
// Any failure (a thrown request, no text, NONE, a failed check) gives null: the page shows the fallback and
// says nothing about it. The 12 seconds and one call at a time are the page's (src/page.js).
import { AI_MODE } from './ai-mode.js'
import { LIVE_DATA } from './live-data.js'
import { TALK_DATA } from './talk-data.js'
import { looksSecret } from './secret-rule.js'
import { talkNorm, cutIgnored, startsWith, whichOf, lineKey, noteLast } from './talk.js'
import { LIVE_ROW, byWords, rankIn, withNext, isFollowUp, followRows, resultOfRow } from './live-rows.js'
import { readSubject, readPick, judgeWritten } from './live-checks.js'
import { firstCallText, writerText, pickText, inputText, liveParams } from './live-request.js'
import { ONESHOT_TIMEOUT_MS } from './model-call.js'

export const LIVE_SECONDS = LIVE_DATA.seconds
// The second call starts only when at least this much of the 12 s is left (decided: a call that cannot finish
// in time is not started).
export const SECOND_CALL_MIN_MS = 4000
const LV_GO = LIVE_DATA.go_to_ai
const LV_DONT_KNOW = ['N1', 'N1_AGAIN', 'AGAIN', 'MEAN_NONE']

// Step 2 (code_answers): only these no-AI results reach the AI, judged on the result before no_repeat, so a
// plain line given for "what do you mean" keeps its why. N1_AGAIN and AGAIN are no_repeat's own lines in place
// of an N1 or a repeat; they come only after a result this already sends.
export function goesToAi(pre) {
  if (!pre) return false
  if (pre.kind === 'plain') return pre.why === 'what do you mean'
  return LV_GO.includes(pre.kind)
}

// Why this message makes no call (null: it may). In this order: the switch, code's own answer, the model the
// page checked is not ready (still checking, none or an error), the message looks like a secret by Helper's
// secret rule, or Hermes still works on an earlier call of Helper's (one call at a time).
export function liveWhyNot({ mode = AI_MODE, pre, text, status, inHermes = 0 }) {
  if (mode === 'no_ai_step') return 'no AI step'
  if (!goesToAi(pre)) return 'code answered'
  if (!status || status.state !== 'ok') return 'model not ready'
  if (looksSecret(text)) return 'looks secret'
  if (inHermes > 0) return 'Hermes still works on a call'
  return null
}

// build: a how-question is never a request (route2.py's guard, build.skip_starts and build.how_phrases)
function isHowQuestion(text) {
  const t = cutIgnored(talkNorm(text))
  return startsWith(t, TALK_DATA.build.skip_starts) || whichOf(t, TALK_DATA.build.how_phrases).length > 0
}

// The steps 3 to 6 for one message. Returns { result, rows } (a line to show in place of the fallback), or
// { fallback: why } (show the fallback).
//   text: the message as typed; message: what may be sent of it (a name given with it cut off)
//   pre, out: the no-AI turn's result before and after no_repeat; before: the visit's note of Helper's last
//   line as it was before this message ({ last, lastKey, liveRows }); lines: src/live-request.js lastLines;
//   lastLine: Helper's last line as shown; request: host.request; msLeft(): ms left of the 12 s
//   onCall(name): told before each call (for the tests' log)
//   alive(): false once the page has closed this turn (12 s, or the next message): no further call starts
export async function askLive({ mode = AI_MODE, text, message = text, pre, out, before, lines = [], lastLine = '', request, msLeft = () => Infinity, alive = () => true, onCall = () => {} }) {
  const input = inputText(message, lines)
  const call = async (name, instructions, maxTokens) => {
    if (!alive()) return null
    onCall(name)
    try {
      const res = await request('llm.oneshot', liveParams(instructions, input, maxTokens), ONESHOT_TIMEOUT_MS)
      return res && typeof res.text === 'string' ? res.text : null
    } catch {
      return null
    }
  }
  let ids = null
  if (isFollowUp(text, pre, before)) ids = followRows(before)
  if (!ids || !ids.length) {
    ids = null
    const w = byWords(message)
    if (w.length) ids = withNext(w)
  }
  if (!ids) {
    const raw = await call('first', firstCallText(), LIVE_DATA.first_call.max_tokens)
    if (raw === null) return { fallback: 'first call failed' }
    const subject = readSubject(raw)
    if (subject === 'none') return { fallback: 'first call: none' }
    if (subject === 'build') return isHowQuestion(text) ? { fallback: 'build to a how-question' } : { result: { kind: 'H1', why: 'ai' }, rows: [] }
    ids = subject === 'talk' ? followRows(before) : withNext(rankIn(message, subject))
  }
  if (msLeft() < SECOND_CALL_MIN_MS) return { fallback: 'no time for the second call' }
  const rows = ids.map(id => ({ id, text: LIVE_ROW[id].text }))
  if (mode === 'ai_picks_line') {
    const raw = await call('pick', pickText(ids), LIVE_DATA.pick_only.max_tokens)
    if (raw === null) return { fallback: 'pick call failed' }
    const p = readPick(raw, ids)
    if (p.id) return { result: resultOfRow(p.id), rows: ids }
    if (p.word === 'TALK') return LV_DONT_KNOW.includes(out.kind) ? { result: { kind: 'OK' }, rows: [] } : { fallback: 'talk: the no-AI line' }
    if (p.word === 'BUILD') return isHowQuestion(text) ? { fallback: 'build to a how-question' } : { result: { kind: 'H1', why: 'ai' }, rows: [] }
    return { fallback: 'pick: none' }
  }
  const raw = await call('writer', writerText(ids), LIVE_DATA.writer.max_tokens)
  if (raw === null) return { fallback: 'writer call failed' }
  const j = judgeWritten(raw, rows, { lastLine, message: text })
  if (j.word === 'NONE') return { fallback: 'writer: NONE' }
  if (j.word === 'BUILD') return isHowQuestion(text) ? { fallback: 'build to a how-question' } : { result: { kind: 'H1', why: 'ai' }, rows: [] }
  if (j.fail) return { fallback: 'check ' + j.fail }
  return { result: { kind: 'written', text: j.text, used: j.used }, rows: ids }
}

// The words a written reply is told apart by (its own key for no_repeat and c23)
const writtenKey = text => JSON.stringify(['written', talkNorm(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()])

// Step 7, for a line from the AI step: never the same line twice in a row (a picked row that is Helper's last
// line again, or a line the person called wrong in this visit, gives the fallback instead; a written repeat was
// stopped by c23); what the no-AI turn kept is still told under it; the line is noted as Helper's last, and its
// rows as this message's rows (for a follow-up). Returns the result to show, or null for the fallback.
export function liveApply(st, got, out, before, text) {
  if (!got || !got.result) return null
  const r = { ...got.result }
  if (r.kind !== 'written') {
    const asked = whichOf(talkNorm(text), TALK_DATA.no_repeat.asked_again).length > 0
    const k = lineKey(r)
    if (!asked && (k === before.lastKey || (st.rejected || []).includes(k))) return null
  }
  for (const x of ['kept', 'first', 'name_taken', 'thing']) if (x in out) r[x] = out[x]
  st.pending = null
  st.lastq = false
  noteLast(st, r)
  if (r.kind === 'written') {
    // follow_up.rule and how_after_rows: "a written reply that used rows"; one that used none is ordinary talk
    st.last = (r.used || []).some(u => u.toLowerCase() !== 'none') ? 'written' : 'written-talk'
    st.lastKey = writtenKey(r.text)
  }
  st.liveRows = got.rows && got.rows.length ? { key: st.lastKey, ids: got.rows } : null
  return r
}
