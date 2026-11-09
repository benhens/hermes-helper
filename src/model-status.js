// "Is a model connected?" without calling a model (build-v1.md section 5).
// Asks Hermes's own readiness check, setup.runtime_check, the one its onboarding uses. Never decides
// from setup.status: on a fresh Desktop running the Nous free tier that still says "not configured".
// Result: { state: 'ok', name } | { state: 'none' } | { state: 'error' }.
//   ok    = a model and its sign-in or key resolve. name may be '' when Hermes doesn't say one.
//   none  = runtime_check answered ok: false.
//   error = the check itself failed, timed out or answered nonsense. Never shown as "no model".

export const NO_MODEL_LINE =
  "Hermes has no model connected yet, so I can't answer typed questions. The steps still work with the buttons."
// hhcontent's wording (content/v1-strings.md part 1).
export const CANT_CHECK_LINE = "Can't check right now. This page couldn't reach your Hermes. Press Check again in a moment."
export const CHECK_TIMEOUT_MS = 20000
// The page checks when it opens and when the person presses "Check again"; an open within this
// time of the last successful check (ok or none) reuses its answer, so switching pages never polls
// Hermes. A failed check is never reused: the next open asks again.
export const RECHECK_AFTER_MS = 30000

export async function checkModel(request, currentModel) {
  let rc
  try {
    rc = await request('setup.runtime_check', {}, CHECK_TIMEOUT_MS)
  } catch {
    return { state: 'error' }
  }
  if (!rc || typeof rc !== 'object' || typeof rc.ok !== 'boolean') return { state: 'error' }
  if (!rc.ok) return { state: 'none' }

  let current = ''
  try {
    current = textOrEmpty(currentModel())
  } catch {
    current = ''
  }
  let name = current || textOrEmpty(rc.model)
  if (!name && rc.free_tier_route === true) {
    try {
      const ft = await request('free_tier.status', {}, CHECK_TIMEOUT_MS)
      name = textOrEmpty(ft && ft.label)
    } catch {
      name = ''
    }
  }
  return { state: 'ok', name }
}

function textOrEmpty(v) {
  return typeof v === 'string' ? v.trim() : ''
}
