// What the page keeps in ctx.storage on the person's computer.
// Keys: tab (setup | yours), step (1-4), answers ({ stepId: optionId }, the person's picks on the
// steps), helperWidth (the width Helper's window was dragged to, 360 to 600 px).
// Anything unexpected in storage falls back to the default.
// About the person, only the record of what Helper keeps (talk v2 row 3): never what they do,
// never the conversation. STORED_KEYS is every key the plugin may
// write; tests/state.test.mjs reads every storage call in src/ and fails on a key outside it.
import { STEPS, cleanAnswers } from './steps.js'
import { clampHelperWidth, HELPER_PX } from './layout.js'

export const STEP_COUNT = STEPS.length
// 'remember' is the person's answer to the memory test on Your setup (src/setup-tab.js).
// 'kept' is the one record of what Helper keeps about the person, by fixed rules (src/kept.js).
// 'met' (changes-14, keeps.met): true once Helper has said hello, so the name is asked only on the first
// visit; nothing about the person, and no Forget removes it (src/page.js).
export const STORED_KEYS = ['tab', 'step', 'answers', 'helperWidth', 'remember', 'kept', 'met']

export function readState(get) {
  const pick = (key, allowed, fallback) => {
    const v = get(key, fallback)
    return allowed.includes(v) ? v : fallback
  }
  const step = get('step', 1)
  return {
    tab: pick('tab', ['setup', 'yours'], 'setup'),
    step: Number.isInteger(step) && step >= 1 && step <= STEP_COUNT ? step : 1,
    answers: cleanAnswers(get('answers', {})),
    helperWidth: clampHelperWidth(get('helperWidth', HELPER_PX))
  }
}
