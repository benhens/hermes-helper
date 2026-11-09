// Page and helper-panel state, kept in ctx.storage on the person's computer (build-v1.md P5, P11).
// Keys: side (right | left), helper (open | hidden | closed), tab (setup | yours), step (1-4),
// chatlog (true | false), answers ({ stepId: optionId }, the person's picks on the steps).
// Anything unexpected in storage falls back to the default.
import { STEPS, cleanAnswers } from './steps.js'

export const STEP_COUNT = STEPS.length

export function readState(get) {
  const pick = (key, allowed, fallback) => {
    const v = get(key, fallback)
    return allowed.includes(v) ? v : fallback
  }
  const step = get('step', 1)
  return {
    side: pick('side', ['right', 'left'], 'right'),
    helper: pick('helper', ['open', 'hidden', 'closed'], 'open'),
    tab: pick('tab', ['setup', 'yours'], 'setup'),
    step: Number.isInteger(step) && step >= 1 && step <= STEP_COUNT ? step : 1,
    chatlog: get('chatlog', false) === true,
    answers: cleanAnswers(get('answers', {}))
  }
}

export function otherSide(side) {
  return side === 'left' ? 'right' : 'left'
}
