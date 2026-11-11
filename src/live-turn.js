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
import { talkNorm, cutIgnored, startsWith, whichOf, lineKey, noteLast, attachOffer } from './talk.js'
import { LIVE_ROW, byWords, rankIn, withNext, isFollowUp, followRows, resultOfRow } from './live-rows.js'
import { readSubject, readPick, judgeWritten, noReply } from './live-checks.js'
import { firstCallText, writerText, pickText, inputText, liveParams, workLine } from './live-request.js'
import { ONESHOT_TIMEOUT_MS } from './model-call.js'

export const LIVE_SECONDS = LIVE_DATA.seconds
// The second call starts only when at least this much of the 12 s is left (decided: a call that cannot finish
// in time is not started).
export const SECOND_CALL_MIN_MS = 4000
const LV_GO = LIVE_DATA.go_to_ai
const LV_DONT_KNOW = ['N1', 'N1_AGAIN', 'AGAIN', 'MEAN_NONE']

// live-v2 changes-5 slow_ai, Lead's pick SLOW_A (job talk-live-3, point 4): Helper's line right after the written
// answer when the visit's first AI call gave no answer in 12 s or gave no_reply text; its text to paste shows at once
// under it, as H1's. Said once per visit (src/page.js keeps visit.slow: 'due', then 'said'; never stored).
export const SLOW_LINE = { line: LIVE_DATA.slow_ai.id, text: LIVE_DATA.slow_ai.text, source: null, answers: null, next: null, paste: LIVE_DATA.slow_ai.paste_text, note: null, used: null, hint: null, rows: null, docs: null }
// Not after a don't-know line (hhcontent's gap: "I answered from my own notes" + "I don't have checked information"
// read oddly together; Lead: it waits for the next written answer of the visit that is not one). The don't-know lines
// are no_repeat's dont_know groups (N1, N1a, N1_AGAIN, and AGAIN in its place), N1-skill (N1's words for a skill asked
// by name) and MEAN_NONE (this file's own don't-know list for TALK, LV_DONT_KNOW). Decided by the Builder (review):
// also not after a line with things to pick, a line that asks a question or asks for more (STUCK), a goodbye (BYE),
// or a line with its own text to paste (H1, H2: two boxes to paste in a row), since SLOW_A after it would take the
// picks' place, leave the question above the newest line, or read as a second hand-over; it waits for the next answer.
const SLOW_NOT_AFTER = new Set([...TALK_DATA.no_repeat.groups.dont_know, ...TALK_DATA.no_repeat.in_place.dont_know, ...LV_DONT_KNOW, 'N1-skill', ...TALK_DATA.no_repeat.groups.stuck, ...TALK_DATA.no_repeat.groups.bye])
export function slowFollows(visit, said) {
  return visit.slow === 'due' && !!said && !SLOW_NOT_AFTER.has(said.line) && !said.answers && !said.paste && !/\?\s*$/.test(String(said.text || ''))
}

// Step 2 (code_answers): only these no-AI results reach the AI, judged on the result before no_repeat, so a
// plain line given for "what do you mean" keeps its why. N1_AGAIN and AGAIN are no_repeat's own lines in place
// of an N1 or a repeat; they come only after a result this already sends.
export function goesToAi(pre) {
  if (!pre) return false
  // live-v2 changes-3: anything from kind again is code's, AGAIN and MEAN_NONE included
  if (pre.by_again) return false
  // ask-fix-t1 (about_rule.weak_hit_then.with_ai): a weak hit goes on to the AI as when no row was found
  if (pre.weak_hit && (pre.kind === 'question' || pre.kind === 'N1')) return true
  if (pre.kind === 'plain') return pre.why === 'what do you mean'
  return LV_GO.includes(pre.kind)
}

// Why this message makes no call (null: it may). In this order: the switch, code's own answer, the AI step is off
// for this visit (hhtech-weak-ai: an earlier call gave no answer in 12 s or gave thinking text), the model the
// page checked is not ready (still checking, none or an error), the message looks like a secret by Helper's
// secret rule, or Hermes still works on an earlier call of Helper's (one call at a time).
export function liveWhyNot({ mode = AI_MODE, pre, text, status, inHermes = 0, off = false }) {
  if (mode === 'no_ai_step') return 'no AI step'
  if (!goesToAi(pre)) return 'code answered'
  if (off) return 'AI off for this visit'
  if (!status || status.state !== 'ok') return 'model not ready'
  if (looksSecret(text)) return 'looks secret'
  if (inHermes > 0) return 'Hermes still works on a call'
  return null
}

// build: a how-question is never a request (route2.py's guard, build.skip_starts and build.how_phrases)
function isHowQuestion(text) {
  const t = cutIgnored(talkNorm(text))
  // live changes-9 (build.model_pick_rule, the third condition): a message that opens with a question word asks
  // something; the pick build is then read as none
  return startsWith(t, TALK_DATA.build.skip_starts) || whichOf(t, TALK_DATA.build.how_phrases).length > 0 || startsWith(t, TALK_DATA.model_pick_not_when_starts)
}

