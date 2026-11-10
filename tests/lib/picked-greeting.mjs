// A test copy of the built plugin whose greeting is the opening line Pēteris picked on 10 Nov 2026
// (content/helper-talk-v2.json, line OPEN). The committed build keeps today's greeting: the picked
// line asks "What's your name?", and the helper cannot handle the answer until its answers are
// built (Lead, 10 Nov 2026). With today's greeting no line of Helper's ends with a question mark,
// so this copy is how the tests, and the real-app screenshot, show the "asking" expression.
// Nothing on disk is changed: the function takes the built source and returns the edited text.
import { LINES } from '../../src/steps.js'

export const PICKED_GREETING = "Hi, I'm Helper. I can help you learn about Hermes and set it up. What's your name?"

export function withPickedGreeting(built) {
  const today = `greeting: ${JSON.stringify(LINES.greeting)},`
  const parts = built.split(today)
  if (parts.length !== 2) throw new Error(`expected today's greeting once in the built file, found it ${parts.length - 1} times`)
  return parts.join(`greeting: ${JSON.stringify(PICKED_GREETING)},`)
}
