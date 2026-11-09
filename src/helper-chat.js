// What the helper says in B3, as plain data (rendered by page.js): one entry per thing said.
// Entry: { who: 'you' | 'helper', kind, lines: [text], fact?, paste?, after?, link?, action? }
// Code decides every entry; no model is asked in B3 (its call is B4). Typed words go through the
// checks of build-v1.md section 7 in their order (src/key-check.js): a pasted key first, on the
// full text; then the build words (straight to the hand-over text); then the 500-character cut.
import { prepareInput, KEY_LINE, LONG_LINE, MAX_INPUT_CHARS } from './key-check.js'
import { LINES, fill, isBuildRequest, handoffText } from './steps.js'

// The greeting: the first thing in the chat log.
export function greetingEntry() {
  return { who: 'helper', kind: 'greeting', lines: [LINES.greeting] }
}

// The person picked an answer: "Your answer: …" and the fact that answer points to, with its source.
export function answerEntry(step, optionId) {
  const option = step.options.find(o => o.id === optionId)
  if (!option) return null
  const fact = step.facts.find(f => f.id === option.fact) || null
  return { who: 'helper', kind: 'answer', lines: [fill(LINES.yourAnswer, { option_label: option.label })], fact }
}

// "I understand, next step" on the last step (its next_rule says "done").
export function doneEntry() {
  return { who: 'helper', kind: 'done', lines: [LINES.afterLast], action: 'yours' }
}

// What the person typed, on the open step. Returns the entries to add (none for an empty box).
// A pasted key is never shown back or kept: only the fixed line is added.
export function typedEntries(text, { step, answers }) {
  const r = prepareInput(text, t => isBuildRequest(step, t))
  if (r.kind === 'empty') return []
  if (r.kind === 'key') return [{ who: 'helper', kind: 'key', lines: [KEY_LINE] }]
  const chars = Array.from(String(text).trim())
  const said = chars.length > MAX_INPUT_CHARS ? chars.slice(0, MAX_INPUT_CHARS).join('') + '…' : chars.join('')
  const you = { who: 'you', kind: 'typed', lines: [said] }
  if (r.kind === 'build') {
    return [you, { who: 'helper', kind: 'handoff', lines: LINES.handoffLead, paste: handoffText(step, answers, text), after: LINES.handoffAfter }]
  }
  // B3 stand-in until the model call (B4): the fixed "no checked answer" line with the step's
  // docs page, which is true here, because nothing has checked an answer yet.
  const out = [you]
  if (r.cut) out.push({ who: 'helper', kind: 'long', lines: [LONG_LINE] })
  out.push({ who: 'helper', kind: 'no-answer', lines: [fill(LINES.noCheckedAnswer, { docs_url: '' }).trim()], link: step.handoff.docs_url })
  return out
}
