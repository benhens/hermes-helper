// "Your setup": the seven cards' pass rules and fixed words (build-v1.md section 8). Pure code, no
// Hermes calls: src/setup-tab.js does the read-only reads and hands the answers to the rules here.
// Code decides every status; no model judges anything.
// Words: content/v1-strings.md part 3 (cards 2 and 4) and content/checks-base.md (cards 1, 3, 5, 6, 7),
// "Passes when" lines from hhdesign's design/hermes-look-r3/your-setup.html. Lines marked
// "(builder)" had no source text yet; they are listed for hhcontent in docs/build/b2-report.md.

import { CANT_CHECK_LINE, modelLabel } from './model-status.js'
import { failLines } from './model-call.js'

// One status per card, always shown as a coloured dot plus its word.
export const STATUS = {
  works: 'Works',
  fix: 'Needs a fix',
  notset: 'Not set up yet',
  unchecked: 'Not checked yet',
  cant: "Can't check right now",
  count: 'Just a count, no pass or fail',
  checking: 'Checking'
}

export const CARD_TITLES = {
  gateway: 'Hermes is connected',
  model: 'A model is connected',
  answers: 'The model answers',
  soul: 'Personality file (SOUL.md)',
  skills: 'Skills are switched on',
  memory: 'Memory can be used',
  remember: 'Does it really remember?'
}

// Cards that belong to one bot get "for {profile}" when the person has more than one bot.
// Card 7 is per bot too, but its title is a question, so the picker above says which bot it is.
export const PER_BOT = new Set(['model', 'answers', 'soul', 'skills', 'memory'])

export function cardTitle(id, bot, botCount) {
  const t = CARD_TITLES[id]
  return PER_BOT.has(id) && botCount > 1 && bot ? `${t} for ${bot}` : t
}

export const PASSES = {
  gateway: 'Passes when: this app is connected to your Hermes',
  model: "Passes when: your provider's sign-in is found. This doesn't ask the model anything.",
  // A no-break space keeps "90 s" on one line.
  answers: 'Passes when: asked to reply "OK", it does within 90\u00a0s. Uses a little of your credit.',
  soul: "Passes when: SOUL.md has your own text, not Hermes's default", // (builder)
  skills: null, // a count only, no pass rule
  memory: 'Passes when: the memory tool is on',
  remember: 'Passes when: another new chat can tell you the test note' // (builder)
}

const OPEN_STEP_2 = { kind: 'step', step: 2, label: 'Open step 2' }
const OPEN_STEP_4 = { kind: 'step', step: 4, label: 'Open step 4' } // (builder) checks-base: "Step 4"
const CHECK_AGAIN = { kind: 'recheck', label: 'Check again' }
const cant = () => ({ status: 'cant', lines: [CANT_CHECK_LINE], action: CHECK_AGAIN })
const checking = () => ({ status: 'checking', lines: [] })

/* ---- card 1: Hermes is connected (host.state.gateway) ---- */
export function gatewayCard(gatewayState) {
  if (gatewayState === 'open') return { status: 'works', lines: ['This page can talk to your Hermes.'] }
  return { status: 'fix', lines: ["This page can't reach your Hermes right now. Try closing and opening the app."] }
}

/* ---- card 2: A model is connected (setup.runtime_check, then setup.status after ok false) ---- */
export const MODEL_LINES = {
  works: name => `Your Hermes has a model: ${name}. The model is the AI that does the thinking.`,
  worksNoName: 'Your Hermes has a model connected. The model is the AI that does the thinking.',
  notset:
    'No model connected yet. The model is the AI that does the thinking, and Hermes needs one before it can answer. Step 2 explains the ways to connect one.',
  fix: "A model is chosen, but Hermes can't use it. Most often the sign-in has ended or the key is wrong. Open Settings, then Providers, and sign in or paste the key again."
}

// check = checkModel()'s answer, or null / { state: 'checking' } while it runs.
export function modelCard(check) {
  if (!check || check.state === 'checking') return checking()
  if (check.state === 'ok') {
    return check.name
      ? { status: 'works', value: check.name, lines: [MODEL_LINES.works(check.name)] }
      : { status: 'works', lines: [MODEL_LINES.worksNoName] }
  }
  if (check.state === 'none') {
    // v1-strings part 3: ok false and provider_configured false = Not set up yet; any other ok false
    // (including a setup.status that couldn't be read) = Needs a fix.
    if (check.configured === false) return { status: 'notset', lines: [MODEL_LINES.notset], action: OPEN_STEP_2 }
    return { status: 'fix', lines: [MODEL_LINES.fix], action: OPEN_STEP_2 }
  }
  return cant()
}

/* ---- card 3: The model answers (one llm.oneshot, only when the person presses Check) ---- */
export const ANSWER_CALL = { instructions: 'Reply with exactly: OK', input: 'Reply with exactly: OK', temperature: 0, max_tokens: 300 }
export const ANSWER_WAIT_LIMIT_S = 90

