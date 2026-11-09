// Helping Hand: a Hermes Desktop plugin. Built by scripts/build.mjs from src/; edit src/, not this file.
// Licence: MIT (see LICENSE).
import { Button, Codicon, CopyButton, GlyphSpinner, PRIMARY_ICON_BTN, ROUTES_AREA, RowButton, SIDEBAR_NAV_AREA, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Textarea, Tip, composerInputBacking, composerSurfaceRing, host, useValue } from '@hermes/plugin-sdk'
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
function rememberCard(answer) {
  if (answer === 'yes') return { status: 'works', lines: [REMEMBER.worked] }
  if (answer === 'no') return { status: 'fix', lines: [], reasonsLead: REMEMBER.reasonsLead, reasons: REMEMBER.reasons }
  return { status: 'unchecked', lines: [] }
}

// ---- src/steps-data.js ----
// Generated by scripts/build.mjs from content/steps-v1.json (hhcontent's fixed step text). Edit the
// JSON, then build; tests/steps.test.mjs checks the data (build-v1.md section 6).
const STEPS_DATA = {
  "about": "Helping Hand v1 step data, steps 1-4. Written by hhcontent, 9 Nov 2026. Shape: docs/plan/build-v1.md section 6, plus optional fields listed in content/v1-strings.md part 4. All text is fixed; code fills only the {slots}. Checked by dev/checks/hhcontent/check-steps-v1.mjs.",
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
// Page and helper-panel state, kept in ctx.storage on the person's computer (build-v1.md P5, P11).
// Keys: side (right | left), helper (open | hidden | closed), tab (setup | yours), step (1-4),
// chatlog (true | false), answers ({ stepId: optionId }, the person's picks on the steps).
// Anything unexpected in storage falls back to the default.

const STEP_COUNT = STEPS.length

function readState(get) {
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

function otherSide(side) {
  return side === 'left' ? 'right' : 'left'
}

// ---- src/helper-chat.js ----
// What the helper says in B3, as plain data (rendered by page.js): one entry per thing said.
// Entry: { who: 'you' | 'helper', kind, lines: [text], fact?, paste?, after?, link?, action? }
// Code decides every entry; no model is asked in B3 (its call is B4). Typed words go through the
// checks of build-v1.md section 7 in their order (src/key-check.js): a pasted key first, on the
// full text; then the build words (straight to the hand-over text); then the 500-character cut.

// The greeting: the first thing in the chat log.
function greetingEntry() {
  return { who: 'helper', kind: 'greeting', lines: [LINES.greeting] }
}

// The person picked an answer: "Your answer: …" and the fact that answer points to, with its source.
function answerEntry(step, optionId) {
  const option = step.options.find(o => o.id === optionId)
  if (!option) return null
  const fact = step.facts.find(f => f.id === option.fact) || null
  return { who: 'helper', kind: 'answer', lines: [fill(LINES.yourAnswer, { option_label: option.label })], fact }
}

// "I understand, next step" on the last step (its next_rule says "done").
function doneEntry() {
  return { who: 'helper', kind: 'done', lines: [LINES.afterLast], action: 'yours' }
}

// What the person typed, on the open step. Returns the entries to add (none for an empty box).
// A pasted key is never shown back or kept: only the fixed line is added.
function typedEntries(text, { step, answers }) {
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

// ---- src/look.js ----
// Every class name the page uses, in one table. Each string is copied from Hermes Desktop's own
// source (v0.23.0, apps/desktop/src/...; the file is named above each group), so the page wears
// exactly the classes Hermes's own screens wear and needs no CSS of its own.
// Why one table: Hermes's stylesheet only holds classes its own code uses. A class we invent would
// silently do nothing, so scripts/check-hermes-classes.mjs checks every token here against the built
// Hermes CSS, and tests/plugin-shape.test.mjs fails if page code writes a class string anywhere else.

const K = {
  // ---- page frame (app/page-search-shell.tsx: Capabilities' page shell, header with tabs) ----
  root: 'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden',
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
  headEnd: 'ml-auto flex shrink-0 items-center gap-0.5',
  // relative: the helper opened over a narrow page (layout.js 'over') is placed inside it.
  body: 'relative flex min-h-0 flex-1',

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

  // ---- helper panel (a page column, like Hermes's right sidebar; master-detail.tsx DetailPane header) ----
  // No line on its edge: Hermes's own sidebar has none, only the step from its fill to the page's
  // (hhdesign fix 5; the Nous theme tints --ui-stroke-tertiary with its accent, so a line read as one).
  helper: 'flex min-h-0 shrink-0 flex-col bg-(--ui-sidebar-surface-background)',
  // Opened from the strip while the window is too narrow for a column: it lies over the page, on
  // its side, at full height (layout.js 'over').
  helperOver: 'absolute inset-y-0 z-20 shadow-lg',
  helperOverRight: 'right-0',
  helperOverLeft: 'left-0',
  helperTop: 'flex h-9 shrink-0 items-center gap-2 px-3',
  helperTopLabel: 'min-w-0 truncate text-xs font-medium text-foreground',
  // RoomHeader's ghost icon buttons (plugins/hermes-bots/group-room-ui.tsx)
  iconTone: 'text-(--ui-text-tertiary)',
  helperBody: 'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-1 pt-1',
  // Pēteris's sketch (inputs/pb-sketch-9nov-helper-chat.png): the helper's words sit low, as plain
  // text with no bubble or card, and the space opens above them. mt-auto, not justify-end, so a
  // long chat log can still be scrolled to its top.
  helperNewest: 'mt-auto flex flex-col gap-3',
  // The helper's words: the chat's own message text (plugins/hermes-bots/group-room-ui.tsx RoomMessage body)
  say: 'text-pretty text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground',
  sayStack: 'flex min-w-0 flex-col gap-1.5',
  sayActions: 'mt-1 flex flex-wrap items-center gap-2',
  // Chat log on: the whole back-and-forth as a plain list, newest at the bottom. Each entry has
  // its speaker in RoomMessage's small time-stamp tone, then the words.
  log: 'flex min-w-0 flex-col gap-3',
  logEntry: 'flex min-w-0 flex-col gap-0.5',
  logWho: 'text-[0.6875rem] font-medium text-(--ui-text-tertiary)',
  // The person's own words in the log: the same text, one tone quieter than the helper's
  logYou: 'wrap-anywhere text-pretty text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-(--ui-text-secondary)',
  // The character stands small at the bottom right, just above the message box, with three
  // thought dots trailing from it up toward the words (the sketch). The dots are the room's typing
  // dots (RoomTyping: size-1.5 rounded-full, secondary text colour), in three sizes, fainter.
  characterRow: 'flex shrink-0 items-end justify-end gap-1 px-4',
  thoughtDots: 'mb-6 flex items-end gap-1',
  thoughtDot1: 'mb-4 size-1 rounded-full bg-(--ui-text-quaternary)',
  thoughtDot2: 'mb-2 size-1.5 rounded-full bg-(--ui-text-quaternary)',
  thoughtDot3: 'size-2 rounded-full bg-(--ui-text-quaternary)',
  // Composer: plugins/hermes-bots/group-room-ui.tsx RoomComposer (rounded surface, round send
  // button), on one row like Hermes's chat composer. No model name (the sketch drops it; it stays
  // on the Your setup card).
  composerForm: 'px-3 pb-3 pt-1',
  composerSurface: 'relative isolate rounded-2xl',
  composerRow: 'flex items-end gap-x-(--composer-control-gap) px-(--composer-surface-pad-x) py-(--composer-surface-pad-y)',
  composerInputCell: 'min-w-0 flex-1',
  // One line that grows as you type, no resize grip: CLARIFY_TEXTAREA_CLASS
  // (components/assistant-ui/clarify/core/shell.tsx) on the room composer's input.
  composerInput:
    'field-sizing-content max-h-40 min-h-0 resize-none !border-transparent !bg-transparent !shadow-none px-1 py-1 text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) placeholder:text-(--ui-text-tertiary)',
  composerSend: 'shrink-0',

  // ---- hidden helper: a thin full-height strip at the page edge, its label written vertically
  // (hhdesign fix 4): components/ui/pane-tab.tsx TAB_VERTICAL and the collapsed kanban column
  // (plugins/kanban/board.tsx), on the open helper's fill ----
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
  cardPasteText: 'min-w-0 flex-1 font-mono text-[0.65rem] text-(--ui-text-tertiary)',
  cardList: 'list-decimal space-y-1 pl-4 text-[0.72rem] leading-snug text-(--ui-text-secondary)',
  pageActions: 'flex flex-wrap items-center gap-2 pt-1'
}

// Joins class names, skipping empty ones. Only K values go in.
function cx(...names) {
  return names.filter(Boolean).join(' ')
}

// Every codicon the plugin names (sidebar row and page). scripts/check-hermes-classes.mjs checks
// they exist in the codicon font Hermes ships; a test checks the code names no others.
const ICONS = ['compass', 'arrow-swap', 'chevron-left', 'chevron-right', 'close', 'arrow-up', 'play-circle', 'location', 'info']
// Hermes's look has one primary button per screen (hhdesign fix 6); every other button of
// ours is secondary or ghost. tests/page-render.test.mjs counts them per screen.

// ---- src/layout.js ----
// How the page fits a narrow window (Lead's decision for B3a; hhtech's b1-verify.md section 2C).
// Pure rules, no React: page.js measures our own page element (a ResizeObserver on our own
// markup, nothing of Hermes's) and asks layoutFor() what to show. In order:
//   1. the open step (or the Your setup column) must stay at least MIN_MAIN_PX wide. If an open
//      helper would push it under that, the helper folds into its edge strip by itself. Nothing is
//      saved: the helper comes back when the window is wider again.
//   2. if the open step is still under MIN_MAIN_PX, the step list shrinks to its numbers.
//   3. the two-column facts (and the three answer choices) stack into one column under
//      TWO_COLUMNS_PX; the Your setup cards do the same under CARD_COLUMNS_PX.
// The widths match the inline column widths page.js sets (16rem, 3rem, 20rem) and the strip's w-7.

const RAIL_PX = 256
const RAIL_NUMBERS_PX = 48
const HELPER_PX = 320
const STRIP_PX = 28
const MIN_MAIN_PX = 320
// The open step's own padding is 24 px a side, so 520 leaves two facts of about 226 px each.
const TWO_COLUMNS_PX = 520
// Two cards of about 270 px each, after the padding and the 12 px gap.
const CARD_COLUMNS_PX = 600

// width: our page's measured width in px (0 or missing = not measured yet: lay out as wide).
// tab: 'setup' | 'yours'. helper: the person's choice, 'open' | 'hidden' | 'closed'.
// peek: the person opened the helper from its strip while the window is too narrow for the
// column (shown over the page; nothing saved).
// Returns:
//   helper: 'open' | 'strip' | 'over' | 'none'   what the helper column shows
//   folded: true when the page folded the helper by itself
//   narrow: true when an open helper would not fit as a column on this tab
//   rail:   'full' | 'numbers' | 'none'          the step list (none on Your setup)
//   main:   the open step's (or Your setup's) width in px, Infinity when not measured
//   columns: 1 | 2   facts (two) and choices (three) side by side;   cardColumns: 1 | 2
function layoutFor({ width, tab, helper, peek = false }) {
  const w = typeof width === 'number' && width > 0 ? width : Infinity
  const railFull = tab === 'setup' ? RAIL_PX : 0
  const narrow = w - railFull - HELPER_PX < MIN_MAIN_PX

  let shown = helper === 'open' ? 'open' : helper === 'hidden' ? 'strip' : 'none'
  const folded = helper === 'open' && narrow
  if (folded) shown = 'strip'
  if (narrow && peek && shown === 'strip') shown = 'over'
  // The width the helper takes beside the page: the column, the strip, or nothing.
  const edgePx = shown === 'open' ? HELPER_PX : shown === 'none' ? 0 : STRIP_PX

  let rail = tab === 'setup' ? 'full' : 'none'
  let railSpace = railFull
  if (rail === 'full' && w - RAIL_PX - edgePx < MIN_MAIN_PX) {
    rail = 'numbers'
    railSpace = RAIL_NUMBERS_PX
  }

  const main = w - railSpace - edgePx
  return {
    helper: shown,
    folded,
    narrow,
    rail,
    main,
    columns: main >= TWO_COLUMNS_PX ? 2 : 1,
    cardColumns: main >= CARD_COLUMNS_PX ? 2 : 1
  }
}

// ---- src/pet-sheet.js ----
// The helper's pet sprite sheet, when there is one. null today: the character is the drawn hand.
// Pēteris is having the pet made (inputs/pb-notes-9nov.md note 3). When it arrives, this becomes
//   { ink: 'data:image/webp;base64,…', fill: 'data:image/webp;base64,…' | null }
// built by a script from the source picture (docs/answers/hhtech-pet.md, For builder). The sheet
// uses the petdex layout: 8 columns × 9 rows of 192 × 208 cells, one row per state (SHEET in
// src/character.js). Each picture is a single-colour mask: only its shape (alpha) counts, because
// the page paints it in the person's theme colours.
const PET_SHEET = null

// ---- src/character.js ----
// The helper's character: one swappable component, used by the page only through <Character>.
// Today it draws hhdesign's hand (design/hermes-look-r3) as inline SVG. Given a pet sheet
// (src/pet-sheet.js) it draws the pet instead, the way hhtech checked in the real app
// (dev/checks/hhtech-pet/plugin.template.js): two stacked divs, the fill below and the ink on top,
// each a CSS mask holding the sheet, painted in theme colours (the ink is var(--ui-accent)); the
// mask position picks the frame, and element.animate() steps through the row's frames.
// Poses are the petdex rows the helper uses: idle, waving, jumping, failed, review (poseFor).
// Colours: theme variables only, as inline styles, so there is no stylesheet to clean up.

/* ---------- which pose ---------- */

// The petdex layout (Hermes's pets: 8 columns × 9 rows of 192 × 208 cells; 6 frames a row over
// 1.1 s unless the sheet says otherwise, as Hermes's own pet-sprite.tsx defaults).
const SHEET = { cols: 8, rows: 9, cellW: 192, cellH: 208, frames: 6, loopMs: 1100 }
// Row of each pose in that layout (Hermes's DEFAULT_STATE_ROWS: 0 idle, 3 waving, 4 jumping,
// 5 failed, 8 review).
const POSE_ROW = { idle: 0, waving: 3, jumping: 4, failed: 5, review: 8 }
// How long a one-off pose (waving, jumping) plays before going back to idle: two loops.
const FLASH_MS = 2 * SHEET.loopMs

// The page's state as a pose, in this order: an error (the check failed) = failed; the model
// is answering = review; a one-off pose that is playing (waving when the helper opens, jumping
// when a step is finished); otherwise idle.
function poseFor({ model, answering = false, flash = null } = {}) {
  if (model === 'error') return 'failed'
  if (answering) return 'review'
  if (flash === 'waving' || flash === 'jumping') return flash
  return 'idle'
}

/* ---------- the sprite (when a sheet is set) ---------- */

const frameCount = (sheet, row) => {
  const n = sheet && sheet.framesByRow ? sheet.framesByRow[row] : undefined
  return Number.isInteger(n) && n > 0 && n <= SHEET.cols ? n : SHEET.frames
}

// One layer's inline style: the whole sheet as a mask, scaled, moved to (frame, row).
function spriteLayer(url, colour, { row, frame = 0, scale }) {
  const w = SHEET.cellW * scale
  const h = SHEET.cellH * scale
  const size = `${SHEET.cols * w}px ${SHEET.rows * h}px`
  const pos = `${-frame * w}px ${-row * h}px`
  return {
    position: 'absolute',
    inset: 0,
    background: colour,
    maskImage: `url("${url}")`,
    WebkitMaskImage: `url("${url}")`,
    maskSize: size,
    WebkitMaskSize: size,
    maskPosition: pos,
    WebkitMaskPosition: pos,
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat'
  }
}

// The two key frames for element.animate(): from the row's first frame to just past its last,
// played with steps(n), so each frame shows for an equal share of the loop.
function spriteAnimation(sheet, row, scale) {
  const n = frameCount(sheet, row)
  const w = SHEET.cellW * scale
  const y = `${-row * SHEET.cellH * scale}px`
  return {
    keys: [
      { maskPosition: `0px ${y}`, WebkitMaskPosition: `0px ${y}` },
      { maskPosition: `${-n * w}px ${y}`, WebkitMaskPosition: `${-n * w}px ${y}` }
    ],
    options: { duration: Math.round((SHEET.loopMs * n) / SHEET.frames), iterations: Infinity, easing: `steps(${n}, end)` }
  }
}

const INK_COLOUR = 'var(--ui-accent)'
// hhtech: --ui-bg-elevated as the fill is almost invisible in both themes; the hand's own body
// tone (the accent mixed into the page surface) reads as a solid figure in light and dark.
const FILL_COLOUR = 'color-mix(in oklab, var(--ui-accent) 18%, var(--ui-editor-surface-background))'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/* ---------- the drawn hand (no sheet) ---------- */

const BODY =
  'M31 73c-5.5 0-9-3.4-9-9v-10.5c-4.6-1.1-9-5.3-9.6-10.4-.5-4.3 3.4-6.9 7.1-4.6 1 .6 1.8 1.4 2.5 2.4V29c0-11 8.6-19 20-19s20 8 20 19v35c0 5.6-3.5 9-9 9z'

const SURFACE = 'var(--ui-editor-surface-background)'
const mix = pct => `color-mix(in oklab, var(--ui-accent) ${pct}%, ${SURFACE})`
const INK = { fill: 'var(--ui-text-primary)' }
const INK_LINE = { fill: 'none', stroke: 'var(--ui-text-primary)', strokeWidth: 2, strokeLinecap: 'round' }

// size: the character's height in px. pose: one of POSE_ROW's names. sheet: a pet sheet, or null
// for the drawn hand (default: src/pet-sheet.js).
function Character({ size = 48, pose = 'idle', sheet = PET_SHEET, shadow = true, label = 'Helping Hand' }) {
  const gid = 'hh-g' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const ink = useRef(null)
  const fill = useRef(null)
  const shown = pose in POSE_ROW ? pose : 'idle'
  const row = POSE_ROW[shown]
  const scale = size / SHEET.cellH

  useEffect(() => {
    if (!sheet || reducedMotion()) return
    const { keys, options } = spriteAnimation(sheet, row, scale)
    const running = [ink.current, fill.current].filter(el => el && typeof el.animate === 'function').map(el => el.animate(keys, options))
    return () => running.forEach(a => a.cancel())
  }, [sheet, row, scale])

  const a11y = {
    role: label ? 'img' : undefined,
    'aria-label': label || undefined,
    'aria-hidden': label ? undefined : true,
    'data-hh-character': sheet ? 'pet' : 'hand',
    'data-pose': shown
  }

  if (sheet) {
    return jsxs('div', {
      ...a11y,
      style: { position: 'relative', flex: 'none', width: Math.round(SHEET.cellW * scale), height: size },
      children: [
        sheet.fill ? jsx('div', { ref: fill, 'data-hh': 'pet-fill', style: spriteLayer(sheet.fill, FILL_COLOUR, { row, scale }) }, 'fill') : null,
        jsx('div', { ref: ink, 'data-hh': 'pet-ink', style: spriteLayer(sheet.ink, INK_COLOUR, { row, scale }) }, 'ink')
      ]
    })
  }

  const mouth = shown === 'failed' ? 'M39.5 45h8' : 'M39 43.5q4.5 4 9 0'
  return jsxs('svg', {
    ...a11y,
    viewBox: '0 0 80 80',
    width: size,
    height: size,
    style: { display: 'block', flex: 'none' },
    children: [
      jsx('defs', {
        children: jsxs('linearGradient', {
          id: gid,
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 1,
          children: [
            jsx('stop', { offset: 0, style: { stopColor: mix(62) } }),
            jsx('stop', { offset: 1, style: { stopColor: mix(80) } })
          ]
        })
      }),
      shadow ? jsx('ellipse', { cx: 42, cy: 76.5, rx: 19, ry: 2.4, style: { fill: 'var(--ui-text-primary)', opacity: 0.1 } }) : null,
      jsx('path', { d: BODY, fill: `url(#${gid})` }),
      jsx('path', { d: 'M22 50.5c1.6 1.3 2.6 1.9 4.4 2.4', style: { fill: 'none', stroke: 'var(--ui-accent)', strokeWidth: 1.6, strokeLinecap: 'round' } }),
      jsx('rect', { x: 22, y: 64, width: 40, height: 9, rx: 4.5, style: { fill: mix(30) } }),
      jsx('ellipse', { cx: 37, cy: 35, rx: 3.3, ry: 4.3, style: INK }),
      jsx('ellipse', { cx: 50, cy: 35, rx: 3.3, ry: 4.3, style: INK }),
      jsx('circle', { cx: 38.3, cy: 33.3, r: 1.1, style: { fill: SURFACE } }),
      jsx('circle', { cx: 51.3, cy: 33.3, r: 1.1, style: { fill: SURFACE } }),
      jsx('circle', { cx: 31, cy: 43.5, r: 3, style: { fill: mix(35), opacity: 0.9 } }),
      jsx('circle', { cx: 56, cy: 43.5, r: 3, style: { fill: mix(35), opacity: 0.9 } }),
      jsx('path', { d: mouth, style: INK_LINE })
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

function makeSetupCards(ctx) {
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

// ---- src/page.js ----
// The Helping Hand page: header with two text tabs, step list, open step, helper panel.
// B1 = the page shell; B2 = the "Your setup" cards; B3a = the native pass (hhdesign's
// b1-design-review.md fixes) and narrow windows (src/layout.js); B3 = Setup steps 1-4 from
// hhcontent's data (src/steps.js) and the helper panel from Pēteris's sketch. The helper's model
// call is B4: until then everything the helper says is fixed text chosen by code (src/helper-chat.js).
// Look: Hermes's own UI kit components (Button, Switch, Textarea, Tip, GlyphSpinner, Codicon,
// RowButton, CopyButton) and, where Hermes has no kit component (its text tabs and vertical strips
// aren't in the SDK), the class strings its own screens use (src/look.js). No CSS of our own.

// Column widths (layout only; every colour, font and line comes from Hermes's classes).
const RAIL_WIDTH = `${RAIL_PX}px`
const RAIL_NUMBERS_WIDTH = `${RAIL_NUMBERS_PX}px`
const HELPER_WIDTH = `${HELPER_PX}px`

const TABS = [
  { id: 'setup', label: 'Setup' },
  { id: 'yours', label: 'Your setup' }
]

function HelperIconButton({ icon, label, onClick, tip = true }) {
  const button = jsx(Button, {
    'aria-label': label,
    className: K.iconTone,
    onClick,
    size: 'icon-sm',
    variant: 'ghost',
    children: jsx(Codicon, { name: icon })
  })
  // Hermes tips icon buttons whose job isn't on screen, but never a close X (DESIGN.md "Buttons").
  return tip ? jsx(Tip, { label, children: button }) : button
}

// Our own page's width, from a ResizeObserver on our own element (never Hermes's markup). The ref
// function is made once, so React doesn't detach and re-attach it on every render; React calls it
// with null on unmount, which stops the observer. 0 until measured, which layoutFor() reads as wide.
function useOwnWidth() {
  const [width, setWidth] = useState(0)
  const holder = useRef(null)
  if (!holder.current) {
    const box = { observer: null }
    box.ref = node => {
      if (box.observer) box.observer.disconnect()
      box.observer = null
      if (!node || typeof ResizeObserver !== 'function') return
      box.observer = new ResizeObserver(entries => {
        const entry = entries[entries.length - 1]
        if (entry) setWidth(Math.round(entry.contentRect.width))
      })
      box.observer.observe(node)
    }
    holder.current = box
  }
  return [width, holder.current.ref]
}

function makePage(ctx) {
  const useSetupCards = makeSetupCards(ctx)
  const sleep = ms => new Promise(resolve => ctx.setTimeout(resolve, ms))
  // Last successful model check (ok or none), shared by every mount of the page while the plugin
  // is loaded. A failed check is not kept, so the next open asks again.
  let lastCheck = null
  // The chat log, kept while the plugin is loaded (leaving the page and coming back keeps it;
  // nothing is written to disk). Each entry gets an id for React's list keys.
  let chatMemory = null
  let nextEntryId = 1
  const withIds = entries => entries.filter(Boolean).map(e => ({ ...e, id: nextEntryId++ }))
  const LOG_MAX = 200
  // Opens a docs page in the person's browser (the SDK's OS door; false when unavailable).
  const openDocs = url => {
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

  return function HelpingHandPage() {
    const [initial] = useState(() => readState((k, d) => ctx.storage.get(k, d)))
    const [side, setSide] = useState(initial.side)
    const [helper, setHelper] = useState(initial.helper)
    const [tab, setTab] = useState(initial.tab)
    const [step, setStep] = useState(initial.step)
    const [chatlog, setChatlog] = useState(initial.chatlog)
    const [answers, setAnswers] = useState(initial.answers)
    const [log, setLog] = useState(() => chatMemory || (chatMemory = withIds([greetingEntry()])))
    // A one-off pose of the character (waving, jumping), played for FLASH_MS.
    const [flash, setFlash] = useState(null)
    const flashStop = useRef(null)
    const [draft, setDraft] = useState('')
    const [focusAsk, setFocusAsk] = useState(false)
    const [focusStrip, setFocusStrip] = useState(false)
    // The person opened the helper from its strip while the window is too narrow for the column:
    // it then lies over the page. Not saved: it ends when the window is wide enough again.
    const [peek, setPeek] = useState(false)
    const [width, measureRef] = useOwnWidth()
    const [modelStatus, recheck] = useModelStatus()
    const setup = useSetupCards({ active: tab === 'yours', launchModel: modelStatus, recheckLaunch: recheck })
    const askBox = useRef(null)
    const stripButton = useRef(null)
    // One ref function per tab, made once (like useOwnWidth's), kept with the tab buttons.
    const tabRefs = useRef(null)
    if (!tabRefs.current) {
      const els = {}
      tabRefs.current = { els, set: Object.fromEntries(TABS.map(t => [t.id, el => (els[t.id] = el)])) }
    }

    const fit = layoutFor({ width, tab, helper, peek })

    const keep = (key, setter) => value => {
      setter(value)
      ctx.storage.set(key, value)
    }
    const saveSide = keep('side', setSide)
    const saveHelper = keep('helper', setHelper)
    const saveTab = keep('tab', setTab)
    const saveStep = keep('step', setStep)
    const saveChatlog = keep('chatlog', setChatlog)

    // "Ask about this step" focuses the message box once it is on screen; a request that finds no
    // box (no model) is dropped, so it can't steal focus later.
    useEffect(() => {
      if (!focusAsk) return
      if (askBox.current) askBox.current.focus()
      setFocusAsk(false)
    }, [focusAsk])

    // Closing the helper that lay over the page hands the keyboard back to the strip.
    useEffect(() => {
      if (!focusStrip) return
      if (stripButton.current) stripButton.current.focus()
      setFocusStrip(false)
    }, [focusStrip])

    // The window got wide enough for the column: an open "over the page" ends. Only a change of
    // width ends it, so switching tabs in a narrow window keeps the helper the person opened.
    useEffect(() => {
      if (peek && !fit.narrow) setPeek(false)
    }, [width])

    const currentStep = stepByNumber(step) || STEPS[0]
    const noModel = modelStatus.state === 'none'
    const helperShown = fit.helper === 'open' || fit.helper === 'over'

    function addToLog(entries) {
      const fresh = withIds(entries)
      if (!fresh.length) return
      setLog(old => (chatMemory = [...old, ...fresh].slice(-LOG_MAX)))
    }

    function playFlash(pose) {
      if (flashStop.current) flashStop.current()
      setFlash(pose)
      flashStop.current = ctx.setTimeout(() => {
        flashStop.current = null
        setFlash(null)
      }, FLASH_MS)
    }
    useEffect(
      () => () => {
        if (flashStop.current) flashStop.current()
      },
      []
    )

    // The character waves when the helper comes on screen (the page opens with it, or the person
    // opens it from the strip or "Show helper").
    const wasShown = useRef(false)
    useEffect(() => {
      if (helperShown && !wasShown.current) playFlash('waving')
      wasShown.current = helperShown
    }, [helperShown])

    // B3 never asks the model, so nothing sets answering yet; B4's call will (review pose).
    const pose = poseFor({ model: modelStatus.state, answering: false, flash })

    // Picking an answer: saved, and the helper says "Your answer: …" with the fact it points to.
    function choose(option) {
      if (answers[currentStep.id] === option.id) return
      const next = { ...answers, [currentStep.id]: option.id }
      setAnswers(next)
      ctx.storage.set('answers', next)
      addToLog([answerEntry(currentStep, option.id)])
    }

    // "I understand, next step": the step's next_rule picks the next step (code, not the model).
    // After the last step the helper says so once; the character jumps either way.
    function finishStep() {
      playFlash('jumping')
      const to = nextAfter(currentStep, answers[currentStep.id])
      if (to !== 'done') return saveStep(to)
      const last = log[log.length - 1]
      if (!last || last.kind !== 'done') addToLog([doneEntry()])
    }

    // The message box: Send or Enter (Shift+Enter makes a new line). Code checks the words in
    // build-v1.md section 7's order (src/helper-chat.js); nothing goes to a model in B3.
    function send() {
      if (noModel) return
      const entries = typedEntries(draft, { step: currentStep, answers })
      if (!entries.length) return
      setDraft('')
      addToLog(entries)
    }

    // Show the helper (strip, "Show helper", "Ask about this step"). In a window too narrow for
    // its column it opens over the page, with the keyboard in its message box. A helper the
    // person hid stays saved as hidden then, so it doesn't come back as a column by itself later.
    function openHelper() {
      const narrow = layoutFor({ width, tab, helper: 'open' }).narrow
      if (helper === 'closed' || (helper === 'hidden' && !narrow)) saveHelper('open')
      if (narrow) {
        setPeek(true)
        setFocusAsk(true)
      }
    }

    function askAboutStep() {
      openHelper()
      setFocusAsk(true)
    }

    // Hide from the panel. Over the page, only that view ends (Hide, or Escape): the saved
    // choice stays as it was, and the keyboard goes back to the strip.
    function hideHelper() {
      if (fit.helper === 'over') {
        setPeek(false)
        setFocusStrip(true)
      } else saveHelper('hidden')
    }

    /* ---------- header: the two text tabs, "Show helper" when the helper is closed ---------- */
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
      'aria-label': 'Helping Hand',
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

    const header = jsxs('div', {
      className: K.head,
      'data-hh': 'header',
      children: [
        tabRow,
        jsx('div', {
          className: K.headEnd,
          children:
            helper === 'closed'
              ? jsx(Button, { variant: 'secondary', size: 'sm', onClick: openHelper, children: 'Show helper' })
              : null
        })
      ]
    })

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
          !noModel && helper !== 'closed'
            ? jsx(Button, { variant: 'secondary', size: 'sm', onClick: askAboutStep, children: 'Ask about this step' })
            : null
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
          children: label
        },
        key
      )
    const factSource = f => sourceLink(f.url || docsUrl(f.source), chipLabel(f.section), f.id || f.source + f.section)

    // The open step is wide enough for two columns (the comparison, and the answer cards).
    const wideStep = fit.columns === 2
    const s = currentStep
    const picked = answers[s.id]
    const fits = fitsGoal(answers, s.id)
    const introSources = []
    for (const src of s.intro_sources || []) {
      const key = `${src.source}#${src.section}`
      if (!introSources.some(x => x.key === key)) introSources.push({ key, url: docsUrl(src.source), label: chipLabel(src.section) })
    }

    const stepView = [
      jsxs(
        'header',
        {
          children: [
            jsx('div', { className: K.sectionLabel, children: `Step ${s.number} of ${STEPS.length}` }),
            jsx('h3', { className: K.stepTitle, children: s.title }),
            jsx('p', { className: K.prose, 'data-hh': 'intro', children: s.intro })
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
      s.compare
        ? jsx(
            'dl',
            {
              className: cx(K.pairGrid, wideStep && K.twoColumns),
              'data-hh': 'compare',
              'data-columns': fit.columns,
              children: ['left', 'right'].map(side => {
                const c = s.compare[side]
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
          children: s.facts.map(f =>
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
            jsx('div', { className: K.question, children: s.question }),
            jsx('div', {
              className: cx(K.choices, wideStep && K.twoColumns),
              role: 'group',
              'aria-label': s.question,
              'data-hh': 'choices',
              'data-columns': fit.columns,
              children: s.options.map(o =>
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

    /* ---------- helper panel (Pēteris's sketch, inputs/pb-sketch-9nov-helper-chat.png) ---------- */
    // "Check again" is always secondary: the step's own button is the screen's one primary button.
    const checkAgain = () =>
      jsx(Button, { variant: 'secondary', size: 'sm', disabled: modelStatus.state === 'checking', onClick: () => recheck(), children: 'Check again' }, 'again')

    // What the page itself has to say about the model check, shown after everything else: no
    // model (content/v1-strings.md part 1) or the check failed (its "Can't check right now").
    const statusEntry = noModel
      ? { id: 'status', who: 'helper', kind: 'no-model', lines: [NO_MODEL_LINE], small: NO_MODEL_SMALL, action: 'recheck' }
      : modelStatus.state === 'error'
        ? { id: 'status', who: 'helper', kind: 'error', lines: [CANT_CHECK_LINE], action: 'recheck' }
        : null

    // One thing the helper (or the person) said, as plain text: no bubble, no card.
    const saying = e => {
      const you = e.who === 'you'
      const parts = e.lines.map((line, i) => jsx('p', { className: you ? K.logYou : K.say, children: line }, 'l' + i))
      if (e.small) parts.push(jsx('p', { className: K.caption, children: e.small }, 'small'))
      if (e.fact) parts.push(jsx('p', { className: K.caption, children: e.fact.text }, 'fact'), jsx('div', { children: factSource(e.fact) }, 'fact-src'))
      if (e.paste) parts.push(jsx(PasteBox, { text: e.paste, label: 'Copy' }, 'paste'))
      if (e.after) parts.push(jsx('p', { className: K.say, children: e.after }, 'after'))
      if (e.link) parts.push(jsx('div', { children: sourceLink(e.link, e.link, 'link') }, 'link'))
      if (e.action === 'recheck') parts.push(jsx('div', { className: K.sayActions, children: checkAgain() }, 'act'))
      if (e.action === 'yours')
        parts.push(jsx('div', { className: K.sayActions, children: jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => saveTab('yours'), children: 'Your setup' }) }, 'act'))
      return parts
    }

    const contextLine = (icon, text, spinning) =>
      jsxs(
        'div',
        {
          className: K.scaffold,
          role: 'status',
          children: [jsx('span', { className: K.scaffoldGlyph, children: spinning ? jsx(GlyphSpinner, {}) : jsx(Codicon, { name: icon, size: '0.875rem' }) }), jsx('span', { className: K.truncate, children: text })]
        },
        'where'
      )

    const where = tab === 'setup' ? `On step ${currentStep.number}: ${currentStep.title}` : setup.bots.length > 1 ? `On Your setup, bot ${setup.bot}` : 'On Your setup'
    const topLine = noModel
      ? contextLine('info', NO_MODEL_PROGRESS, false)
      : modelStatus.state === 'checking'
        ? contextLine('', 'Checking your model', true)
        : modelStatus.state === 'error'
          ? null
          : contextLine('location', where, false)

    // Chat log off: only the newest thing the helper said. On: the whole back-and-forth, newest at
    // the bottom. Either way it sits low in the panel with empty space above it.
    let words
    if (chatlog) {
      const entries = statusEntry ? [...log, statusEntry] : log
      words = jsx(
        'ol',
        {
          className: K.log,
          'data-hh': 'chatlog',
          'aria-label': 'Chat log',
          children: entries.map(e =>
            jsxs(
              'li',
              {
                className: K.logEntry,
                'data-who': e.who,
                'data-kind': e.kind,
                children: [jsx('span', { className: K.logWho, children: e.who === 'you' ? 'You' : 'Helper' }, 'who'), jsx('div', { className: K.sayStack, children: saying(e) }, 'what')]
              },
              e.id
            )
          )
        },
        'log'
      )
    } else {
      const newest = statusEntry || [...log].reverse().find(e => e.who === 'helper') || log[log.length - 1]
      words = jsx('div', { className: K.sayStack, 'data-hh': 'say', 'data-kind': newest.kind, 'aria-live': 'polite', children: saying(newest) }, 'say')
    }
    const helperBody = [topLine, jsx('div', { className: K.helperNewest, 'data-hh': 'helper-newest', children: words }, 'newest')]

    // The character stands small at the bottom right, just above the message box, with three
    // thought dots trailing from it toward the words.
    const characterRow = jsxs(
      'div',
      {
        className: K.characterRow,
        'data-hh': 'character',
        children: [
          jsxs('span', {
            className: K.thoughtDots,
            'aria-hidden': true,
            'data-hh': 'thought-dots',
            children: [jsx('span', { className: K.thoughtDot1 }, 1), jsx('span', { className: K.thoughtDot2 }, 2), jsx('span', { className: K.thoughtDot3 }, 3)]
          }, 'dots'),
          jsx(Character, { size: 48, pose }, 'who')
        ]
      },
      'character'
    )

    // A rounded box that grows as you type, and a round send button on its right, like Hermes's
    // own composer. No model name and no microphone (no documented voice door for plugin pages).
    // With no model the box stays, empty and greyed, with hhdesign's words.
    const composer = jsx('form', {
      className: K.composerForm,
      onSubmit: e => {
        e.preventDefault()
        send()
      },
      'data-hh': 'composer',
      children: jsxs('div', {
        className: cx(K.composerSurface, composerSurfaceRing),
        children: [
          jsx('div', { 'aria-hidden': true, className: composerInputBacking }),
          jsxs('div', {
            className: K.composerRow,
            children: [
              jsx('div', {
                className: K.composerInputCell,
                children: jsx(Textarea, {
                  ref: askBox,
                  rows: 1,
                  className: K.composerInput,
                  disabled: noModel,
                  value: noModel ? '' : draft,
                  // The whole text is kept: the pasted-key check reads all of it before the
                  // 500-character cut (src/key-check.js).
                  onChange: e => setDraft(e.target.value),
                  onKeyDown: e => {
                    if (e.key !== 'Enter' || e.shiftKey || (e.nativeEvent && e.nativeEvent.isComposing)) return
                    e.preventDefault()
                    send()
                  },
                  placeholder: noModel ? NO_MODEL_BOX : tab === 'setup' ? 'Ask about this step' : 'Ask about your setup',
                  'aria-label': 'Ask the helper'
                })
              }),
              jsx(Button, {
                'aria-label': 'Send',
                className: cx(PRIMARY_ICON_BTN, K.composerSend),
                disabled: noModel || !draft.trim(),
                type: 'submit',
                children: jsx(Codicon, { name: 'arrow-up', size: '0.875rem' })
              })
            ]
          })
        ]
      })
    })

    let helperArea = null
    if (fit.helper === 'open' || fit.helper === 'over') {
      const over = fit.helper === 'over'
      helperArea = jsxs(
        'div',
        {
          className: cx(K.helper, over && K.helperOver, over && (side === 'right' ? K.helperOverRight : K.helperOverLeft)),
          style: { width: over && width ? `${Math.min(HELPER_PX, width)}px` : HELPER_WIDTH },
          role: 'complementary',
          'aria-label': 'Helper',
          'data-hh': 'helper',
          'data-over': over,
          // Escape closes the helper that lies over the page (as Hermes's own overlays do).
          onKeyDown: over
            ? e => {
                if (e.key !== 'Escape') return
                e.preventDefault()
                hideHelper()
              }
            : undefined,
          children: [
            jsxs('div', {
              className: K.helperTop,
              children: [
                jsx(Switch, { size: 'xs', checked: chatlog, onCheckedChange: v => saveChatlog(v === true), 'aria-label': 'Chat log' }),
                jsx('span', { className: K.helperTopLabel, children: 'Chat log' }),
                jsxs('div', {
                  className: K.headEnd,
                  children: [
                    jsx(HelperIconButton, {
                      icon: 'arrow-swap',
                      label: side === 'right' ? 'Move to the left' : 'Move to the right',
                      onClick: () => saveSide(otherSide(side))
                    }),
                    jsx(HelperIconButton, { icon: side === 'right' ? 'chevron-right' : 'chevron-left', label: 'Hide the helper', onClick: hideHelper }),
                    jsx(HelperIconButton, {
                      icon: 'close',
                      label: 'Close the helper',
                      tip: false,
                      onClick: () => {
                        setPeek(false)
                        saveHelper('closed')
                      }
                    })
                  ]
                })
              ]
            }),
            jsx('div', { className: K.helperBody, children: helperBody }),
            characterRow,
            composer
          ]
        },
        'helper'
      )
    }

    // Hidden (by the person, or folded by the page in a narrow window): a thin full-height strip at
    // the helper's edge with HELPER written down it; the whole strip opens the helper (fix 4).
    const strip =
      fit.helper === 'strip' || fit.helper === 'over'
        ? jsxs(
            'button',
            {
              type: 'button',
              className: K.strip,
              'aria-label': 'Show the helper',
              'data-hh': 'helper-hidden',
              ref: stripButton,
              'data-folded': fit.folded,
              onClick: openHelper,
              children: [jsx(Codicon, { name: side === 'right' ? 'chevron-left' : 'chevron-right', size: '0.875rem' }), jsx('span', { className: K.stripLabel, children: 'Helper' })]
            },
            'strip'
          )
        : null

    const columns = tab === 'setup' ? [rail, main] : [main]
    const edge = fit.helper === 'over' ? [strip] : [strip || helperArea]
    return jsxs('div', {
      className: K.root,
      'data-hh': 'page',
      // The measured width, for the screenshot checks (dev/checks/b3a-shots).
      'data-width': width,
      children: [
        header,
        jsx('div', {
          className: K.body,
          ref: measureRef,
          'data-hh': 'body',
          children: [...(side === 'left' ? [...edge, ...columns] : [...columns, ...edge]), fit.helper === 'over' ? helperArea : null]
        })
      ]
    })
  }
}

// ---- src/main.js ----
// Plugin entry: one sidebar row and one full page. Nothing else is registered: no tools, hooks,
// panes, timers or network.

const ID = 'helping-hand'
const PATH = '/helping-hand'

export default {
  id: ID,
  name: 'Helping Hand',
  register(ctx) {
    const Page = makePage(ctx)
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: PATH }, render: () => jsx(Page, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: PATH, label: 'Helping Hand', codicon: 'compass' } }
    ])
  }
}
