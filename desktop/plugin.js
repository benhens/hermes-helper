// Helper: a Hermes Desktop plugin. Built by scripts/build.mjs from src/; edit src/, not this file.
// Licence: MIT (see LICENSE).
import { Button, Codicon, CopyButton, GlyphSpinner, PRIMARY_ICON_BTN, ROUTES_AREA, RowButton, SIDEBAR_NAV_AREA, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, Tip, composerInputBacking, composerSurfaceRing, host, useValue } from '@hermes/plugin-sdk'
import { useEffect, useId, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

// ---- src/model-name.js ----
// The model's name the way Hermes's own model button shows it ("mock-small" -> "Mock Small",
// "claude-opus-4-8" -> "Opus 4.8"). Hermes keeps no display name anywhere: its button works the
// name out from the id with the text rules below, and those rules are not in the plugin SDK, so
// this file carries a copy. Do not edit the rules: matching Hermes's button is the point
// (docs/answers/hhtech-model-display-name.md).
//
// Adapted from Hermes Agent, MIT License, Copyright (c) 2025 Nous Research:
// apps/desktop/src/lib/model-status-label.ts (Hermes v0.23.0, commit 2bd378ed). Copied:
// modelBaseId, VARIANT_TAGS, titleCase, VENDOR_CASING, PARAMETER_COUNT, applyVendorCasing,
// prettifyBase, splitTrailingTags, modelDisplayParts, modelVariantTag, formatModelPillLabel.
// Changes: TypeScript types removed; nothing else.

/** Strip provider prefix and normalize for display. */
function modelBaseId(model) {
  const trimmed = model.trim()
  const slash = trimmed.lastIndexOf('/')

  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed
}

const VARIANT_TAGS = [
  [/-fast$/i, 'Fast'],
  [/-flash$/i, 'Flash'],
  [/-thinking$/i, 'Thinking'],
  [/-preview$/i, 'Preview'],
  [/-latest$/i, 'Latest']
]

const titleCase = text => text.replace(/\b\w/g, char => char.toUpperCase()).trim()

const VENDOR_CASING = [
  [/\bDeepseek\b/g, 'DeepSeek'],
  [/\bGlm\b/g, 'GLM'],
  [/\bMinimax\b/g, 'MiniMax'],
  [/\bOpenai\b/g, 'OpenAI'],
  [/\bErnie\b/g, 'ERNIE'],
  [/\bMimo\b/g, 'MiMo'],
  [/\bBge\b/g, 'BGE'],
  [/\bVl\b/g, 'VL'],
  [/\bIt\b/g, 'IT'],
  [/\bFp8\b/g, 'FP8'],
  [/\bAi\b/g, 'AI']
]

const PARAMETER_COUNT = /\b(a?)(\d+(?:\.\d+)?)b\b/gi

const applyVendorCasing = text => {
  let cased = text.replace(PARAMETER_COUNT, (_match, prefix, size) => `${prefix.toUpperCase()}${size}B`)

  for (const [pattern, replacement] of VENDOR_CASING) {
    cased = cased.replace(pattern, replacement)
  }

  return cased
}

function prettifyBase(base) {
  if (/^claude-/i.test(base)) {
    return applyVendorCasing(
      titleCase(
        base
          .replace(/^claude-/i, '')
          .replace(/(\d)-(?=\d)/g, '$1.')
          .replace(/-/g, ' ')
      )
    )
  }

  if (/^gpt-/i.test(base)) {
    return base.replace(/^gpt-/i, 'GPT-')
  }

  if (/^gemini-/i.test(base)) {
    return applyVendorCasing(titleCase(base.replace(/^gemini-/i, 'Gemini ').replace(/-/g, ' ')))
  }

  return applyVendorCasing(titleCase(base.replace(/-/g, ' ')))
}

function splitTrailingTags(base) {
  let variant = ''
  let quant = ''

  for (let progress = true; progress;) {
    progress = false

    if (!variant) {
      for (const [pattern, label] of VARIANT_TAGS) {
        if (pattern.test(base)) {
          variant = label
          base = base.replace(pattern, '')
          progress = true

          break
        }
      }
    }

    if (!quant) {
      const quantMatch = base.match(/-(?:UD-)?(Q\d(?:_[A-Z0-9]+)*|IQ\d(?:_[A-Z0-9]+)*|F16|BF16)$/i)

      if (quantMatch) {
        quant = quantMatch[1].split('_')[0].toUpperCase()
        base = base.slice(0, -quantMatch[0].length)
        base = base.replace(/-(?:Instruct|Chat)(?:-\d{4})?$/i, '')
        progress = true
      }
    }
  }

  return { base, variant, quant }
}

/** Split a model id into a clean display name plus an optional grayed variant tag. */
function modelDisplayParts(model) {
  let { base, variant, quant } = splitTrailingTags(modelBaseId(model))

  const tags = [variant, quant].filter(Boolean)

  const contextWindow = base.match(/\[(\d+[mk])\]$/i)

  if (contextWindow) {
    tags.push(contextWindow[1].toUpperCase())
    base = base.slice(0, -contextWindow[0].length)
  }

  base = base.replace(/-\d{8}$/, '')

  return { name: prettifyBase(base) || model.trim() || 'No model', tag: tags.join(' ') }
}

function modelVariantTag(model) {
  return splitTrailingTags(modelBaseId(model)).variant
}

/** Composer model-pill label: model name plus its variant tag, "name · variant". */
function formatModelPillLabel(model, options) {
  const name = modelDisplayParts(model).name

  const tag = model.trim()
    ? options?.serviceTier === 'ultrafast'
      ? 'Ultrafast'
      : options?.fastMode
        ? 'Fast'
        : modelVariantTag(model)
    : ''

  return tag ? `${name} · ${tag}` : name
}

// ---- src/model-status.js ----
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

// content/v1-strings.md part 1 (hhcontent, final 9 Nov).
const NO_MODEL_LINE =
  "Your Hermes has no model connected yet, so I can't answer what you type. The steps still work: use the buttons on each step."
const NO_MODEL_SMALL = 'A model is the AI that does the thinking. Step 2 explains the ways to connect one.'
const NO_MODEL_PROGRESS = 'Looked in your Hermes: no model connected'
const NO_MODEL_BOX = 'Ask here once a model is connected'
const CANT_CHECK_LINE = "Can't check right now. Couldn't read this from your Hermes. Press Check again in a moment."

const CHECK_TIMEOUT_MS = 20000
// runtime_check can answer 5097 "readiness check still in progress": ask again after 5 s, up to
// 3 more times, and only then say "Can't check right now" (hhtech-default-model.md, For builder).
const STILL_CHECKING_CODE = 5097
const STILL_CHECKING_WAIT_MS = 5000
const STILL_CHECKING_RETRIES = 3
// The page checks when it opens and when the person presses "Check again"; an open within this
// time of the last successful check (ok or none) reuses its answer, so switching pages never polls
// Hermes. A failed check is never reused: the next open asks again.
const RECHECK_AFTER_MS = 30000

// What the message box and the cards call the model when Hermes gives no name.
function modelLabel(name) {
  return typeof name === 'string' && name.trim() ? name.trim() : 'your model'
}

// params: {} for the profile Hermes is running, { profile } for another bot.
async function checkModel(request, { params = {}, sleep = () => Promise.resolve() } = {}) {
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

// ---- src/model-call.js ----
// The page's one way to ask the person's model (build-v1.md section 7, with hhtech's fixes):
// used by the "The model answers" card now and by the helper in B4.
//   host.request('llm.oneshot', { task: 'helping_hand', instructions, input, temperature, max_tokens }, 90000)
// - task 'helping_hand' is a name Hermes doesn't know, so its side-call settings read as "auto" =
//   the person's main model (docs/answers/hhtech-default-model.md points 1-2). Without it the call
//   would run on their chat-title model.
// - No session_id: a session would lend that one chat's model.
// - Never called to "test" whether a model exists: a failed call can make Hermes skip the provider
//   for 60 s. The caller checks setup.runtime_check first and calls only when it says ok.
// When the call fails, the page tells the causes apart by code (docs/answers/hhtech-v1-strings-check.md
// point 1; content/v1-strings.md part 2) and never suggests restarting Hermes.

const ONESHOT_TASK = 'helping_hand'
const ONESHOT_TIMEOUT_MS = 90000
const MODEL_FAILED_CODE = 5030
// Case (a): Hermes skips the provider for 60 s after a failed side call. Wait it out, then try once more.
const NOT_READY_WAIT_S = 60

function oneshotParams({ instructions, input, temperature = 0.2, max_tokens = 300, profile } = {}) {
  const p = { task: ONESHOT_TASK, instructions: String(instructions || ''), input: String(input || ''), temperature, max_tokens }
  if (profile) p.profile = profile
  return p
}

// Which fixed line a failed call gets. recheck = checkModel()'s answer right after the failure
// (only asked for code 5030). Kinds:
//   no_model      runtime_check now says ok false and nothing is set up  -> part 1's line
//   model_broken  runtime_check now says ok false otherwise              -> card 2's "Needs a fix"
//   not_ready     ok true + "No LLM provider configured" (the 60 s skip) -> (a), countdown, one retry
//   key           ok true + "Error code: 401/403"                        -> (b)
//   connection    ok true + "Connection error"                           -> (c)
//   other         anything else, a timeout, no code, a failed recheck    -> (e)
function failureKind(err, recheck) {
  const code = err && typeof err === 'object' ? err.code : undefined
  if (code !== MODEL_FAILED_CODE) return 'other'
  if (!recheck || recheck.state === 'error') return 'other'
  if (recheck.state === 'none') return recheck.configured === false ? 'no_model' : 'model_broken'
  const message = typeof err.message === 'string' ? err.message : ''
  if (message.includes('No LLM provider configured')) return 'not_ready'
  if (/Error code: 40[13]\b/.test(message)) return 'key'
  if (message.includes('Connection error')) return 'connection'
  return 'other'
}

// The fixed lines for each kind, from content/v1-strings.md part 2. `helper` is hhcontent's text as
// written; `card` drops the "pick an answer below" part, because a setup card has no answers below
// it (flagged for hhcontent in docs/build/b2-report.md). {N} = seconds left.
const FAIL_LINES = {
  not_ready: {
    helper: ["Your model isn't ready to answer yet. I'll try again in {N} seconds.", 'Meanwhile, you can pick an answer below.'],
    card: ["Your model isn't ready to answer yet. I'll try again in {N} seconds."],
    button: null
  },
  key: {
    helper: [
      "The service that runs your model didn't accept your key or sign-in.",
      'Open Settings, then Providers, and sign in or paste the key again.',
      'Then press Try again.'
    ],
    button: 'Try again'
  },
  connection: {
    helper: [
      "Hermes couldn't reach your model.",
      "If the model runs on this computer, check that it's running.",
      'If it runs online, check your internet.',
      'Then press Try again.'
    ],
    button: 'Try again'
  },
  other: {
    helper: ["Your model didn't answer this time. Press Try again, or pick an answer below."],
    card: ["Your model didn't answer this time. Press Try again."],
    button: 'Try again'
  }
}

function failLines(kind, where = 'helper', secondsLeft = NOT_READY_WAIT_S) {
  const entry = FAIL_LINES[kind] || FAIL_LINES.other
  const lines = (where === 'card' && entry.card) || entry.helper
  return lines.map(l => l.replace('{N}', String(secondsLeft)))
}

// One ask, with the 5030 handling. Everything with time or the outside world is passed in, so the
// tests can drive it:
//   request(method, params, timeout)   host.request
//   recheck()                          checkModel() for the same bot (no model call)
//   sleep(ms)                          a timer the plugin host cleans up (ctx.setTimeout)
//   onState(state)                     { phase: 'calling', attempt } | { phase: 'countdown', left }
//   cancelled()                        true once the page is gone: stop quietly
// Answers { ok: true, text, ms } or { ok: false, kind } (kind as in failureKind), or null if cancelled.
async function askModel({ request, call, recheck, sleep, onState = () => {}, cancelled = () => false, now = Date.now }) {
  const once = async attempt => {
    onState({ phase: 'calling', attempt })
    const started = now()
    try {
      const res = await request('llm.oneshot', oneshotParams(call), ONESHOT_TIMEOUT_MS)
      const text = res && typeof res.text === 'string' ? res.text : null
      if (text === null) return { ok: false, err: null }
      return { ok: true, text, ms: now() - started }
    } catch (err) {
      return { ok: false, err }
    }
  }
  const classify = async err => {
    if (!err || err.code !== MODEL_FAILED_CODE) return 'other'
    let rc = null
    try {
      rc = await recheck()
    } catch {
      rc = { state: 'error' }
    }
    return failureKind(err, rc)
  }

  let r = await once(1)
  if (cancelled()) return null
  if (r.ok) return r
  let kind = await classify(r.err)
  if (cancelled()) return null
  if (kind !== 'not_ready') return { ok: false, kind }

  for (let left = NOT_READY_WAIT_S; left > 0; left--) {
    onState({ phase: 'countdown', left })
    await sleep(1000)
    if (cancelled()) return null
  }
  r = await once(2)
  if (cancelled()) return null
  if (r.ok) return r
  kind = await classify(r.err)
  if (cancelled()) return null
  // v1-strings (a): "If that fails too, show (e)". A recheck that now finds no model, a wrong key or
  // a dead connection keeps its own line, because that line says what to do.
  return { ok: false, kind: kind === 'not_ready' ? 'other' : kind }
}

// ---- src/key-check.js ----
// What the person typed, checked by code before anything goes to a model (build-v1.md section 7;
// content/v1-strings.md part 4, K1; docs/answers/hhtech-v1-strings-check.md point 2).
// Order matters: 1) pasted key, on the FULL text; 2) build words, on the full text; 3) the
// 500-character cut. A key that starts at character 491 is caught on the full text and missed
// after the cut (hhtech, ran), so the key check must come first.

// hhtech's three patterns, exactly. A match on any one counts as a key.
const KEY_PATTERNS = [
  /(?<![A-Za-z0-9])(?:sk-|sk_|xai-|AIza|ghp_|gho_|github_pat_|hf_|gsk_|pplx-|r8_|fw_)[A-Za-z0-9_-]{16,}/,
  /(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /(?<![A-Za-z0-9])(?=[A-Za-z]*[0-9])(?=[0-9]*[A-Za-z])[A-Za-z0-9]{32,}(?![A-Za-z0-9])/
]

const MAX_INPUT_CHARS = 500

const KEY_LINE =
  "That looks like a secret key, so I didn't send it to your model. Keys go in Settings, then Providers, then API keys, never in a chat."
const LONG_LINE = 'Your message was long, so I read only the first 500 characters.'

function looksLikeKey(text) {
  return typeof text === 'string' && KEY_PATTERNS.some(re => re.test(text))
}

// Returns what the page does with the person's words:
//   { kind: 'key' }                         show KEY_LINE, no model call
//   { kind: 'build' }                       show the hand-over text, no model call (B3/B4)
//   { kind: 'empty' }                       nothing to send
//   { kind: 'send', input, cut }            send input (at most 500 characters); cut = show LONG_LINE
// isBuildRequest is the step's build-word rule (hhcontent's list, B3); until then nothing matches.
function prepareInput(text, isBuildRequest = () => false) {
  const full = typeof text === 'string' ? text : ''
  if (looksLikeKey(full)) return { kind: 'key' }
  if (!full.trim()) return { kind: 'empty' }
  if (isBuildRequest(full)) return { kind: 'build' }
  const chars = Array.from(full)
  const cut = chars.length > MAX_INPUT_CHARS
  return { kind: 'send', input: cut ? chars.slice(0, MAX_INPUT_CHARS).join('') : full, cut }
}

// ---- src/setup-cards.js ----
// "Your setup": the seven cards' pass rules and fixed words (build-v1.md section 8). Pure code, no
// Hermes calls: src/setup-tab.js does the read-only reads and hands the answers to the rules here.
// Code decides every status; no model judges anything.
// Words: content/v1-strings.md part 3 (cards 2 and 4) and content/checks-base.md (cards 1, 3, 5, 6, 7),
// "Passes when" lines from hhdesign's design/hermes-look-r3/your-setup.html. Lines marked
// "(builder)" had no source text yet; they are listed for hhcontent in docs/build/b2-report.md.


// One status per card, always shown as a coloured dot plus its word.
const STATUS = {
  works: 'Works',
  fix: 'Needs a fix',
  notset: 'Not set up yet',
  unchecked: 'Not checked yet',
  cant: "Can't check right now",
  count: 'Just a count, no pass or fail',
  checking: 'Checking'
}

const CARD_TITLES = {
  gateway: 'Hermes is connected',
  model: 'A model is connected',
  answers: 'The model answers',
  soul: 'Personality file (SOUL.md)',
  skills: 'Skills are switched on',
  memory: 'Memory can be used',
  remember: 'Does it really remember?'
}

// Card titles never carry a bot name (B3a, Lead: "A model is connected for default" read badly).
// With several bots, the picker line above the cards names the bot once.
function cardTitle(id) {
  return CARD_TITLES[id]
}

const PASSES = {
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
function gatewayCard(gatewayState) {
  if (gatewayState === 'open') return { status: 'works', lines: ['This page can talk to your Hermes.'] }
  return { status: 'fix', lines: ["This page can't reach your Hermes right now. Try closing and opening the app."] }
}

/* ---- card 2: A model is connected (setup.runtime_check, then setup.status after ok false) ---- */
const MODEL_LINES = {
  works: name => `Your Hermes has a model: ${name}. The model is the AI that does the thinking.`,
  worksNoName: 'Your Hermes has a model connected. The model is the AI that does the thinking.',
  notset:
    'No model connected yet. The model is the AI that does the thinking, and Hermes needs one before it can answer. Step 2 explains the ways to connect one.',
  fix: "A model is chosen, but Hermes can't use it. Most often the sign-in has ended or the key is wrong. Open Settings, then Providers, and sign in or paste the key again."
}

// check = checkModel()'s answer, or null / { state: 'checking' } while it runs.
function modelCard(check) {
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
const ANSWER_CALL = { instructions: 'Reply with exactly: OK', input: 'Reply with exactly: OK', temperature: 0, max_tokens: 300 }
const ANSWER_WAIT_LIMIT_S = 90

// "contains OK": the word OK on its own, any case ("OK", "OK.", "ok"), not inside another word ("token").
function answerPasses(text) {
  return typeof text === 'string' && /(^|[^A-Za-z0-9])ok([^A-Za-z0-9]|$)/i.test(text)
}

function seconds(ms) {
  const s = Math.max(0, ms) / 1000
  return s < 10 ? s.toFixed(1) : String(Math.round(s))
}

// run = { phase: 'idle' } | { phase: 'calling', waited } | { phase: 'countdown', left }
//     | { phase: 'done', result }   (result = askModel()'s answer)
// model = card 2's check for the same bot: the button only works when that says ok.
function answersCard(run, model) {
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
const DEFAULT_SOULS = [
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
function normalizeSoul(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '').trim()
}
const DEFAULT_SET = new Set(DEFAULT_SOULS.map(normalizeSoul))

function isDefaultSoul(text) {
  return DEFAULT_SET.has(normalizeSoul(text))
}

const SOUL_LINES = {
  works:
    'Your Hermes has its own personality file. SOUL.md is the first thing Hermes reads, and it sets who your Hermes is and how it talks.',
  notset:
    "Your Hermes uses the built-in personality. That's fine; nothing is wrong. SOUL.md is a short text file where you can describe how you want it to talk. Help with writing one comes in a later step."
}

// read = { ok: true, value: <profiles.describe answer> } | { ok: false } (rejected or timed out) | null (running)
function soulCard(read) {
  if (!read) return checking()
  if (!read.ok) return cant()
  const soul = read.value && typeof read.value === 'object' ? read.value.soul : undefined
  if (typeof soul !== 'string') return cant()
  // Empty text means Hermes uses its built-in personality (hhtech point 3), so it is "Not set up yet".
  if (!soul.trim() || isDefaultSoul(soul)) return { status: 'notset', lines: [SOUL_LINES.notset] }
  return { status: 'works', lines: [SOUL_LINES.works] }
}

/* ---- card 5: Skills (host.skills.list): a count, no pass or fail ---- */
function skillsCard(read) {
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
const MEMORY_HANDOFF = 'Please switch my memory on and tell me how to check it worked.'
function memoryCard(read) {
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
const REMEMBER = {
  intro: "A test you run in your own chat, because this page can't write to your memory.",
  part1: 'Use the memory tool to save this exact note: Helper test 7Q4.',
  part2: 'What is the Helper test note?',
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
function rememberCard(answer) {
  if (answer === 'yes') return { status: 'works', lines: [REMEMBER.worked] }
  if (answer === 'no') return { status: 'fix', lines: [], reasonsLead: REMEMBER.reasonsLead, reasons: REMEMBER.reasons }
  return { status: 'unchecked', lines: [] }
}

// ---- src/steps-data.js ----
// Generated by scripts/build.mjs from content/steps-v1.json (hhcontent's fixed step text). Edit the
// JSON, then build; tests/steps.test.mjs checks the data (build-v1.md section 6).
const STEPS_DATA = {
  "about": "Helper v1 step data, steps 1-4. Written by hhcontent, 9 Nov 2026. Shape: docs/plan/build-v1.md section 6, plus optional fields listed in content/v1-strings.md part 4. All text is fixed; code fills only the {slots}. Checked by dev/checks/hhcontent/check-steps-v1.mjs.",
  "docs_version": "v0.23.0",
  "docs_root": "/hermes-docs",
  "live_base": "https://hermes-agent.nousresearch.com/docs/",
  "build_word_rule": "Lower-case the person's words, turn curly quotes into straight ones, squeeze spaces. If the words start with one of build_word_skip_starts, skip this check and let the model decide. Otherwise, if any phrase from build_words_common or from the open step's build_words appears with a word boundary on both sides, go straight to the hand-over text with no model call.",
  "build_word_skip_starts": [
    "what is",
    "what's",
    "whats",
    "what are",
    "what does",
    "what do",
    "why",
    "is it",
    "is that",
    "is this",
    "are there",
    "does it",
    "does that",
    "do i need",
    "should i",
    "which"
  ],
  "build_words_common": [
    "do it for me",
    "do this for me",
    "do that for me",
    "can you install",
    "could you install",
    "would you install",
    "please install",
    "install it",
    "install this",
    "install that",
    "install them",
    "can you connect",
    "could you connect",
    "please connect",
    "connect it",
    "connect this",
    "can you build",
    "could you build",
    "please build",
    "build me",
    "build it",
    "can you set up",
    "could you set up",
    "please set up",
    "set it up",
    "set this up",
    "set everything up",
    "set it all up",
    "can you configure",
    "please configure",
    "configure it",
    "can you enable",
    "please enable",
    "enable it",
    "turn it on",
    "switch it on",
    "deploy it",
    "just do it",
    "do it now",
    "build an app",
    "make an app",
    "build a website",
    "make a website",
    "build a bot",
    "make a bot",
    "write the code"
  ],
  "key_pattern_note": "Separate from build words: if the words contain something that looks like a secret key, never send them to the model. See content/v1-strings.md, line K1.",
  "steps": [
    {
      "id": "s1",
      "number": 1,
      "title": "What do you want Hermes to do for you?",
      "rail_subtitle": "What you want Hermes to do",
      "intro": "Hermes is an AI agent: an AI that can do things for you, not only talk. You talk to it in plain words, as you would with ChatGPT. The difference is what it can do around the chat. It can take actions on the computer it runs on, it remembers you from one chat to the next, and it can work on a schedule or answer you in a chat app on your phone. What you want from it decides which of these parts you need, so this is the first question. Pick the answer closest to yours. You can change it later.",
      "intro_sources": [
        {
          "source": "index.mdx",
          "section": "Hermes Agent",
          "quote": "builds a deepening model of who you are across sessions"
        },
        {
          "source": "user-guide/features/tools.md",
          "section": "Tools & Toolsets",
          "quote": "Tools are functions that extend the agent's capabilities."
        },
        {
          "source": "user-guide/messaging/index.md",
          "section": "Messaging Gateway",
          "quote": "The gateway is a single background process that connects to all your configured platforms, handles sessions, runs cron jobs"
        }
      ],
      "compare": null,
      "facts": [
        {
          "id": "s1f1",
          "text": "Hermes remembers what it learns about you from one chat to the next. It also writes down new skills (step-by-step know-how for one kind of task) from what it does, and improves them as it uses them.",
          "source": "index.mdx",
          "section": "Hermes Agent",
          "url": "https://hermes-agent.nousresearch.com/docs/",
          "quote": "creates skills from experience, improves them during use, nudges itself to persist knowledge, and builds a deepening model of who you are across sessions"
        },
        {
          "id": "s1f2",
          "text": "Hermes can take actions, not only answer: run programs, read and change files, search the web, and more. Each kind of action is called a tool.",
          "source": "user-guide/features/tools.md",
          "section": "Available Tools",
          "url": "https://hermes-agent.nousresearch.com/docs/user-guide/features/tools",
          "quote": "covering web search, browser automation, terminal execution, file editing, memory, delegation, scheduled tasks, and more"
        },
        {
          "id": "s1f3",
          "text": "You can message Hermes from chat apps such as Telegram, WhatsApp, Discord or Slack, not only from this app. A part of Hermes called the gateway keeps running in the background to answer you there.",
          "source": "user-guide/messaging/index.md",
          "section": "Messaging Gateway",
          "url": "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/",
          "quote": "The gateway is a single background process that connects to all your configured platforms"
        },
        {
          "id": "s1f4",
          "text": "Hermes can do jobs on a schedule without you being there, such as a summary every morning or a regular check. The docs call these cron jobs.",
          "source": "getting-started/learning-path.md",
          "section": "I want to automate tasks",
          "url": "https://hermes-agent.nousresearch.com/docs/getting-started/learning-path",
          "quote": "Cron jobs let Hermes Agent run tasks on a schedule — daily summaries, periodic checks, automated reports — without you being present."
        },
        {
          "id": "s1f5",
          "text": "The official docs sort what people do with Hermes into a few kinds: help with writing and running code, a bot in a chat app, jobs that run on a schedule, and a team of specialist bots. They advise getting one plain chat working first, then adding one thing at a time.",
          "source": "getting-started/learning-path.md",
          "section": "By Use Case",
          "url": "https://hermes-agent.nousresearch.com/docs/getting-started/learning-path",
          "quote": "I want a team of specialist Bots",
          "more_sources": [
            {
              "source": "getting-started/quickstart.md",
              "section": "The fastest path",
              "quote": "Get one clean conversation working first, then layer on gateway, cron, skills, voice, or routing."
            }
          ]
        }
      ],
      "question": "What would you most like Hermes to do for you first?",
      "options": [
        {
          "id": "o_tasks",
          "label": "Help with tasks on this computer",
          "hint": "Files, writing, research, code",
          "fact": "s1f2",
          "goal_text": "help me with tasks on my computer (files, writing, research, code)",
          "fits": {
            "s3": "o_here"
          }
        },
        {
          "id": "o_phone",
          "label": "Answer me from my phone",
          "hint": "In Telegram, WhatsApp, Discord or Slack",
          "fact": "s1f3",
          "goal_text": "answer me from my phone in a chat app",
          "fits": {
            "s3": "o_always"
          }
        },
        {
          "id": "o_schedule",
          "label": "Do jobs on its own, on a schedule",
          "hint": "A summary every morning, a regular check",
          "fact": "s1f4",
          "goal_text": "do jobs on its own on a schedule",
          "fits": {
            "s3": "o_always"
          }
        },
        {
          "id": "o_unsure",
          "label": "I don't know yet",
          "hint": "See what people use it for",
          "fact": "s1f5",
          "goal_text": "not decided yet",
          "fits": {}
        }
      ],
      "next_rule": {
        "o_tasks": "s2",
        "o_phone": "s2",
        "o_schedule": "s2",
        "o_unsure": "s2"
      },
      "build_words": [
        "do it all",
        "make it work",
        "do everything"
      ],
      "handoff": {
        "template": "I'm setting up Hermes. My goal: {goal}. I'd like you to: \"{request}\". Before you change anything, tell me in plain words what you will do and why, and wait for my OK. Afterwards, tell me how I can check that it worked. Official page: {docs_url}",
        "docs_url": "https://hermes-agent.nousresearch.com/docs/getting-started/learning-path"
      },
      "video": null
    },
    {
      "id": "s2",
      "number": 2,
      "title": "The brain: what a model is, and where it runs",
      "rail_subtitle": "What a model is, where it runs",
      "intro": "Hermes doesn't think by itself. It sends your words to a model: the AI that does the thinking, like the one inside ChatGPT. A provider is the company that runs a model for you. If Hermes already answers you, you already have a model, and this step shows what you have and what else you could use. There are four ways to connect a model: a subscription you may already pay for, an API key (a secret code from a model company), a model on your own computer, or a Nous account (Nous Research makes Hermes). You can switch at any time.",
      "intro_sources": [
        {
          "source": "user-guide/configuring-models.md",
          "section": "Configuring Models",
          "quote": "Main model — what the agent thinks with."
        },
        {
          "source": "integrations/providers.md",
          "section": "Subscription plans: what your plan pays for",
          "quote": "Several providers let you sign in to Hermes with a consumer subscription"
        },
        {
          "source": "getting-started/quickstart.md",
          "section": "2. Choose a Provider",
          "quote": "You can switch providers at any time with hermes model — no lock-in."
        }
      ],
      "compare": {
        "left": {
          "title": "On a provider's computers",
          "text": "Your words go to that provider and nowhere else. You pay through a subscription or for what you use.",
          "source": "reference/faq.md",
          "section": "Is my data sent anywhere?",
          "quote": "API calls go only to the LLM provider you configure"
        },
        "right": {
          "title": "On this computer",
          "text": "Nothing leaves your computer, and it costs nothing to run. It needs a fairly strong computer.",
          "source": "user-guide/local-models.md",
          "section": "Local Models",
          "quote": "Nothing leaves your computer: no account, no API key, and no network access"
        }
      },
      "facts": [
        {
          "id": "s2f1",
          "text": "The name of the model you use shows in the message box, and you can change it there for one chat. The model for new chats is set in Settings, then Model, then Main model, and you can switch to another one at any time.",
          "source": "user-guide/desktop.md",
          "section": "Choosing a model",
          "url": "https://hermes-agent.nousresearch.com/docs/user-guide/desktop#choosing-a-model",
          "quote": "Set the default in Settings → Model → Main model."
        },
        {
          "id": "s2f2",
          "text": "Some subscriptions can be used instead of a key: a ChatGPT plan (you sign in with ChatGPT) or SuperGrok (the paid plan for Grok). For Claude, only the Max plan works, and only with extra usage credits bought on top; Claude Pro can't be used this way. The docs name ChatGPT Plus and Pro, but don't yet say how much of your plan Hermes uses.",
          "source": "integrations/providers.md",
          "section": "Subscription plans: what your plan pays for",
          "url": "https://hermes-agent.nousresearch.com/docs/integrations/providers#subscription-plans-what-your-plan-pays-for",
          "quote": "Pro subscribers cannot use the OAuth path",
          "more_sources": [
            {
              "source": "integrations/providers.md",
              "section": "Subscription plans: what your plan pays for",
              "quote": "Which ChatGPT plan tiers are eligible, and how Hermes usage counts against your plan's Codex limits, are not currently documented"
            },
            {
              "source": "user-guide/configuration.md",
              "section": "Common Setups",
              "quote": "Using Codex OAuth (ChatGPT Pro/Plus account — no API key needed)"
            }
          ]
        },
        {
          "id": "s2f3",
          "text": "An API key is a long secret code from a model company, such as OpenRouter, OpenAI, Anthropic or Google. It works like a password that lets Hermes use your account there, and you usually pay for what you use. Keep it secret: it goes in Settings, then Providers, then API keys, never into a chat.",
          "source": "getting-started/quickstart.md",
          "section": "2. Choose a Provider",
          "url": "https://hermes-agent.nousresearch.com/docs/getting-started/quickstart#2-choose-a-provider",
          "quote": "or API key for pay-per-token",
          "more_sources": [
            {
              "source": "reference/faq.md",
              "section": "How much does it cost?",
              "quote": "You pay only for the LLM API usage from your chosen provider."
            },
            {
              "source": "user-guide/desktop.md",
              "section": "Settings & onboarding",
              "quote": "with an Accounts / API-keys UX for signing in and storing credentials per provider"
            }
          ]
        },
        {
          "id": "s2f4",
          "text": "Hermes can download a model and run it on this computer: no account, no key, and nothing leaves your computer. A graphics card with 8 GB of memory or more runs the small models well, and Hermes shows which models fit before you download. Small models sometimes say they saved something to Hermes's memory when they didn't.",
          "source": "user-guide/local-models.md",
          "section": "Requirements and limits",
          "url": "https://hermes-agent.nousresearch.com/docs/user-guide/local-models",
          "quote": "A GPU with 8 GB+ of memory runs the small catalog models comfortably",
          "more_sources": [
            {
              "source": "user-guide/local-models.md",
              "section": "How Hermes picks what to download",
              "quote": "Every model in the catalog is priced against your machine before you download anything."
            },
            {
              "source": "user-guide/features/memory.md",
              "section": "Troubleshooting",
              "quote": "Small local models (roughly under 30B parameters) and models with weak tool-calling do this often"
            }
          ]
        },
        {
          "id": "s2f5",
          "text": "Nous Portal is an account with Nous Research, the makers of Hermes. One sign-in gives you hundreds of models and extra tools such as web search, on a paid subscription, and the docs call it the recommended way to run Hermes. There is also a free Nous plan, with limits on how much you can use it.",
          "source": "integrations/nous-portal.md",
          "section": "Nous Portal",
          "url": "https://hermes-agent.nousresearch.com/docs/integrations/nous-portal",
          "quote": "the recommended way to run Hermes Agent",
          "more_sources": [
            {
              "source": "integrations/providers.md",
              "section": "Nous Portal",
              "quote": "One OAuth login covers 300+ frontier agentic models"
            },
            {
              "source": "user-guide/configuration.md",
              "section": "Iteration Budget",
              "quote": "on the free Nous tier (no sign-in)"
            }
          ]
        }
      ],
      "question": "Which of these fits you best?",
      "options": [
        {
          "id": "o_keep",
          "label": "Keep the model I have",
          "hint": "It already answers me",
          "fact": "s2f1"
        },
        {
          "id": "o_sub",
          "label": "Use a subscription I pay for",
          "hint": "ChatGPT, SuperGrok or Claude Max",
          "fact": "s2f2"
        },
        {
          "id": "o_key",
          "label": "Use an API key",
          "hint": "Pay for what I use",
          "fact": "s2f3"
        },
        {
          "id": "o_local",
          "label": "Run a model on this computer",
          "hint": "Private and free to run",
          "fact": "s2f4"
        },
        {
          "id": "o_nous",
          "label": "Use a Nous account",
          "hint": "Many models in one sign-in",
          "fact": "s2f5"
        }
      ],
      "next_rule": {
        "o_keep": "s3",
        "o_sub": "s3",
        "o_key": "s3",
        "o_local": "s3",
        "o_nous": "s3"
      },
      "build_words": [
        "connect my chatgpt",
        "connect my claude",
        "connect chatgpt",
        "connect claude",
        "add my key",
        "add my api key",
        "use my key",
        "here is my key",
        "here's my key",
        "my key is",
        "switch my model",
        "change my model",
        "change the model",
        "set my model",
        "download a model",
        "download the model",
        "install a model",
        "install the model",
        "sign me in",
        "log me in",
        "sign in for me",
        "log in for me"
      ],
      "handoff": {
        "template": "I'm setting up Hermes. My goal: {goal}. I'd like you to: \"{request}\". Before you change anything, tell me in plain words what you will change in my model settings and why, and wait for my OK. If a key or a sign-in is needed, tell me where to enter it in Settings; don't ask me to paste a key into this chat. Afterwards, tell me how I can check that it worked. Official page: {docs_url}",
        "docs_url": "https://hermes-agent.nousresearch.com/docs/integrations/providers"
      },
      "video": null
    },
    {
      "id": "s3",
      "number": 3,
      "title": "Where Hermes runs: this computer, or one that is always on",
      "rail_subtitle": "This computer, or one that is always on",
      "intro": "Hermes itself also runs on a computer, and that is a separate choice from the model in step 2. By default, this app runs Hermes on this computer. Hermes can also run on another computer that stays on all the time, and this app then connects to it. Where Hermes runs decides when it can work for you. Answering your messages and running scheduled jobs happen in the background on that computer, so they need it to be on and awake.",
      "intro_sources": [
        {
          "source": "user-guide/desktop.md",
          "section": "Connecting to a remote backend",
          "quote": "By default the app starts and manages its own local backend."
        },
        {
          "source": "user-guide/messaging/index.md",
          "section": "Messaging Gateway",
          "quote": "The gateway is a single background process that connects to all your configured platforms, handles sessions, runs cron jobs"
        },
        {
          "source": "user-guide/desktop.md",
          "section": "Settings & onboarding",
          "quote": "stops the machine from sleeping so long or overnight agent runs keep going"
        }
      ],
      "compare": {
        "left": {
          "title": "This computer",
          "text": "Simplest: nothing extra to set up. It works only while this computer is on and awake.",
          "source": "user-guide/desktop.md",
          "section": "Connecting to a remote backend",
          "quote": "By default the app starts and manages its own local backend."
        },
        "right": {
          "title": "A computer that is always on",
          "text": "A rented server, a home server, or Hermes Cloud. It keeps working while your own computer is off.",
          "source": "user-guide/desktop.md",
          "section": "Connecting to a remote backend",
          "quote": "a VPS, a home server, or a Mini behind Tailscale"
        }
      },
      "facts": [
        {
          "id": "s3f1",
          "text": "By default, the app starts and looks after its own Hermes on this computer. Nothing else is needed to begin.",
          "source": "user-guide/desktop.md",
          "section": "Connecting to a remote backend",
          "url": "https://hermes-agent.nousresearch.com/docs/user-guide/desktop#connecting-to-a-remote-backend",
          "quote": "By default the app starts and manages its own local backend."
        },
        {
          "id": "s3f2",
          "text": "Hermes works only while the computer it runs on is awake. In the app, Settings, then Advanced, then Keep computer awake stops the computer from sleeping during long jobs. Closing the lid still puts it to sleep.",
          "source": "user-guide/desktop.md",
          "section": "Settings & onboarding",
          "url": "https://hermes-agent.nousresearch.com/docs/user-guide/desktop#settings--onboarding",
          "quote": "Closing the lid or choosing Sleep still sleeps the machine",
          "more_sources": [
            {
              "source": "guides/cron-troubleshooting.md",
              "section": "Cron Troubleshooting",
              "quote": "Scheduled fires work as long as the gateway is running"
            }
          ]
        },
        {
          "id": "s3f3",
          "text": "Hermes can also run on another computer that stays on, such as a server you rent (a computer in a data centre that stays on) or one at home. You connect this app to it in Settings, then Gateways, and use it the same way. Setting up that other computer takes some technical steps with typed commands.",
          "source": "user-guide/desktop.md",
          "section": "Connecting to a remote backend",
          "url": "https://hermes-agent.nousresearch.com/docs/user-guide/desktop#connecting-to-a-remote-backend",
          "quote": "point it at a Hermes backend running on another machine — a VPS, a home server, or a Mini behind Tailscale",
          "more_sources": [
            {
              "source": "user-guide/desktop.md",
              "section": "On the backend (the remote machine)",
              "quote": "Set a username and password, then start the backend bound to a reachable address."
            }
          ]
        },
        {
          "id": "s3f4",
          "text": "Hermes Cloud runs Hermes for you on a computer that is hosted for you. You sign in once in Settings, then Gateways, and pick your Hermes from a list, with no address to type in. The Hermes docs don't list its price.",
          "source": "user-guide/desktop.md",
          "section": "Connecting to a remote backend",
          "url": "https://hermes-agent.nousresearch.com/docs/user-guide/desktop#connecting-to-a-remote-backend",
          "quote": "sign in once to Hermes Cloud and pick from the agents on your account; no URL to paste",
          "more_sources": [
            {
              "source": "user-guide/multi-connection-desktop.md",
              "section": "The gateway registry",
              "quote": "A hosted instance discovered through your Hermes Cloud account."
            }
          ]
        },
        {
          "id": "s3f5",
          "text": "Your chats, memory and skills are kept on the computer where Hermes runs. Hermes sends your words only to your model's provider, and it collects no usage data.",
          "source": "reference/faq.md",
          "section": "Is my data sent anywhere?",
          "url": "https://hermes-agent.nousresearch.com/docs/reference/faq#is-my-data-sent-anywhere",
          "quote": "Hermes Agent does not collect telemetry, usage data, or analytics. Your conversations, memory, and skills are stored locally in ~/.hermes/."
        }
      ],
      "question": "Where should your Hermes run?",
      "options": [
        {
          "id": "o_here",
          "label": "This computer is fine for now",
          "hint": "Simplest to start",
          "fact": "s3f1"
        },
        {
          "id": "o_always",
          "label": "A computer that is always on",
          "hint": "My own server",
          "fact": "s3f3"
        },
        {
          "id": "o_cloud",
          "label": "Hermes Cloud",
          "hint": "Hosted for me",
          "fact": "s3f4"
        },
        {
          "id": "o_unsure",
          "label": "I'm not sure yet",
          "hint": "What decides it?",
          "fact": "s3f2"
        }
      ],
      "next_rule": {
        "o_here": "s4",
        "o_always": "s4",
        "o_cloud": "s4",
        "o_unsure": "s4"
      },
      "build_words": [
        "set up a server",
        "set up my server",
        "rent a server",
        "rent me a server",
        "deploy hermes",
        "move hermes",
        "move it to",
        "connect to my server",
        "connect my server",
        "set up hermes cloud",
        "sign up for hermes cloud",
        "sign me up",
        "install hermes",
        "keep my computer awake"
      ],
      "handoff": {
        "template": "I'm setting up Hermes. My goal: {goal}. I'd like you to: \"{request}\". Before you change anything, tell me in plain words what you will do, what it needs (another computer, an account, any cost) and why, and wait for my OK. Afterwards, tell me how I can check that it worked. Official page: {docs_url}",
        "docs_url": "https://hermes-agent.nousresearch.com/docs/user-guide/desktop#connecting-to-a-remote-backend"
      },
      "video": null
    },
    {
      "id": "s4",
      "number": 4,
      "title": "Connecting things: tools, skills, plugins, MCP",
      "rail_subtitle": "Tools, skills, plugins, MCP",
      "intro": "Hermes does things through tools: actions it can take, like searching the web. You can give it more abilities in three ways: skills, plugins and MCP. The names sound alike, but they are different kinds of things. Knowing which kind fits your goal tells you what to ask your Hermes for. This page explains and advises. Your own Hermes does the adding, after you say yes.",
      "intro_sources": [
        {
          "source": "user-guide/features/tools.md",
          "section": "Tools & Toolsets",
          "quote": "Tools are functions that extend the agent's capabilities."
        },
        {
          "source": "getting-started/learning-path.md",
          "section": "I want to build custom tools/skills",
          "quote": "Extend Hermes Agent with your own tools and reusable skill packages."
        }
      ],
      "compare": null,
      "facts": [
        {
          "id": "s4f1",
          "text": "A tool is one kind of action Hermes can take, such as searching the web, running a program or reading a file. Hermes comes with many, grouped into toolsets that you can switch on or off.",
          "source": "user-guide/features/tools.md",
          "section": "Tools & Toolsets",
          "url": "https://hermes-agent.nousresearch.com/docs/user-guide/features/tools",
          "quote": "They're organized into logical toolsets that can be enabled or disabled per platform."
        },
        {
          "id": "s4f2",
          "text": "A skill is written know-how: a document with step-by-step instructions for one kind of task. Hermes reads only each skill's short description until a task needs it, so having many doesn't slow it down. It comes with many skills, and you can add more from the Skills Hub.",
          "source": "getting-started/quickstart.md",
          "section": "Skills",
          "url": "https://hermes-agent.nousresearch.com/docs/getting-started/quickstart#skills",
          "quote": "The agent reads the short descriptions for free and only loads a skill's full content when a task actually calls for it",
          "more_sources": [
            {
              "source": "user-guide/features/skills.md",
              "section": "Skills System",
              "quote": "Skills are on-demand knowledge documents the agent can load when needed."
            }
          ]
        },
        {
          "id": "s4f3",
          "text": "A plugin is an add-on made of code. It can give Hermes new tools or features without changing Hermes itself. The plugin catalog lists plugins that people have reviewed, and each one installs with one command or one click.",
          "source": "user-guide/features/plugins.md",
          "section": "Plugins",
          "url": "https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins",
          "quote": "Hermes has a plugin system for adding custom tools, hooks, and integrations without modifying core code.",
          "more_sources": [
            {
              "source": "user-guide/features/plugin-catalog.md",
              "section": "Plugin Catalog",
              "quote": "The plugin catalog is a curated, human-reviewed directory of Hermes plugins you can install by name with a single command"
            }
          ]
        },
        {
          "id": "s4f4",
          "text": "MCP (Model Context Protocol) is a shared standard, a bit like a plug that fits many sockets. It lets Hermes use tools that live outside it, such as GitHub or a database, without anyone writing a new Hermes tool first.",
          "source": "user-guide/features/mcp.md",
          "section": "MCP (Model Context Protocol)",
          "url": "https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp",
          "quote": "Access to external tool ecosystems without writing a native Hermes tool first",
          "more_sources": [
            {
              "source": "user-guide/features/mcp.md",
              "section": "MCP (Model Context Protocol)",
              "quote": "MCP lets Hermes Agent connect to external tool servers so the agent can use tools that live outside Hermes itself — GitHub, databases"
            }
          ]
        },
        {
          "id": "s4f5",
          "text": "Add only what your goal needs, one thing at a time. The official quickstart says to get a normal chat working first, then add skills, scheduled jobs or messaging one layer at a time.",
          "source": "getting-started/quickstart.md",
          "section": "The fastest path",
          "url": "https://hermes-agent.nousresearch.com/docs/getting-started/quickstart#the-fastest-path",
          "quote": "Get one clean conversation working first, then layer on gateway, cron, skills, voice, or routing."
        }
      ],
      "question": "What would you like Hermes to be able to do next?",
      "options": [
        {
          "id": "o_knowhow",
          "label": "Do a task my way, every time",
          "hint": "Written know-how: a skill",
          "fact": "s4f2"
        },
        {
          "id": "o_service",
          "label": "Use a service I already use",
          "hint": "Such as GitHub or a database",
          "fact": "s4f4"
        },
        {
          "id": "o_feature",
          "label": "Get a new feature",
          "hint": "An add-on: a plugin",
          "fact": "s4f3"
        },
        {
          "id": "o_actions",
          "label": "See what it can already do",
          "hint": "Its built-in tools",
          "fact": "s4f1"
        },
        {
          "id": "o_enough",
          "label": "Nothing more for now",
          "hint": "Keep it simple",
          "fact": "s4f5"
        }
      ],
      "next_rule": {
        "o_knowhow": "done",
        "o_service": "done",
        "o_feature": "done",
        "o_actions": "done",
        "o_enough": "done"
      },
      "build_words": [
        "install a skill",
        "install the skill",
        "install a plugin",
        "install the plugin",
        "add a skill",
        "add the skill",
        "add this skill",
        "add a plugin",
        "add the plugin",
        "add this plugin",
        "add an mcp",
        "add the mcp",
        "set up mcp",
        "set up an mcp",
        "connect gmail",
        "connect my gmail",
        "connect my email",
        "connect my calendar",
        "connect github",
        "connect my github",
        "connect notion",
        "connect my notion",
        "write a skill",
        "create a skill",
        "make a skill",
        "build a plugin",
        "make a plugin",
        "write a plugin",
        "turn on the",
        "switch on the",
        "enable the"
      ],
      "handoff": {
        "template": "I'm setting up Hermes. My goal: {goal}. I'd like you to: \"{request}\". Before you change anything, tell me in plain words whether this is a skill, a plugin or an MCP server, what it will be able to read or change, and why it fits my goal, and wait for my OK. Afterwards, tell me how I can check that it worked. Official page: {docs_url}",
        "docs_url": "https://hermes-agent.nousresearch.com/docs/user-guide/features/plugin-catalog"
      },
      "video": null
    }
  ]
}

// ---- src/steps.js ----
// Setup steps 1-4 (B3): hhcontent's fixed text (content/steps-v1.json, built into src/steps-data.js)
// and the small rules around it, all plain code with no model: which step comes next
// (next_rule), the build-word rule (straight to the hand-over text), the hand-over text itself,
// the "Fits your goal" tag and the docs links. Every sentence the page shows comes from the data
// or from content/v1-strings.md part 4, word for word.

const STEPS = STEPS_DATA.steps
const STEP_IDS = STEPS.map(s => s.id)

// Steps 5-7 show greyed under "After these", with no content (build-v1.md section 6).
const LATER_STEPS = [
  { number: 5, title: 'Personality and memory' },
  { number: 6, title: 'Messaging' },
  { number: 7, title: 'Several bots' }
]
const VERSION_LINE = 'Hermes v0.23 · docs checked 9 Nov 2026'

// content/v1-strings.md part 4 (hhcontent). {slots} are filled by code only.
const LINES = {
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

const fill = (line, slots) => line.replace(/\{(\w+)\}/g, (m, k) => (k in slots ? String(slots[k]) : m))

function stepByNumber(n) {
  return STEPS.find(s => s.number === n) || null
}

function stepById(id) {
  return STEPS.find(s => s.id === id) || null
}

// The step list's two lines. The title up to its colon ("The brain"); a title without one (step 1
// is a question) gives its place to the data's own short line, which then isn't repeated below.
function railLines(step) {
  const colon = step.title.indexOf(':')
  if (colon > 0) return { title: step.title.slice(0, colon), sub: step.rail_subtitle || '' }
  return { title: step.rail_subtitle || step.title, sub: '' }
}

// A docs path ("user-guide/desktop.md") as its live page, the same rule hhcontent's check uses
// for every fact url (dev/checks/hhcontent/check-steps-v1.mjs, checkUrl).
function docsUrl(source) {
  const rel = String(source).replace(/\.(md|mdx)$/, '').replace(/^index$/, '').replace(/\/index$/, '/')
  return STEPS_DATA.live_base + rel
}

// The label on a source chip (v1-strings part 5: "Hermes docs › {section}").
const chipLabel = section => `Hermes docs › ${section}`

// Only the official Hermes docs open from the page (a content slip can't open anything else).
const isDocsUrl = url => typeof url === 'string' && url.startsWith(STEPS_DATA.live_base) && !/[\s"'<>]/.test(url)

// The step after this one, by the step's next_rule (code, not the model). No answer picked yet:
// the next step in order (every rule in v1 leads there too). Returns a step number, or 'done'.
function nextAfter(step, optionId) {
  const target = optionId && step.next_rule ? step.next_rule[optionId] : undefined
  if (target === 'done') return 'done'
  const byRule = target ? stepById(target) : null
  if (byRule) return byRule.number
  const following = stepByNumber(step.number + 1)
  return following ? following.number : 'done'
}

// answers: { [stepId]: optionId }, the person's picks. The step-1 answer can tag one option of a
// later step "Fits your goal" (its `fits`).
function fitsGoal(answers, stepId) {
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

function isBuildRequest(step, text) {
  const t = normalise(text)
  if (STEPS_DATA.build_word_skip_starts.some(p => t.startsWith(p + ' ') || t === p)) return false
  const phrases = [...STEPS_DATA.build_words_common, ...((step && step.build_words) || [])]
  return phrases.some(p => new RegExp(`(^|[^a-z0-9])${escape(p)}($|[^a-z0-9])`).test(t))
}

// The hand-over text (v1-strings part 4, "Slots in the hand-over template"):
//   {goal}     the step-1 answer's goal_text, else "not chosen yet"
//   {request}  the person's words, cut to 300 characters, double quotes turned into single ones
//   {docs_url} the step's handoff.docs_url
const REQUEST_MAX_CHARS = 300
function handoffText(step, answers, request) {
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
function cleanAnswers(value) {
  const out = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const s of STEPS) {
    const v = value[s.id]
    if (typeof v === 'string' && s.options.some(o => o.id === v)) out[s.id] = v
  }
  return out
}

// ---- src/state.js ----
// What the page keeps in ctx.storage on the person's computer.
// Keys: tab (setup | yours), step (1-4), answers ({ stepId: optionId }, the person's picks on the
// steps), helperWidth (the width Helper's window was dragged to, 360 to 600 px).
// Anything unexpected in storage falls back to the default.
// Nothing about the person is stored: not the name, not what they do, nothing of the
// conversation (row 1 of docs/build/talk-v1-plan.md). STORED_KEYS is every key the plugin may
// write; tests/state.test.mjs reads every storage call in src/ and fails on a key outside it.

const STEP_COUNT = STEPS.length
// 'remember' is the person's answer to the memory test on Your setup (src/setup-tab.js).
const STORED_KEYS = ['tab', 'step', 'answers', 'helperWidth', 'remember']

function readState(get) {
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

// ---- src/talk-data.js ----
// Generated by scripts/build.mjs from content/helper-talk-v2.json (hhcontent's talk data): only the
// fields src/talk.js reads, and each line's source. Edit the JSON, then build.
const TALK_DATA = {
  "docs_version": "v0.23.0",
  "limits": {
    "request_chars_in_paste": 300,
    "service_chars_in_paste": 40
  },
  "answers": {
    "max_at_once": 5,
    "hint_under_question": "Or type your own answer",
    "hint_under_topics": "Or type your question"
  },
  "fixed": {
    "OPEN": {
      "kind": "opening",
      "text": "Hi, I'm Helper. I can help you learn about Hermes and set it up. What's your name?"
    },
    "F1": {
      "kind": "opening",
      "text": "Nice to meet you, {name}. What do you do?",
      "text_no_name": "Nice to meet you. What do you do?"
    },
    "F2": {
      "kind": "reply",
      "text": "Thanks, {name}. Ask me anything about Hermes, or pick one of these.",
      "text_no_name": "Thanks. Ask me anything about Hermes, or pick one of these.",
      "answers": "topics"
    },
    "F3": {
      "kind": "reply",
      "text": "That's fine. Ask me anything about Hermes, or pick one of these.",
      "answers": "topics"
    },
    "N1": {
      "kind": "reply",
      "text": "I don't have a checked answer for that yet. Here is what I can help with.",
      "answers": "topics"
    },
    "W1": {
      "kind": "question",
      "text": "Which one do you mean?",
      "answers": "matched"
    },
    "C1": {
      "kind": "reply",
      "text": "Hermes can do jobs on a schedule and use services like Gmail. Pick one, or type what you want.",
      "answers": "pair",
      "source": "user-guide/features/cron.md line 15; user-guide/features/mcp.md line 13 (the same sources as sch0 and svc0)"
    },
    "H1": {
      "kind": "reply",
      "text": "I can't do that, but your own Hermes can. Paste this into a new chat with it.",
      "paste_text": "I asked for this: \"{request}\". Please do it for me. Ask me before you change anything."
    },
    "K1": {
      "kind": "reply",
      "text": "That looks like a secret key, so I did not send it. Keys go in Settings, never in a chat."
    }
  },
  "opening": {
    "name_strong_pattern": "(?:my name is|call me|name's|i am called|i'm called)\\s+([\\p{L}'-]{1,30})",
    "name_weak_pattern": "(?:i'm|i am|it's|this is)\\s+([\\p{L}'-]{1,30})",
    "pattern_flags": "iu",
    "short_answer_max_words": 3,
    "name_max_chars": 30,
    "not_a_name": [
      "hi",
      "hello",
      "hey",
      "yo",
      "ok",
      "okay",
      "yes",
      "no",
      "nope",
      "thanks",
      "thank",
      "skip",
      "help",
      "not",
      "sure",
      "a",
      "an",
      "the",
      "about",
      "here",
      "new",
      "just",
      "so",
      "very",
      "really",
      "in",
      "on",
      "at",
      "from",
      "looking",
      "trying",
      "working",
      "using",
      "having",
      "going",
      "doing",
      "wondering",
      "interested",
      "curious",
      "fine",
      "good",
      "nothing",
      "none",
      "idk",
      "me",
      "my",
      "it",
      "to",
      "for",
      "with",
      "and",
      "i",
      "confused",
      "lost",
      "stuck",
      "worried",
      "unsure",
      "back",
      "ready",
      "tired",
      "sorry",
      "afraid",
      "happy",
      "glad",
      "also",
      "still",
      "already",
      "only",
      "pretty",
      "quite",
      "too",
      "all",
      "kinda",
      "struggling",
      "thinking",
      "asking",
      "learning",
      "testing",
      "wanting",
      "hoping",
      "building",
      "running",
      "getting",
      "setting",
      "starting",
      "one",
      "that",
      "this",
      "what",
      "how"
    ],
    "question_starts": [
      "what",
      "what's",
      "whats",
      "how",
      "why",
      "can",
      "is",
      "do",
      "does",
      "which",
      "are",
      "will",
      "should",
      "where",
      "when",
      "who",
      "could",
      "would",
      "did"
    ],
    "work_max_words": 12,
    "work_max_chars": 60,
    "name_with_more": {
      "after_name": [
        ",",
        ".",
        "!",
        ":",
        " and ",
        " here"
      ],
      "self_starts": [
        "i",
        "i'm",
        "im",
        "i've",
        "my",
        "we"
      ]
    }
  },
  "build": {
    "skip_starts": [
      "what is",
      "what's",
      "whats",
      "what are",
      "what does",
      "what do",
      "why",
      "is it",
      "is that",
      "is this",
      "are there",
      "does it",
      "does that",
      "do i need",
      "should i",
      "which",
      "how do i",
      "how can i",
      "how to",
      "can i",
      "how",
      "explain",
      "could you explain",
      "can you explain",
      "would you explain",
      "please explain",
      "tell me how",
      "show me how"
    ],
    "how_phrases": [
      "how to",
      "how do i",
      "how can i",
      "how would i",
      "how should i",
      "how could i",
      "how do you",
      "how does",
      "how i",
      "explain"
    ],
    "build_words": [
      "do it for me",
      "do this for me",
      "do that for me",
      "can you install",
      "could you install",
      "would you install",
      "please install",
      "install it",
      "install this",
      "install that",
      "install them",
      "can you connect",
      "could you connect",
      "please connect",
      "connect it",
      "connect this",
      "can you build",
      "could you build",
      "please build",
      "build me",
      "build it",
      "can you set up",
      "could you set up",
      "please set up",
      "set it up",
      "set this up",
      "set everything up",
      "set it all up",
      "can you configure",
      "please configure",
      "configure it",
      "can you enable",
      "please enable",
      "enable it",
      "turn it on",
      "switch it on",
      "deploy it",
      "just do it",
      "do it now",
      "build an app",
      "make an app",
      "build a website",
      "make a website",
      "build a bot",
      "make a bot",
      "write the code",
      "do it all",
      "make it work",
      "do everything",
      "connect my chatgpt",
      "connect my claude",
      "connect chatgpt",
      "connect claude",
      "add my key",
      "add my api key",
      "use my key",
      "here is my key",
      "here's my key",
      "my key is",
      "switch my model",
      "change my model",
      "change the model",
      "set my model",
      "download a model",
      "download the model",
      "install a model",
      "install the model",
      "sign me in",
      "log me in",
      "sign in for me",
      "log in for me",
      "set up a server",
      "set up my server",
      "rent a server",
      "rent me a server",
      "deploy hermes",
      "move hermes",
      "move it to",
      "connect to my server",
      "connect my server",
      "set up hermes cloud",
      "sign up for hermes cloud",
      "sign me up",
      "install hermes",
      "keep my computer awake",
      "install a skill",
      "install the skill",
      "install a plugin",
      "install the plugin",
      "add a skill",
      "add the skill",
      "add this skill",
      "add a plugin",
      "add the plugin",
      "add this plugin",
      "add an mcp",
      "add the mcp",
      "set up mcp",
      "set up an mcp",
      "connect gmail",
      "connect my gmail",
      "connect my email",
      "connect my calendar",
      "connect github",
      "connect my github",
      "connect notion",
      "connect my notion",
      "write a skill",
      "create a skill",
      "make a skill",
      "build a plugin",
      "make a plugin",
      "write a plugin",
      "turn on the",
      "switch on the",
      "enable the",
      "connect my",
      "link my"
    ],
    "build_pair": {
      "must_have": "for me",
      "and_one_of": [
        "set up",
        "install",
        "connect",
        "link",
        "build",
        "configure",
        "enable",
        "deploy",
        "create",
        "make",
        "add",
        "turn on",
        "switch on"
      ]
    }
  },
  "ignore_phrases": [
    "i don't remember",
    "i dont remember",
    "i do not remember",
    "i can't remember",
    "i cant remember",
    "i cannot remember",
    "i forgot",
    "i forget"
  ],
  "unsure_words": [
    "no",
    "nope",
    "neither",
    "none",
    "nothing",
    "not sure",
    "don't know",
    "dont know",
    "do not know",
    "no idea",
    "idk"
  ],
  "chat_apps": [
    "telegram",
    "telegramm",
    "telegrm",
    "telgram",
    "telegam",
    "telegarm",
    "whatsapp",
    "whatsap",
    "whats app",
    "watsapp",
    "whatsup",
    "wattsapp",
    "whatapp",
    "slack",
    "discord",
    "discrod",
    "signal"
  ],
  "hermes_words": [
    "it",
    "hermes",
    "the bot",
    "my bot"
  ],
  "topic_picks": [
    {
      "label": "What Hermes can do",
      "gives": "can",
      "holds": [
        "sch",
        "svc"
      ],
      "line": "C1"
    },
    {
      "label": "Which AI to use",
      "gives": "mod"
    },
    {
      "label": "Phone and chat apps",
      "gives": "msg"
    },
    {
      "label": "What Hermes remembers",
      "gives": "mem"
    },
    {
      "label": "More than one Hermes",
      "gives": "bot"
    }
  ],
  "topics": [
    {
      "id": "mem",
      "part": "memory",
      "part_if_no_memory_part": "bots",
      "model_hint": "memory, remembering, forgetting",
      "key_words": [
        "memory",
        "memories",
        "remember",
        "remembers",
        "remembering",
        "forget",
        "forgets",
        "forgot",
        "forgetting",
        "talked about",
        "we talked",
        "told it",
        "told hermes",
        "losing track",
        "lost track",
        "recall",
        "recalls",
        "know who i am",
        "knows who i am",
        "who i am",
        "know me",
        "knows me",
        "know about me",
        "knows about me",
        "learned about me",
        "learn about me",
        "learns about me",
        "notes about me",
        "keep in mind",
        "keep track",
        "repeat myself",
        "tell it again",
        "explain again",
        "left off",
        "what i said",
        "what i told",
        "chat history",
        "old chats",
        "past chats",
        "earlier chats",
        "previous chats",
        "memorize",
        "memorise"
      ],
      "misspellings": [
        "rember",
        "remeber",
        "rememeber",
        "remmber",
        "memmory",
        "memorry",
        "memroy",
        "memeory"
      ],
      "weak_key_words": [],
      "pick": {
        "label": "What Hermes remembers"
      },
      "question": {
        "id": "mem-q",
        "text": "What do you want Hermes to remember?",
        "answers": [
          {
            "label": "Things about me",
            "gives": "mem1"
          },
          {
            "label": "What we talked about",
            "gives": "mem2"
          },
          {
            "label": "It forgot what I said",
            "gives": "mem3"
          },
          {
            "label": "Work and home, kept apart",
            "gives": "mem4"
          }
        ]
      },
      "plain": {
        "id": "mem0",
        "text": "Memory is short notes Hermes keeps about you and your work.",
        "source": "user-guide/features/memory.md lines 9, 17 to 18",
        "next": {
          "kind": "part",
          "label": "Open {part}"
        }
      },
      "needs": [
        {
          "id": "mem1",
          "model_hint": "wants Hermes to remember things about them or how they like things",
          "key_words": [
            "about me",
            "my name",
            "i like",
            "i prefer",
            "how i",
            "who i am",
            "know me",
            "knows me",
            "my preferences",
            "keep in mind"
          ],
          "text": "Hermes does that by itself. It keeps short notes about you and reads them in each new chat.",
          "source": "user-guide/features/memory.md line 159, line 20",
          "next": {
            "kind": "paste",
            "label": "Try it",
            "paste_text": "Please save this to your memory: <one thing about you>. Then tell me what you saved."
          }
        },
        {
          "id": "mem2",
          "model_hint": "wants Hermes to recall earlier chats",
          "key_words": [
            "talked",
            "said",
            "last week",
            "last time",
            "yesterday",
            "earlier",
            "old chats",
            "past chats",
            "conversation",
            "conversations",
            "left off",
            "chat history",
            "previous chats",
            "earlier chats",
            "what i said"
          ],
          "text": "Hermes saves every chat. It can search your old chats when you ask.",
          "source": "user-guide/features/memory.md, Session Search, lines 237 to 241",
          "next": {
            "kind": "paste",
            "label": "Try it",
            "paste_text": "What did we talk about last time about <topic>?"
          }
        },
        {
          "id": "mem3",
          "model_hint": "says Hermes forgot something",
          "key_words": [
            "forgot",
            "forgets",
            "forgetting",
            "does not remember",
            "doesn't remember",
            "doesnt remember",
            "lost",
            "losing track",
            "lost track",
            "keeps losing",
            "not working",
            "repeat myself",
            "tell it again",
            "explain again",
            "every time"
          ],
          "text": "New notes show up in the next chat, not this one. Start a new chat and ask again.",
          "source": "user-guide/features/memory.md lines 57 and 86",
          "next": {
            "kind": "paste",
            "label": "Show me what to ask",
            "paste_text": "What do you have in your memory about me? List it."
          }
        },
        {
          "id": "mem4",
          "model_hint": "wants to keep two kinds of things apart",
          "key_words": [
            "separate",
            "apart",
            "private",
            "work and",
            "different"
          ],
          "text": "Each bot keeps its own notes. For separate notes, use a separate bot.",
          "source": "user-guide/features/memory.md line 23",
          "next": {
            "kind": "part",
            "label": "Open Bots",
            "part": "bots"
          }
        }
      ]
    },
    {
      "id": "mod",
      "part": "model",
      "model_hint": "which AI model to use, or what it costs to use one",
      "key_words": [
        "model",
        "models",
        "chatgpt",
        "claude",
        "gpt",
        "openai",
        "gemini",
        "which ai",
        "what ai",
        "best ai",
        "free one",
        "free model",
        "free ai",
        "for free",
        "llm",
        "llms",
        "ai model",
        "ai models",
        "language model",
        "anthropic",
        "ollama",
        "deepseek",
        "grok",
        "mistral",
        "llama",
        "local ai",
        "smartest"
      ],
      "misspellings": [
        "modle",
        "modell",
        "chat gpt",
        "chatgtp"
      ],
      "weak_key_words": [
        "pay",
        "paying",
        "paid",
        "cost",
        "costs",
        "money",
        "spend",
        "spending",
        "expensive",
        "cheap",
        "cheaper",
        "cheapest",
        "free",
        "subscription",
        "subscriptions",
        "budget"
      ],
      "pick": {
        "label": "Which AI to use"
      },
      "question": {
        "id": "mod-q",
        "text": "Do you already pay for ChatGPT or Claude?",
        "answers": [
          {
            "label": "ChatGPT",
            "gives": "mod1"
          },
          {
            "label": "Claude",
            "gives": "mod2"
          },
          {
            "label": "Neither",
            "gives": "mod4"
          },
          {
            "label": "I want it free",
            "gives": "mod3"
          }
        ]
      },
      "plain": {
        "id": "mod0",
        "text": "A model is the AI that does the thinking. Hermes needs one to answer.",
        "source": "user-guide/configuring-models.md line 9",
        "next": {
          "kind": "part",
          "label": "Open Model"
        }
      },
      "needs": [
        {
          "id": "mod1",
          "model_hint": "pays for ChatGPT",
          "key_words": [
            "chatgpt",
            "openai",
            "gpt",
            "codex",
            "chat gpt",
            "chatgtp"
          ],
          "text": "You can sign in to Hermes with your ChatGPT plan. The docs do not say which plans work.",
          "source": "integrations/providers.md, table row OpenAI Codex and the paragraph under it",
          "next": {
            "kind": "part",
            "label": "Open Model",
            "part": "model"
          }
        },
        {
          "id": "mod2",
          "model_hint": "pays for Claude",
          "key_words": [
            "claude",
            "anthropic"
          ],
          "text": "A Claude Max plan works only with extra paid credits. Claude Pro does not work.",
          "source": "integrations/providers.md, table rows Claude Max + OAuth and Claude Pro",
          "next": {
            "kind": "part",
            "label": "Open Model",
            "part": "model"
          }
        },
        {
          "id": "mod3",
          "model_hint": "wants it free, private, or on their own computer",
          "key_words": [
            "free",
            "private",
            "offline",
            "own computer",
            "my computer",
            "local",
            "no account",
            "don't want to pay",
            "dont want to pay",
            "do not want to pay",
            "not pay",
            "without paying",
            "spend",
            "any money",
            "no money",
            "cost nothing",
            "costs nothing",
            "cheap",
            "cheapest",
            "budget",
            "my laptop",
            "own laptop",
            "ollama",
            "local ai"
          ],
          "text": "Hermes can run an AI on your own computer. No account, and nothing leaves your computer.",
          "source": "user-guide/local-models.md lines 9 to 15",
          "next": {
            "kind": "part",
            "label": "Open Model",
            "part": "model"
          }
        },
        {
          "id": "mod4",
          "model_hint": "pays for neither, or does not know",
          "key_words": [
            "no",
            "nope",
            "neither",
            "none",
            "not sure",
            "don't know",
            "dont know",
            "no idea",
            "easy",
            "quick",
            "simple"
          ],
          "only_when_answering": true,
          "only_if_no_other_need": true,
          "text": "The quickest start is a paid Nous plan. One sign-in gives you many AIs to choose from.",
          "source": "user-guide/configuring-models.md line 14",
          "next": {
            "kind": "part",
            "label": "Open Model",
            "part": "model"
          }
        }
      ]
    },
    {
      "id": "msg",
      "part": "messaging",
      "model_hint": "talking to Hermes from a phone or chat app",
      "key_words": [
        "phone",
        "mobile",
        "iphone",
        "android",
        "telegram",
        "whatsapp",
        "slack",
        "discord",
        "signal",
        "sms",
        "imessage",
        "chat app",
        "text me",
        "text it",
        "text hermes",
        "texting",
        "message me",
        "message it",
        "text message",
        "text messages",
        "send me a text",
        "send a text",
        "by text",
        "not at my computer",
        "away from my computer",
        "not at my desk",
        "away from my desk",
        "not at home",
        "away from home",
        "on the go",
        "from anywhere",
        "reach it",
        "reach hermes",
        "when i'm out",
        "when im out",
        "while i'm out",
        "while im out",
        "tablet",
        "ipad",
        "smartphone"
      ],
      "misspellings": [
        "telegramm",
        "telegrm",
        "telgram",
        "telegam",
        "telegarm",
        "whatsap",
        "whats app",
        "watsapp",
        "whatsup",
        "wattsapp",
        "whatapp",
        "discrod"
      ],
      "weak_key_words": [],
      "pick": {
        "label": "Phone and chat apps"
      },
      "question": {
        "id": "msg-q",
        "text": "Which chat app do you use most?",
        "answers": [
          {
            "label": "Telegram",
            "gives": "msg1"
          },
          {
            "label": "WhatsApp",
            "gives": "msg2"
          },
          {
            "label": "Discord",
            "gives": "msg2"
          },
          {
            "label": "Slack",
            "gives": "msg2"
          }
        ]
      },
      "plain": {
        "id": "msg0",
        "text": "You can chat with Hermes from apps like Telegram, WhatsApp or Slack.",
        "source": "user-guide/messaging/index.md line 9",
        "next": {
          "kind": "part",
          "label": "Open Messaging"
        }
      },
      "needs": [
        {
          "id": "msg1",
          "model_hint": "uses Telegram",
          "key_words": [
            "telegram",
            "telegramm",
            "telegrm",
            "telgram",
            "telegam",
            "telegarm"
          ],
          "text": "Telegram has a quick setup. In the app, open Messaging and press Create with QR.",
          "source": "user-guide/desktop.md line 451",
          "next": {
            "kind": "part",
            "label": "Open Messaging",
            "part": "messaging"
          }
        },
        {
          "id": "msg2",
          "model_hint": "uses WhatsApp, Slack, Discord, Signal, SMS, email, Teams, iMessage, Matrix or LINE",
          "key_words": [
            "whatsapp",
            "whatsap",
            "whats app",
            "watsapp",
            "whatsup",
            "wattsapp",
            "whatapp",
            "slack",
            "discord",
            "discrod",
            "signal",
            "sms",
            "email",
            "teams",
            "imessage",
            "matrix",
            "line"
          ],
          "text": "Hermes works with that app. In the Hermes app, open Messaging to set it up.",
          "source": "user-guide/messaging/index.md line 9; user-guide/desktop.md line 451",
          "next": {
            "kind": "part",
            "label": "Open Messaging",
            "part": "messaging"
          }
        },
        {
          "id": "msg3",
          "model_hint": "wants answers at any time, also when their computer is off",
          "key_words": [
            "always",
            "any time",
            "anytime",
            "at night",
            "asleep",
            "laptop closed",
            "laptop is closed",
            "turned off",
            "when off",
            "computer is off"
          ],
          "text": "It answers only while its computer is on. For answers at any time, that computer must stay on.",
          "source": "start-v1.md g2 and g3 (9 Nov, not reopened); user-guide/desktop.md line 668",
          "next": {
            "kind": "part",
            "label": "Open Messaging",
            "part": "messaging"
          }
        }
      ]
    },
    {
      "id": "sch",
      "part": "capabilities",
      "model_hint": "doing something on a schedule",
      "key_words": [
        "schedule",
        "scheduled",
        "scheduling",
        "every day",
        "every morning",
        "each morning",
        "every week",
        "every night",
        "every evening",
        "every hour",
        "each day",
        "each week",
        "daily",
        "weekly",
        "remind",
        "reminder",
        "reminders",
        "automatically",
        "automatic",
        "morning job",
        "every monday",
        "every tuesday",
        "every wednesday",
        "every thursday",
        "every friday",
        "every saturday",
        "every sunday",
        "each monday",
        "each tuesday",
        "each wednesday",
        "each thursday",
        "each friday",
        "each saturday",
        "each sunday",
        "mondays",
        "tuesdays",
        "wednesdays",
        "thursdays",
        "fridays",
        "saturdays",
        "sundays",
        "every weekday",
        "every weekend",
        "every month",
        "each month",
        "monthly",
        "every year",
        "hourly",
        "nightly",
        "each night",
        "each evening",
        "every afternoon",
        "every minute",
        "every few",
        "once a day",
        "once a week",
        "once a month",
        "twice a day",
        "twice a week",
        "regularly",
        "recurring",
        "repeating",
        "on its own",
        "by itself",
        "without me asking",
        "without asking",
        "while i sleep",
        "overnight",
        "at a set time",
        "at a certain time",
        "timer",
        "alarm"
      ],
      "misspellings": [
        "shedule",
        "schedual",
        "scedule",
        "automaticaly",
        "automaticly"
      ],
      "weak_key_words": [],
      "pick": {
        "label": "Daily jobs and reminders"
      },
      "question": {
        "id": "sch-q",
        "text": "What should Hermes do on a schedule?",
        "answers": [
          {
            "label": "Send me a summary",
            "gives": "sch1"
          },
          {
            "label": "Remind me of something",
            "gives": "sch2"
          },
          {
            "label": "Keep an eye on something",
            "gives": "sch3"
          },
          {
            "label": "Work while I'm away",
            "gives": "sch4"
          }
        ]
      },
      "plain": {
        "id": "sch0",
        "text": "Hermes can do jobs on a schedule, such as a summary every morning.",
        "source": "steps-v1.json s1f4 (9 Nov); user-guide/features/cron.md line 15",
        "next": {
          "kind": "part",
          "label": "Open Capabilities"
        }
      },
      "needs": [
        {
          "id": "sch1",
          "model_hint": "a regular summary or report",
          "key_words": [
            "summary",
            "report",
            "news",
            "digest",
            "list",
            "update",
            "every morning",
            "daily",
            "weekly"
          ],
          "text": "Hermes can repeat a job every day or week. Ask it once, in plain words.",
          "source": "user-guide/features/cron.md lines 15 and 24",
          "next": {
            "kind": "paste",
            "label": "Show me what to ask",
            "paste_text": "Every morning at 8, send me a short summary of <what>."
          }
        },
        {
          "id": "sch2",
          "model_hint": "a reminder",
          "key_words": [
            "remind",
            "reminder",
            "reminders",
            "don't forget",
            "tomorrow",
            "in an hour"
          ],
          "text": "Hermes can remind you once, or again and again. Just ask it in plain words.",
          "source": "user-guide/features/cron.md lines 15 and 64",
          "next": {
            "kind": "paste",
            "label": "Show me what to ask",
            "paste_text": "Remind me <when> to <what>."
          }
        },
        {
          "id": "sch3",
          "model_hint": "checking or watching something",
          "key_words": [
            "check",
            "checks",
            "watch",
            "monitor",
            "alert",
            "tell me when",
            "price",
            "prices"
          ],
          "text": "Hermes can check something on a schedule and tell you what it found.",
          "source": "user-guide/features/cron.md lines 65 and 19",
          "next": {
            "kind": "paste",
            "label": "Show me what to ask",
            "paste_text": "Every <how often>, check <what> and tell me what you find."
          }
        },
        {
          "id": "sch4",
          "model_hint": "asks if it runs while they are away",
          "key_words": [
            "away",
            "asleep",
            "turned off",
            "switched off",
            "laptop closed",
            "laptop is closed",
            "when off",
            "computer is off"
          ],
          "text": "Jobs run only while Hermes is running on a computer that is on.",
          "source": "user-guide/features/cron.md line 423, lines 313 to 315",
          "next": {
            "kind": "part",
            "label": "Open Messaging",
            "part": "messaging"
          }
        }
      ]
    },
    {
      "id": "svc",
      "part": "capabilities",
      "model_hint": "using a service they already have, such as Gmail or GitHub",
      "key_words": [
        "services",
        "a service",
        "which service",
        "another service",
        "gmail",
        "google",
        "calendar",
        "github",
        "notion",
        "linear",
        "drive",
        "jira",
        "spotify",
        "outlook",
        "inbox",
        "dropbox",
        "trello",
        "asana",
        "onedrive",
        "sheets",
        "excel",
        "todoist",
        "obsidian",
        "zoom",
        "shopify",
        "airtable",
        "youtube",
        "my mail",
        "mailbox",
        "my apps",
        "other apps",
        "apps i use",
        "my accounts"
      ],
      "misspellings": [
        "gmial",
        "calender"
      ],
      "weak_key_words": [
        "connect",
        "link",
        "email",
        "emails"
      ],
      "weak_only_in_question_about_hermes": true,
      "pick": {
        "label": "Gmail and other services"
      },
      "question": {
        "id": "svc-q",
        "text": "Which service should Hermes use, such as Gmail?",
        "answers": [
          {
            "label": "Gmail",
            "gives": "svc1",
            "service": "Gmail"
          },
          {
            "label": "Google Calendar",
            "gives": "svc1",
            "service": "Google Calendar"
          },
          {
            "label": "Notion",
            "gives": "svc1",
            "service": "Notion"
          },
          {
            "label": "Is it safe to connect?",
            "gives": "svc2"
          }
        ]
      },
      "plain": {
        "id": "svc0",
        "text": "MCP links Hermes to a service you already use, such as GitHub.",
        "source": "user-guide/features/mcp.md line 13",
        "next": {
          "kind": "part",
          "label": "Open Capabilities"
        }
      },
      "needs": [
        {
          "id": "svc1",
          "model_hint": "names a service they want Hermes to use, read or check",
          "key_words": [
            "google calendar",
            "gmail",
            "google",
            "calendar",
            "github",
            "notion",
            "linear",
            "drive",
            "jira",
            "spotify",
            "outlook",
            "gmial",
            "calender",
            "dropbox",
            "trello",
            "asana",
            "onedrive",
            "sheets",
            "excel",
            "todoist",
            "obsidian",
            "zoom",
            "shopify",
            "airtable",
            "youtube"
          ],
          "service_names": {
            "google calendar": "Google Calendar",
            "gmail": "Gmail",
            "gmial": "Gmail",
            "google": "Google",
            "calendar": "my calendar",
            "calender": "my calendar",
            "github": "GitHub",
            "notion": "Notion",
            "linear": "Linear",
            "drive": "Google Drive",
            "jira": "Jira",
            "spotify": "Spotify",
            "outlook": "Outlook",
            "dropbox": "Dropbox",
            "trello": "Trello",
            "asana": "Asana",
            "onedrive": "OneDrive",
            "sheets": "Google Sheets",
            "excel": "Excel",
            "todoist": "Todoist",
            "obsidian": "Obsidian",
            "zoom": "Zoom",
            "shopify": "Shopify",
            "airtable": "Airtable",
            "youtube": "YouTube"
          },
          "text": "Hermes has a list of ready-made links to services. Ask your own Hermes to add yours.",
          "source": "user-guide/features/mcp.md lines 60 to 66",
          "next": {
            "kind": "paste",
            "label": "Show me what to ask",
            "paste_text": "Please connect {service}. If there is a ready-made MCP for it, add that. Ask me before you change anything."
          }
        },
        {
          "id": "svc2",
          "model_hint": "asks if connecting a service is safe",
          "key_words": [
            "safe",
            "see",
            "access",
            "private",
            "privacy",
            "permission",
            "permissions"
          ],
          "text": "Nothing is linked until you add it. You can also limit what Hermes may use there.",
          "source": "user-guide/features/mcp.md lines 60 to 62, line 27",
          "next": {
            "kind": "part",
            "label": "Open Capabilities",
            "part": "capabilities"
          }
        }
      ]
    },
    {
      "id": "bot",
      "part": "bots",
      "model_hint": "having more than one bot",
      "key_words": [
        "bots",
        "second bot",
        "another bot",
        "two bots",
        "more than one",
        "several",
        "multiple",
        "one for work",
        "one for personal",
        "work and personal",
        "second hermes",
        "another hermes",
        "two hermes",
        "agents",
        "separate agent",
        "another agent",
        "second agent",
        "two agents",
        "new agent",
        "separate bot",
        "separate hermes",
        "separate one",
        "a second one",
        "second one",
        "another one for",
        "different bot",
        "more bots",
        "extra bot",
        "new bot",
        "a bot for",
        "build a bot",
        "make a bot",
        "create a bot",
        "add a bot",
        "one for my",
        "one for each",
        "one for home",
        "one per"
      ],
      "misspellings": [],
      "weak_key_words": [],
      "pick": {
        "label": "More than one Hermes"
      },
      "question": {
        "id": "bot-q",
        "text": "What would a second Hermes do for you?",
        "answers": [
          {
            "label": "A different kind of work",
            "gives": "bot1"
          },
          {
            "label": "Help the first one",
            "gives": "bot2"
          },
          {
            "label": "Just start a new chat",
            "gives": "bot3"
          }
        ]
      },
      "plain": {
        "id": "bot0",
        "text": "Each bot is a separate Hermes with its own settings and notes.",
        "source": "user-guide/profiles.md lines 7 and 11; user-guide/bot-mode.md",
        "next": {
          "kind": "part",
          "label": "Open Bots"
        }
      },
      "needs": [
        {
          "id": "bot1",
          "model_hint": "the second bot has a different job",
          "key_words": [
            "work",
            "personal",
            "research",
            "coding",
            "writing",
            "emails",
            "different",
            "another job",
            "one for",
            "business",
            "job",
            "clients",
            "family",
            "home",
            "school",
            "for my"
          ],
          "text": "That fits a second bot. Each bot is a separate Hermes with its own settings and notes.",
          "source": "user-guide/profiles.md line 11",
          "next": {
            "kind": "line",
            "label": "How to add one",
            "id": "bot1-next",
            "text": "Open \"Bots\", press \"+\", then \"New bot\". It asks for a name, a title and a description.",
            "source": "Seen in the running app by hhtech and Lead: dev/checks/hhtech-talk-v2/shots/more-7b-bots-plus-menu.png and more-8-bots-new-dialog.png. App text: apps/desktop/src/plugins/hermes-bots/i18n.ts line 179. The docs page bot-mode.md line 61 says New Agent, which the app does not show."
          }
        },
        {
          "id": "bot2",
          "model_hint": "wants bots to work together",
          "key_words": [
            "together",
            "team",
            "hand over",
            "pass",
            "each other",
            "help each other"
          ],
          "text": "Each bot is a separate Hermes. They can hand work to each other with @ and a name.",
          "source": "user-guide/bot-mode.md lines 181 to 183",
          "next": {
            "kind": "part",
            "label": "Open Bots",
            "part": "bots"
          }
        },
        {
          "id": "bot3",
          "model_hint": "only wants a fresh chat",
          "key_words": [
            "new chat",
            "fresh chat",
            "start over",
            "another conversation",
            "same job"
          ],
          "text": "You may not need a second, separate Hermes. One Hermes can hold many chats at once.",
          "source": "user-guide/desktop.md line 182",
          "next": {
            "kind": "part",
            "label": "Open Bots",
            "part": "bots"
          }
        }
      ]
    }
  ],
  "terms": [
    {
      "id": "tool",
      "label": "Tools",
      "model_hint": "tools, the actions Hermes can take. Also: asks if Hermes can search the web or work with files",
      "key_words": [
        "tool",
        "tools"
      ],
      "text": "Tools are actions Hermes can take, like searching the web or editing files.",
      "source": "user-guide/features/tools.md line 13; start-v1.md c1 (9 Nov)",
      "next": {
        "kind": "part",
        "label": "Open Capabilities",
        "part": "capabilities"
      }
    },
    {
      "id": "skill",
      "label": "Skills",
      "model_hint": "skills. Also: asks how to teach Hermes a new task",
      "key_words": [
        "skill",
        "skills"
      ],
      "text": "A skill is a set of written steps that teach Hermes one task.",
      "source": "getting-started/quickstart.md line 295",
      "next": {
        "kind": "part",
        "label": "Open Capabilities",
        "part": "capabilities"
      }
    },
    {
      "id": "plugin",
      "label": "Plugins",
      "model_hint": "plugins or add-ons",
      "key_words": [
        "plugin",
        "plugins",
        "plug-in",
        "plug-ins",
        "add-on",
        "add-ons"
      ],
      "text": "A plugin is an add-on that gives Hermes a new feature.",
      "source": "user-guide/features/plugins.md line 10",
      "next": {
        "kind": "part",
        "label": "Open Capabilities",
        "part": "capabilities"
      }
    },
    {
      "id": "mcp",
      "label": "MCP",
      "model_hint": "MCP",
      "key_words": [
        "mcp",
        "mcps"
      ],
      "text": "MCP links Hermes to a service you already use, such as GitHub.",
      "source": "user-guide/features/mcp.md line 13",
      "next": {
        "kind": "part",
        "label": "Open Capabilities",
        "part": "capabilities"
      }
    },
    {
      "id": "soul",
      "label": "SOUL.md",
      "model_hint": "SOUL.md",
      "key_words": [
        "soul.md",
        "soul md",
        "soul",
        "soul file"
      ],
      "text": "SOUL.md is the file that says who your Hermes is.",
      "source": "user-guide/features/personality.md line 10",
      "next": {
        "kind": "none"
      }
    },
    {
      "id": "profile",
      "label": "Profile",
      "model_hint": "profiles",
      "key_words": [
        "profile",
        "profiles"
      ],
      "text": "That is one separate Hermes with its own settings and notes. The \"Bots\" tab lists them.",
      "source": "user-guide/bot-mode.md line 12 (A Bot is a profile); user-guide/profiles.md lines 7 and 11. The Bots tab listing them: hhtech ran, dev/checks/hhtech-real-model/nav2/shots/nav2-4-bots-tab-by-hand.txt (one bot on a fresh install, and the screen Profiles shows 1 profile).",
      "next": {
        "kind": "part",
        "label": "Open Bots",
        "part": "bots"
      }
    }
  ],
  "parts": {
    "model": {
      "navigate": "/settings?tab=config:model"
    },
    "messaging": {
      "navigate": "/messaging"
    },
    "bots": {
      "where_line": {
        "id": "bots-where",
        "text": "In the Hermes app, \"Bots\" is the tab next to \"Sessions\", top left.",
        "source": "hhtech ran, Desktop v0.23.0: dev/checks/hhtech-real-model/nav2/shots/nav2-4-bots-tab-by-hand.txt"
      }
    }
  },
  "model": {
    "max_tokens": 300,
    "topic_ids": [
      "mem",
      "mod",
      "msg",
      "sch",
      "svc",
      "bot",
      "tool",
      "skill",
      "plugin",
      "mcp",
      "soul",
      "profile",
      "build",
      "none"
    ],
    "fields": [
      "topic",
      "need",
      "name",
      "work"
    ]
  }
}

// ---- src/talk.js ----
// How Helper answers, as plain code: hhcontent's order of steps (content/helper-talk-v2.md
// section 2.1) ported from the team's route2.py, reading hhcontent's data (src/talk-data.js, made
// by the build from content/helper-talk-v2.json). No React, no storage, no model call of its own.
// tests/talk.test.mjs replays every conversation route2.py itself ran and must get the same
// result at every turn.
//   freshVisit(stage)             what Helper knows in this visit: the stage of the opening, the
//                                 open question, what was asked and found, the name and what the
//                                 person does. Kept in page memory only; nothing is written.
//   turn(text, visit, model)      a typed message -> a result { kind, ... }
//   turnWithModel(text, visit, ask)   the same steps when a model is asked on the way (async)
//   pick, pickTopic, press, skip, sayLine   what the person picks or presses
//   lineFor(result, visit, text)  the result as the line Helper says, its answers and its button
// Not here yet (row 1 of docs/build/talk-v1-plan.md): what Helper keeps between visits. route2.py
// has those steps (keep, keep_typed, kept_need, remember, change); the places they belong are
// marked "row 1" below.

const TOPICS = Object.fromEntries(TALK_DATA.topics.map(t => [t.id, t]))
const TOPIC_IDS = TALK_DATA.topics.map(t => t.id)
const TERMS = Object.fromEntries(TALK_DATA.terms.map(t => [t.id, t]))
const TERM_IDS = TALK_DATA.terms.map(t => t.id)
const BUILD = TALK_DATA.build
const OPENING = TALK_DATA.opening
const FIXED = TALK_DATA.fixed
const TOPIC_PICKS = Object.fromEntries(TALK_DATA.topic_picks.map(p => [p.gives, p]))
const NAME_FLAGS = OPENING.pattern_flags || 'iu'
const NAME_STRONG = new RegExp(OPENING.name_strong_pattern, NAME_FLAGS)
const NAME_WEAK = new RegExp(OPENING.name_weak_pattern, NAME_FLAGS)

/* ---------- matching (the same rules as route2.py: norm, hit, which, starts, cut_ignored) ---------- */
// Lower case, curly quotes to straight ones, spaces squeezed.
function talkNorm(s) {
  return String(s).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim()
}
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordRes = new Map()
// A key word matches with no letter a to z and no digit directly before or after it.
function wordRe(p, flags = '') {
  const key = flags + '\u0000' + p
  if (!wordRes.has(key)) wordRes.set(key, new RegExp('(^|[^a-z0-9])' + escapeRe(p) + '($|[^a-z0-9])', flags))
  return wordRes.get(key)
}
const hits = (t, p) => wordRe(p).test(t)
const whichOf = (t, list) => list.filter(p => hits(t, p))
// A start counts when it is the whole message, or the next character is not a to z, 0 to 9 or '.
const startsWith = (t, list) => list.some(p => t === p || (t.startsWith(p) && /[^a-z0-9']/.test(t[p.length])))
function cutIgnored(t) {
  for (const p of TALK_DATA.ignore_phrases) t = t.replace(wordRe(p, 'g'), '$1 $2')
  return talkNorm(t)
}
const typedWords = s => String(s).trim().split(/\s+/).filter(Boolean)
const capFirst = s => {
  const chars = Array.from(s)
  return chars.length ? chars[0].toUpperCase() + chars.slice(1).join('') : s
}

function buildHit(text) {
  const t = cutIgnored(talkNorm(text)) // the ignore phrases are cut before this step too
  if (startsWith(t, BUILD.skip_starts) || whichOf(t, BUILD.how_phrases).length) return null // a question about how is never a request
  const w = whichOf(t, BUILD.build_words)
  if (w.length) return w[0]
  const pair = BUILD.build_pair
  const doing = whichOf(t, pair.and_one_of)
  if (hits(t, pair.must_have) && doing.length) return pair.must_have + ' + ' + doing[0]
  return null
}
const questionForm = t => t.includes('?') || startsWith(t, OPENING.question_starts)
function strongTopics(t) {
  let ids = TOPIC_IDS.filter(k => whichOf(t, TOPICS[k].key_words.concat(TOPICS[k].misspellings)).length)
  if (whichOf(t, TALK_DATA.chat_apps).length) ids = ids.filter(k => k !== 'svc')
  return ids
}
const anyTerm = t => TERM_IDS.some(k => whichOf(t, TERMS[k].key_words).length)
function needsFor(t, topic, answering) {
  let ns = TOPICS[topic].needs.filter(n => whichOf(t, n.key_words).length && (answering || !n.only_when_answering))
  if (ns.length > 1) ns = ns.filter(n => !n.only_if_no_other_need)
  return ns.map(n => n.id)
}

// Steps 4 and 5: the topic and the need, by key words.
function byCode(text, st) {
  const t = cutIgnored(talkNorm(text))
  const strong = strongTopics(t)
  const r = { topic: null, need: null, term: null, several: null, strong_one: strong.length === 1 }
  if (strong.length > 1) {
    r.several = strong
    return r
  }
  if (strong.length === 1) r.topic = strong[0]
  else {
    if (!st.pending || questionForm(t)) {
      const terms = TERM_IDS.filter(k => whichOf(t, TERMS[k].key_words).length)
      if (terms.length === 1) {
        r.term = terms[0]
        return r
      }
      if (terms.length > 1) {
        r.several = terms
        return r
      }
    }
    if (st.pending) r.topic = st.pending
    else {
      let weak = TOPIC_IDS.filter(k => whichOf(t, TOPICS[k].weak_key_words).length)
      if (whichOf(t, TALK_DATA.chat_apps).length) weak = weak.filter(k => k !== 'svc')
      // such a topic's weak words count only in a question that names Hermes
      if (!(questionForm(t) && whichOf(t, TALK_DATA.hermes_words).length)) weak = weak.filter(k => !TOPICS[k].weak_only_in_question_about_hermes)
      if (weak.length === 1) r.topic = weak[0]
    }
  }
  const topic = r.topic
  if (topic) {
    const answering = st.pending === topic
    const ns = needsFor(t, topic, answering)
    const unsure = whichOf(t, TALK_DATA.unsure_words).length > 0
    if (ns.length === 1) r.need = ns[0]
    else if (!ns.length) {
      if (topic === 'svc' && answering && !strong.length && !unsure && !t.includes('?')) r.need = 'svc1'
      else if (st.found[topic] && !unsure) r.need = st.found[topic]
    }
  }
  return r
}

// Section 4.3: the checks on a model's answer. All must pass, else null and code's own result is used.
function checkModelAnswer(raw) {
  let s = String(raw ?? '').trim()
  const fenced = s.match(/^```[a-z]*\n([\s\S]*)\n```$/)
  if (fenced) s = fenced[1]
  let j
  try {
    j = JSON.parse(s)
  } catch {
    return null
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null
  if (TALK_DATA.model.fields.some(k => typeof j[k] !== 'string')) return null
  if (!TALK_DATA.model.topic_ids.includes(j.topic)) return null
  if (TOPICS[j.topic]) {
    if (j.need && !TOPICS[j.topic].needs.some(n => n.id === j.need)) return null
  } else if (j.need) return null
  if (j.name && !/^[\p{L}'-]{1,30}$/u.test(j.name)) return null
  if (j.work && (typedWords(j.work).length > OPENING.work_max_words || Array.from(j.work).length > OPENING.work_max_chars)) return null
  if (looksLikeKey(j.name) || looksLikeKey(j.work)) return null
  return j
}

/* ---------- the visit ---------- */
// stage: 'name' (Helper asked "What's your name?"), 'work' ("What do you do?"), 'open'.
// pending: the topic whose question is open. asked: topics whose question was asked in this visit.
// found: { topic: need } shown in this visit. lastq: Helper's last line was a question.
// service: the service last named, for the text to paste.
function freshVisit(stage = 'open') {
  return { stage, pending: null, found: {}, asked: [], lastq: false, name: null, work: null, service: null }
}

function codeName(text, strongOnly = false) {
  let m = NAME_STRONG.exec(text)
  if (m) return capFirst(m[1])
  if (strongOnly) return null
  m = NAME_WEAK.exec(text)
  if (m && !OPENING.not_a_name.includes(m[1].toLowerCase())) return capFirst(m[1])
  const ws = text.match(/[^\s,.]+/g) || []
  if (ws.length >= 1 && ws.length <= OPENING.short_answer_max_words && !text.includes('?') && !/\p{Nd}/u.test(text) && !ws.some(w => OPENING.not_a_name.includes(w.toLowerCase())))
    return Array.from(capFirst(ws.join(' '))).slice(0, OPENING.name_max_chars).join('')
  return null
}

// A reply to "What's your name?" that holds a name and a question of its own: [name, the rest], or [null, null].
function nameWithMore(text) {
  const more = OPENING.name_with_more
  let m = NAME_STRONG.exec(text)
  if (!m) {
    m = NAME_WEAK.exec(text)
    if (m) {
      const w = m[1]
      const after = text.slice(m.index + m[0].length).toLowerCase()
      if (!(/^\p{Lu}/u.test(w) && !OPENING.not_a_name.includes(w.toLowerCase()) && more.after_name.some(a => after.startsWith(a)))) m = null
    }
  }
  if (!m) return [null, null]
  const rest = text.slice(m.index + m[0].length).replace(/^(?:[\s,.!:]+|and\b|here\b)+/i, '')
  const rt = cutIgnored(talkNorm(rest))
  if (!rt) return [null, null]
  const hasKey = strongTopics(rt).length > 0 || anyTerm(rt)
  return questionForm(rt) || (hasKey && !startsWith(rt, more.self_starts)) ? [capFirst(m[1]), rest] : [null, null]
}

// The service a "named service" line is about, for its text to paste: the picked answer's own, the
// name for the first key word in the message (the list has the longest first), the message itself
// when it was the answer to "Which service?", or the one named earlier in this visit.
function serviceIn(text, st, answered) {
  const need = TOPICS.svc && TOPICS.svc.needs.find(n => n.id === 'svc1')
  if (!need) return st.service
  const t = cutIgnored(talkNorm(text))
  const word = need.key_words.find(p => hits(t, p))
  if (word && need.service_names && need.service_names[word]) return need.service_names[word]
  if (answered && text.trim()) return Array.from(text.trim()).slice(0, TALK_DATA.limits.service_chars_in_paste).join('')
  return st.service
}

// One typed message, as steps that stop where a model would be asked: the generator hands out the
// message and takes the model's raw answer back, so the same steps run with and without waiting.
function* turnSteps(text, st, hasModel) {
  const out = { calls: 0 }
  const done = (kind, more = {}) => {
    Object.assign(out, { kind }, more)
    st.lastq = kind === 'question' || kind === 'W1'
    if (kind !== 'question' && kind !== 'K1') st.pending = null
    return out
  }
  // 1. a key
  if (looksLikeKey(text)) {
    out.kind = 'K1'
    return out
  }
  // (row 1: step 1 b, a request to Helper to remember something, comes here)
  // 2. a request to do it
  const built = buildHit(text)
  if (built) {
    st.stage = 'open'
    return done('H1', { why: built })
  }
  const t = cutIgnored(talkNorm(text))
  let mj = null
  let asked = false
  // 3. the opening
  if (st.stage === 'name' || st.stage === 'work') {
    let name = null
    let ordinary
    if (st.stage === 'name') {
      const [taken, rest] = nameWithMore(text)
      const both = taken !== null
      if (both) {
        // name and question in one message: take the name, answer the rest (row 1: the name is written here)
        st.name = taken
        out.name_taken = taken
        text = rest
      }
      name = both ? null : codeName(text, true)
      ordinary = both || (!name && (strongTopics(t).length > 0 || anyTerm(t) || questionForm(t)))
      if (!name && !ordinary) name = codeName(text)
    } else ordinary = questionForm(t)
    if (!ordinary) {
      let work = null
      const n = typedWords(text).length
      if (st.stage === 'work' && n >= 1 && n <= OPENING.work_max_words) work = text.trim()
      if (hasModel) {
        out.calls = 1
        asked = true
        mj = checkModelAnswer(yield text)
        if (mj) {
          name = name || mj.name || null
          if (mj.work) work = mj.work
          else if (mj.topic !== 'none' && !name) {
            // the model says it is a question after all
            work = null
            ordinary = true
          }
        }
      }
      if (!ordinary) {
        st.name = name || st.name
        st.work = work
        if (work || st.stage === 'work') {
          st.stage = 'open'
          // (row 1: the name and what the person does are written here)
          return done('F2', { name: st.name, work })
        }
        st.stage = 'work'
        return done('F1', { name: st.name })
      }
    }
    st.stage = 'open'
    st.lastq = false
  }
  // 4 and 5. the topic and the need, by key words
  const code = byCode(text, st)
  out.code = code
  let { topic, need, several } = code
  const answered = !!st.pending && st.pending === topic
  if (code.term) return done('term', { term: code.term })
  // 6. the model, when code did not find both. It is asked once per message.
  if (!(topic && need)) {
    if (hasModel && !asked) {
      out.calls = 1
      mj = checkModelAnswer(yield text)
    }
    if (mj && code.strong_one) {
      // a topic found by a full key word is final; the model may only add a need of that topic
      if (mj.topic === topic && mj.need) need = mj.need
    } else if (mj && mj.topic === 'build') {
      // a request the build words missed. Never for a how-question: then the answer is dropped
      if (!(startsWith(t, BUILD.skip_starts) || whichOf(t, BUILD.how_phrases).length)) {
        st.stage = 'open'
        return done('H1', { why: 'model: build' })
      }
    } else if (mj) {
      several = null
      if (TERMS[mj.topic]) return done('term', { term: mj.topic })
      topic = mj.topic === 'none' ? null : mj.topic
      need = mj.need || null
    }
  }
  // 7. the first that fits
  if (topic && need) {
    // (row 1: an answer typed to Helper's own open question is kept here)
    st.found[topic] = need
    if (topic === 'svc') st.service = serviceIn(text, st, answered && code.need === need)
    return done('row', { topic, need })
  }
  if (several) return done('W1', { buttons: several.slice(0, TALK_DATA.answers.max_at_once) })
  // (row 1: something kept for this topic is used here, and its question is not asked)
  if (topic && !st.lastq && !st.asked.includes(topic)) {
    st.asked.push(topic)
    const r = done('question', { topic })
    st.pending = topic
    return r
  }
  if (topic) return done('plain', { topic })
  return done('N1')
}

// model: null, or a function (text, visit) -> the model's raw answer, used at once (tests, and the
// scripted answers). A model that throws counts as no answer.
function turn(text, st, model = null) {
  const steps = turnSteps(text, st, !!model)
  let step = steps.next()
  while (!step.done) {
    let raw
    try {
      raw = model(step.value, st)
    } catch {
      raw = undefined
    }
    step = steps.next(raw)
  }
  return step.value
}

// ask: an async function (text, visit) -> the model's raw answer, or nothing when the call failed.
// onAsk is told when the wait begins (the page shows the three dots then).
async function turnWithModel(text, st, ask, onAsk = () => {}) {
  const steps = turnSteps(text, st, !!ask)
  let step = steps.next()
  while (!step.done) {
    let raw
    onAsk()
    try {
      raw = await ask(step.value, st)
    } catch {
      raw = undefined
    }
    step = steps.next(raw)
  }
  return step.value
}

// True when a typed message would reach the model step: so the page knows before it waits.
function turnNeedsModel(text, st) {
  const copy = { ...st, found: { ...st.found }, asked: [...st.asked] }
  return !turnSteps(text, copy, true).next().done
}

/* ---------- what the person picks or presses ---------- */
// An answer picked under a topic question: its need's row at once. No key words, no model.
function pick(topic, i, st) {
  const a = TOPICS[topic].question.answers[i]
  st.found[topic] = a.gives
  st.pending = null
  st.lastq = false
  if (a.service) st.service = a.service
  // (row 1: a picked answer to one of the three questions is kept here)
  return { kind: 'row', topic, need: a.gives }
}

// A topic picked under the line after the opening, the no-answer line or the "can do" line.
function pickTopic(topic, st) {
  const held = TOPIC_PICKS[topic]
  if (held && held.holds) {
    st.pending = null
    st.lastq = false
    return { kind: held.line, buttons: held.holds }
  }
  // (row 1: something kept for this topic gives its row here)
  if (!st.asked.includes(topic) && !st.lastq) {
    st.asked.push(topic)
    st.pending = topic
    st.lastq = true
    return { kind: 'question', topic }
  }
  st.pending = null
  st.lastq = false
  return { kind: 'plain', topic }
}

// A button under "Which one do you mean?", with the message that led to it.
function press(choice, text, st) {
  st.lastq = false
  if (TERMS[choice]) return { kind: 'term', term: choice }
  const ns = needsFor(cutIgnored(talkNorm(text)), choice, false)
  if (ns.length !== 1) return { kind: 'plain', topic: choice }
  st.found[choice] = ns[0]
  if (choice === 'svc') st.service = serviceIn(text, st, false)
  return { kind: 'row', topic: choice, need: ns[0] }
}

// Skip, at "What's your name?" or "What do you do?".
function skip(st) {
  if (st.stage !== 'name' && st.stage !== 'work') return null
  st.stage = 'open'
  st.lastq = false
  st.pending = null
  // (row 1: a name given before Skip is written here)
  return { kind: 'F3' }
}

// A button that makes Helper say one more pre-written line.
function sayLine(line, st) {
  st.lastq = false
  st.pending = null
  return { kind: 'extra', line }
}

/* ---------- from a result to what Helper says ---------- */
const fillSlots = (text, slots) => text.replace(/\{(\w+)\}/g, (m, k) => (slots[k] != null ? String(slots[k]) : m))

// Hermes's own screens a "part" button opens (row 3 of the plan): the address, and the name the
// button's label takes. Each address ran in Hermes Desktop v0.23.0 (docs/build/talk-v1-stage1.md).
// Bots has no address: no call opens Hermes's Bots tab. A line that would end in "Open Bots" gets
// no button; in its place Helper says the data's line about where that tab is. A part that is not
// listed here gets nothing.
const PARTS = {
  model: { name: 'Model', to: TALK_DATA.parts.model.navigate },
  messaging: { name: 'Messaging', to: TALK_DATA.parts.messaging.navigate },
  capabilities: { name: 'Capabilities', to: '/capabilities' },
  bots: { name: 'Bots', where: TALK_DATA.parts.bots.where_line }
}

// The lines a button can make Helper say: [id]: { text, source }.
const EXTRA_LINES = (() => {
  const lines = {}
  const take = next => {
    if (next && next.kind === 'line') lines[next.id] = { id: next.id, text: next.text, source: next.source }
  }
  for (const t of TALK_DATA.topics) {
    take(t.plain.next)
    t.needs.forEach(n => take(n.next))
  }
  TALK_DATA.terms.forEach(t => take(t.next))
  return lines
})()

// The button under a line. topic: whose part a plain "Open ..." button means.
function nextFor(next, topic, st) {
  if (!next || next.kind === 'none') return null
  if (next.kind === 'paste') {
    const text = fillSlots(next.paste_text, { service: st.service })
    return /\{\w+\}/.test(text) ? null : { kind: 'paste', label: next.label, text }
  }
  if (next.kind === 'line') return { kind: 'line', label: next.label, line: next.id }
  if (next.kind === 'part') {
    let id = next.part || (topic && TOPICS[topic].part)
    // Helper's own page has no Memory part: the topic names the part to use instead.
    if (!PARTS[id] && topic && TOPICS[topic].part_if_no_memory_part) id = TOPICS[topic].part_if_no_memory_part
    const part = PARTS[id]
    if (!part) return null
    if (part.where) return { kind: 'where', line: part.where.id, text: part.where.text, source: part.where.source }
    return { kind: 'part', label: fillSlots(next.label, { part: part.name }), to: part.to }
  }
  return null
}

const topicPicks = () => ({ kind: 'topics', hint: TALK_DATA.answers.hint_under_topics, items: TALK_DATA.topic_picks.map(p => ({ id: p.gives, label: p.label, topic: p.gives })) })
const labelOf = id => (TOPICS[id] ? TOPICS[id].pick.label : TERMS[id].label)

// The opening line.
function openingLine() {
  return { line: 'OPEN', text: FIXED.OPEN.text, answers: null, next: null, paste: null, source: null }
}

// result: what turn, pick, pickTopic, press, skip or sayLine returned. typed: the person's words
// (for the text to paste under "your own Hermes can").
// Returns { line, text, source, answers, next, paste }.
function lineFor(result, st, typed = '') {
  const said = (line, text, more = {}) => ({ line, text, source: null, answers: null, next: null, paste: null, ...more })
  const named = f => (st.name ? fillSlots(f.text, { name: st.name }) : f.text_no_name || f.text)
  switch (result.kind) {
    case 'K1':
      return said('K1', FIXED.K1.text)
    case 'H1': {
      const request = Array.from(String(typed).trim()).slice(0, TALK_DATA.limits.request_chars_in_paste).join('').replace(/"/g, "'")
      return said('H1', FIXED.H1.text, { paste: fillSlots(FIXED.H1.paste_text, { request }) })
    }
    case 'F1':
      return said('F1', named(FIXED.F1))
    case 'F2':
      return said('F2', named(FIXED.F2), { answers: topicPicks() })
    case 'F3':
      return said('F3', FIXED.F3.text, { answers: topicPicks() })
    case 'N1':
      return said('N1', FIXED.N1.text, { answers: topicPicks() })
    case 'W1':
      return said('W1', FIXED.W1.text, { answers: { kind: 'which', hint: TALK_DATA.answers.hint_under_question, items: result.buttons.map(id => ({ id, label: labelOf(id), which: id })) } })
    case 'term': {
      const t = TERMS[result.term]
      return said('term-' + t.id, t.text, { source: t.source, next: nextFor(t.next, null, st) })
    }
    case 'question': {
      const q = TOPICS[result.topic].question
      return said(q.id, q.text, { answers: { kind: 'question', hint: TALK_DATA.answers.hint_under_question, items: q.answers.map((a, i) => ({ id: `${result.topic}-${i}`, label: a.label, answer: [result.topic, i] })) } })
    }
    case 'plain': {
      const p = TOPICS[result.topic].plain
      return said(p.id, p.text, { source: p.source, next: nextFor(p.next, result.topic, st) })
    }
    case 'row': {
      const n = TOPICS[result.topic].needs.find(x => x.id === result.need)
      return said(n.id, n.text, { source: n.source, next: nextFor(n.next, result.topic, st) })
    }
    case 'extra': {
      const x = EXTRA_LINES[result.line]
      return said(x.id, x.text, { source: x.source })
    }
    default: {
      // a line that shows the topics it holds ("What Hermes can do")
      const f = FIXED[result.kind]
      if (!f) return said('N1', FIXED.N1.text, { answers: topicPicks() })
      return said(result.kind, f.text, { source: f.source || null, answers: { kind: 'pair', hint: TALK_DATA.answers.hint_under_topics, items: (result.buttons || []).map(id => ({ id, label: labelOf(id), topic: id })) } })
    }
  }
}

// The hint in the empty message box. With nothing to pick it is hhdesign's stand-in: the
// data has no words for it.
const REPLY_HINT = 'Reply to Helper'
const hintFor = entry => (entry && entry.answers && entry.answers.items.length ? entry.answers.hint : REPLY_HINT)

// ---- src/look.js ----
// Every class name the page uses, in one table. Each string is copied from Hermes Desktop's own
// source (v0.23.0, apps/desktop/src/...; the file is named above each group), so the page wears
// exactly the classes Hermes's own screens wear and needs no CSS of its own.
// Why one table: Hermes's stylesheet only holds classes its own code uses. A class we invent would
// silently do nothing, so scripts/check-hermes-classes.mjs checks every token here against the built
// Hermes CSS, and tests/plugin-shape.test.mjs fails if page code writes a class string anywhere else.

const K = {
  // ---- page frame (app/page-search-shell.tsx: Capabilities' page shell, header with tabs) ----
  // A row: the left side (tabs, step list, open step), then Helper's strip or window. relative:
  // Helper over a narrow page (layout.js 'over') is placed inside it.
  root: 'relative flex h-full min-h-0 w-full min-w-0 overflow-hidden',
  left: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
  // The header clears Hermes's title-bar band (its window buttons float there), as Capabilities does.
  // No page title: like Capabilities, the sidebar row names the page and the header holds the tabs.
  head: 'flex shrink-0 items-center gap-3 px-6 pb-2 pt-[calc(var(--titlebar-height)+1.5rem)]',
  // Page tabs: Capabilities' text tabs (components/ui/tab-dropdown.tsx ResponsiveTabs row,
  // components/ui/text-tab.tsx TextTab). The colour is split off so the open tab doesn't carry two.
  tabs: 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1',
  textTab:
    'group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-1 text-[length:var(--conversation-caption-font-size)] font-medium transition-colors hover:bg-transparent hover:text-foreground focus-visible:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring',
  textTabIdle: 'text-(--ui-text-tertiary)',
  textTabOn: 'text-foreground',
  textTabLabel: 'underline-offset-4 decoration-current/25 group-hover/text-tab:underline',
  textTabLabelOn: 'underline-offset-4 decoration-current/25 underline',
  body: 'flex min-h-0 flex-1',

  // ---- step list (app/master-detail.tsx ListColumn + CapRow; app/overlays/panel.tsx) ----
  rail: 'flex min-h-0 shrink-0 flex-col p-2',
  railScroll: 'min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]',
  sectionLabel: 'text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground/50',
  sectionLabelPad: 'px-2 pb-1.5 pt-1',
  sectionLabelGap: 'px-2 pb-1.5 pt-4',
  rowList: 'flex flex-col gap-0.5',
  row: 'group/row row-hover flex h-11 w-full shrink-0 items-center rounded-md hover:text-foreground',
  rowActive: 'bg-(--ui-row-active-background) text-foreground',
  rowIdle: 'text-(--ui-text-secondary)',
  rowButton: 'flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md pl-2 pr-1.5 text-left',
  // Narrow window: the step list shows its numbers only, centred in the row
  rowButtonNumbers: 'flex h-full min-w-0 flex-1 cursor-pointer items-center justify-center rounded-md',
  rowText: 'min-w-0 flex-1',
  rowTitle: 'block truncate text-[0.78rem] font-medium text-foreground/85',
  rowTitleOff: 'block truncate text-[0.78rem] font-normal text-muted-foreground/60',
  rowSub: 'flex min-w-0 items-center gap-1 text-[0.62rem] text-muted-foreground/50',
  truncate: 'truncate',
  // Step number: a plain numeral, no key-cap box (hhdesign nice-to-have 8; Settings nav rows have
  // no boxed numbers). The open step's numeral is in the main text colour.
  rowNumber: 'w-3 shrink-0 text-center text-[0.75rem] tabular-nums text-(--ui-text-tertiary)',
  rowNumberOn: 'w-3 shrink-0 text-center text-[0.75rem] tabular-nums text-foreground',
  // DetailColumn footer caption (app/master-detail.tsx)
  railFoot: 'shrink-0 px-2 pb-1 pt-3 text-[0.65rem] text-muted-foreground/50',

  // ---- open step (app/master-detail.tsx DetailColumn; app/capabilities/primitives.tsx DetailHeader) ----
  detail: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
  detailScroll: 'min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]',
  // One fixed left text edge (hhdesign nice-to-have 7): left-aligned with fixed padding, never
  // re-centred when the helper opens, hides or closes; the same 24 px edge as the header's tabs.
  detailInner: 'max-w-2xl space-y-5 px-6 py-4',
  // Your setup is a card grid, so it takes the wider of Hermes's reading widths
  detailInnerWide: 'max-w-3xl space-y-5 px-6 py-4',
  stepTitle: 'min-w-0 text-[0.9375rem] font-semibold tracking-tight',
  // Chat text (plugins/hermes-bots/group-room-ui.tsx RoomMessage body)
  prose: 'mt-1 text-pretty text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground',
  // Settings row title + caption (app/settings/primitives.tsx ListRow). One column; layout.js adds
  // the two columns when the open step is wide enough (the window's sm: breakpoint can't see the
  // step list and helper beside it).
  pairGrid: 'grid gap-5',
  twoColumns: 'grid-cols-2',
  threeColumns: 'grid-cols-3',
  pairTitle: 'text-[length:var(--conversation-text-font-size)] font-medium text-foreground',
  caption: 'mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)',
  // Settings SectionHeading (app/settings/primitives.tsx)
  question: 'mb-2.5 flex items-center gap-2 pt-2 text-[length:var(--conversation-text-font-size)] font-medium',
  // Choice cards: Hermes's first-run setup chooser (components/ui/chip.tsx, card variant)
  choices: 'grid gap-2',
  choice: 'flex min-w-0 items-center gap-2.5 rounded-[6px] px-3 py-2.5 text-left text-[13px] border text-foreground transition-colors',
  choiceOn: 'border-primary bg-primary/15',
  choiceOff: 'border-transparent bg-muted hover:bg-accent/60',
  choiceText: 'min-w-0 flex-1',
  choiceLabel: 'block',
  choiceSub: 'block text-xs text-muted-foreground',
  // "Fits your goal" on an answer card: Hermes's member badge (plugins/hermes-bots/group-room-ui.tsx)
  fitTag: 'shrink-0 rounded-sm bg-(--ui-accent)/15 px-1 text-[0.625rem] font-medium text-(--ui-accent)',
  // The step's facts: a plain list, each fact in the chat's text size with its source tag below
  factList: 'space-y-4',
  fact: 'flex min-w-0 flex-col items-start gap-1.5',
  factText: 'text-pretty text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground',
  // The two-column comparison (steps 2 and 3): each side with its own source tag
  pairSide: 'flex min-w-0 flex-col items-start gap-1.5',
  // Source tags: app/master-detail.tsx ToolChip, in the normal sans like Capabilities' metadata
  // chips ("Built In", "v1.0.1"); mono in Hermes means code, paths and commands.
  chips: 'flex flex-wrap items-center gap-1.5',
  chipsLabel: 'text-xs text-muted-foreground',
  chip: 'rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5 text-[0.65rem] text-(--ui-text-tertiary)',
  // The same tag as a link to its docs page (opened in the person's browser through ctx.os)
  chipLink:
    'wrap-anywhere rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5 text-left text-[0.65rem] text-(--ui-text-tertiary) transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring',
  // Video slot: a quiet scaffold line (components/chat/scaffold-row.tsx)
  scaffold: 'flex min-w-0 items-center gap-1.5 text-[length:var(--conversation-tool-font-size)] leading-(--conversation-line-height) text-(--conversation-scaffold-text)',
  scaffoldGlyph: 'grid size-3.5 shrink-0 place-items-center',
  actions: 'flex flex-wrap items-center gap-2',

  // ---- Helper's conversation window: its own classes are the T table below (src/talk.css).
  // From Hermes it wears only these ----
  // The whole line for screen readers while the eye sees it word by word (src/reveal.js): Hermes's
  // own visually-hidden class (components/ui/dialog.tsx and others).
  srOnly: 'sr-only',
  // Composer: plugins/hermes-bots/group-room-ui.tsx RoomComposer (rounded surface, round send
  // button), on one row like Hermes's chat composer.
  composerSurface: 'relative isolate rounded-2xl',
  composerRow: 'flex items-end gap-x-(--composer-control-gap) px-(--composer-surface-pad-x) py-(--composer-surface-pad-y)',
  composerInputCell: 'min-w-0 flex-1',
  // One line that grows as you type, no resize grip: CLARIFY_TEXTAREA_CLASS
  // (components/assistant-ui/clarify/core/shell.tsx) on the room composer's input.
  composerInput:
    'field-sizing-content max-h-40 min-h-0 resize-none !border-transparent !bg-transparent !shadow-none px-1 py-1 text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) placeholder:text-(--ui-text-tertiary)',
  composerSend: 'shrink-0',

  // ---- Helper's strip: a thin full-height strip at the page's right edge in a narrow window, its
  // label written vertically: components/ui/pane-tab.tsx TAB_VERTICAL and the collapsed kanban
  // column (plugins/kanban/board.tsx), on Helper's fill. It folds Helper away and brings it back ----
  strip:
    'flex h-full w-7 shrink-0 cursor-pointer flex-col items-center gap-2 bg-(--ui-sidebar-surface-background) py-3 text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring',
  stripLabel: 'text-[0.6875rem] font-medium uppercase tracking-wide text-(--ui-text-tertiary) [writing-mode:vertical-rl]',

  // ---- Your setup ----
  // Bot picker: Capabilities' own profile scope selector (app/capabilities/scope-selector.tsx)
  botPicker: 'flex min-w-0 items-center gap-2',
  botPickerLabel: 'text-[0.7rem] font-medium text-(--ui-text-tertiary)',
  botPickerTrigger: 'text-xs h-7 w-56',
  // Card grid: Connectors' directory grid (app/capabilities/connectors/connectors-directory.tsx Group).
  // One column; layout.js adds the second when the column is wide enough (not the window's sm:).
  cardGrid: 'grid gap-3',
  cardWide: 'col-span-full',
  // One card: Connectors' row card (app/capabilities/connectors/connector-row-card.tsx), stacked
  card: 'flex min-w-0 flex-col gap-1.5 rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-bg-elevated) p-3',
  // Title on the left (it wraps), state on the right, so the state sits in the same place on every card
  cardHead: 'flex min-w-0 items-start gap-2',
  cardTitle: 'min-w-0 flex-1 text-[0.8125rem] font-semibold text-(--ui-text-primary)',
  // The card's state lane: a 5 px dot and the word (CardLane in the same file)
  cardState: 'flex shrink-0 items-center gap-1.5 text-[0.6875rem] text-(--ui-text-secondary)',
  dot: 'size-[5px] shrink-0 rounded-full',
  dotWorks: 'bg-(--ui-green)',
  dotFix: 'bg-(--ui-red)',
  dotCant: 'bg-(--ui-yellow)',
  dotNeutral: 'bg-(--ui-text-quaternary)',
  // The card's lines: SecondLine in the same file, without the two-line clamp
  cardText: 'text-[0.72rem] leading-snug text-(--ui-text-secondary)',
  // Model name or count: the composer model label's tone, in normal letters (not mono: Hermes keeps
  // mono for code, paths and commands)
  cardValue: 'min-w-0 truncate text-[0.6875rem] text-(--ui-text-secondary)',
  // "Passes when": Connectors' fact line (CardLane)
  cardPasses: 'text-[0.6875rem] text-(--ui-text-tertiary)',
  cardActions: 'mt-1 flex flex-wrap items-center gap-1.5',
  cardStack: 'flex min-w-0 flex-col gap-1',
  // Text to paste: the source-tag chip's surface (app/master-detail.tsx ToolChip), as a block
  cardPaste: 'flex min-w-0 items-center gap-1.5 rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5',
  cardPasteText: 'wrap-anywhere min-w-0 flex-1 font-mono text-[0.65rem] text-(--ui-text-tertiary)',
  cardList: 'list-decimal space-y-1 pl-4 text-[0.72rem] leading-snug text-(--ui-text-secondary)',
  pageActions: 'flex flex-wrap items-center gap-2 pt-1'
}

// Joins class names, skipping empty ones. Only K and T values go in.
function cx(...names) {
  return names.filter(Boolean).join(' ')
}

// Helper's conversation window is the one part with a style sheet of our own (src/talk.css, from
// hhdesign's design/talk-r3/talk.css): its answers need hover, pressed and keyboard-ring looks
// that Hermes's classes do not have for these shapes. Every class of that sheet, in one table;
// each starts with hh-. tests/talk-css.test.mjs checks that every name here has a rule in the
// sheet and that the sheet has no rule nothing uses.
const T = {
  win: 'hh-win',
  winTight: 'hh-narrow',
  winSmall: 'hh-small',
  // over a narrow page instead of beside it
  winOver: 'hh-over',
  // the conversation so far: Helper's older lines as small bubbles, the person's messages
  conv: 'hh-conv',
  convIn: 'hh-conv-in',
  old: 'hh-old',
  oldLink: 'hh-old-link',
  me: 'hh-me',
  // Helper's newest sentence
  bubble: 'hh-bubble',
  line: 'hh-line',
  inBubble: 'hh-in',
  inBubbleColumn: 'hh-col',
  button: 'hh-btn',
  // in place of a button: where to find a screen that no button can open
  where: 'hh-where',
  dots: 'hh-dots',
  dotOn: 'hh-on',
  // under the bubble: the piece between bubble and character, the character, the answers to pick
  under: 'hh-under',
  linkCell: 'hh-linkcell',
  tail: 'hh-tail-short',
  tailFill: 'hh-tail-fill',
  tailEdge: 'hh-tail-edge',
  charSpace: 'hh-charspace',
  character: 'hh-char',
  answers: 'hh-answers',
  answer: 'hh-answer',
  // held room: there, not seen yet
  wait: 'hh-wait',
  skip: 'hh-link hh-skip',
  grip: 'hh-grip',
  gripPill: 'hh-grip-pill'
}

// Every codicon the plugin names (sidebar row and page). scripts/check-hermes-classes.mjs checks
// they exist in the codicon font Hermes ships; a test checks the code names no others.
const ICONS = ['compass', 'chevron-left', 'chevron-right', 'chevron-down', 'arrow-right', 'arrow-up', 'play-circle']
// Hermes's look has one primary button per screen (hhdesign fix 6); every other button of
// ours is secondary or ghost. tests/page-render.test.mjs counts them per screen.

// ---- src/talk-css.js ----
// Generated by scripts/build.mjs from src/talk.css (the style sheet of Helper's conversation window).
// Edit the CSS, then build; tests/talk-css.test.mjs checks it.
const TALK_CSS = ".hh-win{display:flex;flex-direction:column;padding:16px var(--hh-pad,20px) 18px;background:var(--ui-sidebar-surface-background);--hh-char:168px;--hh-k:.84;--hh-pad:20px}\n.hh-win.hh-narrow{--hh-pad:14px}\n.hh-win.hh-small{--hh-char:132px;--hh-k:.66}\n.hh-conv{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;gap:9px;overflow:hidden}\n.hh-conv>*{flex:none}\n.hh-old{align-self:flex-start;max-width:86%;padding:6px 11px;border-radius:10px;background:var(--ui-bg-elevated);border:1px solid var(--ui-stroke-tertiary);font-size:13.5px;line-height:19px;color:var(--ui-text-secondary)}\n.hh-old-link{display:flex;align-items:center;gap:5px;margin-top:3px;font-size:12.5px;line-height:17px;font-weight:500;color:var(--ui-text-secondary);text-decoration:underline;text-decoration-color:var(--ui-text-quaternary);text-underline-offset:3px;cursor:pointer}\n.hh-old-link .codicon{font-size:12px}\n.hh-me{align-self:flex-end;max-width:82%;padding:6px 11px;border-radius:12px;background:var(--ui-chat-bubble-background);border:1px solid var(--dt-user-bubble-border);font-size:13.5px;line-height:19px;color:var(--ui-text-primary)}\n.hh-link{color:inherit;text-decoration:underline;text-decoration-color:var(--ui-text-quaternary);text-underline-offset:3px;cursor:pointer}\n.hh-link:hover{text-decoration-color:currentColor}\n.hh-bubble{position:relative;align-self:flex-start;max-width:100%;margin-top:5px;padding:11px 15px 12px;border-radius:12px;background:var(--ui-bg-elevated);border:1px solid var(--ui-stroke-primary)}\n.hh-line{font-size:16px;line-height:23px;font-weight:500;text-wrap:pretty;color:var(--ui-text-primary)}\n.hh-in{margin-top:10px;padding-top:10px;border-top:1px solid var(--ui-stroke-tertiary);display:flex}\n.hh-bubble.hh-dots{display:flex;gap:5px;padding:12px 14px;margin-left:calc(var(--hh-char)*.5 - 8px)}\n.hh-dots i{width:6px;height:6px;border-radius:50%;background:var(--ui-text-quaternary)}\n.hh-dots i.hh-on{background:var(--ui-text-secondary)}\n.hh-btn{height:28px;padding:0 10px 0 12px;border-radius:6px;display:inline-flex;align-items:center;gap:7px;flex:none;font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer;background:var(--ui-bg-tertiary);color:var(--ui-text-primary);border:1px solid var(--ui-stroke-secondary)}\n.hh-btn .codicon{font-size:13px;color:var(--ui-text-secondary)}\n.hh-btn:hover{background:var(--ui-control-hover-background);border-color:var(--ui-stroke-primary)}\n.hh-btn:active{background:var(--ui-control-active-background);border-color:var(--ui-stroke-primary);filter:brightness(.8)}\n.hh-under{position:relative;flex:none;display:flex;min-height:calc(108px*var(--hh-k) + 16px)}\n.hh-charspace{flex:none;width:calc(var(--hh-char) + 12px)}\n.hh-small .hh-charspace{width:calc(var(--hh-char) + 8px)}\n.hh-tail-fill{fill:var(--ui-bg-elevated)}\n.hh-tail-edge{fill:none;stroke:var(--ui-stroke-primary);stroke-width:1px;stroke-linejoin:round;stroke-linecap:round}\n.hh-answers{flex:1;min-width:0;display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;align-content:flex-end;padding:8px 0 9px}\n.hh-answer{min-height:29px;max-width:100%;padding:4px 12px;border-radius:12px;display:inline-flex;align-items:center;flex:none;font-size:13.5px;line-height:19px;text-align:left;cursor:pointer;color:var(--ui-text-primary);background:var(--ui-chat-bubble-background);border:1px solid var(--ui-stroke-primary)}\n.hh-answer:hover{background:linear-gradient(var(--ui-control-hover-background),var(--ui-control-hover-background)),var(--ui-chat-bubble-background);border-color:var(--ui-text-quaternary)}\n.hh-answer:active{background:linear-gradient(var(--ui-control-active-background),var(--ui-control-active-background)),var(--ui-chat-bubble-background);border-color:var(--ui-text-tertiary);filter:brightness(.8)}\n.hh-answer:focus-visible,.hh-btn:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}\n.hh-win{position:relative;flex:none;box-sizing:border-box;height:100%;min-height:0;--hh-inset:0px}\n.hh-win.hh-over{position:absolute;top:0;bottom:0;height:auto;z-index:20;border-left:1px solid var(--ui-stroke-tertiary)}\n.hh-conv{flex-direction:column-reverse;justify-content:flex-start;overflow:hidden auto;overscroll-behavior:contain}\n.hh-conv-in{display:flex;flex-direction:column;gap:9px}\n.hh-conv-in>*{flex:none}\n.hh-me{overflow-wrap:anywhere}\n.hh-bubble{flex:none;margin-top:14px;min-width:calc(var(--hh-inset) + var(--hh-char)*.5 + 32px)}\n.hh-bubble.hh-dots{min-width:0;margin-left:calc(var(--hh-inset) + var(--hh-char)*.5 - 8px)}\n.hh-wait{visibility:hidden}\n.hh-in.hh-col{flex-direction:column;align-items:flex-start;gap:8px}\n.hh-where{font-size:13px;line-height:19px;text-wrap:pretty;color:var(--ui-text-secondary)}\n.hh-old .hh-where{margin-top:3px;font-size:12.5px;line-height:17px;color:var(--ui-text-tertiary)}\n.hh-linkcell{position:absolute;z-index:2;left:calc(var(--hh-inset) + var(--hh-char)*.5 - 4px);top:-1px;width:24px;height:calc(100% + 1px - 108px*var(--hh-k));pointer-events:none}\n.hh-tail-short{display:block;width:24px;height:17px;overflow:visible}\n.hh-char{position:absolute;left:var(--hh-inset);bottom:calc(-8px*var(--hh-k));z-index:1;pointer-events:none}\n.hh-skip{flex:none;align-self:center;padding:0 2px;font-size:12.5px;line-height:17px;color:var(--ui-text-tertiary)}\n.hh-grip{position:absolute;top:0;bottom:0;left:-7px;width:14px;display:flex;align-items:center;justify-content:center;cursor:col-resize;z-index:3;touch-action:none}\n.hh-grip::before{content:\"\";position:absolute;top:0;bottom:0;left:7px;width:1px;background:var(--ui-stroke-tertiary)}\n.hh-grip-pill{position:relative;width:5px;height:48px;border-radius:3px;background:var(--ui-text-quaternary)}\n.hh-old-link:focus-visible,.hh-link:focus-visible,.hh-grip:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}"

// ---- src/layout.js ----
// How the page fits its window (talk v1: rows 4 and 5 of docs/build/talk-v1-plan.md).
// Pure rules, no React: page.js measures our own page element (a ResizeObserver on our own
// markup, nothing of Hermes's) and asks layoutFor() what to show.
// Helper's conversation window is a column on the right, HELPER_PX wide; its left edge can be
// dragged between HELPER_MIN_PX and HELPER_MAX_PX and the width is remembered. The open step (or
// the Your setup column) must stay at least MIN_MAIN_PX wide. When the page gets narrow, in order:
//   1. the step list shrinks to its numbers;
//   2. Helper's window narrows, down to HELPER_MIN_PX;
//   3. under OVER_UNDER_PX of page Helper lies over the page, with the "Helper" strip at the
//      page's right edge; the strip folds it away and brings it back. It starts open.
// Folding Helper away is this one input, `folded`. Today only the strip sets it, and only in a
// narrow window; a way to put Helper away in a wide window would set the same input.
// The two-column facts (and the answer cards) stack into one column under TWO_COLUMNS_PX; the Your
// setup cards do the same under CARD_COLUMNS_PX.

const RAIL_PX = 256
const RAIL_NUMBERS_PX = 48
const STRIP_PX = 28
const MIN_MAIN_PX = 320
const HELPER_PX = 460
const HELPER_MIN_PX = 360
const HELPER_MAX_PX = 600
// One threshold for both tabs, so changing the tab never moves Helper between its column and
// over the page: the numbers-only step list, Helper at its narrowest, the open step's least.
const OVER_UNDER_PX = RAIL_NUMBERS_PX + HELPER_MIN_PX + MIN_MAIN_PX
// The character: 168 px wide; 132 px when Helper's window is under 420 px wide or the page is
// under 600 px high (design/talk-r3/notes.md, section 7).
const CHARACTER_PX = 168
const CHARACTER_SMALL_PX = 132
const SMALL_UNDER_WIDE_PX = 420
const SMALL_UNDER_HIGH_PX = 600
// The open step's own padding is 24 px a side, so 520 leaves two facts of about 226 px each.
const TWO_COLUMNS_PX = 520
// Two cards of about 270 px each, after the padding and the 12 px gap.
const CARD_COLUMNS_PX = 600

// The width the person dragged Helper's window to, as remembered: a whole number of px inside
// the limits. Anything that is not a number gives the default.
function clampHelperWidth(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return HELPER_PX
  return Math.min(HELPER_MAX_PX, Math.max(HELPER_MIN_PX, Math.round(value)))
}

// width, height: our page's measured size in px (0 or missing = not measured yet: lay out as wide
// and high). tab: 'setup' | 'yours'. helperWidth: the remembered width. folded: Helper is put away.
// Returns:
//   helper:   'column' | 'over' | 'strip'   beside the page, over the page, or folded to its strip
//   helperPx: the width Helper's window is drawn at
//   narrow:   the page is too narrow for both sides (Helper lies over the page, the strip shows)
//   grip:     the edge to drag is shown (only beside the page)
//   rail:     'full' | 'numbers' | 'none'   the step list (none on Your setup)
//   main:     the open step's (or Your setup's) width in px, Infinity when not measured
//   columns: 1 | 2   facts and choices side by side;   cardColumns: 1 | 2
//   characterPx, small (the 132 px character), tight (the 14 px side padding, under 420 px wide)
function layoutFor({ width, height, tab, helperWidth, folded = false }) {
  const w = typeof width === 'number' && width > 0 ? width : Infinity
  const h = typeof height === 'number' && height > 0 ? height : Infinity
  const want = clampHelperWidth(helperWidth)
  const hasRail = tab === 'setup'
  const narrow = w < OVER_UNDER_PX
  const helper = folded ? 'strip' : narrow ? 'over' : 'column'

  let rail = hasRail ? 'full' : 'none'
  let railSpace = hasRail ? RAIL_PX : 0
  let helperPx = want
  if (helper === 'column') {
    if (hasRail && w - RAIL_PX - want < MIN_MAIN_PX) {
      rail = 'numbers'
      railSpace = RAIL_NUMBERS_PX
    }
    helperPx = Math.min(want, Math.max(HELPER_MIN_PX, w - railSpace - MIN_MAIN_PX))
  } else {
    if (hasRail && w - RAIL_PX - STRIP_PX < MIN_MAIN_PX) {
      rail = 'numbers'
      railSpace = RAIL_NUMBERS_PX
    }
    // Over the page it leaves the strip free, so the strip can always be pressed.
    helperPx = narrow ? Math.min(want, w - STRIP_PX) : want
  }

  const main = w - railSpace - (helper === 'column' ? helperPx : STRIP_PX)
  const tight = helperPx < SMALL_UNDER_WIDE_PX
  const small = tight || h < SMALL_UNDER_HIGH_PX
  return {
    helper,
    helperPx,
    narrow,
    grip: helper === 'column',
    rail,
    main,
    columns: main >= TWO_COLUMNS_PX ? 2 : 1,
    cardColumns: main >= CARD_COLUMNS_PX ? 2 : 1,
    characterPx: small ? CHARACTER_SMALL_PX : CHARACTER_PX,
    small,
    tight
  }
}

// ---- src/expressions.js ----
// The character's numbers and rules, as plain code (no React): variation 2 of hhdesign's
// drawings (design/face-r2). Every number is from the "Variation 2" table in the team's
// design/face-r2/numbers.md, in drawing units (the drawing is 200 units wide; the message box's
// top edge is at y = 140). tests/expressions.test.mjs compares this file with that table.

// The fixed parts. `above` is the area the body may show in: everything over the edge.
// `view` is the part of the 200 x 200 drawing the page draws: from y 14 down to just under the
// finger ends at 147.
const FACE = {
  edge: 140,
  eyes: [{ cx: 78, cy: 84 }, { cx: 122, cy: 84 }],
  rx: 22,
  ry: 24,
  pupil: 9.5,
  hands: [34, 166],
  fingerWide: 11.5,
  fingerApart: 13,
  fingerOver: 7,
  above: { x: -100, y: -200, width: 400, height: 340 },
  view: { x: 0, y: 14, width: 200, height: 134 }
}

// One row of the table per expression. rise: the body moves up by this much (minus = down).
// eyeHeight: 2 x ry. leftEyeUp: the left eye sits higher by this much. pupilR: the pupil's radius.
// pupil: the pupil's place from its eye's centre when nothing is followed. fingers: heights above
// the edge, outer finger first, the same for both hands.
const EXPRESSIONS = {
  resting: { rise: 0, eyeHeight: 48, leftEyeUp: 0, pupilR: 9.5, pupil: [0, 0], mouth: 'M80 119C89 127 111 127 120 119C111 141 89 141 80 119Z', fingers: [22, 30, 33, 27] },
  busy: { rise: -3, eyeHeight: 24, leftEyeUp: 0, pupilR: 8.64, pupil: [0, 0.29], mouth: 'M84 119C84 114.5 116 114.5 116 119C116 123.5 84 123.5 84 119Z', fingers: [22, 16.5, 26.4, 17.55] },
  asking: { rise: 10, eyeHeight: 56.64, leftEyeUp: 7, pupilR: 9.5, pupil: [1.43, 3.96], mouth: 'M91 119C91 106 109 106 109 119C109 132 91 132 91 119Z', fingers: [22, 30, 33, 27] },
  talking: { rise: 6, eyeHeight: 48, leftEyeUp: 0, pupilR: 9.5, pupil: [5.23, 0], mouth: 'M80 119C82 116 118 116 120 119C118 149 82 149 80 119Z', fingers: [22, 30, 33, 27] }
}
const EXPRESSION_NAMES = Object.keys(EXPRESSIONS)

// Timing. Changes between expressions glide for GLIDE_MS; the blink's 4 s is the Builder's first
// number, the rest are hhdesign's (build.js).
const GLIDE_MS = 300
const BLINK_MS = 300
const BLINK_EVERY_MS = 4000
const TALK_MS = 1600
const DRUM_MS = 400
// Rising from behind the message box when the helper opens: the fingers grow over the edge
// first, then the body comes up with a small overshoot (hhdesign's "back" curve, here as the CSS
// curve that draws the same shape). hidden: how far down the body starts, fully behind the edge.
// wordsWaitMs: how long Helper's words wait when the helper opens: the rising and 120 ms more.
// Seen in the real app: a change of expression that lands in the frame or two after the
// rising's last one is not glided (the body was in its talking place at once, 4 px up).
const RISE = { ms: 700, wordsWaitMs: 820, fingersMs: 280, bodyDelayMs: 210, bodyMs: 490, hidden: 101.2, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }

const round2 = n => Math.round(n * 100) / 100

// Finger i (0 = the outer one) of a hand (0 = left, 1 = right), h units tall above the edge: a
// rounded bar that ends 7 units below the edge, so its bottom never moves.
function fingerRect(hand, i, h) {
  const out = hand === 0 ? -1 : 1
  const centre = FACE.hands[hand] + out * (1.5 - i) * FACE.fingerApart
  return {
    x: round2(centre - FACE.fingerWide / 2),
    y: round2(FACE.edge - h),
    width: FACE.fingerWide,
    height: round2(h + FACE.fingerOver),
    rx: FACE.fingerWide / 2
  }
}

// An eye in an expression: the same ellipse, lifted (the left one, when asking) and squashed or
// stretched around its own centre. eye: 0 = left, 1 = right.
function eyeTransform(name, eye) {
  const x = EXPRESSIONS[name]
  const up = eye === 0 ? x.leftEyeUp : 0
  return `translateY(${-up}px) scaleY(${Math.round((x.eyeHeight / (2 * FACE.ry)) * 10000) / 10000})`
}

// A blink closes the eye to 8% of its height (hhdesign's blink) and the pupil's hole to nothing.
// It changes the ellipse's own ry and the hole's own path, never `transform`: see src/character.js.
const BLINK_SHUT = 0.08
const eyeRy = (shut = false) => `${round2(FACE.ry * (shut ? BLINK_SHUT : 1))}px`

const pupilScale = name => Math.round((EXPRESSIONS[name].pupilR / FACE.pupil) * 10000) / 10000

// The pupil as a real hole: one path that fills a huge area and leaves a round gap of the pupil's
// size at the eye's centre (drawn with the even-odd rule, used as an alpha mask on the eye).
// size: 1 = the pupil, 0 = closed (a blink). The path has the same commands at every size, so
// it can glide from one to another.
function pupilHole(eye, size = 1) {
  const r = round2(FACE.pupil * size)
  return `M-5000 -5000H5000V5000H-5000Z M${round2(eye.cx + r)} ${eye.cy}A${r} ${r} 0 1 0 ${round2(eye.cx - r)} ${eye.cy}A${r} ${r} 0 1 0 ${round2(eye.cx + r)} ${eye.cy}Z`
}

// The mouth is the same kind of path in every expression (M, two C curves, Z), so it can glide
// from one to the next. w: half its width; u and l: how far its upper and lower curve reach.
function mouthPath(w, u, l, k) {
  const m = 100
  const y = 119
  return `M${round2(m - w)} ${y}C${round2(m - w * k)} ${round2(y + u)} ${round2(m + w * k)} ${round2(y + u)} ${round2(m + w)} ${y}C${round2(m + w * k)} ${round2(y + l)} ${round2(m - w * k)} ${round2(y + l)} ${round2(m - w)} ${y}Z`
}

// Talking: how far the mouth is open at each tenth of a second of hhdesign's 1.6 s loop.
const TALK = [0.2, 1, 0.5, 0.9, 0.15, 0.8, 1, 0.3, 0.7, 0.1, 0.9, 0.4, 1, 0.2, 0.8, 0.5]
// The loop's mouths, closed with its first one again so it repeats without a jump.
function talkFrames() {
  return [...TALK, TALK[0]].map(open => mouthPath(17 + 3 * open, -1 - 2 * open, 7 + 23 * open, 0.9))
}

// Drumming: finger i's heights over one 0.4 s loop (nine frames, the last equal to the first).
// Each finger dips to 55% of its resting height, a third of a beat after the one before it.
function drumHeights(i) {
  const rest = EXPRESSIONS.resting.fingers[i]
  const heights = []
  for (let j = 0; j < 8; j++) {
    const t = (j * DRUM_MS) / 8 / 1000
    heights.push(round2(rest * (0.55 + 0.45 * Math.abs(Math.sin(Math.PI * (t * 2.5 - i * 0.33))))))
  }
  return [...heights, heights[0]]
}

// Which expression shows; the first that is true wins. Talking is first so the mouth always
// moves while words appear.
//   revealing: one of Helper's lines is appearing word by word right now
//   busy:      a model call is running
//   question:  Helper's newest line ends with a question mark and is fully shown
function expressionFor({ revealing = false, busy = false, question = false } = {}) {
  if (revealing) return 'talking'
  if (busy) return 'busy'
  if (question) return 'asking'
  return 'resting'
}

function asksQuestion(text) {
  return typeof text === 'string' && text.trim().endsWith('?')
}

// The busy value the page holds: a count of model calls that are running. begin() raises it and
// returns the function that lowers it again (calling that twice lowers it once). Today the "The
// model answers" card raises it; the helper's own model call will use the same value.
function makeBusy() {
  let running = 0
  const heard = new Set()
  const tell = () => heard.forEach(fn => fn(running))
  return {
    count: () => running,
    begin() {
      running++
      tell()
      let open = true
      return () => {
        if (!open) return
        open = false
        running--
        tell()
      }
    },
    subscribe(fn) {
      heard.add(fn)
      return () => heard.delete(fn)
    }
  }
}

// ---- src/eyes.js ----
// The eyes: where each pupil goes, and when the eyes look back at the person. Plain code, no
// React. hhtech's recommended way (docs/answers/hhtech-face-cursor.md): the page's own outer box
// hands over the cursor's position, which is only stored (with the time); the pupils are then
// placed at most once per drawn frame, and the "3 seconds without a move" check is one timer that
// is armed once and looks at the stored time when it comes due, not a timer per move. Nothing here listens on the Hermes window, so the eyes follow only while the
// cursor is over our own page.

// How far a pupil travels from its eye's centre, in drawing units (hhdesign's lookAt, variation
// 2): at most 9.5 sideways and 10.5 up or down, which is 6.7 and 7.4 px at 140 px wide. Full
// travel from 45 units away (32 px); closer than that it shrinks, so the pupil does not jump when
// the cursor crosses the eye.
const EYE_TRAVEL = { x: 9.5, y: 10.5, fullAt: 45 }
const FOLLOW_MS = 90
const LEAVE_HOLD_MS = 330
const IDLE_MS = 3000

// eye and target: points on screen in px. scale: px per drawing unit. Returns drawing units.
function pupilOffset(eye, target, scale) {
  const vx = target.x - eye.x
  const vy = target.y - eye.y
  const d = Math.hypot(vx, vy)
  if (!d) return { x: 0, y: 0 }
  const reach = Math.min(1, d / (EYE_TRAVEL.fullAt * scale))
  return { x: (vx / d) * reach * EYE_TRAVEL.x, y: (vy / d) * reach * EYE_TRAVEL.y }
}

const px = n => `${Math.round(n * 100) / 100}px`
const nextFrame = fn => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : null)
const dropFrame = id => {
  if (id !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id)
}

// One tracker per open page. setTimeout is the host's (ctx.setTimeout: it returns the function
// that cancels it). Without one the eyes never follow: they only sit where the expression puts
// them (a plain drawing).
//   attach({ svg, eyes: [left, right], pupils: [left, right], blink })   the drawn pieces
//   setRest([[x, y], [x, y]])   where the pupils sit with nothing to follow (the table's place)
//   setFollowing(on)            off while busy and under reduce motion
//   setGlide(on)                off under reduce motion: everything lands at once
//   pointerMove(x, y) / pointerLeave() / focus(element) / blur() / scroll()   from the page's box
function makeEyes({ setTimeout: later = null, frame = nextFrame, cancelFrame = dropFrame, now = () => Date.now() } = {}) {
  let parts = null
  let rest = [[0, 0], [0, 0]]
  let following = !!later
  let glide = true
  let aim = null // null: looking at the person; { x, y }: a point; { el }: a focused element
  let waiting = null // the frame that will place the pupils
  let framed = false
  let stopLeave = null
  let stopIdle = null
  let stopBlink = null
  let stopped = false
  let aimedAt = 0 // when the eyes last got something to look at

  const cancel = stop => {
    if (stop) stop()
    return null
  }
  const clearTimers = () => {
    stopLeave = cancel(stopLeave)
    stopIdle = cancel(stopIdle)
    stopBlink = cancel(stopBlink)
  }
  const clearFrame = () => {
    if (framed) cancelFrame(waiting)
    framed = false
    waiting = null
  }

  function put(i, x, y, ms, curve) {
    const el = parts && parts.pupils[i]
    if (!el) return
    el.style.transition = glide ? `transform ${ms}ms ${curve}` : 'none'
    el.style.transform = `translate(${px(x)}, ${px(y)})`
  }
  const sitAtRest = () => rest.forEach(([x, y], i) => put(i, x, y, GLIDE_MS, 'ease'))

  // Back to the person: glide to the resting place, then one blink.
  function home({ blink = true } = {}) {
    aim = null
    clearTimers()
    clearFrame()
    sitAtRest()
    if (blink && later && parts && glide) {
      stopBlink = later(() => {
        stopBlink = null
        if (parts && typeof parts.blink === 'function') parts.blink()
      }, GLIDE_MS)
    }
  }

  function place() {
    framed = false
    waiting = null
    if (!parts || !following || !aim) return
    let target = aim
    if (aim.el) {
      if (aim.el.isConnected === false) return home({ blink: false })
      const b = aim.el.getBoundingClientRect()
      target = { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    }
    const scale = parts.svg.getBoundingClientRect().width / 200
    if (!scale) return
    parts.eyes.forEach((eye, i) => {
      const b = eye.getBoundingClientRect()
      const o = pupilOffset({ x: b.left + b.width / 2, y: b.top + b.height / 2 }, target, scale)
      put(i, o.x, o.y, FOLLOW_MS, 'linear')
    })
  }
  function askForFrame() {
    if (framed || !parts) return
    framed = true
    waiting = frame(place)
  }
  // Nothing new to look at for IDLE_MS: back to the person. Armed once; when it comes due and
  // there was a move in between, it waits for the rest of that move's 3 seconds.
  function checkIdle() {
    stopIdle = null
    if (!aim) return
    const left = IDLE_MS - (now() - aimedAt)
    if (left <= 0) home()
    else stopIdle = later(checkIdle, left)
  }
  function follow(next) {
    aim = next
    aimedAt = now()
    stopLeave = cancel(stopLeave)
    stopBlink = cancel(stopBlink)
    if (!stopIdle) stopIdle = later(checkIdle, IDLE_MS)
    askForFrame()
  }

  return {
    attach(next) {
      // A page that comes back after stop() (React replaying a mount) follows again.
      stopped = false
      parts = next
      if (aim) askForFrame()
      else sitAtRest()
    },
    // The character is not drawn (the helper is hidden): nothing is stored, timed or placed.
    detach() {
      parts = null
      aim = null
      clearTimers()
      clearFrame()
    },
    setRest(next) {
      rest = next
      if (!aim || !following) sitAtRest()
    },
    setFollowing(on) {
      following = !!on && !!later && !stopped
      if (!following) home({ blink: false })
    },
    setGlide(on) {
      glide = !!on
    },
    aimed: () => !!aim,
    pointerMove(x, y) {
      if (!following || !parts) return
      follow({ x, y })
    },
    // The cursor left our page (Hermes's sidebar, top strip, bottom bar, or off the window): hold,
    // then look back at the person.
    pointerLeave() {
      if (!following || !aim || aim.el) return
      stopLeave = cancel(stopLeave)
      stopLeave = later(() => {
        stopLeave = null
        home()
      }, LEAVE_HOLD_MS)
    },
    // Keyboard: look at the field or button that shows the keyboard's focus ring.
    focus(el) {
      if (!following || !parts || !el || typeof el.matches !== 'function') return
      let ring = false
      try {
        ring = el.matches(':focus-visible')
      } catch {}
      if (ring) follow({ el })
    },
    // Focus left our page.
    blur() {
      if (aim && aim.el) home()
    },
    // Something of ours scrolled: what the eyes look at may have moved.
    scroll() {
      if (following && aim) askForFrame()
    },
    stop() {
      stopped = true
      following = false
      aim = null
      clearTimers()
      clearFrame()
    }
  }
}

// ---- src/motion.js ----
// The person's "reduce motion" setting: one check, and a watch for changes while the page is open.
// Hermes's own rule already stops CSS transitions and CSS keyframes under this setting
// (apps/desktop/src/styles.css); everything this plugin moves from script (the character's loops
// and rising, the eyes, the word-by-word reveal) asks here and stops itself.
const REDUCE_MOTION = '(prefers-reduced-motion: reduce)'

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia(REDUCE_MOTION).matches === true
}

// Calls onChange(true | false) when the setting changes. Returns the function that stops watching.
function watchReducedMotion(onChange) {
  if (typeof matchMedia !== 'function') return () => {}
  const setting = matchMedia(REDUCE_MOTION)
  if (typeof setting.addEventListener !== 'function') return () => {}
  const heard = () => onChange(setting.matches === true)
  setting.addEventListener('change', heard)
  return () => setting.removeEventListener('change', heard)
}

// ---- src/reveal.js ----
// Word by word: Helper's lines appear one word after another at a steady pace, while the
// character talks. Two small parts:
//   makeRevealClock  plain code: which words of which line are visible, moved on by one host timer
//                    that runs only while words are appearing (or waiting for the character to rise)
//   Said             one line on screen; it listens to the clock for its own line only, so the page
//                    is not drawn again for every word
// The reply itself is always a finished text (Hermes hands a model's reply over whole): this is
// our own pacing of it, not the model speaking live.

// The pace: one word every 120 ms (a first number; Pēteris has not seen a pace yet).
const WORD_MS = 120

function wordsOf(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean)
}

// setInterval is the host's (ctx.setInterval: it returns the function that stops it).
//   show(list)      what is on screen now, in reading order: [{ key, words, fresh }]. A fresh line
//                   the clock has not met yet starts at no words and is revealed in its turn; one
//                   that is not fresh (an older line shown for the first time) is whole at once. A
//                   line that left the screen half way is whole from then on, so nothing replays.
//   shown(key, words, fresh)   how many of the line's words are visible
//   whole(key)      the line is known and fully shown
//   talking()       words are appearing right now (the character talks)
//   onChange(fn)    told when talking starts or stops and when a line becomes whole: the page's
//                   cue to draw itself again. Never told for a word in between.
//   finishAll()     a key press or a mouse press: the rest appears at once
//   holdFor(ms)     words wait this long (the character is rising); the wait is counted in ticks
//   setWhole(on)    reduce motion: every line appears whole, no timer runs
function makeRevealClock({ setInterval: every, wordMs = WORD_MS }) {
  const lines = new Map() // key -> { total, shown }
  let order = [] // keys still being revealed, in reading order
  let stopTimer = null
  let holdTicks = 0
  let wholeAlways = false
  let wasTalking = false
  let lineDone = false // a line became whole since the page was last told
  const watchers = new Map() // key -> Set of functions
  const heard = new Set()

  const tell = key => {
    const set = watchers.get(key)
    if (set) [...set].forEach(fn => fn())
  }
  const head = () => {
    order = order.filter(key => lines.get(key).shown < lines.get(key).total)
    return order.length ? order[0] : null
  }
  const isTalking = () => holdTicks === 0 && head() !== null
  function settle() {
    const need = holdTicks > 0 || head() !== null
    if (need && !stopTimer) stopTimer = every(tick, wordMs)
    if (!need && stopTimer) {
      stopTimer()
      stopTimer = null
    }
    const now = isTalking()
    if (now !== wasTalking || lineDone) {
      wasTalking = now
      lineDone = false
      ;[...heard].forEach(fn => fn())
    }
  }
  function advance() {
    const key = head()
    if (key === null) return
    const line = lines.get(key)
    line.shown++
    if (line.shown >= line.total) lineDone = true
    tell(key)
  }
  function tick() {
    if (holdTicks > 0 && --holdTicks > 0) return
    advance()
    settle()
  }
  function complete(key) {
    const line = lines.get(key)
    if (line.shown >= line.total) return
    line.shown = line.total
    lineDone = true
    tell(key)
  }

  return {
    show(list) {
      const before = head()
      const onScreen = new Set()
      for (const { key, words, fresh } of list) {
        onScreen.add(key)
        const known = lines.get(key)
        if (!known) {
          lines.set(key, { total: words, shown: fresh && !wholeAlways ? 0 : words })
          if (fresh && !wholeAlways) order.push(key)
          else tell(key)
        } else if (known.total !== words) {
          known.total = words
          known.shown = words
          tell(key)
        }
      }
      for (const key of [...order]) if (!onScreen.has(key)) complete(key)
      // A line that has just become the next one gets its first word at once.
      const next = head()
      if (next !== null && next !== before && lines.get(next).shown === 0 && holdTicks === 0) advance()
      settle()
    },
    shown(key, words, fresh) {
      const line = lines.get(key)
      if (line) return Math.min(line.shown, words)
      return fresh && !wholeAlways ? 0 : words
    },
    whole(key) {
      const line = lines.get(key)
      return !!line && line.shown >= line.total
    },
    talking: isTalking,
    finishAll() {
      for (const key of [...order]) complete(key)
      settle()
    },
    holdFor(ms) {
      if (wholeAlways) return
      holdTicks = Math.max(holdTicks, Math.ceil(ms / wordMs))
      settle()
    },
    setWhole(on) {
      wholeAlways = !!on
      if (!wholeAlways) return
      holdTicks = 0
      for (const key of [...order]) complete(key)
      settle()
    },
    watch(key, fn) {
      if (!watchers.has(key)) watchers.set(key, new Set())
      watchers.get(key).add(fn)
      return () => {
        const set = watchers.get(key)
        if (!set) return
        set.delete(fn)
        if (!set.size) watchers.delete(key)
      }
    },
    onChange(fn) {
      heard.add(fn)
      return () => heard.delete(fn)
    }
  }
}

// Kept out of a text selection: a copied line must not come out twice.
const SPOKEN_ONCE = { userSelect: 'none' }
// Words not yet shown hold their place unseen, so the text has its final size from the first word
// and nothing jumps as words arrive.
const UNSEEN = { visibility: 'hidden' }

// One line Helper says. A screen reader gets the whole line once (Hermes's own sr-only class);
// the copy the eye sees, growing word by word, is hidden from it.
function Said({ clock, id, text, className, fresh = false }) {
  const words = wordsOf(text)
  const [, redraw] = useState(0)
  useEffect(() => clock.watch(id, () => redraw(n => n + 1)), [clock, id])
  const n = clock.shown(id, words.length, fresh)
  const rest = words.slice(n).join(' ')
  return jsxs('p', {
    className,
    'data-hh': 'said',
    'data-shown': n,
    'data-words': words.length,
    children: [
      jsx('span', { className: K.srOnly, style: SPOKEN_ONCE, 'data-hh': 'said-whole', children: text }, 'whole'),
      jsxs(
        'span',
        {
          'aria-hidden': true,
          'data-hh': 'said-seen',
          children: [words.slice(0, n).join(' '), rest ? jsx('span', { style: UNSEEN, 'data-hh': 'said-rest', children: (n ? ' ' : '') + rest }, 'rest') : null]
        },
        'seen'
      )
    ]
  })
}

// ---- src/character.js ----
// The helper's character: variation 2 of hhdesign's drawings (design/face-r2), which Pēteris
// picked on 10 Nov 2026. Two eyes that touch, a mouth, and four fingers a side holding on to the
// top edge of the message box. The page draws it itself as inline SVG shapes, every one filled
// with the theme's accent colour: no picture file, no data URL, no colour of our own.
// Used by the page only through <Character>. The numbers live in src/expressions.js.
//   expression  resting | busy | asking | talking (src/expressions.js says which, and when)
//   rising      true while it comes up from behind the message box (once per opening of the helper)
//   reduced     the person's "reduce motion" setting: expressions snap, nothing loops, no rising,
//               and the eyes stay on the person
//   eyes        the page's eyes tracker (src/eyes.js), which places the pupils
// How it moves: a change of expression glides (CSS transitions written here as inline styles);
// what repeats (the blink, drumming fingers, the talking mouth) and the rising are run from script
// with element.animate(), which Hermes's own reduce-motion rule does not stop, so this file
// starts none of them when `reduced` is set.
// No script animation here changes `transform` or `opacity`, except the 0.7 s rising. Seen in the
// real app (dev/checks/character-v2-shots, probe): the app draws such an animation on a layer of
// its own for as long as it runs, also while it waits, and the whole drawing was then soft at its
// edges. So the blink changes the eye's own height (ry) and the hole's own path (d), the fingers
// their y and height, the mouth its path: with those the drawing stayed sharp.

const ACCENT = { fill: 'var(--ui-accent)' }
const SIDES = ['left', 'right']
const FINGER_COUNT = EXPRESSIONS.resting.fingers.length
// A blink, piece by piece: [piece, what changes, open, shut] (src/expressions.js).
const hole = (i, size) => `path("${pupilHole(FACE.eyes[i], size)}")`
const BLINK = SIDES.flatMap((side, i) => [
  [`eye-${side}`, 'ry', eyeRy(), eyeRy(true)],
  [`pupil-hole-${side}`, 'd', hole(i, 1), hole(i, 0)]
])

const play = (el, keys, options) => (el && typeof el.animate === 'function' ? el.animate(keys, options) : null)

// Where a piece is drawn right now, as the first frame of a glide. A glide has to name it: one
// that names only its last frame starts, in the real app, from the new expression's still
// picture and not from what is on screen (dev/checks/character-v2-shots, probe3).
function drawnNow(el, props) {
  if (!el || typeof getComputedStyle !== 'function') return null
  const now = getComputedStyle(el)
  const frame = { offset: 0 }
  for (const p of props) frame[p] = now[p]
  return frame
}

// Stops a loop without a jump: the piece glides from where the loop left it to where the
// expression now draws it.
function stopLoop(el, loop, props, glide) {
  const from = glide ? drawnNow(el, props) : null
  loop.cancel()
  if (from) play(el, [from], { duration: GLIDE_MS, easing: 'ease' })
}

// One blink: both eyes close and open again, and the pupils close with them.
function blinkOnce(nodes, { reduced }) {
  if (reduced) return
  for (const [name, what, open, shut] of BLINK) play(nodes[name], [{ [what]: open }, { [what]: shut }, { [what]: open }], { duration: BLINK_MS, easing: 'ease-in-out' })
}

// The drawn pieces by name, with one ref function per piece, made once.
function makePieces() {
  const nodes = {}
  const setters = {}
  const ref = name =>
    setters[name] ||
    (setters[name] = el => {
      if (el) nodes[name] = el
      else delete nodes[name]
    })
  return { nodes, ref }
}

function Character({ size = CHARACTER_PX, expression = 'resting', rising = false, reduced = false, eyes = null, label = 'Helper' }) {
  const uid = 'hh-face-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const pieces = useRef(null)
  if (!pieces.current) pieces.current = makePieces()
  const { nodes, ref } = pieces.current
  // Without the page's tracker (a plain drawing) a tracker of its own keeps the pupils at the
  // expression's place; it has no timers, so it never follows anything.
  const own = useRef(null)
  if (!eyes && !own.current) own.current = makeEyes()
  const tracker = eyes || own.current
  // Rising: the drawing stays unseen until its rising has started, so it never shows whole first.
  const [armed, setArmed] = useState(false)
  const latest = useRef({})

  const shown = EXPRESSION_NAMES.includes(expression) ? expression : 'resting'
  const x = EXPRESSIONS[shown]
  // comesUp: this draw is part of a rising (the table's own `rise` is how high the body sits).
  const comesUp = rising && !reduced
  latest.current = { shown, reduced }
  const glide = what => (reduced ? 'none' : `${what} ${GLIDE_MS}ms ease`)

  useEffect(() => {
    tracker.attach({
      svg: nodes.svg,
      eyes: SIDES.map(side => nodes[`eye-${side}`]),
      pupils: SIDES.map(side => nodes[`pupil-${side}`]),
      blink: () => blinkOnce(nodes, latest.current)
    })
    return () => tracker.detach()
  }, [tracker])

  // Where the pupils sit when nothing is followed: the expression's own place. And whether they
  // follow at all: not while busy (narrowed eyes, almost no room), never under reduce motion.
  const follows = !reduced && shown !== 'busy'
  useEffect(() => {
    tracker.setGlide(!reduced)
    tracker.setFollowing(follows)
    tracker.setRest([x.pupil, x.pupil])
  }, [tracker, shown, reduced])

  // What repeats. Each loop starts GLIDE_MS after its expression. Drumming and the talking mouth
  // do not start at the expression's still picture, so for those 0.3 s the piece glides from
  // wherever it is to the loop's first frame (glideIn) and the loop takes over without a jump.
  useEffect(() => {
    if (reduced) return
    const running = []
    const loop = (name, keys, ms, props, glideIn = false) => {
      const el = nodes[name]
      let lead = null
      if (glideIn) {
        const from = drawnNow(el, props)
        const to = { ...Object.fromEntries(props.map(p => [p, keys[0][p]])), offset: 1 }
        lead = play(el, from ? [from, to] : [to], { duration: GLIDE_MS, easing: 'ease' })
      }
      const started = play(el, keys, { duration: ms, iterations: Infinity, delay: GLIDE_MS })
      if (started) running.push([el, started, props, lead])
    }
    if (shown === 'resting') {
      const at = [0, (BLINK_EVERY_MS - BLINK_MS) / BLINK_EVERY_MS, (BLINK_EVERY_MS - BLINK_MS / 2) / BLINK_EVERY_MS, 1]
      for (const [name, what, open, shut] of BLINK) loop(name, [open, open, shut, open].map((value, k) => ({ [what]: value, offset: at[k] })), BLINK_EVERY_MS, [what])
    }
    if (shown === 'busy') {
      SIDES.forEach((side, hand) => {
        for (let i = 0; i < FINGER_COUNT; i++) {
          const keys = drumHeights(i).map(h => {
            const r = fingerRect(hand, i, h)
            return { y: `${r.y}px`, height: `${r.height}px` }
          })
          loop(`finger-${side}-${i + 1}`, keys, DRUM_MS, ['y', 'height'], true)
        }
      })
    }
    if (shown === 'talking') loop('mouth', talkFrames().map(d => ({ d: `path("${d}")` })), TALK_MS, ['d'], true)
    return () =>
      running.forEach(([el, started, props, lead]) => {
        stopLoop(el, started, props, !latest.current.reduced)
        if (lead) lead.cancel()
      })
  }, [shown, reduced])

  // Rising, once each time `rising` turns on: the fingers grow over the edge first, then the body
  // comes up from behind it. Neither has an end frame of its own, so each lands on whatever the
  // expression draws. Kept as the last effect: it ends by showing the drawing.
  useEffect(() => {
    if (!comesUp) {
      if (armed) setArmed(false)
      return
    }
    const started = []
    SIDES.forEach(side => {
      for (let i = 0; i < FINGER_COUNT; i++) {
        started.push(play(nodes[`finger-${side}-${i + 1}`], [{ y: `${FACE.edge}px`, height: `${FACE.fingerOver}px`, opacity: 0, offset: 0 }, { opacity: 1, offset: 0.08 }], { duration: RISE.fingersMs, easing: 'linear' }))
      }
    })
    started.push(play(nodes.body, [{ transform: `translateY(${RISE.hidden}px)`, offset: 0 }], { delay: RISE.bodyDelayMs, duration: RISE.bodyMs, easing: RISE.easing, fill: 'backwards' }))
    setArmed(true)
    // Taken off when it is over, when reduce motion is switched on, and when the helper is left.
    return () => started.forEach(a => a && a.cancel())
  }, [comesUp])

  const view = FACE.view
  const pupilMask = (side, i) => {
    const eye = FACE.eyes[i]
    return jsx(
      'mask',
      {
        id: `${uid}-pupil-${side}`,
        maskUnits: 'userSpaceOnUse',
        x: -100,
        y: -200,
        width: 400,
        height: 600,
        style: { maskType: 'alpha' },
        // lift: rides up with its eye (asking). pupil-<side>: moved by the eyes tracker only, so
        // React writes no style on it. pupil-hole-<side>: the hole itself, which can shrink.
        children: jsx('g', {
          'data-hh': `pupil-lift-${side}`,
          style: { transform: `translateY(${-(i === 0 ? x.leftEyeUp : 0)}px)`, transition: glide('transform') },
          children: jsx('g', {
            ref: ref(`pupil-${side}`),
            'data-hh': `pupil-${side}`,
            children: jsx('path', {
              ref: ref(`pupil-hole-${side}`),
              'data-hh': `pupil-hole-${side}`,
              d: pupilHole(eye),
              fillRule: 'evenodd',
              style: { ...ACCENT, transformOrigin: `${eye.cx}px ${eye.cy}px`, transform: `scale(${pupilScale(shown)})`, transition: glide('transform') }
            })
          })
        })
      },
      side
    )
  }
  const eyeShape = (side, i) =>
    jsx(
      'g',
      {
        mask: `url(#${uid}-pupil-${side})`,
        children: jsx('ellipse', {
          ref: ref(`eye-${side}`),
          'data-hh': `eye-${side}`,
          cx: FACE.eyes[i].cx,
          cy: FACE.eyes[i].cy,
          rx: FACE.rx,
          ry: FACE.ry,
          style: { ...ACCENT, transformBox: 'fill-box', transformOrigin: 'center', transform: eyeTransform(shown, i), transition: glide('transform') }
        })
      },
      side
    )
  const finger = (side, hand, i) => {
    const name = `finger-${side}-${i + 1}`
    const r = fingerRect(hand, i, x.fingers[i])
    return jsx(
      'rect',
      {
        ref: ref(name),
        'data-hh': name,
        x: r.x,
        width: r.width,
        rx: r.rx,
        style: { ...ACCENT, y: `${r.y}px`, height: `${r.height}px`, transition: reduced ? 'none' : `y ${GLIDE_MS}ms ease, height ${GLIDE_MS}ms ease` }
      },
      name
    )
  }

  return jsxs('svg', {
    ref: ref('svg'),
    role: label ? 'img' : undefined,
    'aria-label': label || undefined,
    'aria-hidden': label ? undefined : true,
    'data-hh-character': 'face',
    'data-expression': shown,
    'data-eyes': follows ? 'follow' : 'still',
    'data-rising': comesUp || undefined,
    viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`,
    width: size,
    height: Math.round(((size * view.height) / view.width) * 100) / 100,
    // Never wider than its column; nothing of it is cut (the body's small overshoot on rising);
    // mouse presses pass through it to the message box.
    style: { display: 'block', flex: 'none', width: size, maxWidth: '100%', height: 'auto', overflow: 'visible', pointerEvents: 'none', visibility: comesUp && !armed ? 'hidden' : undefined },
    children: [
      jsxs('defs', { children: [jsx('clipPath', { id: `${uid}-above`, children: jsx('rect', { ...FACE.above }) }, 'above'), ...SIDES.map(pupilMask)] }, 'defs'),
      // The body shows only above the edge, so on rising it comes out from behind the message box.
      jsx(
        'g',
        {
          clipPath: `url(#${uid}-above)`,
          children: jsxs('g', {
            ref: ref('body'),
            'data-hh': 'body',
            style: { transform: `translateY(${-x.rise}px)`, transition: glide('transform') },
            children: [
              ...SIDES.map(eyeShape),
              jsx('path', { ref: ref('mouth'), 'data-hh': 'mouth', d: x.mouth, style: { ...ACCENT, d: `path("${x.mouth}")`, transition: glide('d') } }, 'mouth')
            ]
          })
        },
        'body'
      ),
      // The fingers are drawn last, in front, and reach 7 units below the edge, over the message
      // box's top border.
      ...SIDES.flatMap((side, hand) => x.fingers.map((h, i) => finger(side, hand, i)))
    ]
  })
}

// ---- src/setup-tab.js ----
// The "Your setup" tab: reads the person's Hermes through read-only calls, hands each answer to the
// fixed rules in src/setup-cards.js, and draws the cards (build-v1.md section 8).
// Reads (all read-only; never .env, auth.json or config.get):
//   card 1  host.state.gateway                      card 4  profiles.describe { name } -> soul
//   card 2  setup.runtime_check (+ setup.status)    card 5  host.skills.list(profile)
//   card 3  llm.oneshot, only when Check is pressed card 6  host.toolsets.list(profile) -> memory
//   card 7  nothing: the person runs the test in their own chat and presses a button
// Reads start the first time the tab is opened, and again on "Check again". Nothing polls.

// profiles.describe's own limit is Hermes's 30 s default; host.skills/toolsets get the same limit here.
const READ_TIMEOUT_MS = 30000

// The bot (profile) Hermes is running now; '' from Hermes means the default one.
function runningBotName(profile) {
  return typeof profile === 'string' && profile.trim() ? profile.trim() : 'default'
}

// What ctx.storage keeps for card 7: { [bot]: 'yes' | 'no' }. Anything else is dropped.
function readRemember(value) {
  const out = {}
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) if (v === 'yes' || v === 'no') out[k] = v
  }
  return out
}

const DOT = { works: K.dotWorks, fix: K.dotFix, cant: K.dotCant }

function makeSetupCards(ctx, { busy = null } = {}) {
  const request = (method, params, timeout) => host.request(method, params, timeout)
  const sleep = ms => new Promise(resolve => ctx.setTimeout(resolve, ms))
  // A read that rejects after `ms` if Hermes hasn't answered; the timer is the host's, so it is
  // cleaned up with the plugin.
  const limit = (promise, ms) =>
    new Promise((resolve, reject) => {
      const stop = ctx.setTimeout(() => reject(new Error(`no answer within ${ms / 1000} s`)), ms)
      Promise.resolve(promise).then(
        v => {
          stop()
          resolve(v)
        },
        e => {
          stop()
          reject(e)
        }
      )
    })
  const outcome = p => p.then(value => ({ ok: true, value }), () => ({ ok: false }))

  // State and actions for the tab. Lives in the page (always mounted), so switching tabs keeps the
  // answers. launch = { model, recheck }: the page's own model check for the bot Hermes runs, so the
  // helper and card 2 never disagree.
  function useSetupCards({ active, launchModel, recheckLaunch }) {
    const runningBot = runningBotName(useValue(host.state.profile))
    const gateway = useValue(host.state.gateway)
    const [bots, setBots] = useState(null)
    const [picked, setPicked] = useState(null)
    const [reads, setReads] = useState({})
    const [runs, setRuns] = useState({})
    const [remember, setRemember] = useState(() => readRemember(ctx.storage.get('remember', {})))
    const alive = useRef(true)
    // Per bot: a number that goes up with every new read, so an answer from an older read (or from
    // before the running bot changed) is dropped instead of landing on the card.
    const generation = useRef({})
    const started = useRef(false)
    const loadedFor = useRef(null)
    // Card 3: the bots with a model call in flight, and the stop functions of running counters.
    const asking = useRef(new Set())
    const counters = useRef(new Set())

    const bot = picked && bots && bots.includes(picked) ? picked : runningBot
    const isRunning = b => b === runningBot
    const params = b => (isRunning(b) ? {} : { profile: b })
    const scope = b => (isRunning(b) ? undefined : b)
    // A host call that throws instead of rejecting must not stop the reads after it.
    const attempt = fn => Promise.resolve().then(fn)

    function patchRead(b, gen, key, value) {
      if (!alive.current || generation.current[b] !== gen) return
      setReads(r => ({ ...r, [b]: { ...(r[b] || {}), [key]: value } }))
    }

    // reuseLaunch: on the first open, the page's own model check (run when the page opened) is
    // still fresh, so card 2 uses it instead of asking Hermes again.
    function load(b, { reuseLaunch = false } = {}) {
      const gen = (generation.current[b] || 0) + 1
      generation.current[b] = gen
      setReads(r => ({ ...r, [b]: { model: isRunning(b) ? null : { state: 'checking' }, soul: null, skills: null, memory: null } }))
      if (!isRunning(b)) {
        attempt(() => checkModel(request, { params: params(b), sleep })).then(
          m => patchRead(b, gen, 'model', m),
          () => patchRead(b, gen, 'model', { state: 'error' })
        )
      } else if (!(reuseLaunch && launchModel && (launchModel.state === 'ok' || launchModel.state === 'none'))) {
        recheckLaunch()
      }
      outcome(attempt(() => request('profiles.describe', { name: b }, READ_TIMEOUT_MS))).then(v => patchRead(b, gen, 'soul', v))
      outcome(limit(attempt(() => host.skills.list(scope(b))), READ_TIMEOUT_MS)).then(v => patchRead(b, gen, 'skills', v))
      outcome(limit(attempt(() => host.toolsets.list(scope(b))), READ_TIMEOUT_MS)).then(v => patchRead(b, gen, 'memory', v))
    }

    // A failed list keeps the bots we already know, so the picked bot stays on screen.
    function loadBots() {
      outcome(limit(attempt(() => host.profiles.list()), READ_TIMEOUT_MS)).then(r => {
        if (!alive.current) return
        const list = r.ok && r.value && Array.isArray(r.value.profiles) ? r.value.profiles : null
        if (!list) return
        const names = list.map(p => p && typeof p.name === 'string' && p.name.trim()).filter(Boolean)
        if (names.length) setBots(names)
      })
    }

    useEffect(() => {
      alive.current = true
      return () => {
        alive.current = false
        for (const stop of counters.current) stop()
        counters.current.clear()
      }
    }, [])

    // First open of the tab, and again whenever Hermes switches to another bot: the old answers
    // belonged to the old running bot, so they are dropped and read again.
    useEffect(() => {
      if (!active && !started.current) return
      if (loadedFor.current === runningBot) return
      const first = !started.current
      started.current = true
      loadedFor.current = runningBot
      if (!first) {
        generation.current = Object.fromEntries(Object.entries(generation.current).map(([k, v]) => [k, v + 1]))
        setReads({})
        setRuns(r => Object.fromEntries(Object.entries(r).filter(([k]) => asking.current.has(k))))
      }
      loadBots()
      load(bot, { reuseLaunch: first })
    }, [active, runningBot])

    function pick(b) {
      setPicked(b)
      if (!reads[b]) load(b)
    }

    // "Check again" under the cards: every read again for the shown bot. Card 3's last answer is
    // dropped too (it may no longer be true); a call still running is left alone.
    function checkAgain() {
      loadBots()
      load(bot)
      if (!asking.current.has(bot)) setRuns(r => ({ ...r, [bot]: undefined }))
    }

    // Card 3: one model call, only on a press, only when card 2 says ok for this bot.
    function ask(b) {
      const model = isRunning(b) ? launchModel : reads[b] && reads[b].model
      if (!model || model.state !== 'ok') return
      if (asking.current.has(b)) return
      asking.current.add(b)
      // The page's busy value (src/expressions.js makeBusy): up for the whole wait on the model,
      // the "trying again" countdown included; the character shows busy while it is up.
      const endBusy = busy ? busy.begin() : () => {}
      const setRun = run => alive.current && setRuns(r => ({ ...r, [b]: run }))
      let startedAt = 0
      let stopTick = null
      const stopTicking = () => {
        if (stopTick) {
          stopTick()
          counters.current.delete(stopTick)
        }
        stopTick = null
      }
      let lastCheck = null
      askModel({
        request,
        sleep,
        call: { ...ANSWER_CALL, profile: params(b).profile },
        recheck: async () => (lastCheck = await checkModel(request, { params: params(b), sleep })),
        cancelled: () => !alive.current,
        onState: s => {
          stopTicking()
          if (s.phase === 'calling') {
            startedAt = Date.now()
            setRun({ phase: 'calling', waited: 0 })
            stopTick = ctx.setInterval(() => setRun({ phase: 'calling', waited: Math.round((Date.now() - startedAt) / 1000) }), 1000)
            counters.current.add(stopTick)
          } else {
            setRun({ phase: 'countdown', left: s.left })
          }
        }
      })
        .then(
          result => {
            if (!result) return
            setRun({ phase: 'done', result })
            // The call found the model gone: card 2 takes the answer of that same re-check, so
            // both cards agree without asking Hermes a third time.
            if (!result.ok && lastCheck && (result.kind === 'no_model' || result.kind === 'model_broken')) {
              if (isRunning(b)) recheckLaunch()
              else patchRead(b, generation.current[b], 'model', lastCheck)
            }
          },
          () => setRun({ phase: 'done', result: { ok: false, kind: 'other' } })
        )
        .finally(() => {
          stopTicking()
          asking.current.delete(b)
          endBusy()
        })
    }

    function answerRemember(b, answer) {
      const next = { ...remember, [b]: answer }
      setRemember(next)
      ctx.storage.set('remember', next)
    }

    const shown = reads[bot] || {}
    const model = isRunning(bot) ? launchModel : shown.model
    return {
      bot,
      bots: bots || [runningBot],
      cards: {
        gateway: gatewayCard(gateway),
        model: modelCard(model),
        answers: answersCard(runs[bot], model),
        soul: soulCard(shown.soul),
        skills: skillsCard(shown.skills),
        memory: memoryCard(shown.memory),
        remember: rememberCard(remember[bot])
      },
      pick,
      checkAgain,
      ask: () => ask(bot),
      reload: () => load(bot),
      answerRemember: answer => answerRemember(bot, answer)
    }
  }

  return useSetupCards
}

/* ---------- the view (no hooks: plain functions of the state above) ---------- */

function StatusLane({ status }) {
  return jsxs('span', {
    className: K.cardState,
    'data-hh': 'status',
    children: [
      status === 'checking' ? jsx(GlyphSpinner, {}) : jsx('span', { 'aria-hidden': true, className: cx(K.dot, DOT[status] || K.dotNeutral) }),
      jsx('span', { children: STATUS[status] })
    ]
  })
}

function PasteBox({ text, label }) {
  return jsxs('div', {
    className: K.cardPaste,
    children: [
      jsx('span', { className: K.cardPasteText, children: text }),
      jsx(CopyButton, { text, label, appearance: 'button', buttonSize: 'xs', buttonVariant: 'ghost' })
    ]
  })
}

function renderYourSetup(s, { openStep, cardColumns = 2 }) {
  const botCount = s.bots.length
  const actionButton = (action, id) => {
    if (!action) return null
    if (action.kind === 'step') return jsx(Button, { size: 'xs', variant: 'secondary', onClick: () => openStep(action.step), children: action.label }, id + '-step')
    if (action.kind === 'recheck') return jsx(Button, { size: 'xs', variant: 'secondary', onClick: () => s.reload(), children: action.label }, id + '-recheck')
    if (action.kind === 'ask') return jsx(Button, { size: 'xs', variant: 'secondary', disabled: action.disabled, onClick: () => s.ask(), children: action.label }, id + '-ask')
    return null
  }

  const card = (id, { extra = [], more = [], wide = false } = {}) => {
    const c = s.cards[id]
    const passes = PASSES[id]
    const buttons = [actionButton(c.action, id), ...more].filter(Boolean)
    return jsxs(
      'section',
      {
        className: cx(K.card, wide && K.cardWide),
        'data-hh': `card-${id}`,
        'data-status': c.status,
        'aria-label': cardTitle(id),
        children: [
          jsxs('div', {
            className: K.cardHead,
            children: [jsx('h4', { className: K.cardTitle, children: cardTitle(id) }), jsx(StatusLane, { status: c.status })]
          }),
          c.value ? jsx('div', { className: K.cardValue, children: c.value }) : null,
          ...c.lines.map((line, i) => jsx('p', { className: K.cardText, children: line }, `l${i}`)),
          c.reasons ? jsx('p', { className: K.cardText, children: c.reasonsLead }) : null,
          c.reasons ? jsx('ol', { className: K.cardList, children: c.reasons.map((t, i) => jsx('li', { children: t }, i)) }) : null,
          c.handoff
            ? jsxs('div', { className: K.cardStack, children: [jsx('p', { className: K.cardText, children: c.handoff.lead }), jsx(PasteBox, { text: c.handoff.text, label: 'Copy' })] })
            : null,
          ...extra,
          passes ? jsx('p', { className: K.cardPasses, children: passes }) : null,
          buttons.length ? jsx('div', { className: K.cardActions, children: buttons }) : null
        ]
      },
      id
    )
  }

  // Card 7: the person's own two-part test, then their answer.
  const rememberSteps = [
    jsx('p', { className: K.cardText, children: REMEMBER.intro }, 'intro'),
    jsxs(
      'ol',
      {
        className: K.cardList,
        children: [
          jsxs('li', { children: [REMEMBER.steps[0], jsx(PasteBox, { text: REMEMBER.part1, label: 'Copy test text' })] }, 1),
          jsxs('li', { children: [REMEMBER.steps[1], jsx(PasteBox, { text: REMEMBER.part2, label: 'Copy question' })] }, 2),
          jsx('li', { children: REMEMBER.steps[2] }, 3)
        ]
      },
      'steps'
    )
  ]
  const answered = s.cards.remember.status
  const rememberButtons = [
    jsx(Button, { size: 'xs', variant: 'secondary', 'aria-pressed': answered === 'works', onClick: () => s.answerRemember('yes'), children: REMEMBER.yes }, 'yes'),
    jsx(Button, { size: 'xs', variant: 'secondary', 'aria-pressed': answered === 'fix', onClick: () => s.answerRemember('no'), children: REMEMBER.no }, 'no')
  ]

  const picker =
    botCount > 1
      ? jsxs('div', {
          className: K.botPicker,
          'data-hh': 'bot-picker',
          children: [
            jsx('span', { className: K.botPickerLabel, children: 'Showing bot' }),
            jsxs(Select, {
              value: s.bot,
              onValueChange: s.pick,
              children: [
                jsx(SelectTrigger, { className: K.botPickerTrigger, 'aria-label': 'Showing bot', children: jsx(SelectValue, {}) }),
                jsx(SelectContent, { children: s.bots.map(b => jsx(SelectItem, { value: b, children: b }, b)) })
              ]
            }),
            jsx('span', { className: K.botPickerLabel, children: `${botCount} bots on this Hermes` })
          ]
        })
      : null

  return [
    // No heading: the open tab already says "Your setup", as Capabilities' tabs name their page.
    jsx('p', { className: K.caption, 'data-hh': 'yours-lead', children: 'Read from your Hermes. Nothing is changed.' }, 'head'),
    picker,
    jsx(
      'div',
      {
        // Two columns only when the column is wide enough (src/layout.js), else one.
        className: cx(K.cardGrid, cardColumns === 2 && K.twoColumns),
        'data-hh': 'cards',
        'data-columns': cardColumns,
        children: [
          card('gateway'),
          card('model'),
          card('answers'),
          card('soul'),
          card('skills'),
          card('memory'),
          card('remember', { extra: rememberSteps, more: rememberButtons, wide: true })
        ]
      },
      'cards'
    ),
    jsx('div', { className: K.pageActions, children: jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => s.checkAgain(), children: 'Check again' }) }, 'again')
  ]
}

// ---- src/bubble-link.js ----
// The piece between Helper's speech bubble and the character. One component, so another form (a
// curve from the mouth, small bubbles) replaces this file without touching the bubble or the
// answers: hhdesign is drawing the options Pēteris picks from (design/talk-r4/).
// What it gets: a layout cell (.hh-linkcell in src/talk.css), 24 px wide, that starts 1 px inside
// the bubble's lower edge, in front of the bubble, and ends at the character's top. The cell is
// placed by CSS alone; nothing is measured and nothing goes through React state, so it cannot
// lag behind the bubble. What is drawn inside the cell is this file's own business.
// Drawn now (row 2 of docs/build/talk-v1-plan.md): version 1's tail in its shortest drawn size,
// 24 by 17 px, hanging from the bubble with its tip at the lower left. When the answers under the
// bubble are tall, the cell is taller than the tail and there is a gap below the tip.

const BUBBLE_LINK = { width: 24, height: 17 }
// The bubble's fill between the two long sides, and a 1 px edge on those two sides only: the
// short side lies on the bubble's own edge and stays open, so bubble and tail read as one shape.
const SHAPE = `M6,0 L0,${BUBBLE_LINK.height} L${BUBBLE_LINK.width},0`

function BubbleLink() {
  return jsxs('svg', {
    className: T.tail,
    'data-hh': 'bubble-link',
    'aria-hidden': true,
    viewBox: `0 0 ${BUBBLE_LINK.width} ${BUBBLE_LINK.height}`,
    width: BUBBLE_LINK.width,
    height: BUBBLE_LINK.height,
    children: [jsx('path', { className: T.tailFill, d: SHAPE + 'Z' }, 'fill'), jsx('path', { className: T.tailEdge, d: SHAPE }, 'edge')]
  })
}

// ---- src/talk-view.js ----
// The parts of Helper's conversation window (design/talk-r3, version 1 of the speech bubble),
// drawn from plain data. page.js holds the conversation and decides what is said; nothing here
// keeps state, so each part can be drawn and tested alone.
// One thing in the conversation (an "entry"):
//   { id, who: 'you', text }
//   { id, who: 'helper', line, text,
//     answers: null | { kind, hint, items: [{ id, label }] }   answers to pick under the line
//     next:    null | { kind: 'paste', label, text }           a button that opens text to paste
//                   | { kind: 'part', label, to }              a button that opens a Hermes screen
//                   | { kind: 'line', label, line }            a button that makes Helper say one more line
//                   | { kind: 'where', line, text }            no button: in its place, where to find the screen
//     paste:   null | text        text to paste shown at once (the "your own Hermes can" line)
//     opened:  true once a 'paste' button was pressed }
// Classes come from the T table (src/talk.css); the text to paste wears Hermes's own classes.

// The small arrow on a button: down when it opens text under itself, right when it leads on.
const nextIcon = next => (next.kind === 'paste' ? 'chevron-down' : 'arrow-right')
const ANSWERS_LABEL = 'Answers to pick'

// Helper's older line, small, on its side. A button it had stays as a small underlined link; text
// to paste that was opened stays open; a line about where a screen is stays under it.
function OldLine({ entry, onNext }) {
  const next = entry.next
  const pasteText = entry.paste || (next && next.kind === 'paste' && entry.opened ? next.text : null)
  return jsxs('div', {
    className: T.old,
    'data-hh': 'old',
    'data-line': entry.line,
    children: [
      jsx('span', { className: K.srOnly, children: 'Helper said: ' }, 'who'),
      entry.text,
      next && next.kind === 'where' ? jsx('p', { className: T.where, 'data-hh': 'where', 'data-line': next.line, children: next.text }, 'where') : null,
      next && next.kind !== 'where'
        ? jsxs(
            'button',
            {
              type: 'button',
              className: T.oldLink,
              'data-hh': 'old-link',
              'aria-expanded': next.kind === 'paste' ? !!entry.opened : undefined,
              onClick: () => onNext(entry),
              children: [next.label, jsx(Codicon, { name: nextIcon(next) }, 'icon')]
            },
            'next'
          )
        : null,
      pasteText ? jsx(PasteBox, { text: pasteText, label: 'Copy' }, 'paste') : null
    ]
  })
}

// The conversation so far: everything said before Helper's newest sentence. It scrolls when it is
// full and stays at its newest when its room changes (the style sheet does that: the outer box
// stacks from its bottom). A screen reader hears who said each line; the eye sees it by the side.
function Conversation({ entries, onNext, scrollRef }) {
  return jsx('div', {
    className: T.conv,
    ref: scrollRef,
    role: 'group',
    'aria-label': 'Conversation so far',
    'data-hh': 'conversation',
    children: jsx('div', {
      className: T.convIn,
      'data-hh': 'conversation-lines',
      children: entries.map(e =>
        e.who === 'you'
          ? jsxs('div', { className: T.me, 'data-hh': 'me', children: [jsx('span', { className: K.srOnly, children: 'You said: ' }, 'who'), e.text] }, e.id)
          : jsx(OldLine, { entry: e, onNext }, e.id)
      )
    })
  })
}

// Helper's newest sentence, in the filled bubble. The words appear one by one (src/reveal.js) and
// hold their place from the first word, so the bubble has its final size at once. A button or text
// to paste sits inside the bubble under a thin line; its room is held too, and it shows (and can
// be reached with the keyboard) when the line has been said.
//   said: every word of the line is on screen
function Bubble({ entry, clock, fresh, said, onNext }) {
  const next = entry.next
  const pasteText = entry.paste || (next && next.kind === 'paste' && entry.opened ? next.text : null)
  const inside = []
  if (next && next.kind === 'where') inside.push(jsx('p', { className: T.where, 'data-hh': 'where', 'data-line': next.line, children: next.text }, 'where'))
  else if (next)
    inside.push(
      jsxs(
        'button',
        {
          type: 'button',
          className: T.button,
          'data-hh': 'bubble-button',
          'data-kind': next.kind,
          tabIndex: said ? 0 : -1,
          'aria-expanded': next.kind === 'paste' ? !!entry.opened : undefined,
          onClick: () => said && onNext(entry),
          children: [next.label, jsx(Codicon, { name: nextIcon(next) }, 'icon')]
        },
        'next'
      )
    )
  if (pasteText) inside.push(jsx(PasteBox, { text: pasteText, label: 'Copy' }, 'paste'))
  return jsxs('div', {
    className: T.bubble,
    'data-hh': 'bubble',
    'data-line': entry.line,
    'data-said': said,
    'aria-live': 'polite',
    children: [
      jsx(Said, { clock, id: entry.key, text: entry.text, className: T.line, fresh }, entry.key),
      inside.length
        ? jsx('div', { className: cx(T.inBubble, pasteText && T.inBubbleColumn, !said && T.wait), 'aria-hidden': said ? undefined : true, 'data-hh': 'in-bubble', children: inside }, 'in')
        : null
    ]
  })
}

// While Helper works on an answer: a small bubble with three dots, one lit, sitting on the piece
// below it. `lit` is which dot (0 to 2); the page moves it on.
function BusyDots({ lit = 0 }) {
  return jsx('div', {
    className: cx(T.bubble, T.dots),
    'data-hh': 'busy-dots',
    role: 'status',
    'aria-label': 'Helper is working on an answer',
    children: [0, 1, 2].map(i => jsx('i', { className: i === lit ? T.dotOn : undefined }, i))
  })
}

// The answers to pick, on the person's side beside the character, drawn like the person's own
// messages. Real buttons in a named group. Their room is held from the line's first word; until
// the line has been said they are unseen and out of the keyboard's way.
function Answers({ answers, said, onPick }) {
  return jsx('div', {
    className: cx(T.answers, !said && T.wait),
    role: 'group',
    'aria-label': ANSWERS_LABEL,
    'aria-hidden': said ? undefined : true,
    'data-hh': 'answers',
    'data-kind': answers.kind,
    children: answers.items.map(a =>
      jsx('button', { type: 'button', className: T.answer, 'data-hh': 'answer', 'data-answer': a.id, tabIndex: said ? 0 : -1, onClick: () => said && onPick(a), children: a.label }, a.id)
    )
  })
}

// The row under the bubble: the piece between bubble and character in its cell, the character on
// the message box's top edge, and the answers beside it.
function Under({ character, answers, said, onPick }) {
  return jsxs('div', {
    className: T.under,
    'data-hh': 'under',
    children: [
      jsx('div', { className: T.linkCell, 'aria-hidden': true, 'data-hh': 'bubble-link-cell', children: jsx(BubbleLink, {}) }, 'link'),
      jsx('div', { className: T.charSpace }, 'space'),
      jsx('div', { className: T.character, 'data-hh': 'character', children: character }, 'character'),
      answers && answers.items.length ? jsx(Answers, { answers, said, onPick }, 'answers') : null
    ]
  })
}

// The edge to drag, on the window's left side. The page keeps the drag itself (where it began)
// and hands the handlers in; the keyboard moves it with the arrow keys. A drag the system cancels,
// or whose pointer is lost, ends without a new width.
function Grip({ width, min, max, onDown, onMove, onUp, onCancel, onKey }) {
  return jsx('div', {
    className: T.grip,
    role: 'separator',
    tabIndex: 0,
    'aria-orientation': 'vertical',
    'aria-label': 'Width of Helper',
    'aria-valuenow': width,
    'aria-valuemin': min,
    'aria-valuemax': max,
    'data-hh': 'grip',
    onPointerDown: onDown,
    onPointerMove: onMove,
    onPointerUp: onUp,
    onPointerCancel: onCancel,
    onLostPointerCapture: onCancel,
    onKeyDown: onKey,
    children: jsx('span', { className: T.gripPill })
  })
}

// ---- src/page.js ----
// The Helper page: header with two text tabs, step list, open step, and Helper's conversation
// window on the right.
// B1 = the page shell; B2 = the "Your setup" cards; B3a = the native pass and narrow windows
// (src/layout.js); B3 = Setup steps 1-4 from hhcontent's data (src/steps.js); talk v1 = Helper's
// conversation window (design/talk-r3, version 1 of the speech bubble): the newest sentence in a
// bubble above the character, the conversation so far above it, answers to pick beside the
// character. What Helper says is decided by code (src/talk.js) from hhcontent's pre-written lines.
// Look: the left side wears Hermes's own UI kit components and the class strings its own screens
// use (K in src/look.js). Helper's window has the one style sheet of our own (src/talk.css, the T
// table), put into a <style> element inside our own page.

// Column widths (layout only; every colour, font and line comes from Hermes's classes).
const RAIL_WIDTH = `${RAIL_PX}px`
const RAIL_NUMBERS_WIDTH = `${RAIL_NUMBERS_PX}px`
// One press of an arrow key on the edge to drag moves it this far.
const GRIP_KEY_PX = 16
// Keys that are not typing by themselves: pressing one alone does not end the word-by-word reveal.
const LONE_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']
// The longest conversation kept in page memory.
const LOG_MAX = 200

const TABS = [
  { id: 'setup', label: 'Setup' },
  { id: 'yours', label: 'Your setup' }
]

// Our own page's size, from a ResizeObserver on our own element (never Hermes's markup). The ref
// function is made once, so React doesn't detach and re-attach it on every render; React calls it
// with null on unmount, which stops the observer. 0 until measured, which layoutFor() reads as
// wide and high.
function useOwnSize() {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const holder = useRef(null)
  if (!holder.current) {
    const box = { observer: null }
    box.ref = node => {
      if (box.observer) box.observer.disconnect()
      box.observer = null
      if (!node || typeof ResizeObserver !== 'function') return
      box.observer = new ResizeObserver(entries => {
        const entry = entries[entries.length - 1]
        if (!entry) return
        const next = { width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }
        setSize(old => (old.width === next.width && old.height === next.height ? old : next))
      })
      box.observer.observe(node)
    }
    holder.current = box
  }
  return [size, holder.current.ref]
}

function makePage(ctx) {
  // Kept while the plugin is loaded, shared by every mount of the page:
  // busy = how many model calls are running (the character shows busy while it is above 0);
  // clock = which words of Helper's lines are visible (a line is revealed once, then stays whole).
  const busy = makeBusy()
  const clock = makeRevealClock({ setInterval: (fn, ms) => ctx.setInterval(fn, ms) })
  const useSetupCards = makeSetupCards(ctx, { busy })
  const sleep = ms => new Promise(resolve => ctx.setTimeout(resolve, ms))
  // Last successful model check (ok or none), shared by every mount of the page while the plugin
  // is loaded. A failed check is not kept, so the next open asks again.
  let lastCheck = null
  // The conversation, kept while the plugin is loaded (leaving the page and coming back keeps
  // it). Nothing of it is written anywhere: it is gone when Hermes restarts. visit = what Helper
  // knows in this visit (src/talk.js); log = what was said, each entry with an id; typed = the
  // message that led to "Which one do you mean?", kept only while that line is the newest.
  let memory = null
  const remembered = () => {
    if (!memory) {
      memory = { visit: freshVisit('name'), log: [], nextId: 1, typed: '' }
      memory.log = [helperEntry(openingLine())]
    }
    return memory
  }
  const helperEntry = said => {
    const id = memory.nextId++
    return { id, key: `h${id}`, who: 'helper', opened: false, ...said }
  }
  const youEntry = text => ({ id: memory.nextId++, who: 'you', text })
  // Opens a docs page in the person's browser (the SDK's OS door; false when unavailable).
  const openDocs = url => {
    if (!isDocsUrl(url)) return
    try {
      const done = ctx.os && typeof ctx.os.openExternal === 'function' ? ctx.os.openExternal(url) : null
      if (done && typeof done.catch === 'function') done.catch(() => {})
    } catch {}
  }

  function useModelStatus() {
    const fresh = lastCheck && Date.now() - lastCheck.at < RECHECK_AFTER_MS
    const [status, setStatus] = useState(() => (fresh ? lastCheck.result : { state: 'checking' }))
    const running = useRef(false)
    const mounted = useRef(true)

    async function run() {
      if (running.current) return
      running.current = true
      setStatus({ state: 'checking' })
      let result = { state: 'error' }
      try {
        result = await checkModel((method, params, timeout) => host.request(method, params, timeout), { sleep })
      } catch {
        result = { state: 'error' }
      } finally {
        running.current = false
      }
      lastCheck = result.state === 'error' ? null : { result, at: Date.now() }
      if (mounted.current) setStatus(result)
    }

    useEffect(() => {
      mounted.current = true
      if (!fresh) run()
      return () => {
        mounted.current = false
      }
    }, [])

    return [status, run]
  }

  return function HelperPage() {
    const [initial] = useState(() => readState((k, d) => ctx.storage.get(k, d)))
    const [tab, setTab] = useState(initial.tab)
    const [step, setStep] = useState(initial.step)
    const [answers, setAnswers] = useState(initial.answers)
    // The width the person dragged Helper's window to (remembered), and whether Helper is folded
    // away to its strip (not remembered: it starts open, so the greeting is seen first).
    const [helperWidth, setHelperWidth] = useState(initial.helperWidth)
    const [folded, setFolded] = useState(false)
    const [log, setLog] = useState(() => remembered().log)
    // The person's "reduce motion" setting, watched for changes. With it on the character neither
    // moves nor rises, and every line appears whole: a new line is never "fresh" (say(), below),
    // and a line that is appearing when the setting is switched on shows its rest at once (here;
    // declared before the effects that make words wait or appear).
    const [reduced, setReduced] = useState(prefersReducedMotion)
    useEffect(() => watchReducedMotion(setReduced), [])
    useEffect(() => {
      clock.setWhole(reduced)
    }, [reduced])
    // How many model calls are running. And the clock's cue: the page is drawn again when talking
    // starts or stops and when a line becomes whole, never for a single word.
    const [calls, setCalls] = useState(() => busy.count())
    const [, setSaidChange] = useState(0)
    useEffect(() => {
      // Caught up first, in case it changed between the draw and this moment.
      if (busy.count() !== calls) setCalls(busy.count())
      const offBusy = busy.subscribe(setCalls)
      const offClock = clock.onChange(() => setSaidChange(n => n + 1))
      return () => {
        offBusy()
        offClock()
      }
    }, [])
    const revealing = clock.talking()
    // The eyes: one tracker per open page; our own outer box hands it the cursor and the focus.
    const eyes = useRef(null)
    if (!eyes.current) eyes.current = makeEyes({ setTimeout: (fn, ms) => ctx.setTimeout(fn, ms) })
    useEffect(() => () => eyes.current.stop(), [])
    // True once the character has come up after the helper opened (see the effect below).
    const risen = useRef(false)
    const [draft, setDraft] = useState('')
    const [focusAsk, setFocusAsk] = useState(false)
    const [focusStrip, setFocusStrip] = useState(false)
    const [size, measureRef] = useOwnSize()
    const width = size.width
    const [modelStatus, recheck] = useModelStatus()
    const setup = useSetupCards({ active: tab === 'yours', launchModel: modelStatus, recheckLaunch: recheck })
    const askBox = useRef(null)
    // The conversation's scrolling area: kept at the bottom, where the newest words are.
    const helperScroll = useRef(null)
    const stripButton = useRef(null)
    // Where a drag of Helper's edge began: { x, width }.
    const drag = useRef(null)
    // One ref function per tab, made once (like useOwnSize's), kept with the tab buttons.
    const tabRefs = useRef(null)
    if (!tabRefs.current) {
      const els = {}
      tabRefs.current = { els, set: Object.fromEntries(TABS.map(t => [t.id, el => (els[t.id] = el)])) }
    }

    const fit = layoutFor({ width, height: size.height, tab, helperWidth, folded })

    const keep = (key, setter) => value => {
      setter(value)
      ctx.storage.set(key, value)
    }
    const saveTab = keep('tab', setTab)
    const saveStep = keep('step', setStep)

    // The message box takes the keyboard when asked to (a pick, "Ask about this step", Helper
    // opened from its strip); a request that finds no box is dropped, so it can't steal focus later.
    useEffect(() => {
      if (!focusAsk) return
      if (askBox.current) askBox.current.focus()
      setFocusAsk(false)
    }, [focusAsk])

    // Folding Helper away hands the keyboard back to the strip.
    useEffect(() => {
      if (!focusStrip) return
      if (stripButton.current) stripButton.current.focus()
      setFocusStrip(false)
    }, [focusStrip])

    // The window got wide enough for both sides: a folded Helper comes back as its column. Only a
    // change of width does this, so the one place that folds Helper (foldHelper) stays in charge.
    useEffect(() => {
      if (folded && !fit.narrow) setFolded(false)
    }, [width])

    const currentStep = stepByNumber(step) || STEPS[0]
    const helperShown = fit.helper !== 'strip'

    // Puts Helper away or brings it back, with the keyboard following (to the strip, or to the
    // message box). The strip, Escape and "Ask about this step" all go through it; only the
    // unfolding by a wider window (the effect above) sets the state itself, and moves no focus.
    function foldHelper(away) {
      setFolded(away)
      if (away) setFocusStrip(true)
      else setFocusAsk(true)
    }

    // Helper comes on screen (the page opens with it, or the person opens it from the strip): the
    // character rises from behind the message box, once, and Helper's words wait until it is up.
    // Not on a tab change. `risen` keeps a later redraw from asking for the rising again.
    // Declared before the effect that hands the clock its lines, so the wait is in place first.
    useEffect(() => {
      if (!helperShown) return
      if (reduced) {
        risen.current = true
        // forgotten when the helper leaves the screen, so that it rises on its next opening if
        // reduce motion has been switched off by then
        return () => {
          risen.current = false
        }
      }
      clock.holdFor(RISE.wordsWaitMs)
      const stop = ctx.setTimeout(() => {
        risen.current = true
      }, RISE.ms)
      return () => {
        stop()
        risen.current = false
      }
    }, [helperShown])

    // What Helper is saying on screen right now (filled while the bubble is drawn below); after
    // every draw the clock hears it and reveals what is new, word by word.
    const saidNow = []
    useEffect(() => {
      clock.show(helperShown ? saidNow : [])
    })

    // (Whether the eyes follow the cursor is the drawing's own rule: not while busy, never under
    // reduce motion. src/character.js.)
    const busyNow = calls > 0

    // Something new was said, or Helper came back: show the newest of the conversation so far.
    // (By the newest entry's id, not the count: the count stops changing once the log is full.
    // The style sheet keeps it at its newest when the window or the message box changes size.)
    const newestId = log.length ? log[log.length - 1].id : 0
    useEffect(() => {
      const el = helperScroll.current
      if (el) el.scrollTop = el.scrollHeight
    }, [newestId, helperShown])

    /* ---------- the conversation: what the person does, what Helper says back ---------- */
    const visit = remembered().visit
    function addToLog(entries) {
      setLog(old => (memory.log = [...old, ...entries].slice(-LOG_MAX)))
    }
    // Helper's answer to something the person did. shown: the person's side of it, as their message.
    function answer(result, shown, typed = '') {
      if (!result) return
      addToLog([shown ? youEntry(shown) : null, helperEntry(lineFor(result, visit, typed))].filter(Boolean))
      setFocusAsk(true)
    }

    // The message box: Send or Enter (Shift+Enter makes a new line). Code decides the answer
    // (src/talk.js): a pasted key first, on the full text. A key is never shown back or kept.
    function send() {
      const typed = draft
      if (!typed.trim()) return
      setDraft('')
      const result = turn(typed, visit)
      // Kept only while "Which one do you mean?" is open, for the pick that answers it. A message
      // with a key in it never gets that line, so a key is never kept here.
      memory.typed = result.kind === 'W1' ? typed : ''
      const chars = Array.from(typed.trim())
      const shown = chars.length > MAX_INPUT_CHARS ? chars.slice(0, MAX_INPUT_CHARS).join('') + '…' : chars.join('')
      answer(result, result.kind === 'K1' ? null : shown, typed)
    }

    // An answer or a topic picked under Helper's line: it becomes the person's message, and Helper
    // answers at once. The pick goes by its id, never through the key words.
    function pickAnswer(item) {
      const result = item.answer ? pick(item.answer[0], item.answer[1], visit) : item.which ? press(item.which, memory.typed, visit) : pickTopic(item.topic, visit)
      answer(result, item.label)
    }

    // A button in a Helper line: text to paste opens under it (and closes again); a part opens
    // Hermes's own screen; a line makes Helper say one more pre-written line.
    function pressNext(entry) {
      const next = entry.next
      if (!next) return
      if (next.kind === 'paste') return setLog(old => (memory.log = old.map(e => (e.id === entry.id ? { ...e, opened: !e.opened } : e))))
      if (next.kind === 'line') return answer(sayLine(next.line, visit), next.label)
      if (next.kind === 'part') {
        try {
          host.navigate(next.to)
        } catch {}
      }
    }

    // Skip, at "What's your name?" and "What do you do?".
    function skipOpening() {
      answer(skip(visit), 'Skip')
    }

    // Picking an answer on a step: saved. Helper stays silent: its lines come from the conversation only.
    function choose(option) {
      if (answers[currentStep.id] === option.id) return
      const next = { ...answers, [currentStep.id]: option.id }
      setAnswers(next)
      ctx.storage.set('answers', next)
    }

    // "I understand, next step": the step's next_rule picks the next step (code, not the model).
    // After the last step it opens Your setup.
    function finishStep() {
      const to = nextAfter(currentStep, answers[currentStep.id])
      if (to !== 'done') return saveStep(to)
      saveTab('yours')
    }

    // "Ask about this step": the keyboard goes to the message box; a folded Helper opens first.
    function askAboutStep() {
      foldHelper(false)
    }

    /* ---------- Helper's edge to drag: between 360 and 600 px, remembered ---------- */
    // The drag starts from the width on screen (in a squeezed window that is less than the
    // remembered one). Only a drag that moved the edge is saved; a press without a move, a drag
    // the system cancelled and a lost pointer leave the remembered width as it was.
    function gripDown(e) {
      if (e.button !== undefined && e.button !== 0) return
      e.preventDefault()
      drag.current = { x: e.clientX, width: fit.helperPx, before: helperWidth, moved: false }
      if (e.currentTarget && e.currentTarget.setPointerCapture && e.pointerId !== undefined) e.currentTarget.setPointerCapture(e.pointerId)
    }
    const dragged = e => clampHelperWidth(drag.current.width + (drag.current.x - e.clientX))
    function gripMove(e) {
      if (!drag.current || typeof e.clientX !== 'number') return
      // The edge is on the left: moving it left makes Helper wider.
      if (e.clientX !== drag.current.x) drag.current.moved = true
      if (drag.current.moved) setHelperWidth(dragged(e))
    }
    function gripUp(e) {
      if (!drag.current) return
      const d = drag.current
      drag.current = null
      if (typeof e.clientX !== 'number' || (!d.moved && e.clientX === d.x)) return setHelperWidth(d.before)
      const final = clampHelperWidth(d.width + (d.x - e.clientX))
      setHelperWidth(final)
      ctx.storage.set('helperWidth', final)
    }
    function gripCancel() {
      if (!drag.current) return
      const d = drag.current
      drag.current = null
      setHelperWidth(d.before)
    }
    // Arrow keys move the edge 16 px; Home is the narrowest and End the widest (the least and the
    // most of the value the edge reports). A key that would change nothing on screen (wider, in a
    // window that already squeezes Helper) is left alone, so it cannot change the remembered width
    // unseen.
    function gripKey(e) {
      const to = { ArrowLeft: fit.helperPx + GRIP_KEY_PX, ArrowRight: fit.helperPx - GRIP_KEY_PX, Home: HELPER_MIN_PX, End: HELPER_MAX_PX }[e.key]
      if (to === undefined) return
      e.preventDefault()
      const final = clampHelperWidth(to)
      const squeezed = fit.helperPx < clampHelperWidth(helperWidth)
      if (final === fit.helperPx || (squeezed && final > fit.helperPx)) return
      setHelperWidth(final)
      ctx.storage.set('helperWidth', final)
    }

    /* ---------- header: the two text tabs ---------- */
    // Arrow keys move between the tabs, Home and End go to the first and last (DESIGN.md,
    // Keyboard: one entry point at the selected tab; WAI-ARIA tabs pattern).
    function onTabKey(e, index) {
      const last = TABS.length - 1
      const to = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[e.key]
      if (to === undefined) return
      e.preventDefault()
      const next = TABS[to].id
      saveTab(next)
      const el = tabRefs.current.els[next]
      if (el) el.focus()
    }

    const tabRow = jsx('div', {
      className: K.tabs,
      role: 'tablist',
      'aria-label': 'Helper',
      'data-hh': 'tabs',
      children: TABS.map((t, i) => {
        const on = tab === t.id
        return jsx(
          'button',
          {
            type: 'button',
            role: 'tab',
            id: `hh-tab-${t.id}`,
            'aria-selected': on,
            'aria-controls': 'hh-tabpanel',
            tabIndex: on ? 0 : -1,
            'data-active': on,
            className: cx(K.textTab, on ? K.textTabOn : K.textTabIdle),
            ref: tabRefs.current.set[t.id],
            onClick: () => saveTab(t.id),
            onKeyDown: e => onTabKey(e, i),
            children: jsx('span', { className: on ? K.textTabLabelOn : K.textTabLabel, children: t.label })
          },
          t.id
        )
      })
    })

    const header = jsx('div', { className: K.head, 'data-hh': 'header', children: tabRow })

    /* ---------- step list (numbers only when the window is narrow) ---------- */
    const numbersOnly = fit.rail === 'numbers'
    const stepRow = s => {
      const on = s.number === step
      const rail = railLines(s)
      const number = jsx('span', { className: on ? K.rowNumberOn : K.rowNumber, children: s.number }, 'n')
      const button = jsxs(RowButton, {
        className: numbersOnly ? K.rowButtonNumbers : K.rowButton,
        'aria-current': on ? 'step' : undefined,
        'aria-label': numbersOnly ? `Step ${s.number}: ${s.title}` : undefined,
        onClick: () => saveStep(s.number),
        children: numbersOnly
          ? [number]
          : [
              number,
              jsxs(
                'span',
                {
                  className: K.rowText,
                  children: [
                    jsx('span', { className: K.rowTitle, children: rail.title }),
                    rail.sub ? jsx('span', { className: K.rowSub, children: jsx('span', { className: K.truncate, children: rail.sub }) }) : null
                  ]
                },
                't'
              )
            ]
      })
      return jsx(
        'div',
        {
          className: cx(K.row, on ? K.rowActive : K.rowIdle),
          children: numbersOnly ? jsx(Tip, { label: `Step ${s.number}: ${s.title}`, children: button }) : button
        },
        s.number
      )
    }

    // Steps that come later: not buttons. With numbers only, the number carries its title for
    // screen readers (role img + label) and as a tip on hover.
    const laterRow = s => {
      const inner = jsxs('div', {
        className: numbersOnly ? K.rowButtonNumbers : K.rowButton,
        role: numbersOnly ? 'img' : undefined,
        'aria-label': numbersOnly ? `Step ${s.number}: ${s.title}, comes later` : undefined,
        children: [
          jsx('span', { className: K.rowNumber, children: s.number }, 'n'),
          numbersOnly ? null : jsx('span', { className: K.rowText, children: jsx('span', { className: K.rowTitleOff, children: s.title }) }, 't')
        ]
      })
      return jsx(
        'div',
        {
          className: cx(K.row, K.rowIdle),
          'aria-disabled': true,
          children: numbersOnly ? jsx(Tip, { label: `Step ${s.number}: ${s.title}, comes later`, children: inner }) : inner
        },
        s.number
      )
    }

    const rail = jsxs(
      'nav',
      {
        className: K.rail,
        style: { width: numbersOnly ? RAIL_NUMBERS_WIDTH : RAIL_WIDTH },
        'aria-label': 'Steps',
        'data-hh': 'steps',
        'data-numbers-only': numbersOnly,
        children: [
          jsxs('div', {
            className: K.railScroll,
            children: [
              numbersOnly ? null : jsx('div', { className: cx(K.sectionLabel, K.sectionLabelPad), children: 'Steps' }),
              jsx('div', { className: K.rowList, children: STEPS.map(stepRow) }),
              jsx('div', { className: cx(K.sectionLabel, numbersOnly ? K.sectionLabelPad : K.sectionLabelGap), children: numbersOnly ? null : 'After these' }),
              jsx('div', { className: K.rowList, children: LATER_STEPS.map(laterRow) })
            ]
          }),
          numbersOnly ? null : jsx('div', { className: K.railFoot, children: VERSION_LINE })
        ]
      },
      'rail'
    )

    /* ---------- open step ---------- */
    // One primary button per screen (hhdesign fix 6): "I understand, next step"; the rest are secondary.
    const stepActions = jsxs(
      'div',
      {
        className: K.actions,
        children: [
          jsx(Button, { size: 'sm', onClick: finishStep, children: 'I understand, next step' }),
          jsx(Button, { variant: 'secondary', size: 'sm', onClick: askAboutStep, children: 'Ask about this step' })
        ]
      },
      'actions'
    )

    // A source tag that opens its docs page: "Hermes docs › {section}" (v1-strings part 5).
    const sourceLink = (url, label, key) =>
      jsx(
        'a',
        {
          className: K.chipLink,
          href: url,
          target: '_blank',
          rel: 'noreferrer',
          title: url,
          'data-hh': 'source',
          onClick: e => {
            e.preventDefault()
            openDocs(url)
          },
          onAuxClick: e => {
            e.preventDefault()
            openDocs(url)
          },
          children: label
        },
        key
      )
    const factSource = f => sourceLink(f.url || docsUrl(f.source), chipLabel(f.section), f.id || f.source + f.section)

    // The open step is wide enough for two columns (the comparison, and the answer cards).
    const wideStep = fit.columns === 2
    const here = currentStep
    const picked = answers[here.id]
    const fits = fitsGoal(answers, here.id)
    const introSources = []
    for (const src of here.intro_sources || []) {
      const key = `${src.source}#${src.section}`
      if (!introSources.some(x => x.key === key)) introSources.push({ key, url: docsUrl(src.source), label: chipLabel(src.section) })
    }

    const stepView = [
      jsxs(
        'header',
        {
          children: [
            jsx('div', { className: K.sectionLabel, children: `Step ${here.number} of ${STEPS.length}` }),
            jsx('h3', { className: K.stepTitle, children: here.title }),
            jsx('p', { className: K.prose, 'data-hh': 'intro', children: here.intro })
          ]
        },
        'head'
      ),
      introSources.length
        ? jsxs(
            'div',
            {
              className: K.chips,
              'data-hh': 'intro-sources',
              children: [jsx('span', { className: K.chipsLabel, children: 'Source' }, 'l'), ...introSources.map(x => sourceLink(x.url, x.label, x.key))]
            },
            'intro-sources'
          )
        : null,
      here.compare
        ? jsx(
            'dl',
            {
              className: cx(K.pairGrid, wideStep && K.twoColumns),
              'data-hh': 'compare',
              'data-columns': fit.columns,
              children: ['left', 'right'].map(side => {
                const c = here.compare[side]
                return jsxs(
                  'div',
                  {
                    className: K.pairSide,
                    children: [jsx('dt', { className: K.pairTitle, children: c.title }), jsx('dd', { className: K.caption, children: c.text }), factSource(c)]
                  },
                  side
                )
              })
            },
            'compare'
          )
        : null,
      jsx(
        'ul',
        {
          className: K.factList,
          'data-hh': 'facts',
          children: here.facts.map(f =>
            jsxs('li', { className: K.fact, 'data-fact': f.id, children: [jsx('p', { className: K.factText, children: f.text }), factSource(f)] }, f.id)
          )
        },
        'facts'
      ),
      jsxs(
        'div',
        {
          className: K.scaffold,
          'data-hh': 'video',
          children: [
            jsx('span', { className: K.scaffoldGlyph, children: jsx(Codicon, { name: 'play-circle', size: '0.875rem' }) }),
            jsx('span', { children: LINES.videoLater })
          ]
        },
        'video'
      ),
      jsxs(
        'section',
        {
          children: [
            jsx('div', { className: K.question, children: here.question }),
            jsx('div', {
              className: cx(K.choices, wideStep && K.twoColumns),
              role: 'group',
              'aria-label': here.question,
              'data-hh': 'choices',
              'data-columns': fit.columns,
              children: here.options.map(o =>
                jsxs(
                  'button',
                  {
                    type: 'button',
                    'aria-pressed': picked === o.id,
                    className: cx(K.choice, picked === o.id ? K.choiceOn : K.choiceOff),
                    'data-option': o.id,
                    onClick: () => choose(o),
                    children: [
                      jsxs('span', {
                        className: K.choiceText,
                        children: [jsx('span', { className: K.choiceLabel, children: o.label }), o.hint ? jsx('span', { className: K.choiceSub, children: o.hint }) : null]
                      }, 't'),
                      fits === o.id ? jsx('span', { className: K.fitTag, 'data-hh': 'fits-goal', children: LINES.fitsGoal }, 'fit') : null
                    ]
                  },
                  o.id
                )
              )
            })
          ]
        },
        'question'
      ),
      stepActions
    ]

    const yoursView = renderYourSetup(setup, {
      openStep: n => {
        saveStep(n)
        saveTab('setup')
      },
      cardColumns: fit.cardColumns
    })

    const main = jsx(
      'main',
      {
        className: K.detail,
        'data-hh': 'detail',
        // The tabs' panel (the tabs point here with aria-controls).
        role: 'tabpanel',
        id: 'hh-tabpanel',
        'aria-labelledby': `hh-tab-${tab}`,
        children: jsx('div', { className: K.detailScroll, children: jsxs('div', { className: tab === 'setup' ? K.detailInner : K.detailInnerWide, children: tab === 'setup' ? stepView : yoursView }) })
      },
      'main'
    )

    /* ---------- Helper's conversation window (design/talk-r3, version 1 of the speech bubble) ---------- */
    // The newest thing said is Helper's: it is in the bubble, and everything before it is the
    // conversation so far. (While Helper works on an answer the newest thing is the person's
    // message; then the bubble is the three dots.)
    const newest = log[log.length - 1]
    const inBubble = newest && newest.who === 'helper' ? newest : null
    const older = inBubble ? log.slice(0, -1) : log
    // The line appears word by word (src/reveal.js) unless reduce motion is on: then it is whole
    // from its first draw. said = all of it is on screen: answers and buttons wait for that.
    const fresh = !reduced
    let said = true
    if (inBubble) {
      const words = wordsOf(inBubble.text).length
      saidNow.push({ key: inBubble.key, words, fresh, text: inBubble.text })
      said = clock.shown(inBubble.key, words, fresh) >= words
    }
    // Which expression the character shows (src/expressions.js). Asking: Helper's newest line
    // ends with a question mark and all of it is on screen.
    const question = !!inBubble && said && asksQuestion(inBubble.text)
    const expression = expressionFor({ revealing, busy: busyNow, question })
    const toPick = inBubble && inBubble.answers && inBubble.answers.items.length ? inBubble.answers : null
    // "Skip" shows while one of the opening's two questions is still open (the visit's stage, not
    // the newest line: a pasted key at "What's your name?" gets its own line and Skip stays).
    const openingOpen = visit.stage === 'name' || visit.stage === 'work'

    // The character sits on the message box's top edge (placed by src/talk.css). It rises when
    // Helper comes on screen.
    const character = jsx(Character, { size: fit.characterPx, expression, rising: !risen.current, reduced, eyes: eyes.current })

    // A rounded box that grows as you type, and a round send button on its right, like Hermes's
    // own composer. It works without a model: picks and key words need none.
    const composer = jsx(
      'form',
      {
        onSubmit: e => {
          e.preventDefault()
          send()
        },
        'data-hh': 'composer',
        children: jsxs('div', {
          className: cx(K.composerSurface, composerSurfaceRing),
          children: [
            jsx('div', { 'aria-hidden': true, className: composerInputBacking }, 'backing'),
            jsxs(
              'div',
              {
                className: K.composerRow,
                children: [
                  jsx(
                    'div',
                    {
                      className: K.composerInputCell,
                      children: jsx(Textarea, {
                        ref: askBox,
                        rows: 1,
                        className: K.composerInput,
                        value: draft,
                        // The whole text is kept: the pasted-key check reads all of it (src/key-check.js).
                        onChange: e => setDraft(e.target.value),
                        onKeyDown: e => {
                          if (e.key !== 'Enter' || e.shiftKey || (e.nativeEvent && e.nativeEvent.isComposing)) return
                          e.preventDefault()
                          send()
                        },
                        placeholder: hintFor(inBubble),
                        'aria-label': 'Message to Helper'
                      })
                    },
                    'input'
                  ),
                  openingOpen ? jsx('button', { type: 'button', className: T.skip, 'data-hh': 'skip', onClick: skipOpening, children: 'Skip' }, 'skip') : null,
                  jsx(
                    Button,
                    {
                      'aria-label': 'Send',
                      className: cx(PRIMARY_ICON_BTN, K.composerSend),
                      disabled: !draft.trim(),
                      type: 'submit',
                      children: jsx(Codicon, { name: 'arrow-up', size: '0.875rem' })
                    },
                    'send'
                  )
                ]
              },
              'row'
            )
          ]
        })
      },
      'composer'
    )

    let helperArea = null
    if (helperShown) {
      const over = fit.helper === 'over'
      helperArea = jsxs(
        'div',
        {
          className: cx(T.win, fit.tight && T.winTight, fit.small && T.winSmall, over && T.winOver),
          // Over a narrow page it leaves the strip free, and keeps its fill under Hermes's
          // see-through look (data-glass-opaque is Hermes's own switch for that).
          style: over ? { width: `${fit.helperPx}px`, right: `${STRIP_PX}px` } : { width: `${fit.helperPx}px` },
          role: 'complementary',
          'aria-label': 'Helper',
          'data-hh': 'helper',
          'data-over': over,
          'data-glass-opaque': over ? '' : undefined,
          // Escape folds the helper that lies over the page (as Hermes's own overlays do).
          onKeyDown: over
            ? e => {
                if (e.key !== 'Escape') return
                e.preventDefault()
                foldHelper(true)
              }
            : undefined,
          children: [
            fit.grip ? jsx(Grip, { width: fit.helperPx, min: HELPER_MIN_PX, max: HELPER_MAX_PX, onDown: gripDown, onMove: gripMove, onUp: gripUp, onCancel: gripCancel, onKey: gripKey }, 'grip') : null,
            jsx(Conversation, { entries: older, onNext: pressNext, scrollRef: helperScroll }, 'conversation'),
            inBubble ? jsx(Bubble, { entry: inBubble, clock, fresh, said, onNext: pressNext }, 'bubble') : jsx(BusyDots, { lit: 0 }, 'bubble'),
            jsx(Under, { character, answers: toPick, said, onPick: pickAnswer }, 'under'),
            composer
          ]
        },
        'helper'
      )
    }

    // The "Helper" strip at the page's right edge, written down it, in a window too narrow for
    // both sides: it folds Helper away and brings it back. It stays clear of Hermes's title-bar
    // band, where Hermes's own window buttons float.
    const strip =
      fit.helper !== 'column'
        ? jsxs(
            'button',
            {
              type: 'button',
              className: K.strip,
              style: { paddingTop: 'calc(var(--titlebar-height) + 0.75rem)' },
              'aria-label': folded ? 'Show the helper' : 'Hide the helper',
              'aria-expanded': !folded,
              'data-hh': 'helper-strip',
              ref: stripButton,
              onClick: () => foldHelper(!folded),
              children: [jsx(Codicon, { name: folded ? 'chevron-left' : 'chevron-right', size: '0.875rem' }, 'icon'), jsx('span', { className: K.stripLabel, children: 'Helper' }, 'label')]
            },
            'strip'
          )
        : null

    // The left side: the tabs, and under them the step list and the open step (or Your setup).
    const left = jsxs(
      'div',
      {
        className: K.left,
        'data-hh': 'left',
        children: [header, jsx('div', { className: K.body, 'data-hh': 'body', children: tab === 'setup' ? [rail, main] : [main] }, 'body')]
      },
      'left'
    )
    return jsxs('div', {
      className: K.root,
      ref: measureRef,
      'data-hh': 'page',
      // The measured size, for the real-app checks (dev/checks/talk-v1).
      'data-width': width,
      'data-height': size.height,
      // The eyes (src/eyes.js) hear the cursor, the keyboard's focus and scrolling from this box
      // only, never from the Hermes window: so they follow only while the cursor is over our page.
      onPointerMove: e => eyes.current.pointerMove(e.clientX, e.clientY),
      onPointerLeave: () => eyes.current.pointerLeave(),
      onFocus: e => eyes.current.focus(e.target),
      onBlur: e => {
        if (!e.relatedTarget || !e.currentTarget || !e.currentTarget.contains(e.relatedTarget)) eyes.current.blur()
      },
      onScrollCapture: () => eyes.current.scroll(),
      // The person types or presses the mouse while words are still appearing: the rest appears at once.
      onKeyDownCapture: e => {
        if (!LONE_KEYS.includes(e.key)) clock.finishAll()
      },
      onPointerDownCapture: () => clock.finishAll(),
      // Our one style sheet (src/talk.css) lives inside our own page, so it leaves with the page.
      children: [jsx('style', { 'data-hh': 'talk-css', children: TALK_CSS }, 'css'), left, strip, helperArea]
    })
  }
}

// ---- src/main.js ----
// Plugin entry: one sidebar row and one full page. Nothing else is registered: no tools, hooks,
// panes, timers or network.

const ID = 'helper'
const PATH = '/helper'

export default {
  id: ID,
  name: 'Helper',
  register(ctx) {
    const Page = makePage(ctx)
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: PATH }, render: () => jsx(Page, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: PATH, label: 'Helper', codicon: 'compass' } }
    ])
  }
}