// "contains OK": the word OK on its own, any case ("OK", "OK.", "ok"), not inside another word ("token").
export function answerPasses(text) {
  return typeof text === 'string' && /(^|[^A-Za-z0-9])ok([^A-Za-z0-9]|$)/i.test(text)
}

function seconds(ms) {
  const s = Math.max(0, ms) / 1000
  return s < 10 ? s.toFixed(1) : String(Math.round(s))
}

// run = { phase: 'idle' } | { phase: 'calling', waited } | { phase: 'countdown', left }
//     | { phase: 'done', result }   (result = askModel()'s answer)
// model = card 2's check for the same bot: the button only works when that says ok.
export function answersCard(run, model) {
  const ready = !!model && model.state === 'ok'
  // A button that asks the model works only while card 2 says ok for this bot.
  const button = (label, disabled = !ready) => ({ kind: 'ask', label, disabled })
  const phase = run ? run.phase : 'idle'
  if (phase === 'calling') return { status: 'checking', lines: [`Waiting for your model, ${run.waited || 0} s`] }
  if (phase === 'countdown') return { status: 'checking', lines: failLines('not_ready', 'card', run.left) }
  if (phase === 'done' && run.result) {
    const r = run.result
    const name = modelLabel(ready ? model.name : '')
    if (r.ok && answerPasses(r.text)) {
      // A model id keeps its own spelling; only the fallback "your model" starts the sentence capitalised.
      const lead = ready && model.name ? name : 'Your model'
      return { status: 'works', lines: [`${lead} answered a short test in ${seconds(r.ms)} seconds.`], action: button('Check again') }
    }
    if (r.ok) return { status: 'fix', lines: ['Your model answered, but not with OK. Press Try again.'], action: button('Try again') } // (builder)
    // The call found no usable model (runtime_check asked again): card 2's own line and Open step 2.
    // Status stays "Needs a fix": build-v1.md section 8 gives card 3 only Works / Needs a fix / Not checked yet.
    if (r.kind === 'no_model') return { status: 'fix', lines: [MODEL_LINES.notset], action: OPEN_STEP_2 }
    if (r.kind === 'model_broken') return { status: 'fix', lines: [MODEL_LINES.fix], action: OPEN_STEP_2 }
    return { status: 'fix', lines: failLines(r.kind, 'card'), action: button('Try again') }
  }
  if (!model || model.state === 'checking') return { status: 'unchecked', lines: [], action: button('Check') }
  if (!ready) return { status: 'unchecked', lines: ['This check needs a connected model first.'], action: button('Check') } // (builder)
  return { status: 'unchecked', lines: [], action: button('Check') }
}

/* ---- card 4: Personality file (SOUL.md) (profiles.describe -> soul) ---- */
// Hermes's own default text and the older auto-seeded texts, copied from hermes_cli/default_soul.py
// (Hermes v0.23.0, DEFAULT_SOUL_MD and _LEGACY_TEMPLATE_SOULS). A file equal to any of them, after
// the same clean-up Hermes does, is "the built-in personality". Known risk: if Hermes changes its
// default text, an untouched file would show Works (README, known issues).
const DEFAULT_SOUL_MD =
  'You are Hermes Agent, built by Nous Research. Be direct: match the length of your reply to the weight of ' +
  'the ask \u2014 a one-line question gets a one-line answer, and finished work gets a short report of what ' +
  "changed, what's verified, and what's left, never a replay of the process. No filler (\"Great question,\" " +
  '"I\'d be happy to"), no restating the request back, no re-summarizing what you already said, no narrating ' +
  "tool calls the user can see. Plain claims over adjectives; when unsure, say so plainly. Agree because it's " +
  'right, not because the user said it. Depth is earned \u2014 give it when the user asks for detail, teaches, or ' +
  'the stakes demand it, not by default.'
const SCAFFOLD_HEAD =
  "# Hermes Agent Persona\n\n<!--\nThis file defines the agent's personality and tone.\n" +
  'The agent will embody whatever you write here.\nEdit this to customize how Hermes communicates with you.\n\n'
const SCAFFOLD_TAIL =
  'This file is loaded fresh each message -- no restart needed.\n' + 'Delete the contents (or this file) to use the default personality.\n-->'
