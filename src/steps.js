// Setup steps 1-4 (B3): hhcontent's fixed text (content/steps-v1.json, built into src/steps-data.js)
// and the small rules around it, all plain code with no model: which step comes next
// (next_rule), the build-word rule (straight to the hand-over text), the hand-over text itself,
// the "Fits your goal" tag and the docs links. Every sentence the page shows comes from the data
// or from content/v1-strings.md part 4, word for word.
import { STEPS_DATA } from './steps-data.js'

export const STEPS = STEPS_DATA.steps
export const STEP_IDS = STEPS.map(s => s.id)

// Steps 5-7 show greyed under "After these", with no content (build-v1.md section 6).
export const LATER_STEPS = [
  { number: 5, title: 'Personality and memory' },
  { number: 6, title: 'Messaging' },
  { number: 7, title: 'Several bots' }
]
export const VERSION_LINE = 'Hermes v0.23 · docs checked 9 Nov 2026'

// content/v1-strings.md part 4 (hhcontent). {slots} are filled by code only.
export const LINES = {
  greeting: "Open a step and ask me about it here. I explain things; I don't change your settings.",
  yourAnswer: 'Your answer: {option_label}',
  fitsGoal: 'Fits your goal',
  afterLast: "That's the first four steps. Your setup shows what you have now.",
  noCheckedAnswer: "I don't have a checked answer for that yet. The closest official page is: {docs_url}",
  handoffLead: ["I don't do that here. I help you understand and decide; your own Hermes does the doing.", 'Paste this into a new chat with your Hermes:'],
  handoffAfter: "When it's done, come back and check it under Your setup.",
  // The video slot (build-v1.md section 6: video is null in v1, the slot stays).
  videoLater: 'A short video for this step comes later. It will need the internet when you press Play.'
}

export const fill = (line, slots) => line.replace(/\{(\w+)\}/g, (m, k) => (k in slots ? String(slots[k]) : m))

export function stepByNumber(n) {
  return STEPS.find(s => s.number === n) || null
}

export function stepById(id) {
  return STEPS.find(s => s.id === id) || null
}

// The step list's two lines. The title up to its colon ("The brain"); a title without one (step 1
// is a question) gives its place to the data's own short line, which then isn't repeated below.
export function railLines(step) {
  const colon = step.title.indexOf(':')
  if (colon > 0) return { title: step.title.slice(0, colon), sub: step.rail_subtitle || '' }
  return { title: step.rail_subtitle || step.title, sub: '' }
}

// A docs path ("user-guide/desktop.md") as its live page, the same rule hhcontent's check uses
// for every fact url (dev/checks/hhcontent/check-steps-v1.mjs, checkUrl).
export function docsUrl(source) {
  const rel = String(source).replace(/\.(md|mdx)$/, '').replace(/^index$/, '').replace(/\/index$/, '/')
  return STEPS_DATA.live_base + rel
}

// The label on a source chip (v1-strings part 5: "Hermes docs › {section}").
export const chipLabel = section => `Hermes docs › ${section}`

// The step after this one, by the step's next_rule (code, not the model). No answer picked yet:
// the next step in order (every rule in v1 leads there too). Returns a step number, or 'done'.
export function nextAfter(step, optionId) {
  const target = optionId && step.next_rule ? step.next_rule[optionId] : undefined
  if (target === 'done') return 'done'
  const byRule = target ? stepById(target) : null
  if (byRule) return byRule.number
  const following = stepByNumber(step.number + 1)
  return following ? following.number : 'done'
}

// answers: { [stepId]: optionId }, the person's picks. The step-1 answer can tag one option of a
// later step "Fits your goal" (its `fits`).
export function fitsGoal(answers, stepId) {
  const first = STEPS[0]
  const picked = first.options.find(o => o.id === (answers || {})[first.id])
  return picked && picked.fits ? picked.fits[stepId] || null : null
}

// The build-word rule, as steps-v1.json's build_word_rule says it: lower-case, straight quotes,
// squeezed spaces; a question start skips the check; otherwise any phrase from the common list or
// the open step's list, with a word boundary on both sides, means "go straight to the hand-over".
const normalise = s =>
  String(s).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim()
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function isBuildRequest(step, text) {
  const t = normalise(text)
  if (STEPS_DATA.build_word_skip_starts.some(p => t.startsWith(p + ' ') || t === p)) return false
  const phrases = [...STEPS_DATA.build_words_common, ...((step && step.build_words) || [])]
  return phrases.some(p => new RegExp(`(^|[^a-z0-9])${escape(p)}($|[^a-z0-9])`).test(t))
}

// The hand-over text (v1-strings part 4, "Slots in the hand-over template"):
//   {goal}     the step-1 answer's goal_text, else "not chosen yet"
//   {request}  the person's words, cut to 300 characters, double quotes turned into single ones
//   {docs_url} the step's handoff.docs_url
export const REQUEST_MAX_CHARS = 300
export function handoffText(step, answers, request) {
  const first = STEPS[0]
  const picked = first.options.find(o => o.id === (answers || {})[first.id])
  const words = Array.from(String(request || '').replace(/["\u201c\u201d]/g, "'").trim())
  return fill(step.handoff.template, {
    goal: picked && picked.goal_text ? picked.goal_text : 'not chosen yet',
    request: words.slice(0, REQUEST_MAX_CHARS).join(''),
    docs_url: step.handoff.docs_url
  })
}

// Only answers that are real options of real steps survive (storage can hold anything).
export function cleanAnswers(value) {
  const out = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const s of STEPS) {
    const v = value[s.id]
    if (typeof v === 'string' && s.options.some(o => o.id === v)) out[s.id] = v
  }
  return out
}
