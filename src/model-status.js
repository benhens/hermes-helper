// "Is a model connected?" without calling a model (build-v1.md section 5, corrected by
// docs/answers/hhtech-default-model.md point 4).
// Asks Hermes's own readiness check, setup.runtime_check, the one its onboarding uses. ok true/false
// is decided by runtime_check alone. Only after ok false does it read setup.status, to tell
// "nothing set up yet" (provider_configured false) from "chosen but broken" (card 2).
// Result:
//   { state: 'ok', name }               a model and its sign-in or key resolve. name may be ''.
//   { state: 'none', configured }       runtime_check said ok false. configured: true | false | null
//                                       (null = setup.status couldn't be read).
//   { state: 'error' }                  the check itself failed, timed out or answered nonsense.
//                                       Never shown as "no model".
// The name: the free tier's label when runtime_check.free_tier_route, else runtime_check.model as
// Hermes's model button shows it (src/model-name.js), else ''. Never host.state.model (it can be
// one chat's own pick) or config.get.
import { formatModelPillLabel } from './model-name.js'

// content/v1-strings.md part 1 (hhcontent, final 9 Nov).
export const NO_MODEL_LINE =
  "Your Hermes has no model connected yet, so I can't answer what you type. The steps still work: use the buttons on each step."
export const NO_MODEL_SMALL = 'A model is the AI that does the thinking. Step 2 explains the ways to connect one.'
export const NO_MODEL_PROGRESS = 'Looked in your Hermes: no model connected'
export const NO_MODEL_BOX = 'Ask here once a model is connected'
export const CANT_CHECK_LINE = "Can't check right now. Couldn't read this from your Hermes. Press Check again in a moment."

export const CHECK_TIMEOUT_MS = 20000
// runtime_check can answer 5097 "readiness check still in progress": ask again after 5 s, up to
// 3 more times, and only then say "Can't check right now" (hhtech-default-model.md, For builder).
export const STILL_CHECKING_CODE = 5097
export const STILL_CHECKING_WAIT_MS = 5000
export const STILL_CHECKING_RETRIES = 3
// The page checks when it opens and when the person presses "Check again"; an open within this
// time of the last successful check (ok or none) reuses its answer, so switching pages never polls
// Hermes. A failed check is never reused: the next open asks again.
export const RECHECK_AFTER_MS = 30000

// What the message box and the cards call the model when Hermes gives no name.
export function modelLabel(name) {
  return typeof name === 'string' && name.trim() ? name.trim() : 'your model'
}

// params: {} for the profile Hermes is running, { profile } for another bot.
export async function checkModel(request, { params = {}, sleep = () => Promise.resolve() } = {}) {
  let rc
  for (let attempt = 0; ; attempt++) {
    try {
      rc = await request('setup.runtime_check', { ...params }, CHECK_TIMEOUT_MS)
      break
    } catch (e) {
      if (e && e.code === STILL_CHECKING_CODE && attempt < STILL_CHECKING_RETRIES) {
        await sleep(STILL_CHECKING_WAIT_MS)
        continue
      }
      return { state: 'error' }
    }
  }
  if (!rc || typeof rc !== 'object' || typeof rc.ok !== 'boolean') return { state: 'error' }

  if (!rc.ok) {
    let configured = null
    try {
      const st = await request('setup.status', { ...params }, CHECK_TIMEOUT_MS)
      if (st && typeof st.provider_configured === 'boolean') configured = st.provider_configured
    } catch {
      configured = null
    }
    return { state: 'none', configured }
  }

  return { state: 'ok', name: await displayName(request, rc, params) }
}

// The name the page shows (docs/answers/hhtech-model-display-name.md section 4):
//   1. free_tier_route true: free_tier.status's own label ("Nous · free tier"), never the id run
//      through the button's rules ("nous/welcome" would read "Welcome");
//   2. else runtime_check.model, shown the way Hermes's model button shows it ("Mock Small");
//   3. else '' (the page then says "your model").
async function displayName(request, rc, params) {
  if (rc.free_tier_route === true) {
    // free_tier.status is a pure read scoped to the same bot (tui_gateway/methods_free_tier.py, profile_scoped).
    try {
      const ft = await request('free_tier.status', { ...params }, CHECK_TIMEOUT_MS)
      return textOrEmpty(ft && ft.label)
    } catch {
      return ''
    }
  }
  const id = textOrEmpty(rc.model)
  return id ? formatModelPillLabel(id) : ''
}

function textOrEmpty(v) {
  return typeof v === 'string' ? v.trim() : ''
}