export const DEFAULT_SOULS = [
  DEFAULT_SOUL_MD,
  SCAFFOLD_HEAD +
    'Examples:\n' +
    '  - "You are a warm, playful assistant who uses kaomoji occasionally."\n' +
    '  - "You are a concise technical expert. No fluff, just facts."\n' +
    '  - "You speak like a friendly coworker who happens to know everything."\n\n' +
    SCAFFOLD_TAIL,
  SCAFFOLD_HEAD + SCAFFOLD_TAIL,
  'You are Hermes Agent, an intelligent AI assistant created by Nous Research. You are helpful, ' +
    'knowledgeable, and direct. You assist users with a wide range of tasks including answering questions, ' +
    'writing and editing code, analyzing information, creative work, and executing actions via your tools. ' +
    'You communicate clearly, admit uncertainty when appropriate, and prioritize being genuinely useful over ' +
    'being verbose unless otherwise directed below. Be targeted and efficient in your exploration and ' +
    'investigations.',
  DEFAULT_SOUL_MD.replaceAll('\u2014', '--')
]

// Hermes's _normalize_soul: unify line endings, drop a leading BOM, trim.
export function normalizeSoul(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '').trim()
}
const DEFAULT_SET = new Set(DEFAULT_SOULS.map(normalizeSoul))

export function isDefaultSoul(text) {
  return DEFAULT_SET.has(normalizeSoul(text))
}

export const SOUL_LINES = {
  works:
    'Your Hermes has its own personality file. SOUL.md is the first thing Hermes reads, and it sets who your Hermes is and how it talks.',
  notset:
    "Your Hermes uses the built-in personality. That's fine; nothing is wrong. SOUL.md is a short text file where you can describe how you want it to talk. Help with writing one comes in a later step."
}

// read = { ok: true, value: <profiles.describe answer> } | { ok: false } (rejected or timed out) | null (running)
export function soulCard(read) {
  if (!read) return checking()
  if (!read.ok) return cant()
  const soul = read.value && typeof read.value === 'object' ? read.value.soul : undefined
  if (typeof soul !== 'string') return cant()
  // Empty text means Hermes uses its built-in personality (hhtech point 3), so it is "Not set up yet".
  if (!soul.trim() || isDefaultSoul(soul)) return { status: 'notset', lines: [SOUL_LINES.notset] }
  return { status: 'works', lines: [SOUL_LINES.works] }
}

/* ---- card 5: Skills (host.skills.list): a count, no pass or fail ---- */
export function skillsCard(read) {
  if (!read) return checking()
  if (!read.ok || !Array.isArray(read.value)) return cant()
  const on = read.value.filter(s => s && s.enabled === true).length
  if (on === 0) {
    return { status: 'count', value: '0 switched on', lines: ['No skills are on. Hermes still works; skills add know-how for certain tasks. Step 4 explains them.'], action: OPEN_STEP_4 }
  }
  const lead = on === 1 ? '1 skill is on.' : `${on} skills are on.`
  return {
    status: 'count',
    value: `${on} switched on`,
    lines: [`${lead} A skill is written know-how your Hermes loads when a task needs it.`],
    action: OPEN_STEP_4
  }
}

/* ---- card 6: Memory switch (host.toolsets.list -> "memory") ---- */
export const MEMORY_HANDOFF = 'Please switch my memory on and tell me how to check it worked.'
export function memoryCard(read) {
  if (!read) return checking()
  if (!read.ok || !Array.isArray(read.value)) return cant()
  const memory = read.value.find(t => t && t.name === 'memory')
  if (!memory || typeof memory.enabled !== 'boolean') return cant()
  if (memory.enabled) return { status: 'works', lines: ['Memory is on. Your Hermes can save notes about you that come back in later chats.'] }
  return {
    status: 'fix',
    lines: ["Memory is switched off. Your Hermes can't save anything, whatever it says."],
    handoff: { lead: 'Paste this into a new chat with your Hermes:', text: MEMORY_HANDOFF }
  }
}

/* ---- card 7: Does it really remember? (the person runs the test in their own chat) ---- */
export const REMEMBER = {
  intro: "A test you run in your own chat, because this page can't write to your memory.",
  part1: 'Use the memory tool to save this exact note: Helping Hand test 7Q4.',
  part2: 'What is the Helping Hand test note?',
  steps: ['Paste the test text into a new chat.', 'Open another new chat and ask for the note.', 'Tell us what it said.'],
  yes: 'It said 7Q4',
  no: "It didn't",
  worked: 'It found the note in a new chat, so memory works for this bot.', // (builder)
  reasonsLead: 'Three likely reasons, most likely first:', // (builder)
  reasons: [
    "It said it saved but didn't. Small models do this often. A stronger model for setup fixes it.",
    'The note is waiting for your OK. Type /memory pending, then /memory approve all.',
    'The note went to another bot. Each bot (profile) has its own memory.'
  ]
}

// answer = 'yes' | 'no' | undefined (kept per bot in ctx.storage)
export function rememberCard(answer) {
  if (answer === 'yes') return { status: 'works', lines: [REMEMBER.worked] }
  if (answer === 'no') return { status: 'fix', lines: [], reasonsLead: REMEMBER.reasonsLead, reasons: REMEMBER.reasons }
  return { status: 'unchecked', lines: [] }
}