// The steps 3 to 6 for one message. Returns { result, rows } (a line to show in place of the fallback), or
// { fallback: why } (show the fallback).
//   text: the message as typed; message: what may be sent of it (a name given with it cut off)
//   pre, out: the no-AI turn's result before and after no_repeat; before: the visit's note of Helper's last
//   line as it was before this message ({ last, lastKey, liveRows }); lines: src/live-request.js lastLines;
//   lastLine: Helper's last line as shown; request: host.request; msLeft(): ms left of the 12 s
//   onCall(name): told before each call (for the tests' log)
//   alive(): false once the page has closed this turn (12 s, or the next message): no further call starts
//   work: what the person does as kept (live-v2 changes-4), for the work line of the second call and for c24
// A call that sends back thinking text (hhtech-weak-ai) ends the turn at once: { fallback, thinking: true }, so
// the page can turn the AI step off for the rest of the visit. A reply that is empty after reading (it sat on the
// USED: line) is an ordinary fallback.
//   names: the kept name and this visit's name: a work value holding one is not sent (src/live-request.js workLine)
export async function askLive({ mode = AI_MODE, text, message = text, pre, out, before, lines = [], lastLine = '', request, msLeft = () => Infinity, alive = () => true, onCall = () => {}, work = null, names = [] }) {
  const input = inputText(message, lines)
  let thinking = false
  const call = async (name, instructions, maxTokens) => {
    if (!alive()) return null
    onCall(name)
    try {
      const res = await request('llm.oneshot', liveParams(instructions, input, maxTokens), ONESHOT_TIMEOUT_MS)
      const t = res && typeof res.text === 'string' ? res.text : null
      if (t !== null && noReply(t)) {
        thinking = true
        return null
      }
      return t
    } catch {
      return null
    }
  }
  const got = await askSteps({ mode, text, message, pre, out, before, lastLine, msLeft, call, work, names })
  return thinking ? { fallback: 'thinking text', thinking: true } : got
}

async function askSteps({ mode, text, message, pre, out, before, lastLine, msLeft, call, work, names }) {
  let ids = null
  // live changes-9 (follow_up.work_line_c9): on a follow-up the About them line is not handed
  let follow = false
  if (isFollowUp(text, pre, before)) ids = followRows(before)
  if (ids && ids.length) follow = true
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
    if (subject === 'talk' && ids.length) follow = true
  }
  const handed = follow ? null : work
  if (msLeft() < SECOND_CALL_MIN_MS) return { fallback: 'no time for the second call' }
  const rows = ids.map(id => ({ id, text: LIVE_ROW[id].text }))
  if (mode === 'ai_picks_line') {
    const raw = await call('pick', pickText(ids, handed, names), LIVE_DATA.pick_only.max_tokens)
    if (raw === null) return { fallback: 'pick call failed' }
    const p = readPick(raw, ids)
    if (p.id) return { result: resultOfRow(p.id), rows: ids }
    if (p.word === 'TALK') return LV_DONT_KNOW.includes(out.kind) ? { result: { kind: 'OK' }, rows: [] } : { fallback: 'talk: the no-AI line' }
    if (p.word === 'BUILD') return isHowQuestion(text) ? { fallback: 'build to a how-question' } : { result: { kind: 'H1', why: 'ai' }, rows: [] }
    return { fallback: 'pick: none' }
  }
  const raw = await call('writer', writerText(ids, handed, names), LIVE_DATA.writer.max_tokens)
  if (raw === null) return { fallback: 'writer call failed' }
  const j = judgeWritten(raw, rows, { lastLine, message: text, work, workHanded: !!workLine(handed, names) })
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
  for (const x of ['kept', 'first', 'name_taken', 'thing', 'work_first']) if (x in out) r[x] = out[x]
  st.pending = null
  st.lastq = false
  // changes-3 (review): the fallback was noted as the last answer line, but it is not shown; "again" must find the
  // one before it, unless this line is an answer line itself
  if ('lastAnswer' in before) {
    st.lastAnswer = before.lastAnswer
    st.lastAnswerKey = before.lastAnswerKey
  }
  noteLast(st, r)
  // offer-t1: the offer of the line shown (a line the AI picked may carry one; a written reply carries none), judged
  // against the offer shown before this message, not the fallback's
  st.lastOffer = before.lastOffer || null
  attachOffer(r, st, before.lastTopic || null)
  if (r.kind === 'written') {
    // follow_up.rule and how_after_rows: "a written reply that used rows"; one that used none is ordinary talk
    st.last = (r.used || []).some(u => u.toLowerCase() !== 'none') ? 'written' : 'written-talk'
    st.lastKey = writtenKey(r.text)
    st.lastAnswerKey = st.lastKey // changes-3: "again" compares it with the line just before
  }
  st.liveRows = got.rows && got.rows.length ? { key: st.lastKey, ids: got.rows } : null
  return r
}
