// The person's "reduce motion" setting: one check, and a watch for changes while the page is open.
// Hermes's own rule already stops CSS transitions and CSS keyframes under this setting
// (apps/desktop/src/styles.css); everything this plugin moves from script (the character's loops
// and rising, the eyes, the word-by-word reveal) asks here and stops itself.
const REDUCE_MOTION = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia(REDUCE_MOTION).matches === true
}

// Calls onChange(true | false) when the setting changes. Returns the function that stops watching.
export function watchReducedMotion(onChange) {
  if (typeof matchMedia !== 'function') return () => {}
  const setting = matchMedia(REDUCE_MOTION)
  if (typeof setting.addEventListener !== 'function') return () => {}
  const heard = () => onChange(setting.matches === true)
  setting.addEventListener('change', heard)
  return () => setting.removeEventListener('change', heard)
}
