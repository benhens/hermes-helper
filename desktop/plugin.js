// Helper: a Hermes Desktop plugin. Built by scripts/build.mjs from src/; edit src/, not this file.
// Licence: MIT (see LICENSE).
import { Button, Codicon, CopyButton, ListRow, PRIMARY_ICON_BTN, ROUTES_AREA, SIDEBAR_NAV_AREA, Textarea, composerInputBacking, composerSurfaceRing, host, icons, useValue } from '@hermes/plugin-sdk'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
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

// ---- src/talk-data.js ----
// Generated by scripts/build.mjs from content/helper-talk-v2.json (hhcontent's talk data) and the
// skill names of content/skills-list-v1.json: only the fields the code reads, and each line's source.
// Edit the JSON, then build.
const TALK_DATA = {
  "docs_version": "v0.23.0",
  "limits": {
    "request_chars_in_paste": 300,
    "service_chars_in_paste": 40
  },
  "answers": {
    "max_at_once": 4,
    "hint_under_question": "Or type your own answer",
    "hint_under_topics": "Or type your question"
  },
  "fixed": {
    "OPEN": {
      "text": "Hi, I'm Helper. I can help you learn about Hermes and set it up. What's your name?"
    },
    "F1": {
      "text": "Nice to meet you, {name}. What do you do?",
      "text_no_name": "Nice to meet you. What do you do?"
    },
    "F2": {
      "text": "Thanks, {name}.",
      "text_no_name": "Thanks.",
      "offer": "general"
    },
    "F3": {
      "text": "That's fine.",
      "offer": "general"
    },
    "N1": {
      "text": "Sorry, I don't have checked information on that yet. I only say what I have checked.",
      "offer": "dont_know"
    },
    "N1a": {
      "text": "Sorry, I don't have that information. It is not on the official Hermes lists I use.",
      "offer": "dont_know"
    },
    "N_HINT": {
      "text": "To see what I can help with, type \"what can I ask you\"."
    },
    "TP": {
      "text": "I can explain how Hermes works and help you set it up. Pick one."
    },
    "W1": {
      "text": "Which one do you mean?"
    },
    "C1": {
      "text": "Hermes can work with the web, files and pictures. It can do jobs on a schedule and use services like Gmail. Pick one.",
      "source": "user-guide/features/tools.md line 17 (web search, file editing); user-guide/features/image-generation.md line 10 (pictures); user-guide/features/cron.md line 15; user-guide/features/mcp.md line 13 (the sources of can0, w_image, sch0, svc0). More than one Hermes is not in the line, only in the picks: user-guide/profiles.md lines 7 and 11 (bot0)."
    },
    "H1": {
      "text": "I can't do that, but your own Hermes can. Paste this into a new chat with it.",
      "paste_text": "I asked for this: \"{request}\". Please do it for me. Ask me before you change anything."
    },
    "H2": {
      "text": "Hermes can read, change and run code on your computer. You can ask it for help with that. I don't build things myself.",
      "paste_text": "I asked: \"{request}\". Can you help me with that? First tell me your plan, and ask me before you change anything."
    },
    "K1": {
      "text": "That looks like a secret key. I did not keep it. Keys go in Settings, never in a chat."
    },
    "COST": {
      "text": "Hermes itself is free. The AI it uses can cost money, depending on which one you choose.",
      "source": "getting-started/official-domains.md line 61 (Hermes Agent is MIT-licensed and free to self-host); user-guide/configuring-models.md lines 13 to 15 (a subscription, token-billed providers); integrations/providers.md rows Claude Max + OAuth (extra paid credits); user-guide/local-models.md lines 9 to 15 (an AI on your own computer, no account)",
      "next": {
        "kind": "part",
        "label": "Open Model",
        "part": "model"
      }
    },
    "WHERE": {
      "text": "Both work. Hermes answers and runs jobs only while its computer is on. For any time, use a computer that stays on.",
      "source": "index.mdx line 115 (it lives wherever you put it: a $5 VPS, a GPU cluster or serverless; not tied to your laptop) and line 144 (runs anywhere, not just your laptop); user-guide/features/cron.md lines 313 to 315 and 423 (jobs run inside the gateway, which must be running); start-v1.md g2 and g3 with user-guide/desktop.md line 668 (it answers only while its computer is on; the line of msg3). R6: server and VPS are said as a computer that stays on (r6_say_instead).",
      "next": {
        "kind": "part",
        "label": "Open Messaging",
        "part": "messaging"
      }
    },
    "W2": {
      "text": "A skill is written steps that teach Hermes one task. A plugin is an add-on that gives Hermes a new feature. Pick one.",
      "source": "getting-started/quickstart.md line 295 (skills are instruction documents that teach Hermes how to do a specific task); user-guide/features/plugins.md line 10 (a plugin system for adding custom tools, hooks and integrations); the two term lines skill and plugin"
    },
    "NAME_AGAIN": {
      "text": "Hi again, {name}.",
      "offer": "general"
    },
    "NAME_NEW": {
      "text": "Thanks, {name}.",
      "offer": "general"
    },
    "BACK": {
      "text": "Hi again, {name}.",
      "text_no_name": "Hi again.",
      "offer": "general"
    },
    "HELLO": {
      "text": "Hi, {name}.",
      "text_no_name": "Hi.",
      "offer": "general"
    },
    "HELLO_SAME": {
      "text": "I'm here.",
      "offer": "general"
    },
    "THANKS": {
      "text": "You're welcome.",
      "offer": "after_topic"
    },
    "OK": {
      "text": "Good.",
      "offer": "after_topic"
    },
    "HOW": {
      "text": "I'm good, thanks for asking.",
      "offer": "general"
    },
    "WHO": {
      "text": "I'm Helper. I help you learn about Hermes and set it up. Your own Hermes does the work.",
      "source": "His opening of 10 Nov (I can help you learn about Hermes and set it up); BRIEF value 4 (it never builds or installs).",
      "offer": "general"
    },
    "AI": {
      "text": "I'm a small program inside Hermes, not a person. No AI writes my words. I use lines checked against the Hermes docs.",
      "offer": "general"
    },
    "AI_PICK": {
      "text": "I'm a small program inside Hermes, not a person. When I'm not sure, your own AI picks which checked line fits.",
      "offer": "general"
    },
    "AI_WRITES": {
      "text": "I'm a small program inside Hermes, not a person. Your own AI writes some replies from checked facts. It can still get things wrong.",
      "offer": "general"
    },
    "BYE": {
      "text": "Bye. Come back any time."
    },
    "CUT": {
      "text": "Sorry, that looks cut off.",
      "offer": "general"
    },
    "MEAN_NONE": {
      "text": "Sorry, I was not clear.",
      "offer": "words"
    },
    "WRONG": {
      "text": "Sorry about that.",
      "offer": "general"
    },
    "AGAIN": {
      "text": "Sorry, I have nothing more on that.",
      "offer": "general"
    },
    "N1_AGAIN": {
      "text": "Sorry, I don't have checked information on that one either.",
      "offer": "dont_know"
    },
    "OK_SAME": {
      "text": "All right.",
      "offer": "after_topic"
    },
    "THANKS_SAME": {
      "text": "Any time.",
      "offer": "after_topic"
    },
    "HOW_SAME": {
      "text": "Still good, thanks.",
      "offer": "general"
    },
    "BYE_SAME": {
      "text": "Bye for now."
    },
    "CUT_SAME": {
      "text": "I can't tell what you need from that.",
      "offer": "general"
    },
    "WRONG_SAME": {
      "text": "Sorry again.",
      "offer": "general"
    },
    "STUCK": {
      "text": "Sorry it isn't working.",
      "offer": "stuck"
    },
    "STUCK_SAME": {
      "text": "Sorry it still isn't working.",
      "offer": "general"
    },
    "PRIV": {
      "text": "With an AI on your own computer, nothing leaves your computer. An AI from a company, free ones too, gets your messages.",
      "source": "user-guide/local-models.md line 14: \"Nothing leaves your computer: no account, no API key, and no network access after a model is downloaded.\" Second sentence: user-guide/features/provider-routing.md line 98: \"Controls whether providers can use your prompts for training.\" and user-guide/configuring-models.md line 79: \"the vendor may train on your prompts and completions\" (both show prompts reach the provider; no docs line says it in general words or names the free model)",
      "next": {
        "kind": "line",
        "label": "And my files?",
        "id": "PRIV-next",
        "text": "Before a risky command, like deleting files, Hermes asks you to approve it first.",
        "source": "the line SAFE, word for word (/hermes-docs/user-guide/security.md lines 16 and 26)"
      }
    },
    "POWER": {
      "text": "On your own computer, small AIs run well with an 8 GB graphics card. Hermes shows which ones fit.",
      "source": "user-guide/local-models.md line 202: \"A GPU with 8 GB+ of memory runs the small catalog models comfortably;\" and line 65: \"**Memory fit** — green (*Fits your GPU*: runs entirely in GPU memory),\". No docs line says an AI from a company needs no strong computer, so the line does not say it."
    },
    "HVC": {
      "text": "Hermes learns from experience and remembers you across chats. ChatGPT can be the AI inside it.",
      "source": "index.mdx line 19: \"The self-improving AI agent built by Nous Research. ... it creates skills from experience, improves them during use, ... and builds a deepening model of who you are across sessions.\" Third sentence: mod1's source, integrations/providers.md (OpenAI Codex row): sign in with a ChatGPT plan."
    },
    "MIG": {
      "text": "There are two kinds of moving.",
      "source": "Helper's own lead-in; the two kinds are the offer move",
      "offer": "move"
    },
    "MIG_APP": {
      "text": "Hermes can bring over your notes and settings from other AI apps. The docs name OpenClaw, Claude Code, Codex, Cursor, \"Grok Bot\" and OpenBot.",
      "source": "dev/hermes-src/website/docs/user-guide/import-from-other-agents.md line 9 (\"imports your existing **OpenClaw**, **Claude Code**, **OpenAI Codex CLI**, **Cursor**, **Grok Bot** or **OpenBot** setup into Hermes with one command\") and line 4 (\"instructions, rules, allowlists, MCP servers, skills, memories\")",
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please bring my setup over from <my old AI app> with hermes migrate. Show me the plan before you write anything.",
        "source": "dev/hermes-src/website/docs/user-guide/import-from-other-agents.md line 15 (\"Already set up? Run `hermes migrate` for the same offer\") and line 9 (\"You always see a per-item plan before anything is written\")"
      }
    },
    "MIG_NOT_LISTED": {
      "text": "The docs name only OpenClaw, Claude Code, Codex, Cursor, \"Grok Bot\" and OpenBot. I have nothing checked on other apps.",
      "source": "dev/hermes-src/website/docs/user-guide/import-from-other-agents.md line 9 (the list of six); no other app is named on that page",
      "offer": "general"
    },
    "MIG_PC": {
      "text": "Hermes can pack your settings, chats and other data into one zip file. Hermes on the new computer unpacks it. That replaces what is there.",
      "source": "dev/hermes-src/website/docs/reference/cli-commands.md line 1116 (\"Create a zip archive of your Hermes configuration, skills, sessions, and data.\") and line 1192 (\"Restore a previously created Hermes backup into your Hermes home directory. All files in the archive overwrite existing files\")",
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please make a full backup of my Hermes with hermes backup and tell me where the zip file is.",
        "source": "dev/hermes-src/website/docs/reference/cli-commands.md lines 1110 to 1123 (hermes backup, default ~/hermes-backup-<timestamp>.zip) and 1186 to 1192 (hermes import <zipfile>)"
      }
    },
    "HERMES": {
      "text": "Hermes is an AI helper made by Nous Research. It learns from experience and remembers you across chats.",
      "source": "dev/hermes-src/website/docs/index.mdx line 19 (\"The self-improving AI agent built by [Nous Research]... it creates skills from experience, improves them during use, ... builds a deepening model of who you are across sessions.\")",
      "offer": "general"
    },
    "START": {
      "text": "Most people start by picking the AI Hermes uses. The quick setup signs you in, with no secret key.",
      "source": "dev/hermes-src/website/docs/getting-started/quickstart.md line 105 (\"**Quick Setup (Nous Portal)** — OAuth login, no API keys to manage ... The recommended fast path.\")",
      "offer": "general"
    },
    "KEY": {
      "text": "Not always. The quick setup signs you in, so you need no key. A key is a secret code some AI companies give you instead.",
      "source": "dev/hermes-src/website/docs/getting-started/quickstart.md line 105 (\"OAuth login, no API keys to manage\") and line 119 (\"**OpenRouter** ... Enter your API key\"). 'secret code': K1's own wording; the docs keep keys in .env, 'secrets only' (dev/hermes-src/AGENTS.md, User state).",
      "next": {
        "kind": "part",
        "label": "Open Model",
        "part": "model"
      }
    },
    "UPDATE": {
      "text": "The Hermes app checks for updates by itself. When one is ready, it offers a one-click update.",
      "source": "dev/hermes-src/website/docs/user-guide/desktop.md line 526 (\"The app checks for updates in the background and offers a one-click update when one is ready.\")"
    },
    "SAFE": {
      "text": "Before a risky command, like deleting files, Hermes asks you to approve it first.",
      "source": "dev/hermes-src/website/docs/user-guide/security.md line 26 (\"Before executing any command, Hermes checks it against a curated list of dangerous patterns. If a match is found, the user must explicitly approve it.\") and line 16 (\"human-in-the-loop for destructive operations\")",
      "next": {
        "kind": "line",
        "label": "And my messages?",
        "id": "SAFE-next",
        "text": "With an AI on your own computer, nothing leaves your computer. An AI from a company, free ones too, gets your messages.",
        "source": "the line PRIV, word for word (its source)"
      }
    },
    "PERSONALITY": {
      "text": "You change its personality in SOUL.md, the file that says who your Hermes is.",
      "source": "dev/hermes-src/website/docs/user-guide/features/personality.md line 9 (\"Hermes Agent's personality is fully customizable. `SOUL.md` is the **primary identity**\") and line 50 (\"Edit `~/.hermes/SOUL.md` to change Hermes' default personality.\")",
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please show me my SOUL.md and help me change how you talk. Ask me before you save anything."
      }
    },
    "KEY_WHAT": {
      "text": "A key is a secret code from an AI company. It lets Hermes use that company's AI. Keys go in Settings, never in a chat.",
      "source": "dev/hermes-src/website/docs/getting-started/quickstart.md line 118 (\"Anthropic ... or API key for pay-per-token\") and line 119 (\"OpenRouter ... Enter your API key\"); 'Keys go in Settings, never in a chat': line K1, word for word. 'secret': dev/hermes-src/AGENTS.md, User state (\".env (secrets only)\").",
      "next": {
        "kind": "part",
        "label": "Open Model",
        "part": "model"
      }
    },
    "MIG_CHATGPT": {
      "text": "The docs name no way to move chats or settings from ChatGPT. ChatGPT can still be the AI inside Hermes.",
      "source": "/hermes-docs/user-guide/import-from-other-agents.md line 9 (the six apps: \"**OpenClaw**, **Claude Code**, **OpenAI Codex CLI**, **Cursor**, **Grok Bot** or **OpenBot**\"; ChatGPT is not among them) and line 4 (what comes over: \"instructions, rules, allowlists, MCP servers, skills, memories\"; no chats). Second sentence: mod1's source (integrations/providers.md, OpenAI Codex row: sign in with a ChatGPT plan).",
      "next": {
        "kind": "part",
        "label": "Open Model",
        "part": "model"
      }
    },
    "AGENT": {
      "text": "That is an AI that works by itself. The docs say Hermes gets better the longer it runs.",
      "source": "/hermes-docs/index.mdx line 115 (\"It's an **autonomous agent** that gets more capable the longer it runs.\")",
      "offer": "general"
    },
    "KEY_WHERE": {
      "text": "A key is a secret code. In the Hermes app it goes in Settings, never in a chat.",
      "source": "/hermes-docs/user-guide/desktop.md line 447 (\"**Providers settings pane** — a dedicated place to manage inference providers, with an Accounts / API-keys UX for signing in and storing credentials per provider\"). First sentence: line K1, word for word. Seen: the Settings list has a row Providers (docs/answers/hhtech-helper-settings.md line 15, hhtech ran the app v0.23.0).",
      "next": {
        "kind": "part",
        "label": "Open Model",
        "part": "model"
      }
    },
    "FREE": {
      "text": "Hermes itself is free. An AI on your own computer needs no account. Some AI companies let you start free.",
      "source": "/hermes-docs/getting-started/official-domains.md line 61 (\"Hermes Agent is MIT-licensed and free to self-host.\"); user-guide/local-models.md line 14 (\"Nothing leaves your computer: no account, no API key\"); integrations/providers.md line 653 (\"Free tier included\") and line 521 (\"Create an account and a free API key\")",
      "next": {
        "kind": "part",
        "label": "Open Model",
        "part": "model"
      }
    },
    "MODEL_FOR": {
      "text": "I have nothing checked on which AI suits which kind of work.",
      "source": "No docs page was found that matches an AI to a kind of work (not a full search of the docs: checked user-guide/configuring-models.md and integrations/providers.md headings only).",
      "offer": "pay"
    },
    "MODEL_CHANGE": {
      "text": "In a Hermes chat, the message box shows the AI's name. Click it to choose another.",
      "source": "/hermes-docs/user-guide/desktop.md line 283 (\"The model picker lives in the **composer**, just left of the microphone. Click it to switch the model\")",
      "next": {
        "kind": "part",
        "label": "Open Model",
        "part": "model"
      }
    },
    "SKILL_ADD": {
      "text": "A skill is written steps for one task. To add one, click \"Capabilities\", then \"Skills\", then a card, then \"Install\".",
      "source": "Seen run by hhtech in Hermes Desktop v0.23.0 (docs/answers/hhtech-wants-check.md section 5; the same clicks as the steps in helper-wants-v1.json, w_reddit next). Docs: /hermes-docs/user-guide/desktop.md line 483 (\"The Skills tab lists your installed skills ... each entry has a one-click **Install** button\")",
      "next": {
        "kind": "part",
        "label": "Open Capabilities",
        "part": "capabilities"
      }
    },
    "PLUGIN_WHICH": {
      "text": "A plugin is an add-on. You need none to start. Hermes loads its built-in ones by itself.",
      "source": "/hermes-docs/user-guide/features/plugins.md line 290 (\"bundled \\\"always-works\\\" infrastructure loads automatically; third-party general plugins are opt-in\")",
      "next": {
        "kind": "part",
        "label": "Open Capabilities",
        "part": "capabilities"
      }
    },
    "PLUGIN_ADD": {
      "text": "A plugin is an add-on. Your own Hermes can add one when you give it the name.",
      "source": "/hermes-docs/user-guide/features/plugins.md line 429 (\"hermes plugins install <name>                # install a catalog entry\") and line 222 (\"you're asked `Enable 'name' now? [y/N]`\")",
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please install the plugin <name> with hermes plugins install. Ask me before you switch it on."
      }
    },
    "CODING": {
      "text": "The docs do not say it in general. For jobs on a schedule they say you just ask in plain words.",
      "source": "/hermes-docs/user-guide/features/cron.md line 24 (\"you can create, pause, edit, and remove jobs by asking in plain language — no CLI required\"). user-guide/desktop.md line 9 does not say whether coding is needed.",
      "offer": "general"
    },
    "PICK_FIRST": {
      "text": "Choose one, and I will show you how.",
      "source": "Helper's own line"
    },
    "HOW_PASTE": {
      "text": "Press \"{label}\". Copy the text and paste it into a chat with Hermes.",
      "source": "Helper's own line; {label} is the label of the paste button of Helper's last answer"
    },
    "HOW_PART": {
      "text": "Press \"{label}\". It opens that part for you.",
      "source": "Helper's own line; {label} is the label of the part button of Helper's last answer"
    },
    "START_2": {
      "text": "First choose the AI Hermes uses. Then send Hermes one message to see that it answers.",
      "source": "/hermes-docs/getting-started/quickstart.md line 105 (\"**Quick Setup (Nous Portal)** ... The recommended fast path.\") and line 182 (\"## 3. Run Your First Chat\")",
      "offer": "general_2"
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
      "how",
      "thx",
      "cheers",
      "sup",
      "wassup",
      "bye",
      "goodbye",
      "cya",
      "later",
      "why",
      "who",
      "when",
      "where",
      "which",
      "whats",
      "what's",
      "can",
      "could",
      "would",
      "should",
      "does",
      "did",
      "is",
      "are"
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
    "name_refused_words_also": [
      "pin",
      "pins"
    ],
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
    },
    "name_strong_stop": [
      "today",
      "tomorrow",
      "tonight",
      "yesterday",
      "later",
      "soon",
      "now",
      "sometime",
      "sometimes",
      "anytime",
      "whenever",
      "when",
      "if",
      "after",
      "before",
      "next",
      "this",
      "that",
      "every",
      "each",
      "daily",
      "weekly",
      "morning",
      "mornings",
      "evening",
      "evenings",
      "afternoon",
      "night",
      "noon",
      "weekend",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
      "again",
      "maybe",
      "please",
      "pls",
      "plz",
      "whatever",
      "anything",
      "something",
      "by",
      "out",
      "up",
      "any",
      "asap",
      "once",
      "twice",
      "anyway"
    ],
    "name_new_may_follow": [
      "please",
      "pls",
      "plz",
      "thanks",
      "thank you",
      "thx",
      "now",
      "instead",
      "from now on"
    ]
  },
  "key_patterns": [
    "(?<![A-Za-z0-9])(?:sk-|sk_|rk_|xai-|AIza|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|hf_|gsk_|pplx-|r8_|fw_|npm_|xox[abposr]-|xapp-)[A-Za-z0-9_-]{16,}",
    "(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}",
    "(?<![A-Za-z0-9])(?=[A-Za-z]*[0-9])(?=[0-9]*[A-Za-z])[A-Za-z0-9]{32,}(?![A-Za-z0-9])",
    "(?<![A-Za-z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Za-z0-9])",
    "(?<![A-Za-z0-9/+.:_-])(?!(?:[A-Za-z][a-z]*(?:[A-Z][a-z]+)*[0-9]*/){2,}[A-Za-z][a-z]*(?:[A-Z][a-z]+)*[0-9]*(?![A-Za-z0-9/+]))(?=[A-Za-z0-9/+]*[A-Z])(?=[A-Za-z0-9/+]*[a-z])(?=[A-Za-z0-9/+]*[0-9])[A-Za-z0-9+][A-Za-z0-9/+]{39}(?![A-Za-z0-9/+=.:_-])",
    "(?<![0-9])[0-9]{6,12}:[A-Za-z0-9_-]{30,}",
    "-----BEGIN [A-Z ]*PRIVATE KEY-----"
  ],
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
    },
    "make_words": [
      "make me",
      "create me",
      "build me",
      "can you make",
      "could you make",
      "would you make",
      "will you make",
      "please make",
      "can you create",
      "could you create",
      "would you create",
      "please create",
      "i want you to make",
      "i want you to build",
      "i want you to create",
      "i need you to make",
      "i need you to build"
    ],
    "make_not_followed_by": [
      "it",
      "that",
      "this",
      "sure",
      "sense",
      "things",
      "understand",
      "me understand",
      "hermes",
      "my hermes",
      "my bot",
      "the bot",
      "my bots"
    ],
    "make_not_when_starts": [
      "can it",
      "could it",
      "will it",
      "would it",
      "can hermes",
      "could hermes",
      "will hermes",
      "would hermes",
      "does hermes",
      "is hermes able",
      "is it able"
    ],
    "build_question_words": [
      "build an app",
      "make an app",
      "build a website",
      "make a website",
      "build a bot",
      "make a bot",
      "write the code",
      "build me",
      "build it",
      "make me an app",
      "make me a website"
    ],
    "software_lead_ins": [
      "please",
      "pls",
      "can you",
      "could you",
      "would you",
      "will you",
      "i want you to",
      "i need you to",
      "help me",
      "just",
      "now",
      "ok",
      "okay",
      "so"
    ],
    "software_verbs": [
      "write",
      "code",
      "create",
      "program",
      "develop",
      "design"
    ],
    "software_things": [
      "script",
      "scripts",
      "program",
      "programs",
      "programme",
      "app",
      "apps",
      "application",
      "web app",
      "game",
      "games",
      "bot",
      "bots",
      "chatbot",
      "website",
      "websites",
      "site",
      "web page",
      "webpage",
      "landing page",
      "code",
      "plugin",
      "extension",
      "macro",
      "software",
      "api",
      "tool"
    ],
    "software_between_max": 3,
    "software_between_not": [
      "my",
      "your",
      "our",
      "his",
      "her",
      "their",
      "second",
      "another",
      "other",
      "extra",
      "hermes"
    ]
  },
  "model_pick_not_when_starts": [
    "what",
    "which",
    "who",
    "where",
    "when",
    "why",
    "how",
    "should",
    "do i",
    "do you",
    "does",
    "is",
    "are",
    "am i",
    "can i",
    "could i",
    "will it",
    "can it",
    "can hermes",
    "must i",
    "have i"
  ],
  "small_talk": {
    "cut_end_words": [
      "helper",
      "hermes",
      "please",
      "pls",
      "mate"
    ],
    "cut_start_words": [
      "helper",
      "hermes"
    ],
    "kinds": {
      "hello": [
        "hey",
        "hi",
        "hello",
        "hiya",
        "heya",
        "hey there",
        "hi there",
        "hello there",
        "yo",
        "howdy",
        "hey hey",
        "hii",
        "hiii",
        "heyy",
        "heyyy",
        "helo",
        "hallo",
        "good morning",
        "good afternoon",
        "good evening",
        "morning",
        "evening",
        "greetings"
      ],
      "thanks": [
        "thanks",
        "thank you",
        "thx",
        "ty",
        "thank u",
        "thanks a lot",
        "thank you so much",
        "thanks so much",
        "many thanks",
        "cheers",
        "great thanks",
        "ok thanks",
        "okay thanks",
        "ok thank you",
        "okay thank you",
        "much appreciated",
        "appreciate it",
        "thanks for that",
        "nice thanks",
        "cool thanks"
      ],
      "ok": [
        "ok",
        "okay",
        "k",
        "kk",
        "okey",
        "oki",
        "cool",
        "nice",
        "great",
        "got it",
        "gotcha",
        "alright",
        "all right",
        "sure",
        "fine",
        "good",
        "perfect",
        "understood",
        "i see",
        "makes sense",
        "ah ok",
        "oh ok",
        "ok cool",
        "ah",
        "oh",
        "hmm",
        "hm",
        "interesting",
        "awesome",
        "wow",
        "yes",
        "yeah",
        "yep",
        "yup",
        "no",
        "nope",
        "nah",
        "lol",
        "haha",
        "ha"
      ],
      "how": [
        "how are you",
        "how are you doing",
        "how are u",
        "how r u",
        "hows it going",
        "how's it going",
        "how is it going",
        "whats up",
        "what's up",
        "sup",
        "wassup",
        "how do you do",
        "you ok",
        "you good",
        "how are things",
        "how have you been"
      ],
      "who": [
        "who are you",
        "what are you",
        "who is this",
        "what is this",
        "whats your name",
        "what's your name",
        "what is your name",
        "your name",
        "who made you",
        "what is helper",
        "who is helper",
        "what's helper",
        "whats helper",
        "what do you do",
        "tell me about yourself",
        "introduce yourself"
      ],
      "ai": [
        "are you an ai",
        "are you ai",
        "are you a bot",
        "are you a robot",
        "are you human",
        "are you a human",
        "are you a person",
        "are you real",
        "are you a real person",
        "is this a bot",
        "is this an ai",
        "is this a person",
        "is this a human",
        "is this a real person",
        "am i talking to a bot",
        "am i talking to a person",
        "am i talking to a human",
        "am i talking to an ai",
        "am i talking to ai",
        "are you chatgpt",
        "are you claude",
        "is this chatgpt",
        "is this claude"
      ],
      "bye": [
        "bye",
        "goodbye",
        "good bye",
        "bye bye",
        "see you",
        "see ya",
        "cya",
        "later",
        "see you later",
        "good night",
        "goodnight",
        "gotta go",
        "got to go",
        "that's all",
        "thats all",
        "that is all",
        "i'm done",
        "im done",
        "that's it",
        "thats it"
      ],
      "mean": [
        "what do you mean",
        "what does that mean",
        "what does it mean",
        "i don't understand",
        "i dont understand",
        "i do not understand",
        "i don't get it",
        "i dont get it",
        "huh",
        "what",
        "say that again",
        "explain that",
        "can you explain that",
        "in simple words",
        "simpler please",
        "simpler",
        "say it simpler",
        "i'm confused",
        "im confused",
        "confused",
        "what?"
      ],
      "wrong": [
        "that's wrong",
        "thats wrong",
        "that is wrong",
        "wrong",
        "wrong answer",
        "that's not right",
        "thats not right",
        "that is not right",
        "not right",
        "incorrect",
        "that's incorrect",
        "thats incorrect",
        "you're wrong",
        "youre wrong",
        "not what i meant",
        "that's not what i meant",
        "thats not what i meant",
        "that is not what i meant",
        "not what i asked",
        "that's not what i asked",
        "thats not what i asked",
        "that's not it",
        "thats not it",
        "not that",
        "no not that",
        "no, not that",
        "no that's wrong",
        "no, that's wrong",
        "no thats wrong",
        "no, thats wrong",
        "no not what i meant",
        "no, not what i meant",
        "nope wrong",
        "nope, wrong",
        "i meant something else",
        "not quite"
      ],
      "stuck": [
        "that didn't work",
        "that didnt work",
        "that did not work",
        "it didn't work",
        "it didnt work",
        "it did not work",
        "didn't work",
        "didnt work",
        "did not work",
        "that doesn't work",
        "that doesnt work",
        "it doesn't work",
        "it doesnt work",
        "it does not work",
        "doesn't work",
        "doesnt work",
        "not working",
        "it's not working",
        "its not working",
        "it is not working",
        "still not working",
        "it's still not working",
        "its still not working",
        "it still isn't working",
        "it still isnt working",
        "still isn't working",
        "it still doesn't work",
        "it still doesnt work",
        "that still didn't work",
        "still didn't work",
        "still doesn't work",
        "still doesnt work",
        "that didn't help",
        "that didnt help",
        "it didn't help",
        "it didnt help",
        "didn't help",
        "that doesn't help",
        "that doesnt help",
        "that did nothing",
        "nothing happened",
        "not answering",
        "isn't answering",
        "isnt answering",
        "not responding",
        "doesn't answer",
        "doesnt answer",
        "no answer",
        "not replying"
      ],
      "again": [
        "again",
        "once more",
        "repeat",
        "repeat that",
        "one more time"
      ]
    },
    "cut_question_words": [
      "how",
      "why",
      "who",
      "when",
      "where",
      "which"
    ],
    "cut_dangling": [
      "a",
      "an",
      "the",
      "to",
      "i",
      "my",
      "and",
      "or",
      "of",
      "for",
      "with",
      "about"
    ],
    "cut_small_words": [
      "you",
      "u",
      "it",
      "i",
      "we",
      "they",
      "this",
      "that",
      "me",
      "hermes",
      "helper"
    ],
    "no_words": [
      "no",
      "nope",
      "nah"
    ],
    "no_means_wrong_after": [
      "row",
      "plain",
      "term",
      "W2",
      "COST",
      "WHERE",
      "N1",
      "N1a",
      "N1_AGAIN",
      "H1",
      "skill by name",
      "C1",
      "AGAIN",
      "then"
    ],
    "thanks_tail": [
      "so much",
      "so so much",
      "a lot",
      "very much",
      "lots",
      "loads",
      "heaps",
      "a ton",
      "a bunch",
      "again",
      "man",
      "buddy",
      "x"
    ],
    "again_brings_back": [
      "row",
      "plain",
      "term",
      "W2",
      "COST",
      "WHERE",
      "skill by name",
      "wants",
      "written",
      "then"
    ],
    "how_after_rows": {
      "words": [
        "how",
        "and",
        "and then",
        "why"
      ],
      "after": [
        "row",
        "plain",
        "term",
        "wants",
        "COST",
        "WHERE",
        "written",
        "then"
      ]
    },
    "how_that": {
      "phrases": [
        "how do i do that",
        "how do i do this",
        "how do i do it",
        "how would i do that",
        "how can i do that",
        "how to do that",
        "how do i set that up",
        "how do i set it up",
        "how do i get that",
        "how do i start",
        "how do i start that",
        "how do i use that",
        "how do i use it",
        "show me how",
        "where do i do that",
        "where is that",
        "where do i find that"
      ],
      "cut_first": [
        "ok",
        "okay",
        "so",
        "and",
        "cool",
        "right",
        "but",
        "well",
        "yes",
        "yeah",
        "sure",
        "great",
        "nice",
        "good"
      ]
    }
  },
  "live_c6": {
    "privacy_words": [
      "private",
      "privacy",
      "my data",
      "data private",
      "data safe",
      "is my data",
      "who sees",
      "who can see",
      "who reads",
      "leave my computer",
      "leaves my computer",
      "leave my laptop",
      "stay on my computer",
      "stays on my computer",
      "confidential",
      "spy",
      "spying"
    ],
    "power_words": [
      "powerful computer",
      "strong computer",
      "good computer",
      "fast computer",
      "beefy",
      "what computer",
      "which computer",
      "computer do i need",
      "kind of computer",
      "type of computer",
      "hardware",
      "specs",
      "gpu",
      "graphics card",
      "powerful laptop",
      "powerful pc",
      "strong pc",
      "good pc"
    ],
    "vs_names": [
      "chatgpt",
      "chat gpt",
      "claude",
      "gemini",
      "copilot",
      "grok",
      "openai"
    ],
    "vs_words": [
      "difference",
      "different",
      "differ",
      "compare",
      "compared",
      "comparison",
      "vs",
      "versus",
      "better than",
      "instead of",
      "why use",
      "why not just",
      "same as",
      "like chatgpt",
      "like claude"
    ],
    "hosted_words": [
      "free model",
      "free ai",
      "free one",
      "free plan",
      "free tier",
      "nous",
      "chatgpt",
      "chat gpt",
      "claude",
      "gpt",
      "openai",
      "gemini",
      "hosted",
      "cloud ai",
      "online ai"
    ],
    "greet_more": {
      "question_words": [
        "how",
        "what",
        "why",
        "which",
        "where",
        "when",
        "who",
        "can",
        "could",
        "should",
        "does",
        "do",
        "is",
        "are",
        "will",
        "would",
        "help"
      ]
    }
  },
  "offers": {
    "hint": "Or type your own question",
    "things": {
      "setup": {
        "label": "Set up Hermes",
        "say": "set up Hermes",
        "gives": {
          "kind": "setup_chat",
          "id": "Q_NEW"
        }
      },
      "can": {
        "label": "What Hermes can do",
        "say": "see what it does",
        "gives": {
          "kind": "topic_pick",
          "id": "can"
        }
      },
      "mod": {
        "label": "Which AI to use",
        "say": "pick its AI",
        "gives": {
          "kind": "topic_pick",
          "id": "mod"
        }
      },
      "msg": {
        "label": "Phone and chat apps",
        "say": "use your phone",
        "gives": {
          "kind": "topic_pick",
          "id": "msg"
        }
      },
      "mem": {
        "label": "What Hermes remembers",
        "say": "see what it remembers",
        "gives": {
          "kind": "topic_pick",
          "id": "mem"
        }
      },
      "sch": {
        "label": "Daily jobs and reminders",
        "say": "set up daily jobs",
        "gives": {
          "kind": "topic_pick",
          "id": "sch"
        }
      },
      "svc": {
        "label": "Gmail and other services",
        "say": "link a service",
        "gives": {
          "kind": "topic_pick",
          "id": "svc"
        }
      },
      "bot": {
        "label": "More than one Hermes",
        "say": "add a second Hermes",
        "gives": {
          "kind": "topic_pick",
          "id": "bot"
        }
      },
      "what": {
        "label": "What Hermes is",
        "say": "know what Hermes is",
        "gives": {
          "kind": "line",
          "id": "HERMES"
        }
      },
      "mig_app": {
        "label": "From another AI app",
        "gives": {
          "kind": "line",
          "id": "MIG_APP"
        }
      },
      "mig_pc": {
        "label": "To another computer",
        "gives": {
          "kind": "line",
          "id": "MIG_PC"
        }
      },
      "fix_ai": {
        "label": "Check its AI",
        "gives": {
          "kind": "topic_pick",
          "id": "mod"
        }
      },
      "fix_app": {
        "label": "Check my chat app",
        "gives": {
          "kind": "row",
          "id": "msg3"
        }
      },
      "skill": {
        "label": "Skills",
        "gives": {
          "kind": "term",
          "id": "skill"
        }
      },
      "plugin": {
        "label": "Plugins",
        "gives": {
          "kind": "term",
          "id": "plugin"
        }
      },
      "mcp": {
        "label": "MCP",
        "gives": {
          "kind": "term",
          "id": "mcp"
        }
      },
      "pay_mod1": {
        "label": "ChatGPT",
        "gives": {
          "kind": "row",
          "id": "mod1"
        }
      },
      "pay_mod2": {
        "label": "Claude",
        "gives": {
          "kind": "row",
          "id": "mod2"
        }
      },
      "pay_mod4": {
        "label": "Neither",
        "gives": {
          "kind": "row",
          "id": "mod4"
        }
      },
      "pay_mod3": {
        "label": "I want it free",
        "gives": {
          "kind": "row",
          "id": "mod3"
        }
      }
    },
    "sets": {
      "general": {
        "text": "Do you want to set up Hermes, or see what it does?",
        "picks": [
          "setup",
          "can"
        ],
        "text_no_setup": "Do you want to see what Hermes does, or pick its AI?",
        "picks_no_setup": [
          "can",
          "mod"
        ],
        "instead": "general_2"
      },
      "general_2": {
        "text": "Do you want to pick its AI, or chat from your phone?",
        "picks": [
          "mod",
          "msg"
        ],
        "instead": "general"
      },
      "dont_know": {
        "text": "Do you want to know what Hermes is, or set it up?",
        "picks": [
          "what",
          "setup"
        ],
        "text_no_setup": "Do you want to know what Hermes is, or what it does?",
        "picks_no_setup": [
          "what",
          "can"
        ],
        "instead": "general_2"
      },
      "words": {
        "text": "Do you want one of these words explained?",
        "picks": [
          "skill",
          "plugin",
          "mcp"
        ],
        "instead": "general"
      },
      "move": {
        "text": "Do you mean from another AI app, or to a new computer?",
        "picks": [
          "mig_app",
          "mig_pc"
        ],
        "instead": "general"
      },
      "stuck": {
        "text": "Do you want to check its AI, or your chat app?",
        "picks": [
          "fix_ai",
          "fix_app"
        ],
        "instead": "general"
      },
      "after_topic": {
        "instead": "general",
        "template": "Do you want to {say1}, or {say2}?",
        "by_topic": {
          "mod": [
            "msg",
            "mem"
          ],
          "msg": [
            "sch",
            "svc"
          ],
          "mem": [
            "msg",
            "bot"
          ],
          "sch": [
            "svc",
            "msg"
          ],
          "svc": [
            "sch",
            "mod"
          ],
          "bot": [
            "mem",
            "msg"
          ],
          "use": [
            "mod",
            "can"
          ]
        }
      },
      "pay": {
        "text": "Do you already pay for ChatGPT or Claude?",
        "picks": [
          "pay_mod1",
          "pay_mod2",
          "pay_mod4",
          "pay_mod3"
        ],
        "instead": "general"
      }
    }
  },
  "offer_words": {
    "migrate": [
      "migrate",
      "migrating",
      "migration",
      "move from",
      "move over",
      "bring over",
      "bring my stuff",
      "bring things",
      "bring my",
      "switch from",
      "import my",
      "move my stuff",
      "move to hermes",
      "moving to hermes",
      "transfer",
      "switch over",
      "switching from",
      "switching over",
      "coming from",
      "import my chats",
      "import chats",
      "chats from",
      "bring my chats",
      "move my chats"
    ],
    "listed_apps": [
      "openclaw",
      "claude code",
      "codex",
      "cursor",
      "grok bot",
      "openbot",
      "clawdbot",
      "moltbot"
    ],
    "not_listed_apps": [
      "chatgpt",
      "chat gpt",
      "gemini",
      "copilot",
      "perplexity"
    ],
    "computer": [
      "new computer",
      "another computer",
      "new laptop",
      "another laptop",
      "new mac",
      "new pc",
      "other computer",
      "new machine",
      "another machine"
    ],
    "what_hermes": [
      "what is hermes",
      "what's hermes",
      "whats hermes",
      "what is this",
      "what does hermes do",
      "tell me about hermes"
    ],
    "start": [
      "get started",
      "getting started",
      "where to begin",
      "where do i begin",
      "where to start",
      "where do i start",
      "set up first",
      "start with",
      "i'm lost",
      "im lost",
      "i am lost",
      "don't know where",
      "dont know where",
      "what do i do first",
      "what should i do first",
      "set this up",
      "set it up",
      "set hermes up",
      "set up hermes",
      "do first",
      "start first",
      "first step",
      "what first"
    ],
    "key": [
      "api key",
      "api keys",
      "a key",
      "an api",
      "openai key",
      "anthropic key",
      "claude key",
      "my key",
      "key go",
      "keys go"
    ],
    "update": [
      "update hermes",
      "upgrade hermes",
      "update the app",
      "new version",
      "newest version",
      "latest version",
      "how do i update",
      "how to update"
    ],
    "safe": [
      "delete my files",
      "deletes my files",
      "delete files",
      "delete my stuff",
      "is it safe",
      "safe to use",
      "break my computer",
      "mess up my computer"
    ],
    "personality": [
      "personality",
      "its tone",
      "how it talks",
      "talk differently",
      "change how it talks"
    ],
    "stuck_more": [
      "not answering",
      "isn't answering",
      "isnt answering",
      "not responding",
      "doesn't answer",
      "doesnt answer",
      "no answer",
      "not replying",
      "is broken",
      "it's broken",
      "its broken",
      "something broke",
      "it broke",
      "keeps crashing",
      "crashed",
      "an error",
      "error message"
    ],
    "laptop_off": [
      "laptop is closed",
      "laptop closed",
      "close my laptop",
      "computer is off",
      "laptop is off",
      "turn off my computer",
      "computer off"
    ],
    "key_what_starts": [
      "what is",
      "what's",
      "whats",
      "what are",
      "what does"
    ],
    "chatgpt_names": [
      "chatgpt",
      "chat gpt"
    ],
    "agent_what": [
      "agent",
      "agents",
      "ai agent",
      "ai agents",
      "an agent"
    ],
    "what_hermes_any": [
      "what even is this",
      "what is this app",
      "what's this app",
      "whats this app",
      "what does this app",
      "what even is hermes",
      "what is this thing",
      "what is this program"
    ],
    "key_where": [
      "where do i put",
      "where do i enter",
      "where do i add",
      "where do i paste",
      "where to put",
      "where should i put",
      "where can i put",
      "where does",
      "put my",
      "enter my",
      "paste my",
      "add my",
      "key go",
      "keys go"
    ],
    "free": [
      "without paying",
      "not pay",
      "don't want to pay",
      "dont want to pay",
      "do not want to pay",
      "pay nothing",
      "cost nothing",
      "costs nothing",
      "no money",
      "for free"
    ],
    "model_for": [
      "which model",
      "what model",
      "which ai",
      "what ai",
      "best model",
      "best ai",
      "model should",
      "ai should"
    ],
    "model_change": [
      "change the model",
      "change model",
      "change my model",
      "switch model",
      "switch models",
      "switch the model",
      "change the ai",
      "change its ai",
      "switch the ai",
      "switch ai",
      "different model",
      "another model",
      "swap the model"
    ],
    "own_ai": [
      "run the ai",
      "run an ai",
      "run ai",
      "ai on my",
      "model on my",
      "run a model",
      "run models",
      "run the model"
    ],
    "skill_add": [
      "add a skill",
      "add skills",
      "add a new skill",
      "add new skills",
      "install a skill",
      "install skills",
      "get a skill",
      "get more skills",
      "get new skills"
    ],
    "plugin_which": [
      "what plugins",
      "which plugins",
      "which plugin",
      "plugins should",
      "plugins do i need",
      "need plugins",
      "need a plugin",
      "need any plugins",
      "best plugins"
    ],
    "plugin_add": [
      "install a plugin",
      "install plugins",
      "install the plugin",
      "install this plugin",
      "add a plugin",
      "add plugins",
      "get a plugin"
    ],
    "coding_ask": [
      "know coding",
      "need to know coding",
      "know how to code",
      "need to code",
      "have to code",
      "need coding",
      "without coding",
      "know programming",
      "be a programmer",
      "be a developer",
      "not a programmer",
      "not a developer",
      "can't code",
      "cant code",
      "not technical",
      "non-technical"
    ]
  },
  "about_rule": {
    "rows": {
      "mod1": [
        "plan",
        "plans",
        "subscription",
        "subscriptions",
        "subscribe",
        "subscribed",
        "sign in",
        "sign-in",
        "signed in",
        "log in",
        "login",
        "account",
        "accounts",
        "pay",
        "pays",
        "paying",
        "paid",
        "i have",
        "i've got",
        "i got",
        "i already",
        "i use",
        "i'm on",
        "im on",
        "use my",
        "with my",
        "works with",
        "work with",
        "plus",
        "use chatgpt",
        "use gpt",
        "use openai",
        "with chatgpt",
        "my chatgpt"
      ],
      "mod2": [
        "plan",
        "plans",
        "subscription",
        "subscriptions",
        "subscribe",
        "subscribed",
        "sign in",
        "sign-in",
        "signed in",
        "log in",
        "login",
        "account",
        "accounts",
        "pay",
        "pays",
        "paying",
        "paid",
        "i have",
        "i've got",
        "i got",
        "i already",
        "i use",
        "i'm on",
        "im on",
        "use my",
        "with my",
        "works with",
        "work with",
        "max",
        "pro",
        "use claude",
        "with claude",
        "my claude"
      ],
      "mod3": [
        "own computer",
        "my computer",
        "own laptop",
        "my laptop",
        "laptop",
        "own machine",
        "my machine",
        "my pc",
        "my mac",
        "local",
        "locally",
        "offline",
        "private",
        "privately",
        "no account",
        "ollama",
        "local ai",
        "leaves my computer",
        "leave my computer"
      ]
    }
  },
  "no_repeat": {
    "exempt": [
      "H1",
      "H2",
      "K1",
      "RM1",
      "RM3",
      "RM4",
      "RM5",
      "RM6",
      "NAME_NEW",
      "AI",
      "AI_PICK",
      "AI_WRITES",
      "TP",
      "F1",
      "F2",
      "F3",
      "OPEN",
      "BACK",
      "skill by name",
      "PICK_FIRST",
      "HOW_PASTE",
      "HOW_PART"
    ],
    "groups": {
      "hello": [
        "HELLO",
        "HELLO_SAME"
      ],
      "ok": [
        "OK",
        "OK_SAME"
      ],
      "thanks": [
        "THANKS",
        "THANKS_SAME"
      ],
      "how": [
        "HOW",
        "HOW_SAME"
      ],
      "who": [
        "WHO"
      ],
      "bye": [
        "BYE",
        "BYE_SAME"
      ],
      "cut": [
        "CUT",
        "CUT_SAME"
      ],
      "wrong": [
        "WRONG",
        "WRONG_SAME"
      ],
      "stuck": [
        "STUCK",
        "STUCK_SAME"
      ],
      "dont_know": [
        "N1",
        "N1a",
        "N1_AGAIN"
      ],
      "start": [
        "START",
        "START_2"
      ]
    },
    "in_place": {
      "hello": [
        "HELLO_SAME",
        "HELLO"
      ],
      "ok": [
        "OK_SAME",
        "OK"
      ],
      "thanks": [
        "THANKS_SAME",
        "THANKS"
      ],
      "how": [
        "HOW_SAME",
        "HOW"
      ],
      "who": [
        "ai_line",
        "WHO"
      ],
      "bye": [
        "BYE_SAME",
        "BYE"
      ],
      "cut": [
        "CUT_SAME",
        "CUT"
      ],
      "wrong": [
        "WRONG_SAME",
        "WRONG"
      ],
      "stuck": [
        "STUCK_SAME",
        "STUCK"
      ],
      "dont_know": [
        "N1_AGAIN",
        "AGAIN"
      ],
      "answer": [
        "plain",
        "AGAIN",
        "MEAN_NONE"
      ],
      "start": [
        "START_2",
        "START"
      ]
    },
    "wrong_starts": [
      "no",
      "nope",
      "nah",
      "wrong",
      "that's wrong",
      "thats wrong",
      "that is wrong",
      "that's not",
      "thats not",
      "that is not",
      "not what i",
      "not that",
      "i meant",
      "incorrect",
      "that isn't"
    ],
    "wrong_anywhere": [
      "not what i meant",
      "not what i asked",
      "that's wrong",
      "thats wrong",
      "that is wrong",
      "that's not it",
      "thats not it",
      "that's not right",
      "thats not right",
      "you're wrong",
      "youre wrong",
      "i meant",
      "not what i",
      "isn't what i",
      "is not what i",
      "isn't right",
      "is not right",
      "not correct",
      "isn't correct",
      "misunderstood",
      "misunderstand",
      "got it wrong",
      "you are wrong"
    ],
    "asked_again": [
      "again",
      "once more",
      "repeat",
      "repeat that",
      "one more time",
      "say that again"
    ]
  },
  "lonely_words": {
    "drive": {
      "needs_one_of": [
        "my drive",
        "the drive",
        "use drive",
        "drive folder",
        "drive folders",
        "drive file",
        "drive files",
        "in drive",
        "on drive",
        "from drive",
        "to drive",
        "shared drive"
      ]
    },
    "zoom": {
      "needs_one_of": [
        "use zoom",
        "my zoom",
        "connect zoom",
        "link zoom",
        "zoom account",
        "zoom app",
        "zoom call",
        "zoom calls",
        "zoom meeting",
        "zoom meetings",
        "on zoom",
        "with zoom",
        "to zoom"
      ],
      "not_with": [
        "listen",
        "listens",
        "listening",
        "record",
        "records",
        "recording",
        "join",
        "joins",
        "attend",
        "attends",
        "take notes",
        "takes notes",
        "transcribe"
      ]
    },
    "phone": {
      "not_with": [
        "photo",
        "photos",
        "pictures",
        "files",
        "contacts",
        "back up",
        "backup",
        "storage",
        "phone my",
        "phone the",
        "phone a",
        "phone an",
        "phone him",
        "phone her",
        "phone them",
        "phone me",
        "phone us",
        "phone someone",
        "phone somebody",
        "phone people",
        "phone back",
        "phone call",
        "phone calls",
        "phone number",
        "phone numbers"
      ]
    },
    "slow": {
      "needs_one_of": [
        "answer",
        "answers",
        "reply",
        "replies",
        "response",
        "responses",
        "it",
        "it's",
        "hermes",
        "bot",
        "helper",
        "chat",
        "chats",
        "message",
        "messages",
        "ai",
        "model"
      ],
      "not_with": [
        "internet",
        "wifi",
        "wi-fi",
        "computer",
        "laptop",
        "pc",
        "mac",
        "phone",
        "service",
        "website",
        "connection",
        "network",
        "printer"
      ]
    },
    "is slow": {
      "needs_one_of": [
        "answer",
        "answers",
        "reply",
        "replies",
        "response",
        "responses",
        "it",
        "it's",
        "hermes",
        "bot",
        "helper",
        "chat",
        "chats",
        "message",
        "messages",
        "ai",
        "model"
      ],
      "not_with": [
        "internet",
        "wifi",
        "wi-fi",
        "computer",
        "laptop",
        "pc",
        "mac",
        "phone",
        "service",
        "website",
        "connection",
        "network",
        "printer"
      ]
    },
    "speed up": {
      "not_with": [
        "internet",
        "wifi",
        "wi-fi",
        "computer",
        "laptop",
        "pc",
        "mac",
        "phone",
        "service",
        "website",
        "connection",
        "network",
        "printer"
      ]
    },
    "speed it up": {
      "not_with": [
        "internet",
        "wifi",
        "wi-fi",
        "computer",
        "laptop",
        "pc",
        "mac",
        "phone",
        "service",
        "website",
        "connection",
        "network",
        "printer"
      ]
    },
    "bill": {
      "needs_one_of": [
        "huge",
        "high",
        "big",
        "too high",
        "so high",
        "this month",
        "last month",
        "went up",
        "going up",
        "expensive",
        "too much",
        "so much"
      ],
      "not_with": [
        "pay my",
        "pay the",
        "pay a",
        "pay bills",
        "split"
      ]
    },
    "too long": {
      "needs_one_of": [
        "context",
        "chat",
        "chats",
        "conversation",
        "conversations",
        "session",
        "sessions",
        "window"
      ]
    },
    "fills up": {
      "needs_one_of": [
        "context",
        "chat",
        "chats",
        "conversation",
        "conversations",
        "session",
        "sessions",
        "window"
      ]
    },
    "filling up": {
      "needs_one_of": [
        "context",
        "chat",
        "chats",
        "conversation",
        "conversations",
        "session",
        "sessions",
        "window"
      ]
    },
    "filled up": {
      "needs_one_of": [
        "context",
        "chat",
        "chats",
        "conversation",
        "conversations",
        "session",
        "sessions",
        "window"
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
  "asks_for_topics": {
    "phrases": [
      "what can i ask",
      "what should i ask",
      "what could i ask",
      "what do i ask",
      "what else can i ask",
      "what can you help with",
      "what can you help me with",
      "what do you help with",
      "how can you help",
      "what can you tell me",
      "what can you explain",
      "what do you know",
      "what can you do",
      "what are you for",
      "what topics",
      "which topics",
      "what questions",
      "where do i start",
      "where should i start",
      "where to start",
      "give me ideas",
      "give me some ideas",
      "i don't know what to ask",
      "i dont know what to ask",
      "not sure what to ask",
      "no idea what to ask",
      "show me the topics",
      "show me topics"
    ],
    "whole_message": [
      "help",
      "help me",
      "i need help",
      "can you help",
      "can you help me",
      "topics",
      "options",
      "menu",
      "ideas",
      "examples"
    ]
  },
  "what_is": {
    "pattern": "^(?:(?:so|ok|okay|and|hi|hey|helper|please|pls|plz|can you|could you|would you)[ ,]+)*(?:what is|what's|whats|what are|what exactly is|what does|explain|tell me what)\\s+(?:a |an |the )?(.+?)(?:\\s+(?:is|are|means|mean))?(?:[\\s,?.!]+(?:please|pls|plz|thanks|thank you|thx))*\\s*[?.!]*$",
    "words": {
      "mod": [
        "model",
        "models",
        "ai model",
        "ai models",
        "llm",
        "llms",
        "language model",
        "large language model"
      ],
      "mem": [
        "memory",
        "memories",
        "hermes memory"
      ],
      "msg": [
        "messaging"
      ],
      "sch": [
        "scheduled job",
        "scheduled jobs",
        "schedule",
        "cron",
        "cron job",
        "cron jobs"
      ],
      "bot": [
        "bot",
        "bots"
      ],
      "use": [
        "token",
        "tokens"
      ]
    }
  },
  "cost": {
    "words": [
      "cost",
      "costs",
      "price",
      "prices",
      "pricing",
      "how much is it",
      "how much is hermes",
      "how much does it",
      "how much does hermes",
      "is it free",
      "is hermes free",
      "free to use",
      "have to pay",
      "need to pay",
      "pay for hermes",
      "pay for it",
      "fee",
      "fees"
    ],
    "amount_asks": [
      "how much",
      "per month",
      "a month",
      "each month",
      "every month",
      "monthly",
      "per year",
      "a year",
      "per day",
      "a day"
    ],
    "use_price_words": [
      "cost",
      "costs",
      "costing",
      "cost me",
      "costs me",
      "costing me",
      "money",
      "price",
      "pay"
    ]
  },
  "where": {
    "words": [
      "server",
      "servers",
      "vps",
      "cloud",
      "in the cloud",
      "hosting",
      "host it",
      "host hermes",
      "self-host",
      "self host",
      "raspberry pi",
      "mac mini",
      "always on",
      "24/7",
      "run it on my laptop",
      "run it on my computer",
      "run hermes on my laptop",
      "run hermes on my computer",
      "where should i run",
      "where do i run",
      "where to run",
      "where can i run",
      "where should i install",
      "where do i install",
      "where to install"
    ]
  },
  "w1_pairs": [
    {
      "terms": [
        "skill",
        "plugin"
      ],
      "line": "W2"
    }
  ],
  "topic_picks": [
    {
      "label": "What Hermes can do",
      "gives": "can",
      "line": "C1",
      "holds": [
        "wants",
        "sch",
        "svc",
        "bot"
      ]
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
    }
  ],
  "held_picks": [
    "wants"
  ],
  "held_labels": {
    "wants": "Web, files, pictures and voice"
  },
  "topics": [
    {
      "id": "mem",
      "part": "memory",
      "part_if_no_memory_part": "bots",
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
        "text": "Do you want Hermes to remember you, or find old chats?",
        "answers": [
          {
            "label": "Things about me",
            "gives": "mem1"
          },
          {
            "label": "Our old chats",
            "gives": "mem2"
          },
          {
            "label": "It forgot something",
            "gives": "mem3"
          },
          {
            "label": "Separate notes per Hermes",
            "gives": "mem4"
          }
        ]
      },
      "plain": {
        "id": "mem0",
        "text": "Memory is short notes Hermes keeps about you and your work.",
        "source": "user-guide/features/memory.md lines 9, 17 to 18",
        "next": {
          "kind": "paste",
          "label": "Try it",
          "paste_text": "Please save this to your memory: <one thing about you>. Then tell me what you saved."
        }
      },
      "needs": [
        {
          "id": "mem1",
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
        "paying",
        "paid",
        "cost",
        "costs",
        "spend",
        "spending",
        "expensive",
        "cheap",
        "cheaper",
        "cheapest",
        "free",
        "subscription",
        "subscriptions",
        "budget",
        "pay for",
        "have to pay",
        "need to pay",
        "do i pay",
        "pay anything",
        "pay to use",
        "pay monthly",
        "pay extra",
        "pay more",
        "pay less",
        "should i pay",
        "will i pay",
        "how much money",
        "cost money",
        "costs money",
        "cost me money",
        "spend money",
        "spending money",
        "any money",
        "save money",
        "waste money",
        "much money"
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
        },
        "then": {
          "id": "msg0-then",
          "text": "In the Hermes app, open Messaging and pick your chat app. For Telegram, press Create with QR.",
          "source": "user-guide/desktop.md line 451 (msg1 and msg2's source); content/dash-setup-list-v2.json, Chat apps steps"
        }
      },
      "needs": [
        {
          "id": "msg1",
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
          },
          "then": {
            "id": "msg1-then",
            "text": "Scan the code with Telegram on your phone. Hermes makes the bot, lets only you in, and restarts by itself.",
            "source": "user-guide/desktop.md line 487 in /hermes-docs (\"scan the code (or open the link) in Telegram, and Hermes creates the bot, detects your user ID for the allowlist, saves the credentials, and restarts the gateway for you\"); the same two sentences as content/dash-setup-list-v2.json, chat_apps steps 3 and 4"
          }
        },
        {
          "id": "msg2",
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
        "text": "Do you want a daily job, a reminder, or a regular check?",
        "answers": [
          {
            "label": "A job every day",
            "gives": "sch1"
          },
          {
            "label": "A reminder",
            "gives": "sch2"
          },
          {
            "label": "A regular check",
            "gives": "sch3"
          },
          {
            "label": "My email every morning",
            "gives": "sch5"
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
          "key_words": [
            "summary",
            "report",
            "news",
            "digest",
            "list",
            "daily update",
            "daily updates",
            "weekly update",
            "weekly updates",
            "morning update",
            "update every",
            "updates every",
            "update me every",
            "an update each",
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
        },
        {
          "id": "sch5",
          "key_words": [
            "email",
            "emails",
            "e-mail",
            "mail",
            "my mail",
            "gmail",
            "inbox",
            "outlook"
          ],
          "wins_over_other_needs": true,
          "text": "Yes. Connect your email to Hermes first. Then ask it once, in plain words.",
          "source": "user-guide/features/cron.md lines 15 and 24 (jobs on a schedule, made by asking in plain language); user-guide/skills/bundled/productivity/productivity-google-workspace.md lines 11 and 34 (a built-in skill that reads Gmail)",
          "next": {
            "kind": "paste",
            "label": "Show me what to ask",
            "paste_text": "Every morning at 8, check my email and send me a short summary."
          }
        }
      ]
    },
    {
      "id": "svc",
      "part": "capabilities",
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
          "key_words": [
            "google calendar",
            "gmail",
            "google drive",
            "google sheets",
            "google mail",
            "google",
            "calendar",
            "github",
            "notion",
            "linear",
            "one drive",
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
            "google drive": "Google Drive",
            "google sheets": "Google Sheets",
            "google mail": "Gmail",
            "google": "Google",
            "calendar": "my calendar",
            "calender": "my calendar",
            "github": "GitHub",
            "notion": "Notion",
            "linear": "Linear",
            "one drive": "OneDrive",
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
        "text": "Do you want one more Hermes, or two that work together?",
        "answers": [
          {
            "label": "One more Hermes",
            "gives": "bot1"
          },
          {
            "label": "Two working together",
            "gives": "bot2"
          },
          {
            "label": "Many chats in one",
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
    },
    {
      "id": "use",
      "part": "model",
      "key_words": [
        "token",
        "tokens",
        "usage",
        "use less",
        "uses less",
        "using less",
        "less usage",
        "uses a lot",
        "uses so much",
        "uses too much",
        "using too much",
        "using a lot",
        "uses up",
        "costs too much",
        "cost too much",
        "costing too much",
        "costs a lot",
        "too expensive",
        "so expensive",
        "cheaper",
        "save money",
        "spend less",
        "pay less",
        "lower cost",
        "lower the cost",
        "reduce cost",
        "reduce the cost",
        "credits",
        "quota",
        "rate limit",
        "usage limit",
        "runs out",
        "run out",
        "ran out",
        "running out",
        "hit the limit",
        "hit a limit",
        "hit my limit",
        "reached the limit",
        "limit reached",
        "so slow",
        "too slow",
        "is slow",
        "slow answers",
        "answers slowly",
        "takes forever",
        "takes so long",
        "takes too long",
        "faster answers",
        "costing me",
        "cost me",
        "costs me",
        "too much money",
        "so much money",
        "a lot of money",
        "spending too much",
        "spending so much",
        "bill",
        "take forever",
        "taking forever",
        "took forever",
        "takes ages",
        "take ages",
        "taking ages",
        "took ages",
        "slows down",
        "slowing down",
        "slowed down",
        "speed it up",
        "speed up",
        "slow",
        "context window",
        "context length",
        "context is full",
        "too long",
        "fills up",
        "filling up",
        "filled up",
        "long chat",
        "long chats",
        "long conversation"
      ],
      "misspellings": [
        "tokns",
        "toknes",
        "tokenz",
        "tokkens",
        "useage",
        "usuage"
      ],
      "weak_key_words": [
        "limit",
        "limits"
      ],
      "typed_only": true,
      "pick": {
        "label": "Using less"
      },
      "question": {
        "id": "use-q",
        "text": "Is it the cost, a limit that runs out, or slow answers?",
        "answers": [
          {
            "label": "Each message uses a lot",
            "gives": "use1"
          },
          {
            "label": "It costs too much",
            "gives": "use2"
          },
          {
            "label": "My limit runs out",
            "gives": "use3"
          },
          {
            "label": "Answers are slow",
            "gives": "use4"
          }
        ]
      },
      "plain": {
        "id": "use0",
        "text": "Tokens are small pieces of words. Your AI counts them, and long chats use the most.",
        "source": "token: Anthropic glossary, https://platform.claude.com/docs/en/about-claude/glossary (\"Tokens are the smallest individual units of a language model, and can correspond to words, subwords, characters\"); counted and paid: getting-started/quickstart.md line 118 (\"API key for pay-per-token\"); long chats: reference/faq.md line 547 (\"Cause: Long conversations, verbose system prompts, or many tool calls accumulating context.\")",
        "next": {
          "kind": "line",
          "label": "What helps",
          "id": "use-more",
          "text": "When a chat gets long, start a fresh one. Click \"New session\" at the top left.",
          "source": "reference/faq.md line 547 (\"Cause: Long conversations\"); sessions.md line 97 (\"`/new` for a fresh thread\"); seen: the left list's top item \"New session\", dev/checks/hhtech-desk-usage/shots-2b-r2/01-new-chat.png (hhtech-desk-usage.md section 2; Lead opened two other shots of the same run)"
        }
      },
      "needs": [
        {
          "id": "use1",
          "key_words": [
            "token",
            "tokens",
            "tokns",
            "toknes",
            "use less",
            "uses less",
            "using less",
            "less usage",
            "uses a lot",
            "uses so much",
            "uses too much",
            "using too much",
            "using a lot",
            "uses up",
            "each message",
            "every message",
            "each question",
            "every question",
            "per message",
            "per question",
            "context window",
            "context length",
            "context is full",
            "too long",
            "fills up",
            "filling up",
            "filled up",
            "long chat",
            "long chats",
            "long conversation"
          ],
          "only_if_no_other_need": true,
          "text": "Long chats use the most tokens, small pieces of words. For a fresh chat, click \"New session\" at the top left.",
          "source": "token: Anthropic glossary (as use0); reference/faq.md line 547 (\"Cause: Long conversations\"); sessions.md line 97 (\"`/new` for a fresh thread\"); seen: the left list's top item \"New session\", dev/checks/hhtech-desk-usage/shots-2b-r2/01-new-chat.png (hhtech-desk-usage.md section 2; Lead opened two other shots of the same run)",
          "next": {
            "kind": "line",
            "label": "See what uses them",
            "id": "use1-next",
            "text": "In a Hermes chat, not here, type /usage and send it. It shows what each message carries, like the list of actions Hermes can take.",
            "source": "reference/faq.md lines 558 to 559 (\"# Check session token usage\" / \"/usage\"), line 562 (\"the system prompt plus tool schemas sent on every call\"); user-guide/tui.md line 133 (\"Rich token / cost / context panel\"); seen: /usage typed in a Desktop chat prints \"Context breakdown (estimated)\" with \"System prompt\", \"Tool definitions\", \"Subagent definitions\", \"Conversation\", dev/checks/hhtech-desk-usage/shots-2b-r2/09-usage-sent.png (opened by Lead). \"actions Hermes can take\" is the tool term's own wording (terms.tool). \"send it\": hhtech saw /compress need Enter twice (the first picks it from a list); the line does not say how many.",
            "mean": {
              "id": "use1-next-mean",
              "text": "Open a chat with Hermes and type /usage as your message. Hermes answers with a list of what takes up room in that chat.",
              "source": "the same as use1-next: reference/faq.md lines 558 to 559 (/usage); seen: /usage typed in a Desktop chat prints \"Context breakdown (estimated)\" (dev/checks/hhtech-desk-usage/shots-2b-r2/09-usage-sent.png, opened by Lead)"
            }
          }
        },
        {
          "id": "use2",
          "key_words": [
            "cost",
            "costs",
            "costing",
            "expensive",
            "cheaper",
            "cheap",
            "money",
            "save money",
            "spend less",
            "pay less",
            "price",
            "bill",
            "costs too much",
            "too expensive",
            "costing me",
            "cost me",
            "costs me",
            "too much money",
            "so much money",
            "a lot of money",
            "spending too much",
            "spending so much"
          ],
          "text": "Long chats cost the most. For a fresh chat, click \"New session\" at the top left. A cheaper AI also helps.",
          "source": "reference/faq.md line 547 (\"Long conversations\"); sessions.md line 97 (\"`/new` for a fresh thread\"); seen: the left list's top item \"New session\", dev/checks/hhtech-desk-usage/shots-2b-r2/01-new-chat.png (hhtech-desk-usage.md section 2; Lead opened two other shots of the same run); integrations/providers.md line 1562 (\"Cost optimization\")",
          "next": {
            "kind": "part",
            "label": "Open Model"
          }
        },
        {
          "id": "use3",
          "key_words": [
            "limit",
            "limits",
            "runs out",
            "run out",
            "ran out",
            "running out",
            "quota",
            "credits",
            "rate limit",
            "usage limit",
            "hit the limit",
            "hit a limit",
            "hit my limit",
            "reached the limit",
            "limit reached"
          ],
          "text": "Each message uses part of your limit, and long chats use more. For a fresh chat, click \"New session\" at the top left.",
          "source": "user-guide/features/credential-pools.md line 29 (\"Plan/usage limit reached\"); reference/faq.md line 547 (\"Long conversations\"); sessions.md line 97 (\"`/new` for a fresh thread\"); seen: the left list's top item \"New session\", dev/checks/hhtech-desk-usage/shots-2b-r2/01-new-chat.png (hhtech-desk-usage.md section 2; Lead opened two other shots of the same run)",
          "next": {
            "kind": "line",
            "label": "See what uses them",
            "id": "use3-next",
            "text": "In a Hermes chat, not here, type /usage and send it. It shows what each message carries, like the list of actions Hermes can take.",
            "source": "reference/faq.md lines 558 to 559 (\"# Check session token usage\" / \"/usage\"), line 562 (\"the system prompt plus tool schemas sent on every call\"); user-guide/tui.md line 133 (\"Rich token / cost / context panel\"); seen: /usage typed in a Desktop chat prints \"Context breakdown (estimated)\" with \"System prompt\", \"Tool definitions\", \"Subagent definitions\", \"Conversation\", dev/checks/hhtech-desk-usage/shots-2b-r2/09-usage-sent.png (opened by Lead). \"actions Hermes can take\" is the tool term's own wording (terms.tool). \"send it\": hhtech saw /compress need Enter twice (the first picks it from a list); the line does not say how many.",
            "mean": {
              "id": "use3-next-mean",
              "text": "Open a chat with Hermes and type /usage as your message. Hermes answers with a list of what takes up room in that chat.",
              "source": "the same as use3-next: reference/faq.md lines 558 to 559 (/usage); seen: /usage typed in a Desktop chat prints \"Context breakdown (estimated)\" (dev/checks/hhtech-desk-usage/shots-2b-r2/09-usage-sent.png, opened by Lead)"
            }
          }
        },
        {
          "id": "use4",
          "key_words": [
            "slow",
            "slowly",
            "so slow",
            "too slow",
            "takes forever",
            "takes long",
            "takes so long",
            "takes too long",
            "faster",
            "speed",
            "laggy",
            "lag",
            "take forever",
            "taking forever",
            "took forever",
            "takes ages",
            "take ages",
            "taking ages",
            "took ages",
            "slows down",
            "slowing down",
            "slowed down",
            "speed it up",
            "speed up"
          ],
          "text": "Big AIs and long chats can make answers slow. A smaller, faster AI can help.",
          "source": "reference/faq.md lines 538 to 541 (\"Slow responses ... Cause: Large model, distant API server, or heavy system prompt with many tools ... Try a faster/smaller model\"); guides/troubleshooting-agent-quality.md line 27 (\"responses are slowing down\" in a long session)",
          "next": {
            "kind": "part",
            "label": "Open Model"
          }
        }
      ]
    }
  ],
  "terms": [
    {
      "id": "tool",
      "label": "Tools",
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
      },
      "mean": {
        "id": "skill-mean",
        "text": "Think of a skill as a recipe. Hermes follows its steps when a task needs it.",
        "source": "the same as the skill line: getting-started/quickstart.md line 295 (\"on-demand instruction documents that teach Hermes how to do a specific task ... a step-by-step procedure\"). 'recipe' is hhcontent's own everyday comparison, not a docs word."
      }
    },
    {
      "id": "plugin",
      "label": "Plugins",
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
      },
      "mean": {
        "id": "plugin-mean",
        "text": "It is like an app on your phone. You add it, and Hermes gets one more feature.",
        "source": "the same as the plugin line: user-guide/features/plugins.md line 10. 'like an app on your phone' is hhcontent's own everyday comparison, not a docs word."
      }
    },
    {
      "id": "mcp",
      "label": "MCP",
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
  "keeps": {
    "answers": {
      "mod": {
        "values": [
          {
            "need": "mod1",
            "value": "you pay for ChatGPT",
            "typed_words": [
              "chatgpt",
              "openai",
              "gpt",
              "codex",
              "chat gpt",
              "chatgtp"
            ],
            "typed_not_with_unsure_words": true
          },
          {
            "need": "mod2",
            "value": "you pay for Claude",
            "typed_words": [
              "claude",
              "anthropic"
            ],
            "typed_not_with_unsure_words": true
          },
          {
            "need": "mod4",
            "value": "you pay for neither",
            "typed_words": []
          },
          {
            "need": "mod3",
            "value": "you want it free",
            "typed_words": [
              "want it free",
              "for free",
              "free one",
              "free ai",
              "free model",
              "don't want to pay",
              "dont want to pay",
              "do not want to pay",
              "not pay",
              "without paying",
              "no money",
              "any money",
              "cost nothing",
              "costs nothing",
              "cheapest"
            ]
          }
        ]
      },
      "msg": {
        "names": {
          "telegram": "Telegram",
          "telegramm": "Telegram",
          "telegrm": "Telegram",
          "telgram": "Telegram",
          "telegam": "Telegram",
          "telegarm": "Telegram",
          "whatsapp": "WhatsApp",
          "whatsap": "WhatsApp",
          "whats app": "WhatsApp",
          "watsapp": "WhatsApp",
          "whatsup": "WhatsApp",
          "wattsapp": "WhatsApp",
          "whatapp": "WhatsApp",
          "slack": "Slack",
          "discord": "Discord",
          "discrod": "Discord",
          "signal": "Signal",
          "sms": "SMS",
          "email": "Email",
          "teams": "Teams",
          "imessage": "iMessage",
          "matrix": "Matrix"
        }
      },
      "svc": {
        "names": {
          "google calendar": "Google Calendar",
          "gmail": "Gmail",
          "gmial": "Gmail",
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
          "youtube": "YouTube",
          "google drive": "Google Drive",
          "google sheets": "Google Sheets",
          "google mail": "Gmail",
          "one drive": "OneDrive"
        }
      }
    },
    "things": [
      {
        "id": "name",
        "kept_words": "{name}"
      },
      {
        "id": "work",
        "kept_words": "{work}"
      },
      {
        "id": "mod",
        "kept_words": "{value}"
      },
      {
        "id": "msg",
        "kept_words": "you use {app}"
      },
      {
        "id": "svc",
        "kept_words": "you use {service}"
      },
      {
        "id": "asked",
        "kept_words": "{thing}"
      }
    ],
    "typed_change": {
      "self_words": [
        "my",
        "i use",
        "i have",
        "i pay",
        "i'm on",
        "im on",
        "i am on",
        "we use",
        "i switched",
        "i moved"
      ],
      "question_words": [
        "can",
        "could",
        "how",
        "does",
        "do",
        "should",
        "which",
        "what",
        "will",
        "is it"
      ],
      "not_words": [
        "not",
        "don't",
        "dont",
        "no longer",
        "anymore",
        "stopped",
        "never",
        "used to",
        "instead of"
      ]
    },
    "work": {
      "limits": {
        "min_words": 1,
        "max_words": 12,
        "max_chars": 80
      },
      "non_answers": [
        "nothing",
        "not much",
        "nothing really",
        "none",
        "no",
        "nope",
        "idk",
        "i don't know",
        "i dont know",
        "dunno",
        "not sure",
        "skip",
        "pass",
        "rather not say",
        "i'd rather not say",
        "prefer not to say",
        "i prefer not to say",
        "none of your business",
        "n/a",
        "na",
        "-",
        "?",
        "..."
      ],
      "lines": {
        "WORK_SECRET": "Thanks. I didn't keep that, because it looks like a password or a long number.",
        "WORK_LONG": "Thanks. That is too long for me to keep. In 12 words or fewer, what do you do?",
        "WORK_LONG_2": "Thanks. I didn't keep that, because it is too long.",
        "WORK_ASK": "What do you do now?"
      },
      "offers": {
        "WORK_LONG_2": "general",
        "WORK_SECRET": "general"
      },
      "typed_change": {
        "starts": [
          "i'm a",
          "i'm an",
          "im a",
          "i am a",
          "i am an",
          "i work as",
          "i work at",
          "i work in",
          "i work for",
          "i'm working as",
          "i run",
          "i own",
          "i teach",
          "i study",
          "i'm studying",
          "i manage",
          "i coach",
          "my job is",
          "my work is",
          "i'm retired",
          "i am retired"
        ],
        "now_words": [
          "now",
          "nowadays",
          "these days",
          "instead",
          "anymore"
        ],
        "not_with": [
          "not",
          "no longer",
          "don't",
          "dont",
          "bit",
          "little",
          "beginner",
          "newbie",
          "confused",
          "lost",
          "stuck"
        ],
        "ask_again_words": [
          "change what i do",
          "change my job",
          "change what you know about my job",
          "update what i do"
        ]
      }
    },
    "use": {
      "used_line": "From what I keep: {kept_words}.",
      "used_link": {
        "words": "Change"
      }
    },
    "tell": {
      "kept_line": "Kept: {kept_words}.",
      "first_time_if_no_model_call": "I keep this in the Hermes app on this computer. Nothing you type to me goes to any AI or anyone. Never tell me passwords.",
      "link": {
        "words": "See what I keep"
      },
      "see": {
        "see_line": "This is all I keep about you.",
        "see_line_nothing": "I keep nothing about you yet.",
        "see_line_deleted": "Everything I kept about you is deleted. I only remember that we have met.",
        "delete_all": {
          "label": "Delete all of it",
          "question": "Delete everything I keep about you?",
          "after_yes": "Done. I keep nothing about you now. I won't ask your name again.",
          "after_no": "Fine. Nothing is changed.",
          "answers": [
            {
              "label": "Yes, delete it",
              "gives": "yes"
            },
            {
              "label": "No",
              "gives": "no"
            }
          ]
        },
        "rows": {
          "name": "Your name: {name}",
          "work": "What you do: {work}",
          "mod": "Paying for an AI: {value}",
          "msg": "Your chat app: {app}",
          "svc": "A service you use: {service}",
          "asked": "You asked me to remember: {thing}"
        }
      }
    },
    "remember": {
      "lead_ins": [
        "please",
        "helper",
        "hey helper",
        "hi helper",
        "ok",
        "okay",
        "also",
        "and"
      ],
      "request_starts": [
        "remember that",
        "remember this:",
        "remember:",
        "make sure you remember",
        "make sure that you remember",
        "make sure to remember",
        "don't forget that",
        "dont forget that",
        "do not forget that",
        "keep in mind that",
        "note that",
        "remember i",
        "remember i'm",
        "remember im",
        "remember my",
        "remember we",
        "remember our"
      ],
      "thing_starts_at_last_word": [
        "remember i",
        "remember i'm",
        "remember im",
        "remember my",
        "remember we",
        "remember our"
      ],
      "limits": {
        "min_words": 2,
        "max_words": 15,
        "max_chars": 100,
        "max_things": 3
      },
      "refuse": {
        "words": [
          "password",
          "passwords",
          "passwd",
          "passcode",
          "passcodes",
          "passphrase",
          "passphrases",
          "pin code",
          "pin codes",
          "pin number",
          "pin numbers",
          "my pin",
          "my pins",
          "pin is",
          "pins are",
          "bank pin",
          "card number",
          "card numbers",
          "credit card",
          "credit cards",
          "cvv",
          "cvc",
          "security code",
          "iban",
          "ibans",
          "account number",
          "account numbers",
          "sort code",
          "routing number",
          "social security",
          "ssn",
          "passport number",
          "passport numbers",
          "secret key",
          "secret keys",
          "api key",
          "api keys",
          "api-key",
          "apikey",
          "access key",
          "access keys",
          "private key",
          "private keys",
          "access token",
          "access tokens",
          "api token",
          "auth token",
          "bot token",
          "recovery code",
          "recovery codes",
          "backup code",
          "backup codes",
          "recovery phrase",
          "seed phrase",
          "login",
          "logins",
          "log-in",
          "credentials"
        ],
        "digits_pattern": "(?:\\d[ -]?){8,}",
        "secret_words": [
          "password",
          "passwords",
          "passwd",
          "pw",
          "pwd",
          "passcode",
          "passcodes",
          "passphrase",
          "passphrases",
          "login",
          "logins",
          "log-in",
          "recovery phrase",
          "recovery words",
          "seed phrase",
          "seed words",
          "secret words",
          "mnemonic",
          "parole",
          "paroles",
          "passwort",
          "kennwort",
          "mot de passe",
          "contraseña",
          "contrasena",
          "senha",
          "wachtwoord",
          "hasło",
          "haslo",
          "salasana",
          "lösenord",
          "losenord",
          "passord",
          "adgangskode",
          "пароль",
          "parola",
          "heslo",
          "jelszó",
          "jelszo",
          "slaptažodis",
          "slaptazodis",
          "parool",
          "şifre",
          "sifre",
          "my pin",
          "pin code",
          "alarm code",
          "door code",
          "gate code",
          "combination"
        ],
        "typo_words": [
          "password",
          "passwords",
          "passcode",
          "passphrase",
          "passwort",
          "wachtwoord"
        ],
        "typo_min_letters": 6,
        "maybe_words": [
          "pin",
          "pins",
          "pin code",
          "pin number",
          "key",
          "keys",
          "code",
          "codes",
          "token",
          "tokens",
          "secret",
          "secrets",
          "pass",
          "card",
          "cards",
          "cvv",
          "cvc",
          "iban",
          "ibans",
          "account number",
          "account numbers",
          "sort code",
          "routing number",
          "social security",
          "ssn",
          "passport number",
          "credentials",
          "wifi",
          "wi-fi"
        ],
        "link_words": [
          "is",
          "are",
          "was",
          "were",
          "ir",
          "ist",
          "est",
          "es",
          "è",
          "é",
          "är",
          "er",
          "jest",
          "je",
          "yra",
          "это"
        ],
        "link_within": 4,
        "after_link_not_value": [
          "in",
          "on",
          "at",
          "under",
          "inside",
          "into",
          "with",
          "the",
          "a",
          "an",
          "my",
          "our",
          "your",
          "his",
          "her",
          "their",
          "its",
          "this",
          "that",
          "written",
          "saved",
          "stored",
          "kept",
          "somewhere",
          "same",
          "different",
          "too",
          "very",
          "so",
          "long",
          "short",
          "hard",
          "easy",
          "simple",
          "not",
          "never",
          "always",
          "still",
          "old",
          "new",
          "weak",
          "strong",
          "safe",
          "changed",
          "reset",
          "expired",
          "lost",
          "forgotten",
          "also",
          "all",
          "required",
          "needed",
          "slow",
          "broken",
          "wrong",
          "missing",
          "gone",
          "there",
          "here",
          "important",
          "private",
          "secret",
          "~"
        ],
        "not_secret_phrases": [
          "password manager",
          "password managers",
          "login page",
          "login screen",
          "log in page",
          "password-free",
          "product code",
          "wifi is called",
          "wi-fi is called"
        ],
        "value": {
          "min_chars": 4,
          "digits_alone": 4,
          "digits_with_letters": 2,
          "min_chars_with_letters": 6,
          "signs": "!@#$%^&*_+=?~|<>",
          "not_values": [
            "^[0-9]{1,2}:[0-9]{2}$",
            "^[0-9]{1,2}[./][0-9]{1,2}[./][0-9]{2,4}$",
            "^[A-Z]{1,4}-?[0-9]{2,6}(-[0-9]{1,6})*$",
            "^[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}$",
            "^(https?://|www\\.)",
            "^[^\\s]*\\.[a-z]{2,}(/[^\\s]*)?$",
            "^@[A-Za-z][A-Za-z0-9_.]{1,31}$"
          ],
          "not_values_are": [
            "a time, 7:30",
            "a date, 12.05.2015",
            "capital letters then digits, like a postcode or flight number: LV-1050, BT602, ORD-2026-1145",
            "an email address",
            "a web address",
            "a web address without http, example.com/shop",
            "a user name with @ in front, @maria_bakes"
          ]
        },
        "shape": {
          "max_label_words": 4
        },
        "word_run": {
          "min_words": 12,
          "word": "[A-Za-z]{3,8}",
          "not_these": [
            "the",
            "and",
            "for",
            "with",
            "that",
            "this",
            "you",
            "your",
            "our",
            "his",
            "her",
            "are",
            "was",
            "has",
            "have",
            "not",
            "but",
            "from",
            "can",
            "will",
            "all",
            "any",
            "out",
            "who",
            "what",
            "when",
            "where",
            "how",
            "why",
            "they",
            "them",
            "she",
            "him",
            "its",
            "there",
            "then",
            "than",
            "also",
            "just",
            "very",
            "into",
            "about",
            "would",
            "could"
          ]
        }
      },
      "unsure": {
        "about": [
          "remember",
          "memorize",
          "memorise",
          "don't forget",
          "dont forget",
          "do not forget",
          "keep in mind",
          "make a note",
          "take a note"
        ],
        "said_to": [
          "you",
          "helper"
        ]
      },
      "lines": [
        {
          "id": "RM1",
          "kind": "reply",
          "text": "Done. It is on your list now. I do not act on it, and your Hermes is not told."
        },
        {
          "id": "RM2",
          "kind": "question",
          "text": "Do you mean me, or your own Hermes?",
          "answers": [
            {
              "label": "You, Helper",
              "gives": "RM3"
            },
            {
              "label": "My Hermes",
              "gives": "mem"
            }
          ]
        },
        {
          "id": "RM3",
          "kind": "reply",
          "text": "Tell me what to keep. Start with: remember that."
        },
        {
          "id": "RM4",
          "kind": "reply",
          "text": "I keep three such things at most. Delete one first, then ask again."
        },
        {
          "id": "RM5",
          "kind": "reply",
          "text": "That is too long for me to keep. Try it in 15 words or fewer."
        },
        {
          "id": "RM6",
          "kind": "reply",
          "text": "That looks like a password or a private number. I did not keep it."
        }
      ]
    },
    "typed": {
      "not_when": {
        "hermes_words": [
          "hermes",
          "my bot",
          "the bot",
          "my hermes"
        ],
        "it_words": [
          "it"
        ],
        "helper_words": [
          "you",
          "your",
          "yours"
        ]
      },
      "see": {
        "key_words": [
          "what do you know about me",
          "what do you keep about me",
          "what have you kept",
          "what did you keep",
          "what do you remember about me",
          "what you know about me",
          "show what you know",
          "what do you have on me",
          "see what i keep",
          "see what you keep"
        ]
      },
      "forget_one": {
        "key_words": {
          "name": [
            "forget my name",
            "delete my name",
            "remove my name",
            "don't keep my name",
            "do not keep my name",
            "stop keeping my name"
          ],
          "mod": [
            "forget what i pay for",
            "delete what i pay for",
            "forget that i pay",
            "forget that i want it free"
          ],
          "msg": [
            "forget my chat app",
            "delete my chat app",
            "remove my chat app"
          ],
          "svc": [
            "forget my service",
            "delete my service",
            "remove my service"
          ],
          "asked": [
            "forget what i asked you to remember",
            "delete what i asked you to remember",
            "forget what i told you to remember"
          ],
          "work": [
            "forget what i do",
            "delete what i do",
            "remove what i do",
            "forget my job",
            "delete my job",
            "remove my job",
            "forget my work",
            "delete my work"
          ]
        },
        "questions": {
          "name": "Delete your name?",
          "mod": "Delete what you told me about paying?",
          "msg": "Delete your chat app?",
          "svc": "Delete the service you named?",
          "asked": "Delete all you asked me to remember?",
          "work": "Delete what you told me you do?"
        },
        "after_yes": "Done. I no longer keep that.",
        "after_no": "Fine. Nothing is changed.",
        "nothing_kept": "I keep nothing like that, so there is nothing to delete.",
        "answers": [
          {
            "label": "Yes, delete it",
            "gives": "yes"
          },
          {
            "label": "No",
            "gives": "no"
          }
        ]
      },
      "forget_all": {
        "key_words": [
          "delete everything",
          "forget everything",
          "forget me",
          "forget all of this",
          "forget all of it",
          "delete all you know",
          "delete what you know about me",
          "forget what you know about me",
          "delete my data"
        ]
      }
    },
    "after_settings_page_exists": {
      "button_under_see": "Open Helper settings",
      "by_hand": "By hand: open \"Settings\", then \"Plugins\", then \"Helper\"."
    },
    "met": {
      "store_key": "met",
      "value": true
    },
    "settings_file": {
      "top_line": "This is what Helper keeps about you. Your Hermes does not read it or act on it.",
      "order": [
        "name",
        "work",
        "mod",
        "msg",
        "svc",
        "asked"
      ],
      "under_box": [
        "One thing per line. Delete a line to forget it.",
        "The words in brackets are Helper's reasons. Helper puts them back when you save."
      ],
      "empty": "Helper keeps nothing about you yet.",
      "buttons": [
        "Save",
        "Undo changes"
      ],
      "cannot_read": "Nothing was saved. Helper could not read line {n}:",
      "why": {
        "no_label": "Start it with a word such as Name or Remember, then a colon.",
        "empty": "Write something after the colon, or delete the line.",
        "name_value": "A name has letters only, 30 at most.",
        "mod_value": "After Paying for an AI, write ChatGPT, Claude, Neither or Free.",
        "msg_value": "Helper knows these chat apps: Telegram, WhatsApp, Discord, Slack, Signal, SMS, Email, Teams, iMessage, Matrix.",
        "svc_value": "Helper does not know that service. Try one such as Gmail or Notion, or delete the line.",
        "remember_short": "Write at least two words after Remember.",
        "remember_long": "Keep it to 15 words and 100 letters or fewer.",
        "remember_bracket": "Brackets at the end of a line are for Helper's reasons. Leave yours out.",
        "twice": "There is a {label} line already. Keep one of them.",
        "same_twice": "This line is there twice. Delete one.",
        "too_many": "Helper keeps three Remember lines at most. Delete one.",
        "work_value": "Keep it to 12 words and 80 letters or fewer, with no question mark."
      },
      "saved": "Saved.",
      "also_tell": "You can also tell Helper. In its conversation, type: forget my name.",
      "facts": [
        "Kept as plain text in the Hermes app on this computer.",
        "Shared by all your bots, each a separate Hermes.",
        "Removing Helper does not delete it.",
        "Do not type passwords here."
      ],
      "box_lines": {
        "name": {
          "label": "Name",
          "reason": "Helper greets you with it"
        },
        "work": {
          "label": "What you do",
          "reason": "Helper tells your AI this when it asks for help",
          "reason_without_ai": "you told Helper this"
        },
        "mod": {
          "label": "Paying for an AI",
          "reason": "so Helper does not ask again",
          "values": {
            "ChatGPT": "mod1",
            "Claude": "mod2",
            "Neither": "mod4",
            "Free": "mod3"
          }
        },
        "msg": {
          "label": "Chat app",
          "reason": "so Helper shows that app's setup",
          "values": "keeps.answers.msg.names, written with the app's own spelling"
        },
        "svc": {
          "label": "Service",
          "reason": "so Helper can write the text to paste",
          "values": "keeps.answers.svc.names, written with the service's own spelling"
        },
        "asked": {
          "label": "Remember",
          "reason": "you asked Helper to keep it",
          "max": 3
        }
      },
      "would_delete": {
        "question": "Save, and forget {n} things?",
        "question_one": "Save, and forget one thing?",
        "answers": [
          {
            "label": "Yes, save",
            "gives": "yes"
          },
          {
            "label": "No",
            "gives": "no"
          }
        ]
      },
      "forget_all": {
        "label": "Forget all of this",
        "action": "Forget",
        "under": "Deletes everything on this page from this computer. Helper still won't ask your name again.",
        "question": "Delete everything Helper keeps about you?",
        "with_question": "What was already sent to your AI cannot be taken back.",
        "after_yes": "Done. Helper keeps nothing about you now. It won't ask your name again.",
        "answers": [
          {
            "label": "Yes, delete it",
            "gives": "yes"
          },
          {
            "label": "No",
            "gives": "no"
          }
        ]
      },
      "read": {
        "labels": {
          "name": [
            "name",
            "your name",
            "my name"
          ],
          "mod": [
            "paying for an ai",
            "paying for ai"
          ],
          "msg": [
            "chat app",
            "your chat app",
            "my chat app"
          ],
          "svc": [
            "service",
            "a service you use",
            "my service"
          ],
          "asked": [
            "remember",
            "you asked helper to remember"
          ],
          "work": [
            "what you do",
            "what i do",
            "work",
            "my work",
            "job",
            "my job"
          ]
        },
        "max_box_chars": 2000,
        "quote_max_chars": 60,
        "messages": {
          "saved": "Saved.",
          "cannot_read": "Nothing was saved. Helper could not read line {n}:",
          "quote": "\"{line}\"",
          "secret_line": "Nothing was saved. Line {n} looks like a password, a secret key or a long number. Delete it.",
          "too_much": "Nothing was saved. That is too much text for Helper's few short lines."
        }
      }
    }
  },
  "skills": [
    {
      "name": "apple-notes"
    },
    {
      "name": "apple-reminders"
    },
    {
      "name": "findmy"
    },
    {
      "name": "imessage"
    },
    {
      "name": "claude-code"
    },
    {
      "name": "codex"
    },
    {
      "name": "computer-use"
    },
    {
      "name": "hermes-agent"
    },
    {
      "name": "architecture-diagram"
    },
    {
      "name": "ascii-video"
    },
    {
      "name": "baoyu-infographic"
    },
    {
      "name": "claude-design"
    },
    {
      "name": "humanizer"
    },
    {
      "name": "manim-video"
    },
    {
      "name": "p5js"
    },
    {
      "name": "popular-web-designs"
    },
    {
      "name": "songwriting-and-ai-music"
    },
    {
      "name": "sdlc-review"
    },
    {
      "name": "email-inbox-triage"
    },
    {
      "name": "himalaya"
    },
    {
      "name": "youtube-content"
    },
    {
      "name": "obsidian"
    },
    {
      "name": "document-to-action-items"
    },
    {
      "name": "google-workspace"
    },
    {
      "name": "maps"
    },
    {
      "name": "meeting-action-items"
    },
    {
      "name": "microsoft-office"
    },
    {
      "name": "pdf"
    },
    {
      "name": "product-price-monitor"
    },
    {
      "name": "teams-meeting-pipeline"
    },
    {
      "name": "weekly-review-planning"
    },
    {
      "name": "arxiv"
    },
    {
      "name": "competitor-news-monitor"
    },
    {
      "name": "grounded-citations"
    },
    {
      "name": "xurl"
    },
    {
      "name": "codebase-inspection"
    },
    {
      "name": "dogfood"
    },
    {
      "name": "github"
    },
    {
      "name": "requesting-code-review"
    },
    {
      "name": "simplify-code"
    },
    {
      "name": "spike"
    },
    {
      "name": "systematic-debugging"
    },
    {
      "name": "test-driven-development"
    },
    {
      "name": "blocked-page-recovery"
    },
    {
      "name": "agent-merge-conflict-arbiter"
    },
    {
      "name": "antigravity-cli"
    },
    {
      "name": "blackbox"
    },
    {
      "name": "dynamic-workflow"
    },
    {
      "name": "grok"
    },
    {
      "name": "opencode"
    },
    {
      "name": "openhands"
    },
    {
      "name": "evm"
    },
    {
      "name": "hyperliquid"
    },
    {
      "name": "solana"
    },
    {
      "name": "one-three-one-rule"
    },
    {
      "name": "ai-presenter-video"
    },
    {
      "name": "anatomy"
    },
    {
      "name": "archify"
    },
    {
      "name": "ascii-art"
    },
    {
      "name": "auteur"
    },
    {
      "name": "baoyu-article-illustrator"
    },
    {
      "name": "baoyu-comic"
    },
    {
      "name": "brag"
    },
    {
      "name": "brag-slim"
    },
    {
      "name": "comfyui"
    },
    {
      "name": "concept-diagrams"
    },
    {
      "name": "creative-ideation"
    },
    {
      "name": "design-md"
    },
    {
      "name": "draw-your-font"
    },
    {
      "name": "dream-loop"
    },
    {
      "name": "excalidraw"
    },
    {
      "name": "heartmula"
    },
    {
      "name": "hyperframes"
    },
    {
      "name": "impeccable"
    },
    {
      "name": "ip-as-logo"
    },
    {
      "name": "kanban-video-orchestrator"
    },
    {
      "name": "meme-generation"
    },
    {
      "name": "mono-color"
    },
    {
      "name": "pixel-art"
    },
    {
      "name": "pretext"
    },
    {
      "name": "simple-english"
    },
    {
      "name": "sketch"
    },
    {
      "name": "social-media-content-calendar"
    },
    {
      "name": "system-atlas"
    },
    {
      "name": "tldraw-offline"
    },
    {
      "name": "unreal-mcp"
    },
    {
      "name": "jupyter-notebook"
    },
    {
      "name": "actual-setup"
    },
    {
      "name": "docker-management"
    },
    {
      "name": "hermes-s6-container-supervision"
    },
    {
      "name": "inference-sh-cli"
    },
    {
      "name": "pinggy-tunnel"
    },
    {
      "name": "setup-wizard-generator"
    },
    {
      "name": "watchers"
    },
    {
      "name": "adversarial-ux-test"
    },
    {
      "name": "agentmail"
    },
    {
      "name": "3-statement-model"
    },
    {
      "name": "comps-analysis"
    },
    {
      "name": "dcf-model"
    },
    {
      "name": "excel-author"
    },
    {
      "name": "lbo-model"
    },
    {
      "name": "merger-model"
    },
    {
      "name": "polymarket"
    },
    {
      "name": "pptx-author"
    },
    {
      "name": "stocks"
    },
    {
      "name": "minecraft-modpack-server"
    },
    {
      "name": "pokemon-player"
    },
    {
      "name": "fitness-nutrition"
    },
    {
      "name": "neuroskill-bci"
    },
    {
      "name": "fastmcp"
    },
    {
      "name": "mcp-oauth-remote-gateway"
    },
    {
      "name": "mcporter"
    },
    {
      "name": "gif-search"
    },
    {
      "name": "songsee"
    },
    {
      "name": "accelerate"
    },
    {
      "name": "axolotl"
    },
    {
      "name": "chroma"
    },
    {
      "name": "dspy"
    },
    {
      "name": "evaluating-llms-harness"
    },
    {
      "name": "faiss"
    },
    {
      "name": "flash-attention"
    },
    {
      "name": "lambda-labs"
    },
    {
      "name": "llama-cpp"
    },
    {
      "name": "modal"
    },
    {
      "name": "nemo-curator"
    },
    {
      "name": "obliteratus"
    },
    {
      "name": "peft"
    },
    {
      "name": "pytorch-fsdp"
    },
    {
      "name": "pytorch-lightning"
    },
    {
      "name": "saelens"
    },
    {
      "name": "segment-anything-model"
    },
    {
      "name": "serving-llms-vllm"
    },
    {
      "name": "simpo"
    },
    {
      "name": "slime"
    },
    {
      "name": "tensorrt-llm"
    },
    {
      "name": "torchtitan"
    },
    {
      "name": "unsloth"
    },
    {
      "name": "stripe-link-cli"
    },
    {
      "name": "stripe-projects"
    },
    {
      "name": "box"
    },
    {
      "name": "canvas"
    },
    {
      "name": "decision-questionnaire"
    },
    {
      "name": "here-now"
    },
    {
      "name": "live-dashboard"
    },
    {
      "name": "memento-flashcards"
    },
    {
      "name": "property-listings"
    },
    {
      "name": "shop"
    },
    {
      "name": "siyuan"
    },
    {
      "name": "telephony"
    },
    {
      "name": "bioinformatics"
    },
    {
      "name": "blogwatcher"
    },
    {
      "name": "darwinian-evolver"
    },
    {
      "name": "domain-intel"
    },
    {
      "name": "drug-discovery"
    },
    {
      "name": "gitnexus-explorer"
    },
    {
      "name": "llm-wiki"
    },
    {
      "name": "osint-investigation"
    },
    {
      "name": "parallel-cli"
    },
    {
      "name": "qmd"
    },
    {
      "name": "research-paper-writing"
    },
    {
      "name": "rss-feeds"
    },
    {
      "name": "scrapling"
    },
    {
      "name": "1password"
    },
    {
      "name": "godmode"
    },
    {
      "name": "oss-forensics"
    },
    {
      "name": "sherlock"
    },
    {
      "name": "unbroker"
    },
    {
      "name": "web-pentest"
    },
    {
      "name": "openhue"
    },
    {
      "name": "reddit-reading"
    },
    {
      "name": "ast-grep"
    },
    {
      "name": "code-wiki"
    },
    {
      "name": "grill-me"
    },
    {
      "name": "hermes-agent-skill-authoring"
    },
    {
      "name": "inspecting-hermes-desktop-dom"
    },
    {
      "name": "node-inspect-debugger"
    },
    {
      "name": "pr-lens"
    },
    {
      "name": "python-debugpy"
    },
    {
      "name": "rest-graphql-debug"
    },
    {
      "name": "subagent-driven-development"
    },
    {
      "name": "cloudflare-temporary-deploy"
    },
    {
      "name": "har-derived-api-client"
    },
    {
      "name": "page-agent"
    },
    {
      "name": "publish-site"
    },
    {
      "name": "scrollcraft"
    },
    {
      "name": "yuanbao"
    }
  ]
}

// ---- src/wants-data.js ----
// Generated by scripts/build.mjs from content/helper-wants-v1.json (hhcontent's wants: the rows, the
// groups, the skills of the two docs pages) and content/skills-list-v1.json (which skills are left
// out), checked against content/docs-lines-v0.23.0.json. Only the fields the code reads. Edit the JSON, then build.
const WANTS_DATA = {
  "docs_version": "v0.23.0",
  "pick": {
    "label": "Web, files, pictures and voice"
  },
  "question": {
    "text": "What do you want Hermes to do?",
    "answers": [
      {
        "label": "Search and use the web",
        "gives_group": "web"
      },
      {
        "label": "Files and my computer",
        "gives_group": "files"
      },
      {
        "label": "Pictures and video",
        "gives_group": "pics"
      },
      {
        "label": "Voice and sound",
        "gives_group": "voice"
      }
    ]
  },
  "groups": [
    {
      "id": "web",
      "label": "Search and use the web",
      "subject_words": [
        "web",
        "internet",
        "online",
        "website",
        "websites",
        "twitter",
        "tweet",
        "reddit",
        "post",
        "posting",
        "social media",
        "papers",
        "maps",
        "map",
        "stocks",
        "stock",
        "prices",
        "price",
        "flights"
      ]
    },
    {
      "id": "files",
      "label": "Files and my computer",
      "subject_words": [
        "pdf",
        "pdfs",
        "word",
        "excel",
        "powerpoint",
        "document",
        "documents",
        "spreadsheet",
        "obsidian",
        "code",
        "coding",
        "my computer"
      ]
    },
    {
      "id": "pics",
      "label": "Pictures and video",
      "subject_words": [
        "video",
        "videos",
        "picture",
        "pictures",
        "image",
        "images",
        "photo",
        "photos",
        "youtube",
        "animation"
      ]
    },
    {
      "id": "voice",
      "label": "Voice and sound",
      "subject_words": [
        "voice",
        "speak",
        "speech",
        "audio",
        "song",
        "songs",
        "music",
        "podcast"
      ]
    }
  ],
  "rows": [
    {
      "id": "w_web",
      "group": "web",
      "label": "Search the web",
      "kind": "built_in_tool",
      "thing": "web_search, web_extract",
      "key_words": [
        "web search",
        "search engine",
        "google things",
        "google something",
        "google it",
        "webpages",
        "webpage"
      ],
      "things": [
        "web",
        "internet",
        "online",
        "google",
        "news"
      ],
      "actions": [
        "search",
        "searches",
        "searching",
        "look up",
        "looks up",
        "find",
        "research",
        "check",
        "browse",
        "look stuff up",
        "looks stuff up",
        "look things up",
        "looks things up"
      ],
      "text": "Hermes can search the web and read web pages. That is a built-in tool, an action it can take.",
      "sources": [
        {
          "file": "user-guide/features/tools.md",
          "line": 27,
          "quote": "Search the web and extract page content."
        },
        {
          "file": "user-guide/features/web-search.md",
          "line": 16,
          "quote": "search the web and return ranked results"
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please search the web for <what you want to know>, and list the pages you used. If web search is not ready, tell me what it needs."
      }
    },
    {
      "id": "w_browser",
      "group": "web",
      "label": "Use a website for me",
      "kind": "built_in_tool",
      "thing": "browser_exec",
      "key_words": [
        "browser automation",
        "use a browser",
        "use the browser"
      ],
      "things": [
        "website",
        "websites",
        "web page",
        "web pages",
        "site",
        "sites",
        "form",
        "forms",
        "browser"
      ],
      "actions": [
        "click",
        "clicks",
        "fill",
        "fills",
        "fill in",
        "fill out",
        "log in",
        "sign in",
        "open",
        "opens",
        "navigate",
        "book",
        "order",
        "use",
        "control"
      ],
      "text": "Hermes can open a website, click, type and fill in forms. That is a built-in tool, an action it can take.",
      "sources": [
        {
          "file": "user-guide/features/browser.md",
          "line": 10,
          "quote": "gives the agent a real web browser"
        },
        {
          "file": "user-guide/features/browser.md",
          "line": 18,
          "quote": "Navigate, read, click, type, scrape and screenshot"
        },
        {
          "file": "user-guide/features/browser.md",
          "line": 25,
          "quote": "No API key, no setup."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please open <website> with your browser tool and <what to do there>. Ask me before you send, buy or sign in to anything."
      }
    },
    {
      "id": "w_xpost",
      "group": "web",
      "label": "Post on X for me",
      "kind": "built_in_skill",
      "thing": "xurl",
      "key_words": [],
      "things": [
        "twitter",
        "tweet",
        "tweets",
        "on x",
        "to x",
        "x account",
        "x.com"
      ],
      "actions": [
        "post",
        "posts",
        "posting",
        "tweet",
        "reply",
        "publish",
        "send",
        "write",
        "search",
        "read",
        "dm"
      ],
      "text": "Hermes comes with a skill called \"xurl\". Its written steps teach Hermes to search and post on X.",
      "sources": [
        {
          "file": "reference/skills-catalog.md",
          "line": 98,
          "quote": "X/Twitter via xurl CLI: raw post search, posting, DM, media."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please use your \"xurl\" skill to <what you want>. If the skill is missing or not ready, tell me what it needs."
      }
    },
    {
      "id": "w_reddit",
      "group": "web",
      "label": "Read Reddit",
      "kind": "optional_skill",
      "thing": "reddit-reading",
      "key_words": [],
      "things": [
        "reddit",
        "subreddit",
        "subreddits"
      ],
      "actions": [
        "read",
        "reads",
        "search",
        "check",
        "follow",
        "summarize",
        "summarise",
        "browse",
        "watch",
        "look at",
        "find"
      ],
      "text": "There is an optional skill, \"reddit-reading\". You add it first. Its written steps teach Hermes to read and search Reddit.",
      "sources": [
        {
          "file": "reference/optional-skills-catalog.md",
          "line": 254,
          "quote": "Read Reddit: subreddits, search, threads, users. No browser."
        },
        {
          "file": "reference/optional-skills-catalog.md",
          "line": 9,
          "quote": "Install them explicitly"
        }
      ],
      "next": {
        "kind": "steps",
        "label": "Show me how to add it",
        "steps": [
          "In the Hermes app, click \"Capabilities\", then the \"Skills\" tab.",
          "Click \"Source\", then pick \"Optional\".",
          "Find the card \"reddit-reading\". If it is not there, scroll down and click \"Show more\". Do it again until you see it.",
          "Click the card, then click \"Install\"."
        ],
        "after": "It works from your next new chat, not this one."
      }
    },
    {
      "id": "w_docs",
      "group": "files",
      "label": "Read my documents",
      "kind": "built_in_tool",
      "thing": "read_file",
      "key_words": [],
      "things": [
        "pdf",
        "pdfs",
        "word file",
        "word files",
        "word document",
        "word documents",
        "docx",
        "excel",
        "spreadsheet",
        "spreadsheets",
        "document",
        "documents",
        "file",
        "files",
        "contract",
        "contracts"
      ],
      "actions": [
        "read",
        "reads",
        "open",
        "summarize",
        "summarise",
        "summary",
        "go through",
        "look at",
        "understand",
        "extract",
        "analyze",
        "analyse"
      ],
      "text": "Hermes can read Word, Excel and PDF files. This is built in. Scanned pages come out empty.",
      "sources": [
        {
          "file": "user-guide/features/document-extraction.md",
          "line": 9,
          "quote": "automatically converts common document formats to readable text"
        },
        {
          "file": "user-guide/features/document-extraction.md",
          "line": 16,
          "quote": "`.docx`"
        },
        {
          "file": "user-guide/features/document-extraction.md",
          "line": 17,
          "quote": "`.xlsx`"
        },
        {
          "file": "user-guide/features/document-extraction.md",
          "line": 19,
          "quote": "`.pdf`"
        },
        {
          "file": "user-guide/features/document-extraction.md",
          "line": 38,
          "quote": "contain no text layer and silently convert to nothing"
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please read this file and tell me what is in it: <where the file is>. If you cannot read part of it, say which part."
      }
    },
    {
      "id": "w_pdf",
      "group": "files",
      "label": "Make or change a PDF",
      "kind": "built_in_skill",
      "thing": "pdf",
      "key_words": [],
      "things": [
        "pdf",
        "pdfs"
      ],
      "actions": [
        "make",
        "create",
        "merge",
        "combine",
        "fill",
        "fill in",
        "fill out",
        "edit",
        "change",
        "split",
        "ocr"
      ],
      "text": "Hermes comes with a skill called \"pdf\". Its written steps teach Hermes to make, merge, fill in and edit PDF files.",
      "sources": [
        {
          "file": "reference/skills-catalog.md",
          "line": 81,
          "quote": "PDF files: create, read, merge, fill, OCR, edit text."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please use your \"pdf\" skill to <what you want>. If the skill is missing or not ready, tell me what it needs."
      }
    },
    {
      "id": "w_office",
      "group": "files",
      "label": "Make Word or Excel files",
      "kind": "built_in_skill",
      "thing": "microsoft-office",
      "key_words": [],
      "things": [
        "word",
        "powerpoint",
        "excel",
        "slides",
        "presentation",
        "presentations",
        "deck",
        "spreadsheet",
        "spreadsheets",
        "docx",
        "pptx",
        "xlsx"
      ],
      "actions": [
        "make",
        "create",
        "write",
        "edit",
        "change",
        "draft",
        "prepare"
      ],
      "text": "Hermes comes with a skill called \"microsoft-office\". Its written steps teach Hermes to make and edit Word, PowerPoint and Excel files.",
      "sources": [
        {
          "file": "reference/skills-catalog.md",
          "line": 80,
          "quote": "Create, read, and edit Word, PowerPoint, and Excel files."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please use your \"microsoft-office\" skill to <what you want>. If the skill is missing or not ready, tell me what it needs."
      }
    },
    {
      "id": "w_notes",
      "group": "files",
      "label": "Use my Obsidian notes",
      "kind": "built_in_skill",
      "thing": "obsidian",
      "key_words": [],
      "things": [
        "obsidian"
      ],
      "actions": [
        "read",
        "search",
        "find",
        "write",
        "edit",
        "create",
        "add",
        "make",
        "use",
        "open",
        "notes",
        "note",
        "vault",
        "work with",
        "access"
      ],
      "text": "Hermes comes with a skill called \"obsidian\". Its written steps teach Hermes to read, search and edit your Obsidian notes.",
      "sources": [
        {
          "file": "reference/skills-catalog.md",
          "line": 70,
          "quote": "Read, search, create, and edit notes in the Obsidian vault."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please use your \"obsidian\" skill to <what you want>. If the skill is missing or not ready, tell me what it needs."
      }
    },
    {
      "id": "w_meeting",
      "group": "files",
      "label": "Sort out meeting notes",
      "kind": "built_in_skill",
      "thing": "meeting-action-items",
      "key_words": [],
      "things": [
        "meeting",
        "meetings",
        "meeting notes",
        "minutes"
      ],
      "actions": [
        "action items",
        "action points",
        "tasks",
        "decisions",
        "to-do",
        "to-dos",
        "todo",
        "todos",
        "owners",
        "tickets",
        "who does what",
        "follow-ups",
        "follow ups"
      ],
      "text": "Hermes comes with a skill called \"meeting-action-items\". Its written steps teach Hermes to turn meeting notes into decisions and tasks.",
      "sources": [
        {
          "file": "reference/skills-catalog.md",
          "line": 79,
          "quote": "Turn meeting notes into cited decisions, owners, tickets."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please use your \"meeting-action-items\" skill to <what you want>. If the skill is missing or not ready, tell me what it needs."
      }
    },
    {
      "id": "w_code",
      "group": "files",
      "label": "Write and run code",
      "kind": "built_in_tool",
      "thing": "terminal, read_file, patch",
      "key_words": [
        "coding",
        "programming"
      ],
      "things": [
        "code",
        "script",
        "scripts",
        "program",
        "programs",
        "python",
        "javascript"
      ],
      "actions": [
        "write",
        "writes",
        "run",
        "runs",
        "fix",
        "read",
        "edit",
        "debug",
        "review",
        "change",
        "help"
      ],
      "text": "Hermes can read, change and run code on your computer. This is built in.",
      "sources": [
        {
          "file": "getting-started/learning-path.md",
          "line": 49,
          "quote": "Hermes Agent can read, edit, and run code in your projects."
        },
        {
          "file": "user-guide/features/tools.md",
          "line": 29,
          "quote": "Execute commands and manipulate files."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please look at the code in <folder> and <what you want>. Ask me before you change or run anything."
      }
    },
    {
      "id": "w_computer",
      "group": "files",
      "label": "Click and type for me",
      "kind": "built_in_tool",
      "thing": "computer_use",
      "key_words": [
        "computer use"
      ],
      "things": [
        "mouse",
        "keyboard",
        "my screen",
        "my desktop",
        "my computer",
        "my mac",
        "my pc",
        "my laptop",
        "my apps"
      ],
      "actions": [
        "click",
        "clicks",
        "type",
        "types",
        "control",
        "controls",
        "drive",
        "operate",
        "take over",
        "move"
      ],
      "text": "Hermes can click and type in the apps on your computer. It is built in, and the docs call it Computer Use.",
      "sources": [
        {
          "file": "user-guide/features/computer-use.md",
          "line": 8,
          "quote": "Hermes Agent can drive your desktop"
        },
        {
          "file": "user-guide/features/computer-use.md",
          "line": 21,
          "quote": "The built-in `computer_use` toolset"
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "I want you to click and type in an app on my computer: <which app, and what to do>. Tell me first what Computer Use needs. Ask me before you change anything."
      }
    },
    {
      "id": "w_image",
      "group": "pics",
      "label": "Make pictures",
      "kind": "built_in_tool",
      "thing": "image_generate",
      "key_words": [
        "image generation"
      ],
      "things": [
        "image",
        "images",
        "picture",
        "pictures",
        "photo",
        "photos",
        "logo",
        "logos",
        "drawing",
        "drawings",
        "art",
        "illustration",
        "illustrations"
      ],
      "actions": [
        "make",
        "makes",
        "create",
        "creates",
        "generate",
        "generates",
        "draw",
        "draws",
        "design",
        "paint"
      ],
      "text": "Hermes can make pictures from your words. That is a built-in tool, an action it can take. The picture service costs money.",
      "sources": [
        {
          "file": "user-guide/features/image-generation.md",
          "line": 10,
          "quote": "Hermes Agent generates images from text prompts via FAL.ai."
        },
        {
          "file": "user-guide/features/image-generation.md",
          "line": 14,
          "quote": "| Price |"
        },
        {
          "file": "user-guide/features/image-generation.md",
          "line": 158,
          "quote": "Direct FAL requires a funded `FAL_KEY`"
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please make a picture of <what>. If picture making is not ready, tell me what it needs and what it costs. Ask me before you change anything."
      }
    },
    {
      "id": "w_see",
      "group": "pics",
      "label": "Look at my pictures",
      "kind": "built_in",
      "thing": "vision",
      "key_words": [],
      "things": [
        "image",
        "images",
        "picture",
        "pictures",
        "photo",
        "photos",
        "screenshot",
        "screenshots"
      ],
      "actions": [
        "look at",
        "looks at",
        "see",
        "sees",
        "describe",
        "read",
        "reads",
        "analyze",
        "analyse",
        "understand",
        "explain",
        "what is in",
        "what's in"
      ],
      "text": "Hermes can look at a picture you give it. This is built in. If your AI reads only text, another AI describes it.",
      "sources": [
        {
          "file": "user-guide/features/vision.md",
          "line": 10,
          "quote": "any vision-capable model can process them"
        },
        {
          "file": "user-guide/features/vision.md",
          "line": 204,
          "quote": "an auxiliary vision model describes the image, and the text description is injected into the conversation"
        },
        {
          "file": "user-guide/features/vision.md",
          "line": 206,
          "quote": "You don't configure this"
        },
        {
          "file": "user-guide/features/tools.md",
          "line": 31,
          "quote": "`vision_analyze`"
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "I am giving you a picture. Please tell me what you see in it. If you cannot look at pictures, tell me what is missing."
      }
    },
    {
      "id": "w_video",
      "group": "pics",
      "label": "Make a video from text",
      "kind": "built_in_tool_off",
      "thing": "video_generate",
      "key_words": [
        "text to video",
        "text-to-video",
        "video generation"
      ],
      "things": [
        "video",
        "videos",
        "clip",
        "clips"
      ],
      "actions": [
        "make",
        "makes",
        "create",
        "creates",
        "generate",
        "generates",
        "produce"
      ],
      "text": "Hermes can make a video from text or from a picture. That tool, an action it can take, is switched off at first.",
      "sources": [
        {
          "file": "reference/tools-reference.md",
          "line": 312,
          "quote": "Opt-in toolset (not loaded in the default"
        },
        {
          "file": "reference/tools-reference.md",
          "line": 325,
          "quote": "Generate a video from a text prompt (text-to-video) or animate a still image (image-to-video)"
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "I want to make a video from text. Please tell me what the Video Generation tool needs and what it costs. Turn it on only if I say yes."
      }
    },
    {
      "id": "w_anim",
      "group": "pics",
      "label": "Make an animated explainer",
      "kind": "built_in_skill",
      "thing": "manim-video",
      "key_words": [],
      "things": [
        "animation",
        "animations",
        "animated",
        "explainer",
        "explainers",
        "manim"
      ],
      "actions": [
        "make",
        "makes",
        "create",
        "creates",
        "generate",
        "produce",
        "video",
        "videos"
      ],
      "text": "Hermes comes with a skill called \"manim-video\". Its written steps teach Hermes to make animated maths videos.",
      "sources": [
        {
          "file": "reference/skills-catalog.md",
          "line": 42,
          "quote": "Manim CE animations: 3Blue1Brown math/algo videos."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please use your \"manim-video\" skill to <what you want>. If the skill is missing or not ready, tell me what it needs."
      }
    },
    {
      "id": "w_presenter",
      "group": "pics",
      "label": "Make a presenter video",
      "kind": "optional_skill",
      "thing": "ai-presenter-video",
      "key_words": [],
      "things": [
        "presenter",
        "talking head",
        "avatar",
        "spokesperson"
      ],
      "actions": [
        "video",
        "videos",
        "make",
        "create",
        "generate"
      ],
      "text": "There is an optional skill, \"ai-presenter-video\". You add it first. Its written steps teach Hermes to make a video of an AI presenter.",
      "sources": [
        {
          "file": "reference/optional-skills-catalog.md",
          "line": 60,
          "quote": "Make a verified AI presenter video from script + image."
        },
        {
          "file": "reference/optional-skills-catalog.md",
          "line": 9,
          "quote": "Install them explicitly"
        }
      ],
      "next": {
        "kind": "steps",
        "label": "Show me how to add it",
        "steps": [
          "In the Hermes app, click \"Capabilities\", then the \"Skills\" tab.",
          "Click \"Source\", then pick \"Optional\".",
          "Find the card \"ai-presenter-video\". If it is not there, scroll down and click \"Show more\". Do it again until you see it.",
          "Click the card, then click \"Install\"."
        ],
        "after": "It works from your next new chat, not this one."
      }
    },
    {
      "id": "w_youtube",
      "group": "pics",
      "label": "Sum up a YouTube video",
      "kind": "built_in_skill",
      "thing": "youtube-content",
      "key_words": [],
      "things": [
        "youtube",
        "yt video",
        "yt videos"
      ],
      "actions": [
        "summarize",
        "summarise",
        "summary",
        "summaries",
        "sum up",
        "transcript",
        "transcripts",
        "notes",
        "tldr",
        "key points",
        "blog",
        "thread"
      ],
      "text": "Hermes comes with a skill called \"youtube-content\". Its written steps teach Hermes to turn a YouTube video's words into a summary.",
      "sources": [
        {
          "file": "reference/skills-catalog.md",
          "line": 64,
          "quote": "YouTube transcripts to summaries, threads, blogs."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please use your \"youtube-content\" skill to <what you want>. If the skill is missing or not ready, tell me what it needs."
      }
    },
    {
      "id": "w_meme",
      "group": "pics",
      "label": "Make memes",
      "kind": "optional_skill",
      "thing": "meme-generation",
      "key_words": [
        "meme",
        "memes"
      ],
      "things": [],
      "actions": [],
      "text": "There is an optional skill, \"meme-generation\". You add it first. Its written steps teach Hermes to put text on known meme pictures.",
      "sources": [
        {
          "file": "reference/optional-skills-catalog.md",
          "line": 81,
          "quote": "Create meme PNGs from templates with Pillow text overlay."
        },
        {
          "file": "reference/optional-skills-catalog.md",
          "line": 9,
          "quote": "Install them explicitly"
        }
      ],
      "next": {
        "kind": "steps",
        "label": "Show me how to add it",
        "steps": [
          "In the Hermes app, click \"Capabilities\", then the \"Skills\" tab.",
          "Click \"Source\", then pick \"Optional\".",
          "Find the card \"meme-generation\". If it is not there, scroll down and click \"Show more\". Do it again until you see it.",
          "Click the card, then click \"Install\"."
        ],
        "after": "It works from your next new chat, not this one."
      }
    },
    {
      "id": "w_voice",
      "group": "voice",
      "label": "Talk to it out loud",
      "kind": "built_in",
      "thing": "Voice Mode",
      "key_words": [
        "voice mode",
        "by voice",
        "with my voice",
        "use my voice",
        "talk out loud",
        "speak out loud",
        "voice chat",
        "voice conversation",
        "voice conversations",
        "microphone",
        "talk to it out loud"
      ],
      "things": [],
      "actions": [],
      "text": "You can talk to Hermes out loud and hear it answer. It is built in, and the docs call it Voice Mode.",
      "sources": [
        {
          "file": "user-guide/features/voice-mode.md",
          "line": 9,
          "quote": "Talk to the agent using your microphone, hear spoken replies"
        },
        {
          "file": "user-guide/desktop.md",
          "line": 350,
          "quote": "Talk to Hermes and hear it back"
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "I want to talk to you with my voice. Please tell me what Voice Mode needs here and how I start it. Ask me before you change anything."
      }
    },
    {
      "id": "w_aloud",
      "group": "voice",
      "label": "Read answers out loud",
      "kind": "built_in_tool",
      "thing": "text_to_speech",
      "key_words": [
        "text to speech",
        "text-to-speech",
        "tts",
        "read aloud",
        "read it out",
        "voice message",
        "voice messages"
      ],
      "things": [
        "answers",
        "answer",
        "replies",
        "reply",
        "text",
        "messages"
      ],
      "actions": [
        "read aloud",
        "read out",
        "aloud",
        "spoken",
        "audio"
      ],
      "text": "Hermes can turn its answers into speech. This is built in, and the standard voice is free.",
      "sources": [
        {
          "file": "user-guide/features/tts.md",
          "line": 13,
          "quote": "supports both text-to-speech output and voice message transcription"
        },
        {
          "file": "user-guide/features/tts.md",
          "line": 25,
          "quote": "| **Edge TTS** (default) | Good | Free | None needed |"
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please read your next answer out loud. If speech is not ready, tell me what it needs."
      }
    },
    {
      "id": "w_stt",
      "group": "voice",
      "label": "Turn voice notes into text",
      "kind": "built_in",
      "thing": "voice message transcription (speech-to-text)",
      "key_words": [
        "voice note",
        "voice notes",
        "voice memo",
        "voice memos",
        "transcribe",
        "transcription",
        "speech to text",
        "speech-to-text"
      ],
      "things": [
        "voice note",
        "voice notes",
        "voice message",
        "voice messages",
        "voice memo",
        "voice memos",
        "recording",
        "recordings",
        "audio"
      ],
      "actions": [
        "into text",
        "to text",
        "transcribe",
        "transcribes",
        "write out",
        "type out",
        "write down"
      ],
      "text": "Hermes turns voice messages from Telegram or WhatsApp into text by itself. This is built in.",
      "sources": [
        {
          "file": "user-guide/features/tts.md",
          "line": 13,
          "quote": "supports both text-to-speech output and voice message transcription"
        },
        {
          "file": "user-guide/features/tts.md",
          "line": 496,
          "quote": "Voice messages sent on Telegram, Discord, WhatsApp, Slack, or Signal are automatically transcribed and injected as text into the conversation."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "I want to send you voice messages and have them turned into text. Please tell me what that needs here. Ask me before you change anything."
      }
    },
    {
      "id": "w_music",
      "group": "voice",
      "label": "Write a song",
      "kind": "built_in_skill",
      "thing": "songwriting-and-ai-music",
      "key_words": [],
      "things": [
        "song",
        "songs",
        "music",
        "lyrics"
      ],
      "actions": [
        "write",
        "writes",
        "make",
        "create",
        "compose",
        "generate"
      ],
      "text": "Hermes comes with a skill called \"songwriting-and-ai-music\". Its written steps teach Hermes songwriting, and how to brief Suno, a music AI.",
      "sources": [
        {
          "file": "reference/skills-catalog.md",
          "line": 45,
          "quote": "Songwriting craft and Suno AI music prompts."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please use your \"songwriting-and-ai-music\" skill to <what you want>. If the skill is missing or not ready, tell me what it needs."
      }
    },
    {
      "id": "w_papers",
      "group": "web",
      "label": "Find research papers",
      "kind": "built_in_skill",
      "thing": "arxiv",
      "key_words": [],
      "things": [
        "paper",
        "papers",
        "arxiv",
        "studies"
      ],
      "actions": [
        "find",
        "search",
        "look up",
        "read",
        "summarize",
        "summarise",
        "check"
      ],
      "text": "Hermes comes with a skill called \"arxiv\". Its written steps teach Hermes to search research papers on arXiv.",
      "sources": [
        {
          "file": "reference/skills-catalog.md",
          "line": 90,
          "quote": "Search arXiv papers by keyword, author, category, or ID."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please use your \"arxiv\" skill to <what you want>. If the skill is missing or not ready, tell me what it needs."
      }
    },
    {
      "id": "w_maps",
      "group": "web",
      "label": "Find places and routes",
      "kind": "built_in_skill",
      "thing": "maps",
      "key_words": [],
      "things": [
        "map",
        "maps",
        "route",
        "routes",
        "directions",
        "address",
        "addresses",
        "nearby",
        "time zone",
        "time zones"
      ],
      "actions": [
        "find",
        "get",
        "look up",
        "plan",
        "show",
        "search",
        "check",
        "how far"
      ],
      "text": "Hermes comes with a skill called \"maps\". Its written steps teach Hermes to find places, routes and time zones.",
      "sources": [
        {
          "file": "reference/skills-catalog.md",
          "line": 78,
          "quote": "Geocode, POIs, routes, timezones via OpenStreetMap/OSRM."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please use your \"maps\" skill to <what you want>. If the skill is missing or not ready, tell me what it needs."
      }
    },
    {
      "id": "w_stocks",
      "group": "web",
      "label": "Check stock prices",
      "kind": "optional_skill",
      "thing": "stocks",
      "key_words": [],
      "things": [
        "stock",
        "stocks",
        "shares",
        "crypto",
        "bitcoin"
      ],
      "actions": [
        "check",
        "look up",
        "compare",
        "follow",
        "quote",
        "quotes",
        "price",
        "prices"
      ],
      "text": "There is an optional skill, \"stocks\". You add it first. Its written steps teach Hermes to look up stock and crypto prices.",
      "sources": [
        {
          "file": "reference/optional-skills-catalog.md",
          "line": 134,
          "quote": "Stock quotes, history, search, compare, crypto via Yahoo."
        },
        {
          "file": "reference/optional-skills-catalog.md",
          "line": 9,
          "quote": "Install them explicitly"
        }
      ],
      "next": {
        "kind": "steps",
        "label": "Show me how to add it",
        "steps": [
          "In the Hermes app, click \"Capabilities\", then the \"Skills\" tab.",
          "Click \"Source\", then pick \"Optional\".",
          "Find the card \"stocks\". If it is not there, scroll down and click \"Show more\". Do it again until you see it.",
          "Click the card, then click \"Install\"."
        ],
        "after": "It works from your next new chat, not this one."
      }
    },
    {
      "id": "w_prices",
      "group": "web",
      "label": "Watch a price for me",
      "kind": "built_in_skill",
      "thing": "product-price-monitor",
      "key_words": [],
      "things": [
        "price",
        "prices",
        "flight",
        "flights",
        "listing",
        "listings",
        "deal",
        "deals"
      ],
      "actions": [
        "watch",
        "watches",
        "track",
        "tracks",
        "monitor",
        "alert",
        "alerts",
        "drops",
        "tell me when",
        "keep an eye"
      ],
      "text": "Hermes comes with a skill called \"product-price-monitor\". Its written steps teach Hermes to watch prices and alert you at your target.",
      "sources": [
        {
          "file": "reference/skills-catalog.md",
          "line": 82,
          "quote": "Watch product, flight, or listing prices; alert on target."
        }
      ],
      "next": {
        "kind": "paste",
        "label": "Show me what to ask",
        "paste_text": "Please use your \"product-price-monitor\" skill to <what you want>. If the skill is missing or not ready, tell me what it needs."
      }
    }
  ],
  "fixed": {
    "N2": {
      "text": "I don't know that one. These are the nearest things I have checked."
    },
    "G1": {
      "text": "Here is what I have checked for that. Pick one, or type your own."
    },
    "S1": {
      "text": "Hermes comes with a skill called \"{name}\". It teaches Hermes to {say}",
      "text_fixed": "Hermes comes with a skill called \"{name}\". Skills are written steps that teach Hermes one task. The docs say this.",
      "sources": []
    },
    "S2": {
      "text": "The skill \"{name}\" must be added first. It teaches Hermes to {say}",
      "text_fixed": "The optional skill \"{name}\" must be added first. Skills are written steps that teach Hermes one task. The docs say this.",
      "sources": [
        {
          "file": "reference/optional-skills-catalog.md",
          "line": 9,
          "quote": "Install them explicitly"
        }
      ],
      "next": {
        "kind": "steps",
        "label": "Show me how to add it",
        "steps": [
          "In the Hermes app, click \"Capabilities\", then the \"Skills\" tab.",
          "Click \"Source\", then pick \"Optional\".",
          "Find the card \"{name}\". If it is not there, scroll down and click \"Show more\". Do it again until you see it.",
          "Click the card, then click \"Install\"."
        ],
        "after": "It works from your next new chat, not this one."
      }
    },
    "box-head": {
      "text": "From the Hermes docs"
    },
    "CN1": {
      "text": "The Hermes app links apps such as Gmail through its \"Connectors\" page. Click \"Capabilities\", then the \"Connectors\" tab.",
      "sources": [
        {
          "file": "user-guide/features/tool-gateway.md",
          "line": 124,
          "quote": "Connectors are hosted apps such as Gmail that the agent reaches through the Nous tool gateway"
        },
        {
          "file": "user-guide/features/tool-gateway.md",
          "line": 139,
          "quote": "The desktop app's **Connectors** page."
        }
      ]
    },
    "CN2": {
      "text": "The Hermes app links apps such as Gmail through its \"Connectors\" page. To see if {service} is there, click \"Capabilities\", then the \"Connectors\" tab.",
      "sources": [
        {
          "file": "user-guide/features/tool-gateway.md",
          "line": 124,
          "quote": "Connectors are hosted apps such as Gmail that the agent reaches through the Nous tool gateway"
        },
        {
          "file": "user-guide/features/tool-gateway.md",
          "line": 139,
          "quote": "The desktop app's **Connectors** page."
        }
      ]
    }
  },
  "service_lines": {
    "Gmail": {
      "line": "CN1"
    },
    "Google Calendar": {
      "line": "CN2"
    },
    "Google Drive": {
      "line": "CN2"
    },
    "GitHub": {
      "line": "S1",
      "skill": "github"
    }
  },
  "skill_name_rule_wf1": {
    "ordinary_names": [
      "accelerate",
      "anatomy",
      "auteur",
      "blackbox",
      "box",
      "brag",
      "canvas",
      "chroma",
      "dogfood",
      "impeccable",
      "maps",
      "modal",
      "pretext",
      "shop",
      "sketch",
      "slime",
      "spike",
      "stocks",
      "watchers"
    ],
    "skill_for_pattern": "skills? (?:for|that can|which can) (?:a |an |the |my )?([a-z][a-z0-9'-]*)",
    "skill_for_not_after": [
      "me",
      "it",
      "hermes",
      "bot",
      "bots",
      "beginners",
      "beginner",
      "newcomers",
      "newcomer",
      "starters",
      "agents",
      "agent"
    ]
  },
  "skills": [
    {
      "name": "apple-notes",
      "kind": "built_in",
      "say": "write, find and change notes in Apple Notes.",
      "docs_words": "Manage Apple Notes via memo CLI: create, search, edit.",
      "page": "reference/skills-catalog.md",
      "line": 19
    },
    {
      "name": "apple-reminders",
      "kind": "built_in",
      "say": "add, list and tick off items in Apple Reminders.",
      "docs_words": "Apple Reminders via remindctl: add, list, complete.",
      "page": "reference/skills-catalog.md",
      "line": 20
    },
    {
      "name": "findmy",
      "kind": "built_in",
      "say": "see where your Apple devices and AirTags are, using the Find My app.",
      "docs_words": "Track Apple devices/AirTags via FindMy.app on macOS.",
      "page": "reference/skills-catalog.md",
      "line": 21
    },
    {
      "name": "imessage",
      "kind": "built_in",
      "say": "send and read iMessages and texts from the Messages app on a Mac.",
      "docs_words": "Send and receive iMessages/SMS via the imsg CLI on macOS.",
      "page": "reference/skills-catalog.md",
      "line": 22
    },
    {
      "name": "claude-code",
      "kind": "built_in",
      "say": "hand a coding job to Claude Code, a separate coding app.",
      "docs_words": "Delegate coding to Claude Code CLI (features, PRs).",
      "page": "reference/skills-catalog.md",
      "line": 28
    },
    {
      "name": "codex",
      "kind": "built_in",
      "say": "hand a coding job to Codex, a separate coding app by OpenAI.",
      "docs_words": "Delegate coding to OpenAI Codex CLI (features, PRs).",
      "page": "reference/skills-catalog.md",
      "line": 29
    },
    {
      "name": "computer-use",
      "kind": "built_in",
      "say": "use your desktop, doing things in the background first.",
      "docs_words": "Drive the desktop background-first; escalate on signal.",
      "page": "reference/skills-catalog.md",
      "line": 30
    },
    {
      "name": "hermes-agent",
      "kind": "built_in",
      "say": "use and change its own settings and look, and add to itself.",
      "docs_words": "Use, configure, theme, extend, and orchestrate Hermes Agent.",
      "page": "reference/skills-catalog.md",
      "line": 31
    },
    {
      "name": "architecture-diagram",
      "kind": "built_in",
      "say": "draw a dark-themed picture of how a software system fits together.",
      "docs_words": "Dark-themed SVG architecture/cloud/infra diagrams as HTML.",
      "page": "reference/skills-catalog.md",
      "line": 37
    },
    {
      "name": "ascii-video",
      "kind": "built_in",
      "say": "turn a video or sound into a moving picture made of letters.",
      "docs_words": "ASCII video: convert video/audio to colored ASCII MP4/GIF.",
      "page": "reference/skills-catalog.md",
      "line": 38
    },
    {
      "name": "baoyu-infographic",
      "kind": "built_in",
      "say": "make an infographic: one picture that sums up facts, in many layouts.",
      "docs_words": "Infographics: 21 layouts x 21 styles (信息图, 可视化).",
      "page": "reference/skills-catalog.md",
      "line": 39
    },
    {
      "name": "claude-design",
      "kind": "built_in",
      "say": "design a one-off web page, slide deck or clickable mockup.",
      "docs_words": "Design one-off HTML artifacts (landing, deck, prototype).",
      "page": "reference/skills-catalog.md",
      "line": 40
    },
    {
      "name": "humanizer",
      "kind": "built_in",
      "say": "rewrite text so it sounds less like an AI wrote it.",
      "docs_words": "Humanize text: strip AI-isms and add real voice.",
      "page": "reference/skills-catalog.md",
      "line": 41
    },
    {
      "name": "manim-video",
      "kind": "built_in",
      "say": "make animated videos that explain maths.",
      "docs_words": "Manim CE animations: 3Blue1Brown math/algo videos.",
      "page": "reference/skills-catalog.md",
      "line": 42
    },
    {
      "name": "p5js",
      "kind": "built_in",
      "say": "make art with code, also moving and 3D art.",
      "docs_words": "p5.js sketches: gen art, shaders, interactive, 3D.",
      "page": "reference/skills-catalog.md",
      "line": 43
    },
    {
      "name": "popular-web-designs",
      "kind": "built_in",
      "say": "make web pages in the style of 54 well-known sites, such as Stripe.",
      "docs_words": "54 real design systems (Stripe, Linear, Vercel) as HTML/CSS.",
      "page": "reference/skills-catalog.md",
      "line": 44
    },
    {
      "name": "songwriting-and-ai-music",
      "kind": "built_in",
      "say": "help write songs, and write the text you give Suno, a music AI.",
      "docs_words": "Songwriting craft and Suno AI music prompts.",
      "page": "reference/skills-catalog.md",
      "line": 45
    },
    {
      "name": "sdlc-review",
      "kind": "built_in",
      "say": null,
      "docs_words": "Review Kanban handoffs and route verified outcomes.",
      "page": "reference/skills-catalog.md",
      "line": 51
    },
    {
      "name": "email-inbox-triage",
      "kind": "built_in",
      "say": "sort your inbox by what matters most, and draft replies for you to check.",
      "docs_words": "Triage an inbox: prioritize threads, draft replies safely.",
      "page": "reference/skills-catalog.md",
      "line": 57
    },
    {
      "name": "himalaya",
      "kind": "built_in",
      "say": "read and send email from your own mailbox.",
      "docs_words": "Himalaya CLI: IMAP/SMTP email from terminal.",
      "page": "reference/skills-catalog.md",
      "line": 58
    },
    {
      "name": "youtube-content",
      "kind": "built_in",
      "say": "turn a YouTube video's spoken words into a summary, thread or blog post.",
      "docs_words": "YouTube transcripts to summaries, threads, blogs.",
      "page": "reference/skills-catalog.md",
      "line": 64
    },
    {
      "name": "obsidian",
      "kind": "built_in",
      "say": "read, search, write and change notes in your Obsidian notes folder.",
      "docs_words": "Read, search, create, and edit notes in the Obsidian vault.",
      "page": "reference/skills-catalog.md",
      "line": 70
    },
    {
      "name": "document-to-action-items",
      "kind": "built_in",
      "say": "pull deadlines, duties and tasks out of a document, with where each was found.",
      "docs_words": "Extract cited obligations, deadlines, tasks from documents.",
      "page": "reference/skills-catalog.md",
      "line": 76
    },
    {
      "name": "google-workspace",
      "kind": "built_in",
      "say": "use your Gmail, Google Calendar, Drive, Docs and Sheets.",
      "docs_words": "Gmail, Calendar, Drive, Docs, Sheets via gws CLI or Python.",
      "page": "reference/skills-catalog.md",
      "line": 77
    },
    {
      "name": "maps",
      "kind": "built_in",
      "say": "find places, addresses, routes and time zones from open map data.",
      "docs_words": "Geocode, POIs, routes, timezones via OpenStreetMap/OSRM.",
      "page": "reference/skills-catalog.md",
      "line": 78
    },
    {
      "name": "meeting-action-items",
      "kind": "built_in",
      "say": "turn meeting notes into decisions, who does what, and follow-up tasks.",
      "docs_words": "Turn meeting notes into cited decisions, owners, tickets.",
      "page": "reference/skills-catalog.md",
      "line": 79
    },
    {
      "name": "microsoft-office",
      "kind": "built_in",
      "say": "make, read and change Word, PowerPoint and Excel files.",
      "docs_words": "Create, read, and edit Word, PowerPoint, and Excel files.",
      "page": "reference/skills-catalog.md",
      "line": 80
    },
    {
      "name": "pdf",
      "kind": "built_in",
      "say": "make, read, merge and fill in PDF files, also scanned ones.",
      "docs_words": "PDF files: create, read, merge, fill, OCR, edit text.",
      "page": "reference/skills-catalog.md",
      "line": 81
    },
    {
      "name": "product-price-monitor",
      "kind": "built_in",
      "say": "watch a product, flight or listing price and tell you at your target.",
      "docs_words": "Watch product, flight, or listing prices; alert on target.",
      "page": "reference/skills-catalog.md",
      "line": 82
    },
    {
      "name": "teams-meeting-pipeline",
      "kind": "built_in",
      "say": "get summaries of Teams meetings.",
      "docs_words": "Teams meeting summaries, job replay, Graph subscriptions.",
      "page": "reference/skills-catalog.md",
      "line": 83
    },
    {
      "name": "weekly-review-planning",
      "kind": "built_in",
      "say": "look back at your week, see what got stuck, and plan the next.",
      "docs_words": "Weekly reset: commitments, stalled work, next-week plan.",
      "page": "reference/skills-catalog.md",
      "line": 84
    },
    {
      "name": "arxiv",
      "kind": "built_in",
      "say": "search and read science papers on arXiv.",
      "docs_words": "Search arXiv papers by keyword, author, category, or ID.",
      "page": "reference/skills-catalog.md",
      "line": 90
    },
    {
      "name": "competitor-news-monitor",
      "kind": "built_in",
      "say": "watch companies you name and report only important news about them.",
      "docs_words": "Watch named companies for material news; cited digests.",
      "page": "reference/skills-catalog.md",
      "line": 91
    },
    {
      "name": "grounded-citations",
      "kind": "built_in",
      "say": "give answers where every fact shows where it came from.",
      "docs_words": "Ground answers and documents in cited, verifiable sources.",
      "page": "reference/skills-catalog.md",
      "line": 92
    },
    {
      "name": "xurl",
      "kind": "built_in",
      "say": "post, search and send messages on X, the site that was Twitter.",
      "docs_words": "X/Twitter via xurl CLI: raw post search, posting, DM, media.",
      "page": "reference/skills-catalog.md",
      "line": 98
    },
    {
      "name": "codebase-inspection",
      "kind": "built_in",
      "say": "count how much code a project has, and in which languages.",
      "docs_words": "Inspect codebases w/ pygount: LOC, languages, ratios.",
      "page": "reference/skills-catalog.md",
      "line": 104
    },
    {
      "name": "dogfood",
      "kind": "built_in",
      "say": "test a web app like a user would, and write up the bugs found.",
      "docs_words": "Exploratory QA of web apps: find bugs, evidence, reports.",
      "page": "reference/skills-catalog.md",
      "line": 105
    },
    {
      "name": "github",
      "kind": "built_in",
      "say": "work with GitHub: issues, pull requests, reviews and code folders.",
      "docs_words": "GitHub via gh CLI: PRs, issues, reviews, repos, auth.",
      "page": "reference/skills-catalog.md",
      "line": 106
    },
    {
      "name": "requesting-code-review",
      "kind": "built_in",
      "say": "check new code for safety and quality before it is saved for good.",
      "docs_words": "Pre-commit review: security scan, quality gates, auto-fix.",
      "page": "reference/skills-catalog.md",
      "line": 107
    },
    {
      "name": "simplify-code",
      "kind": "built_in",
      "say": "tidy up code you changed lately.",
      "docs_words": "Parallel 4-agent cleanup of recent code changes.",
      "page": "reference/skills-catalog.md",
      "line": 108
    },
    {
      "name": "spike",
      "kind": "built_in",
      "say": "try out an idea with quick throwaway code before building it for real.",
      "docs_words": "Throwaway experiments to validate an idea before build.",
      "page": "reference/skills-catalog.md",
      "line": 109
    },
    {
      "name": "systematic-debugging",
      "kind": "built_in",
      "say": "find the real cause of a bug before trying to fix it.",
      "docs_words": "4-phase root cause debugging: understand bugs before fixing.",
      "page": "reference/skills-catalog.md",
      "line": 110
    },
    {
      "name": "test-driven-development",
      "kind": "built_in",
      "say": "write code by writing a test first, then the code that passes it.",
      "docs_words": "TDD: enforce RED-GREEN-REFACTOR, tests before code.",
      "page": "reference/skills-catalog.md",
      "line": 111
    },
    {
      "name": "blocked-page-recovery",
      "kind": "built_in",
      "say": "get a web page that will not open, such as one behind a paywall.",
      "docs_words": "Use when a fetch fails: 403/429, paywall, WAF, bot wall.",
      "page": "reference/skills-catalog.md",
      "line": 117
    },
    {
      "name": "agent-merge-conflict-arbiter",
      "kind": "optional",
      "say": "settle a clash when two AI helpers changed the same code.",
      "docs_words": "Neutral arbiter for merge conflicts between two agents.",
      "page": "reference/optional-skills-catalog.md",
      "line": 34
    },
    {
      "name": "antigravity-cli",
      "kind": "optional",
      "say": "use the separate Antigravity app.",
      "docs_words": "Operate the Antigravity CLI (agy): plugins, auth, sandbox.",
      "page": "reference/optional-skills-catalog.md",
      "line": 35
    },
    {
      "name": "blackbox",
      "kind": "optional",
      "say": "hand a coding job to Blackbox AI, a separate coding app.",
      "docs_words": "Delegate coding tasks to the Blackbox AI multi-model CLI.",
      "page": "reference/optional-skills-catalog.md",
      "line": 36
    },
    {
      "name": "dynamic-workflow",
      "kind": "optional",
      "say": null,
      "docs_words": "Plan-in-code fan-outs, adversarial verification, waves.",
      "page": "reference/optional-skills-catalog.md",
      "line": 37
    },
    {
      "name": "grok",
      "kind": "optional",
      "say": "hand a coding job to Grok Build, a separate coding app by xAI.",
      "docs_words": "Delegate coding to xAI Grok Build CLI (features, PRs).",
      "page": "reference/optional-skills-catalog.md",
      "line": 38
    },
    {
      "name": "opencode",
      "kind": "optional",
      "say": "hand a coding job to OpenCode, a separate coding app.",
      "docs_words": "Delegate coding to OpenCode CLI (features, PR review).",
      "page": "reference/optional-skills-catalog.md",
      "line": 39
    },
    {
      "name": "openhands",
      "kind": "optional",
      "say": "hand a coding job to OpenHands, a coding app that works with many AIs.",
      "docs_words": "Delegate coding to OpenHands CLI (model-agnostic, LiteLLM).",
      "page": "reference/optional-skills-catalog.md",
      "line": 40
    },
    {
      "name": "evm",
      "kind": "optional",
      "say": "look up wallets, coins and fees on eight blockchains. Read only.",
      "docs_words": "Read-only EVM client: wallets, tokens, gas across 8 chains.",
      "page": "reference/optional-skills-catalog.md",
      "line": 46
    },
    {
      "name": "hyperliquid",
      "kind": "optional",
      "say": "look up prices and your past trades on Hyperliquid.",
      "docs_words": "Hyperliquid market data, account history, trade review.",
      "page": "reference/optional-skills-catalog.md",
      "line": 47
    },
    {
      "name": "solana",
      "kind": "optional",
      "say": "look up Solana wallets, coins and NFTs, with prices in dollars.",
      "docs_words": "Query Solana wallets, tokens, txs, and NFTs in USD.",
      "page": "reference/optional-skills-catalog.md",
      "line": 48
    },
    {
      "name": "one-three-one-rule",
      "kind": "optional",
      "say": "answer a hard choice as one problem, three options and one pick.",
      "docs_words": "1-3-1 decision briefs: problem, three options, one pick.",
      "page": "reference/optional-skills-catalog.md",
      "line": 54
    },
    {
      "name": "ai-presenter-video",
      "kind": "optional",
      "say": "make a video of a talking presenter from a script and one photo.",
      "docs_words": "Make a verified AI presenter video from script + image.",
      "page": "reference/optional-skills-catalog.md",
      "line": 60
    },
    {
      "name": "anatomy",
      "kind": "optional",
      "say": "explain an idea with a machine drawing you can click on.",
      "docs_words": "Explain an idea as an interactive isometric machine figure.",
      "page": "reference/optional-skills-catalog.md",
      "line": 61
    },
    {
      "name": "archify",
      "kind": "optional",
      "say": "make clickable diagrams as web pages.",
      "docs_words": "Validated interactive HTML diagrams, upstream-maintained.",
      "page": "reference/optional-skills-catalog.md",
      "line": 62
    },
    {
      "name": "ascii-art",
      "kind": "optional",
      "say": "make pictures and big banner text out of letters.",
      "docs_words": "ASCII art: pyfiglet, cowsay, boxes, image-to-ascii.",
      "page": "reference/optional-skills-catalog.md",
      "line": 63
    },
    {
      "name": "auteur",
      "kind": "optional",
      "say": "design and build web pages with a film-like, cinematic feel.",
      "docs_words": "Design and build cinematic, award-level web pages.",
      "page": "reference/optional-skills-catalog.md",
      "line": 64
    },
    {
      "name": "baoyu-article-illustrator",
      "kind": "optional",
      "say": "make matching pictures to illustrate an article you wrote.",
      "docs_words": "Article illustrations: type × style × palette consistency.",
      "page": "reference/optional-skills-catalog.md",
      "line": 65
    },
    {
      "name": "baoyu-comic",
      "kind": "optional",
      "say": "make comics that teach a topic or tell someone's life story.",
      "docs_words": "Knowledge comics (知识漫画): educational, biography, tutorial.",
      "page": "reference/optional-skills-catalog.md",
      "line": 66
    },
    {
      "name": "brag",
      "kind": "optional",
      "say": "make a launch video for a project you built.",
      "docs_words": "Project launch video via Hyperframes, upstream-maintained.",
      "page": "reference/optional-skills-catalog.md",
      "line": 67
    },
    {
      "name": "brag-slim",
      "kind": "optional",
      "say": "make a launch video for a project or web address.",
      "docs_words": "Launch video from a project or URL, upstream-maintained.",
      "page": "reference/optional-skills-catalog.md",
      "line": 68
    },
    {
      "name": "comfyui",
      "kind": "optional",
      "say": "make pictures, video and sound with AI.",
      "docs_words": "Generate images, video, and audio via diffusion workflows.",
      "page": "reference/optional-skills-catalog.md",
      "line": 69
    },
    {
      "name": "concept-diagrams",
      "kind": "optional",
      "say": "make simple, flat diagrams for teaching.",
      "docs_words": "Generate flat, minimal educational SVG visuals as HTML.",
      "page": "reference/optional-skills-catalog.md",
      "line": 70
    },
    {
      "name": "creative-ideation",
      "kind": "optional",
      "say": "come up with ideas, using named methods from creative work.",
      "docs_words": "Generate ideas via named methods from creative practice.",
      "page": "reference/optional-skills-catalog.md",
      "line": 71
    },
    {
      "name": "design-md",
      "kind": "optional",
      "say": "write and check a DESIGN.md file that describes how a design looks.",
      "docs_words": "Author/validate/export Google's DESIGN.md token spec files.",
      "page": "reference/optional-skills-catalog.md",
      "line": 72
    },
    {
      "name": "draw-your-font",
      "kind": "optional",
      "say": "turn a photo of your handwriting into a font you can install.",
      "docs_words": "Turn a handwriting photo into an installable TTF font.",
      "page": "reference/optional-skills-catalog.md",
      "line": 73
    },
    {
      "name": "dream-loop",
      "kind": "optional",
      "say": "build 3D scenes, checking each against a drawing of the goal.",
      "docs_words": "Build stunning 3D scenes via a concept-art fidelity loop.",
      "page": "reference/optional-skills-catalog.md",
      "line": 74
    },
    {
      "name": "excalidraw",
      "kind": "optional",
      "say": "make hand-drawn style diagrams for Excalidraw.",
      "docs_words": "Hand-drawn Excalidraw JSON diagrams (arch, flow, seq).",
      "page": "reference/optional-skills-catalog.md",
      "line": 75
    },
    {
      "name": "heartmula",
      "kind": "optional",
      "say": "make whole songs from lyrics, like Suno does.",
      "docs_words": "HeartMuLa: Suno-like song generation from lyrics + tags.",
      "page": "reference/optional-skills-catalog.md",
      "line": 76
    },
    {
      "name": "hyperframes",
      "kind": "optional",
      "say": "make MP4 videos from web pages.",
      "docs_words": "Render MP4/WebM videos from HTML compositions.",
      "page": "reference/optional-skills-catalog.md",
      "line": 77
    },
    {
      "name": "impeccable",
      "kind": "optional",
      "say": "design the look of web pages well.",
      "docs_words": "Frontend design guidance, upstream-maintained (impeccable).",
      "page": "reference/optional-skills-catalog.md",
      "line": 78
    },
    {
      "name": "ip-as-logo",
      "kind": "optional",
      "say": "design a tiny, cute mascot logo that still reads when very small.",
      "docs_words": "Design minimal cute IP mascot marks readable at 32px.",
      "page": "reference/optional-skills-catalog.md",
      "line": 79
    },
    {
      "name": "kanban-video-orchestrator",
      "kind": "optional",
      "say": "split a big video job among several Hermes helpers and run it.",
      "docs_words": "Plan and run multi-agent video production pipelines.",
      "page": "reference/optional-skills-catalog.md",
      "line": 80
    },
    {
      "name": "meme-generation",
      "kind": "optional",
      "say": "make meme pictures from a topic, with text on a known template.",
      "docs_words": "Create meme PNGs from templates with Pillow text overlay.",
      "page": "reference/optional-skills-catalog.md",
      "line": 81
    },
    {
      "name": "mono-color",
      "kind": "optional",
      "say": "make poster pictures in one or two ink colours, like printed art.",
      "docs_words": "Generate one- or two-ink editorial print poster images.",
      "page": "reference/optional-skills-catalog.md",
      "line": 82
    },
    {
      "name": "pixel-art",
      "kind": "optional",
      "say": "make pixel art in the colours of old game consoles.",
      "docs_words": "Pixel art w/ era palettes (NES, Game Boy, PICO-8).",
      "page": "reference/optional-skills-catalog.md",
      "line": 83
    },
    {
      "name": "pretext",
      "kind": "optional",
      "say": "build playful web demos where text flows around moving things.",
      "docs_words": "Build creative browser demos with DOM-free text layout.",
      "page": "reference/optional-skills-catalog.md",
      "line": 84
    },
    {
      "name": "simple-english",
      "kind": "optional",
      "say": "rewrite text in very simple, strict English.",
      "docs_words": "Rewrite text to ASD-STE100 Simplified Technical English.",
      "page": "reference/optional-skills-catalog.md",
      "line": 85
    },
    {
      "name": "sketch",
      "kind": "optional",
      "say": "make two or three quick throwaway designs of a screen to compare.",
      "docs_words": "Throwaway HTML mockups: 2-3 design variants to compare.",
      "page": "reference/optional-skills-catalog.md",
      "line": 86
    },
    {
      "name": "social-media-content-calendar",
      "kind": "optional",
      "say": "plan posts for several social media sites, from first idea to posting.",
      "docs_words": "Plan multi-platform social campaigns: briefs to posting.",
      "page": "reference/optional-skills-catalog.md",
      "line": 87
    },
    {
      "name": "system-atlas",
      "kind": "optional",
      "say": "build a clickable map of how a software system works.",
      "docs_words": "Build explorable isometric architecture atlases as HTML.",
      "page": "reference/optional-skills-catalog.md",
      "line": 88
    },
    {
      "name": "tldraw-offline",
      "kind": "optional",
      "say": "read and change drawings in the tldraw offline app.",
      "docs_words": "Drive and script tldraw offline canvases with an agent.",
      "page": "reference/optional-skills-catalog.md",
      "line": 89
    },
    {
      "name": "unreal-mcp",
      "kind": "optional",
      "say": "control scenes and objects in Unreal Engine, a game-making app.",
      "docs_words": "Automate Unreal Engine editor scenes, actors, and renders.",
      "page": "reference/optional-skills-catalog.md",
      "line": 90
    },
    {
      "name": "jupyter-notebook",
      "kind": "optional",
      "say": "run Python step by step in a Jupyter notebook that keeps its results.",
      "docs_words": "Iterative Python via live Jupyter kernel (hamelnb).",
      "page": "reference/optional-skills-catalog.md",
      "line": 96
    },
    {
      "name": "actual-setup",
      "kind": "optional",
      "say": "set up Actual Computer to run AI for Hermes.",
      "docs_words": "Set up Actual Computer (actual.inc) inference in Hermes.",
      "page": "reference/optional-skills-catalog.md",
      "line": 102
    },
    {
      "name": "docker-management",
      "kind": "optional",
      "say": "start, stop and tidy Docker containers, a way to run apps boxed in.",
      "docs_words": "Manage Docker containers, images, volumes, and Compose.",
      "page": "reference/optional-skills-catalog.md",
      "line": 103
    },
    {
      "name": "hermes-s6-container-supervision",
      "kind": "optional",
      "say": null,
      "docs_words": "Modify or debug s6 services in the Hermes Docker image.",
      "page": "reference/optional-skills-catalog.md",
      "line": 104
    },
    {
      "name": "inference-sh-cli",
      "kind": "optional",
      "say": "make pictures and video with over 150 AI apps run on inference.sh.",
      "docs_words": "Run 150+ AI apps (image, video, LLM) via inference.sh CLI.",
      "page": "reference/optional-skills-catalog.md",
      "line": 105
    },
    {
      "name": "pinggy-tunnel",
      "kind": "optional",
      "say": "give something running on your computer a public web address for a while.",
      "docs_words": "Zero-install localhost tunnels over SSH via Pinggy.",
      "page": "reference/optional-skills-catalog.md",
      "line": 106
    },
    {
      "name": "setup-wizard-generator",
      "kind": "optional",
      "say": "make a step-by-step script that walks a person through a manual setup.",
      "docs_words": "Generate a bash wizard guiding a human through manual setup.",
      "page": "reference/optional-skills-catalog.md",
      "line": 107
    },
    {
      "name": "watchers",
      "kind": "optional",
      "say": "check news feeds, GitHub or data links on a timer and report new items.",
      "docs_words": "Poll RSS, JSON APIs, and GitHub with watermark dedup.",
      "page": "reference/optional-skills-catalog.md",
      "line": 108
    },
    {
      "name": "adversarial-ux-test",
      "kind": "optional",
      "say": "play an angry, impatient user to find what is confusing in your app.",
      "docs_words": "Roleplay a hostile user to find and triage UX pain points.",
      "page": "reference/optional-skills-catalog.md",
      "line": 114
    },
    {
      "name": "agentmail",
      "kind": "optional",
      "say": "use its own email inbox, through AgentMail.",
      "docs_words": "Use when an agent needs AgentMail CLI email inboxes.",
      "page": "reference/optional-skills-catalog.md",
      "line": 120
    },
    {
      "name": "3-statement-model",
      "kind": "optional",
      "say": "fill in a company's linked money statements in an Excel file.",
      "docs_words": "Build integrated IS/BS/CF financial workbooks in Excel.",
      "page": "reference/optional-skills-catalog.md",
      "line": 126
    },
    {
      "name": "comps-analysis",
      "kind": "optional",
      "say": "value a company against similar companies, in an Excel file.",
      "docs_words": "Build comparable-company valuation workbooks in Excel.",
      "page": "reference/optional-skills-catalog.md",
      "line": 127
    },
    {
      "name": "dcf-model",
      "kind": "optional",
      "say": "value a company from its future cash, in an Excel file.",
      "docs_words": "Build discounted cash flow valuation workbooks in Excel.",
      "page": "reference/optional-skills-catalog.md",
      "line": 128
    },
    {
      "name": "excel-author",
      "kind": "optional",
      "say": "build careful financial Excel files that others can check.",
      "docs_words": "Build auditable financial workbooks headless via openpyxl.",
      "page": "reference/optional-skills-catalog.md",
      "line": 129
    },
    {
      "name": "lbo-model",
      "kind": "optional",
      "say": "plan the numbers for buying a company with borrowed money, in Excel.",
      "docs_words": "Build leveraged buyout workbooks with IRR/MOIC in Excel.",
      "page": "reference/optional-skills-catalog.md",
      "line": 130
    },
    {
      "name": "merger-model",
      "kind": "optional",
      "say": "work out what a merger does to earnings per share, in Excel.",
      "docs_words": "Build M&A accretion/dilution workbooks in Excel.",
      "page": "reference/optional-skills-catalog.md",
      "line": 131
    },
    {
      "name": "polymarket",
      "kind": "optional",
      "say": "look up prediction market odds and prices on Polymarket.",
      "docs_words": "Query Polymarket: markets, prices, orderbooks, history.",
      "page": "reference/optional-skills-catalog.md",
      "line": 132
    },
    {
      "name": "pptx-author",
      "kind": "optional",
      "say": "make PowerPoint files.",
      "docs_words": "Build PowerPoint decks headless with python-pptx.",
      "page": "reference/optional-skills-catalog.md",
      "line": 133
    },
    {
      "name": "stocks",
      "kind": "optional",
      "say": "look up stock and crypto prices, history and comparisons, from Yahoo.",
      "docs_words": "Stock quotes, history, search, compare, crypto via Yahoo.",
      "page": "reference/optional-skills-catalog.md",
      "line": 134
    },
    {
      "name": "minecraft-modpack-server",
      "kind": "optional",
      "say": "set up and run a Minecraft game world with mods.",
      "docs_words": "Host modded Minecraft servers (CurseForge, Modrinth).",
      "page": "reference/optional-skills-catalog.md",
      "line": 140
    },
    {
      "name": "pokemon-player",
      "kind": "optional",
      "say": "play Pokemon games.",
      "docs_words": "Play Pokemon via headless emulator + RAM reads.",
      "page": "reference/optional-skills-catalog.md",
      "line": 141
    },
    {
      "name": "fitness-nutrition",
      "kind": "optional",
      "say": "plan workouts and look up food values and exercises.",
      "docs_words": "Workout planning, macros, and body metrics via wger/USDA.",
      "page": "reference/optional-skills-catalog.md",
      "line": 147
    },
    {
      "name": "neuroskill-bci",
      "kind": "optional",
      "say": "read your mood and focus from a NeuroSkill brain sensor.",
      "docs_words": "Use live BCI cognitive and mood state from NeuroSkill.",
      "page": "reference/optional-skills-catalog.md",
      "line": 148
    },
    {
      "name": "fastmcp",
      "kind": "optional",
      "say": null,
      "docs_words": "Build, test, and deploy Python MCP servers.",
      "page": "reference/optional-skills-catalog.md",
      "line": 154
    },
    {
      "name": "mcp-oauth-remote-gateway",
      "kind": "optional",
      "say": null,
      "docs_words": "Manual OAuth for remote MCP servers on headless gateways.",
      "page": "reference/optional-skills-catalog.md",
      "line": 155
    },
    {
      "name": "mcporter",
      "kind": "optional",
      "say": null,
      "docs_words": "List, auth, and call MCP servers/tools from the terminal.",
      "page": "reference/optional-skills-catalog.md",
      "line": 156
    },
    {
      "name": "gif-search",
      "kind": "optional",
      "say": "find and save GIFs from Tenor.",
      "docs_words": "Search/download GIFs from Tenor via curl + jq.",
      "page": "reference/optional-skills-catalog.md",
      "line": 162
    },
    {
      "name": "songsee",
      "kind": "optional",
      "say": "draw pictures of a sound file, such as its pitch over time.",
      "docs_words": "Audio spectrograms/features (mel, chroma, MFCC) via CLI.",
      "page": "reference/optional-skills-catalog.md",
      "line": 163
    },
    {
      "name": "accelerate",
      "kind": "optional",
      "say": "train AIs on several graphics cards with few code changes.",
      "docs_words": "Run PyTorch training across GPUs with minimal changes.",
      "page": "reference/optional-skills-catalog.md",
      "line": 169
    },
    {
      "name": "axolotl",
      "kind": "optional",
      "say": "train your own version of an AI from a settings file.",
      "docs_words": "Axolotl: YAML LLM fine-tuning (LoRA, DPO, GRPO).",
      "page": "reference/optional-skills-catalog.md",
      "line": 170
    },
    {
      "name": "chroma",
      "kind": "optional",
      "say": "keep text in a search store so an AI can find it by meaning.",
      "docs_words": "Embedding database for RAG and semantic search.",
      "page": "reference/optional-skills-catalog.md",
      "line": 171
    },
    {
      "name": "dspy",
      "kind": "optional",
      "say": "build AI programs that improve their own instructions by themselves.",
      "docs_words": "DSPy: declarative LM programs, auto-optimize prompts, RAG.",
      "page": "reference/optional-skills-catalog.md",
      "line": 172
    },
    {
      "name": "evaluating-llms-harness",
      "kind": "optional",
      "say": "test AIs on standard exams to compare how good they are.",
      "docs_words": "lm-eval-harness: benchmark LLMs (MMLU, GSM8K, etc.).",
      "page": "reference/optional-skills-catalog.md",
      "line": 173
    },
    {
      "name": "faiss",
      "kind": "optional",
      "say": "search huge collections of numbers for the closest matches, very fast.",
      "docs_words": "Fast vector similarity search at billion scale.",
      "page": "reference/optional-skills-catalog.md",
      "line": 174
    },
    {
      "name": "flash-attention",
      "kind": "optional",
      "say": "make training and running AIs faster.",
      "docs_words": "Speed up long-sequence transformer training and inference.",
      "page": "reference/optional-skills-catalog.md",
      "line": 175
    },
    {
      "name": "lambda-labs",
      "kind": "optional",
      "say": "rent strong graphics cards from Lambda Labs to train AIs.",
      "docs_words": "On-demand GPU cloud instances for ML training.",
      "page": "reference/optional-skills-catalog.md",
      "line": 176
    },
    {
      "name": "llama-cpp",
      "kind": "optional",
      "say": "run an AI on your own computer with llama.cpp.",
      "docs_words": "llama.cpp local GGUF inference + HF Hub model discovery.",
      "page": "reference/optional-skills-catalog.md",
      "line": 177
    },
    {
      "name": "modal",
      "kind": "optional",
      "say": "run AI jobs on Modal's rented graphics cards.",
      "docs_words": "Serverless GPU cloud for ML jobs and model APIs.",
      "page": "reference/optional-skills-catalog.md",
      "line": 178
    },
    {
      "name": "nemo-curator",
      "kind": "optional",
      "say": "clean up large piles of text before training an AI on it.",
      "docs_words": "Curate LLM training data: dedupe, filter, PII redaction.",
      "page": "reference/optional-skills-catalog.md",
      "line": 179
    },
    {
      "name": "obliteratus",
      "kind": "optional",
      "say": "remove an AI's refusals, so it stops saying no to requests.",
      "docs_words": "OBLITERATUS: abliterate LLM refusals (diff-in-means).",
      "page": "reference/optional-skills-catalog.md",
      "line": 180
    },
    {
      "name": "peft",
      "kind": "optional",
      "say": "train your own version of a big AI on a small graphics card.",
      "docs_words": "Fine-tune large LLMs with LoRA on limited GPU memory.",
      "page": "reference/optional-skills-catalog.md",
      "line": 181
    },
    {
      "name": "pytorch-fsdp",
      "kind": "optional",
      "say": null,
      "docs_words": "Fully sharded data-parallel training for large models.",
      "page": "reference/optional-skills-catalog.md",
      "line": 182
    },
    {
      "name": "pytorch-lightning",
      "kind": "optional",
      "say": null,
      "docs_words": "Clean training loops with built-in distributed support.",
      "page": "reference/optional-skills-catalog.md",
      "line": 183
    },
    {
      "name": "saelens",
      "kind": "optional",
      "say": null,
      "docs_words": "Train sparse autoencoders to interpret model features.",
      "page": "reference/optional-skills-catalog.md",
      "line": 184
    },
    {
      "name": "segment-anything-model",
      "kind": "optional",
      "say": "cut out any object in a picture, by pointing at it.",
      "docs_words": "SAM: zero-shot image segmentation via points, boxes, masks.",
      "page": "reference/optional-skills-catalog.md",
      "line": 185
    },
    {
      "name": "serving-llms-vllm",
      "kind": "optional",
      "say": "run an AI fast for many users at once, with vLLM.",
      "docs_words": "vLLM: high-throughput LLM serving, OpenAI API, quantization.",
      "page": "reference/optional-skills-catalog.md",
      "line": 186
    },
    {
      "name": "simpo",
      "kind": "optional",
      "say": null,
      "docs_words": "Reference-free preference alignment, simpler than DPO.",
      "page": "reference/optional-skills-catalog.md",
      "line": 187
    },
    {
      "name": "slime",
      "kind": "optional",
      "say": null,
      "docs_words": "RL post-training for LLMs with Megatron and SGLang.",
      "page": "reference/optional-skills-catalog.md",
      "line": 188
    },
    {
      "name": "tensorrt-llm",
      "kind": "optional",
      "say": "run AIs as fast as possible on NVIDIA graphics cards.",
      "docs_words": "High-throughput LLM inference on NVIDIA GPUs.",
      "page": "reference/optional-skills-catalog.md",
      "line": 189
    },
    {
      "name": "torchtitan",
      "kind": "optional",
      "say": "train a new AI from scratch on many graphics cards.",
      "docs_words": "Pretrain LLMs at scale with PyTorch 4D parallelism.",
      "page": "reference/optional-skills-catalog.md",
      "line": 190
    },
    {
      "name": "unsloth",
      "kind": "optional",
      "say": "train your own version of an AI faster, on a smaller graphics card.",
      "docs_words": "Unsloth: 2-5x faster LoRA/QLoRA fine-tuning, less VRAM.",
      "page": "reference/optional-skills-catalog.md",
      "line": 191
    },
    {
      "name": "stripe-link-cli",
      "kind": "optional",
      "say": "buy things for you, with each payment approved in Link.",
      "docs_words": "Agent payments via Stripe Link — cards, SPT, approvals.",
      "page": "reference/optional-skills-catalog.md",
      "line": 197
    },
    {
      "name": "stripe-projects",
      "kind": "optional",
      "say": "sign you up for web services and keep their logins in one place.",
      "docs_words": "Provision SaaS services + sync creds via Stripe Projects.",
      "page": "reference/optional-skills-catalog.md",
      "line": 198
    },
    {
      "name": "box",
      "kind": "optional",
      "say": "organise, share and search your files on Box, a cloud file store.",
      "docs_words": "Box manages cloud files, sharing, search, and metadata.",
      "page": "reference/optional-skills-catalog.md",
      "line": 204
    },
    {
      "name": "canvas",
      "kind": "optional",
      "say": "see your courses and assignments in Canvas, a school website.",
      "docs_words": "Fetch Canvas LMS courses and assignments via API token.",
      "page": "reference/optional-skills-catalog.md",
      "line": 205
    },
    {
      "name": "decision-questionnaire",
      "kind": "optional",
      "say": "turn a decision you cannot make alone into questions for someone else.",
      "docs_words": "Turn an unanswerable decision into a questionnaire doc.",
      "page": "reference/optional-skills-catalog.md",
      "line": 206
    },
    {
      "name": "here-now",
      "kind": "optional",
      "say": "put a web page online at here.now and keep files there.",
      "docs_words": "Publish sites to {slug}.here.now and store files in Drives.",
      "page": "reference/optional-skills-catalog.md",
      "line": 207
    },
    {
      "name": "live-dashboard",
      "kind": "optional",
      "say": "build a page that shows live facts and refreshes itself.",
      "docs_words": "Build self-updating dashboards from live sources.",
      "page": "reference/optional-skills-catalog.md",
      "line": 208
    },
    {
      "name": "memento-flashcards",
      "kind": "optional",
      "say": "help you learn facts with flashcards that come back at the right time.",
      "docs_words": "Spaced-repetition flashcards: create, review, quiz, export.",
      "page": "reference/optional-skills-catalog.md",
      "line": 209
    },
    {
      "name": "property-listings",
      "kind": "optional",
      "say": "show homes or rentals you found as cards to compare, in the Hermes app.",
      "docs_words": "Present property and rental listings as desktop cards.",
      "page": "reference/optional-skills-catalog.md",
      "line": 210
    },
    {
      "name": "shop",
      "kind": "optional",
      "say": "search shops, buy, and track orders and returns.",
      "docs_words": "Shop catalog search, checkout, order tracking, returns.",
      "page": "reference/optional-skills-catalog.md",
      "line": 211
    },
    {
      "name": "siyuan",
      "kind": "optional",
      "say": "search and change notes in SiYuan, a notes app.",
      "docs_words": "Query and edit a SiYuan knowledge base via its API.",
      "page": "reference/optional-skills-catalog.md",
      "line": 212
    },
    {
      "name": "telephony",
      "kind": "optional",
      "say": "get a phone number, send texts and make AI phone calls, through Twilio.",
      "docs_words": "Provision Twilio numbers, SMS/MMS, and AI outbound calls.",
      "page": "reference/optional-skills-catalog.md",
      "line": 213
    },
    {
      "name": "bioinformatics",
      "kind": "optional",
      "say": "find the right method for gene and biology data work.",
      "docs_words": "Gateway to 400+ genomics and computational biology skills.",
      "page": "reference/optional-skills-catalog.md",
      "line": 219
    },
    {
      "name": "blogwatcher",
      "kind": "optional",
      "say": "follow blogs and news feeds and see what is new.",
      "docs_words": "Monitor blogs and RSS/Atom feeds via blogwatcher-cli tool.",
      "page": "reference/optional-skills-catalog.md",
      "line": 220
    },
    {
      "name": "darwinian-evolver",
      "kind": "optional",
      "say": "improve a short text or code by trying many versions and keeping the best.",
      "docs_words": "Evolve prompts/regex/SQL/code with Imbue's evolution loop.",
      "page": "reference/optional-skills-catalog.md",
      "line": 221
    },
    {
      "name": "domain-intel",
      "kind": "optional",
      "say": "look up public facts about a website's address: owner, certificates, subdomains.",
      "docs_words": "Passive recon of subdomains, SSL certs, WHOIS, and DNS.",
      "page": "reference/optional-skills-catalog.md",
      "line": 222
    },
    {
      "name": "drug-discovery",
      "kind": "optional",
      "say": "look up medicines and how they act, for drug research.",
      "docs_words": "Drug discovery: ChEMBL search, drug-likeness, interactions.",
      "page": "reference/optional-skills-catalog.md",
      "line": 223
    },
    {
      "name": "gitnexus-explorer",
      "kind": "optional",
      "say": "show a code project as a clickable map of its parts.",
      "docs_words": "Serve an interactive codebase knowledge graph web UI.",
      "page": "reference/optional-skills-catalog.md",
      "line": 224
    },
    {
      "name": "llm-wiki",
      "kind": "optional",
      "say": "build a growing set of linked notes that an AI keeps up to date.",
      "docs_words": "Karpathy's LLM Wiki: build/query interlinked markdown KB.",
      "page": "reference/optional-skills-catalog.md",
      "line": 225
    },
    {
      "name": "osint-investigation",
      "kind": "optional",
      "say": "dig through public records to trace money, companies and links between them.",
      "docs_words": "Follow the money via public records and sanctions data.",
      "page": "reference/optional-skills-catalog.md",
      "line": 226
    },
    {
      "name": "parallel-cli",
      "kind": "optional",
      "say": "search the web and do deep research with Parallel.",
      "docs_words": "Agent-native web search, deep research, and enrichment.",
      "page": "reference/optional-skills-catalog.md",
      "line": 227
    },
    {
      "name": "qmd",
      "kind": "optional",
      "say": "search your own notes and documents on your computer, by words and meaning.",
      "docs_words": "Hybrid local search over notes, docs, and transcripts.",
      "page": "reference/optional-skills-catalog.md",
      "line": 228
    },
    {
      "name": "research-paper-writing",
      "kind": "optional",
      "say": "plan, run and write up AI research for big science meetings.",
      "docs_words": "Write ML papers for NeurIPS/ICML/ICLR: design→submit.",
      "page": "reference/optional-skills-catalog.md",
      "line": 229
    },
    {
      "name": "rss-feeds",
      "kind": "optional",
      "say": "read news feeds from a website and list the newest entries.",
      "docs_words": "Read RSS, Atom, JSON feeds; discover feeds behind a page.",
      "page": "reference/optional-skills-catalog.md",
      "line": 230
    },
    {
      "name": "scrapling",
      "kind": "optional",
      "say": "copy data from websites while staying hidden, and get past their robot blocks.",
      "docs_words": "Scrape sites with stealth browsing and Cloudflare bypass.",
      "page": "reference/optional-skills-catalog.md",
      "line": 231
    },
    {
      "name": "1password",
      "kind": "optional",
      "say": "read your secrets from 1Password and use them.",
      "docs_words": "Set up op CLI, sign in, and read or inject secrets.",
      "page": "reference/optional-skills-catalog.md",
      "line": 237
    },
    {
      "name": "godmode",
      "kind": "optional",
      "say": "get around the safety rules of AIs.",
      "docs_words": "Jailbreak LLMs: Parseltongue, GODMODE, ULTRAPLINIAN.",
      "page": "reference/optional-skills-catalog.md",
      "line": 238
    },
    {
      "name": "oss-forensics",
      "kind": "optional",
      "say": "investigate an attack on open-source code on GitHub and write a report.",
      "docs_words": "GitHub supply-chain forensics: recovery, IOCs, reporting.",
      "page": "reference/optional-skills-catalog.md",
      "line": 239
    },
    {
      "name": "sherlock",
      "kind": "optional",
      "say": "find which websites have an account with a given username.",
      "docs_words": "Find accounts for a username across 400+ platforms.",
      "page": "reference/optional-skills-catalog.md",
      "line": 240
    },
    {
      "name": "unbroker",
      "kind": "optional",
      "say": "find and remove your personal details from people-search websites.",
      "docs_words": "Remove your info from data-broker sites, by name or phone.",
      "page": "reference/optional-skills-catalog.md",
      "line": 241
    },
    {
      "name": "web-pentest",
      "kind": "optional",
      "say": "attack a website you have permission to test, and report its security holes.",
      "docs_words": "Authorized web pentest: recon, proof-based exploits, report.",
      "page": "reference/optional-skills-catalog.md",
      "line": 242
    },
    {
      "name": "openhue",
      "kind": "optional",
      "say": "turn Philips Hue lights and scenes on and off.",
      "docs_words": "Control Philips Hue lights, scenes, rooms via OpenHue CLI.",
      "page": "reference/optional-skills-catalog.md",
      "line": 248
    },
    {
      "name": "reddit-reading",
      "kind": "optional",
      "say": "read and search Reddit posts and comments.",
      "docs_words": "Read Reddit: subreddits, search, threads, users. No browser.",
      "page": "reference/optional-skills-catalog.md",
      "line": 254
    },
    {
      "name": "ast-grep",
      "kind": "optional",
      "say": "search and change code by its structure, not only its letters.",
      "docs_words": "AST-aware structural code search and rewrite via ast-grep.",
      "page": "reference/optional-skills-catalog.md",
      "line": 260
    },
    {
      "name": "code-wiki",
      "kind": "optional",
      "say": "write a wiki with diagrams that explains a code project.",
      "docs_words": "Generate wiki docs + Mermaid diagrams for any codebase.",
      "page": "reference/optional-skills-catalog.md",
      "line": 261
    },
    {
      "name": "grill-me",
      "kind": "optional",
      "say": "question your plan hard, step by step, before you build it.",
      "docs_words": "Adversarial plan interview before implementation.",
      "page": "reference/optional-skills-catalog.md",
      "line": 262
    },
    {
      "name": "hermes-agent-skill-authoring",
      "kind": "optional",
      "say": "write new skills, the steps that teach Hermes a task, for the Hermes project.",
      "docs_words": "Author in-repo SKILL.md files: frontmatter and structure.",
      "page": "reference/optional-skills-catalog.md",
      "line": 263
    },
    {
      "name": "inspecting-hermes-desktop-dom",
      "kind": "optional",
      "say": "look inside the running Hermes app's page, for people changing the app.",
      "docs_words": "Read the live Hermes desktop DOM/CSS over CDP.",
      "page": "reference/optional-skills-catalog.md",
      "line": 264
    },
    {
      "name": "node-inspect-debugger",
      "kind": "optional",
      "say": "find bugs in Node.js programs by pausing them step by step.",
      "docs_words": "Debug Node.js via --inspect + Chrome DevTools Protocol CLI.",
      "page": "reference/optional-skills-catalog.md",
      "line": 265
    },
    {
      "name": "pr-lens",
      "kind": "optional",
      "say": "draw a code change as a moving diagram that shows how it works.",
      "docs_words": "Draw code changes as animated architecture/data-flow SVGs.",
      "page": "reference/optional-skills-catalog.md",
      "line": 266
    },
    {
      "name": "python-debugpy",
      "kind": "optional",
      "say": "find bugs in Python programs by pausing them step by step.",
      "docs_words": "Debug Python: pdb REPL + debugpy remote (DAP).",
      "page": "reference/optional-skills-catalog.md",
      "line": 267
    },
    {
      "name": "rest-graphql-debug",
      "kind": "optional",
      "say": "find out why a web service answers with an error.",
      "docs_words": "Debug REST/GraphQL APIs: status codes, auth, schemas, repro.",
      "page": "reference/optional-skills-catalog.md",
      "line": 268
    },
    {
      "name": "subagent-driven-development",
      "kind": "optional",
      "say": "carry out a coding plan by handing each task to a fresh AI helper.",
      "docs_words": "Execute plans via delegate_task subagents (2-stage review).",
      "page": "reference/optional-skills-catalog.md",
      "line": 269
    },
    {
      "name": "cloudflare-temporary-deploy",
      "kind": "optional",
      "say": "put a small web app online for an hour, with no account.",
      "docs_words": "Deploy a Worker live, no account, via wrangler --temporary.",
      "page": "reference/optional-skills-catalog.md",
      "line": 275
    },
    {
      "name": "har-derived-api-client",
      "kind": "optional",
      "say": "record what a website sends, then make a program that fetches the same data.",
      "docs_words": "Record a site's XHR into a HAR, derive an HTTP client.",
      "page": "reference/optional-skills-catalog.md",
      "line": 276
    },
    {
      "name": "page-agent",
      "kind": "optional",
      "say": "add an AI helper inside your own web app that clicks for its users.",
      "docs_words": "Embed an in-page natural-language GUI copilot in web apps.",
      "page": "reference/optional-skills-catalog.md",
      "line": 277
    },
    {
      "name": "publish-site",
      "kind": "optional",
      "say": "put a website you built online on GitHub, Cloudflare or Netlify Pages.",
      "docs_words": "Versioned site deploys to GitHub/Cloudflare/Netlify Pages.",
      "page": "reference/optional-skills-catalog.md",
      "line": 278
    },
    {
      "name": "scrollcraft",
      "kind": "optional",
      "say": "build landing pages where scrolling plays like a film.",
      "docs_words": "Premium scroll-driven landing pages; scroll = timeline.",
      "page": "reference/optional-skills-catalog.md",
      "line": 279
    },
    {
      "name": "yuanbao",
      "kind": "optional",
      "say": null,
      "docs_words": "Yuanbao (元宝) groups: @mention users, query info/members.",
      "page": "reference/optional-skills-catalog.md",
      "line": 285
    }
  ]
}

// ---- src/ai-mode.js ----
// The one switch for Helper's AI step (talk-live row 1). talk-live-2 (Lead, 11 Nov 2026 04:40, from Pēteris's words of
// 03:45 to 03:58: "Of course there needs to be an AI behind"): the commit holds ai_writes. Code still answers first,
// as built; only what code is not sure of goes to the person's AI.
//   no_ai_step     Helper answers with its pre-written lines only. Nothing is sent to any AI.
//   ai_picks_line  when code is not sure, the person's own AI picks which of Helper's checked lines to show
//   ai_writes      when code is not sure, the person's own AI writes the reply from Helper's checked lines,
//                  and fixed checks (src/live-checks.js) decide whether it is shown
// It alone picks: whether a typed message can ever be sent, the "are you an AI" line, the first-time faint
// line under the first "Kept:", the settings page's second top line, and (at build) README's lines by mode.
// The build stops when the data's own switches (use_now) say otherwise (scripts/live-data.mjs).
const AI_MODES = ['no_ai_step', 'ai_picks_line', 'ai_writes']
const AI_MODE = 'ai_writes'

// ---- src/setup-built.js ----
// Whether the set-up conversation (content/helper-setup-chat-v1.json) is in this build. false: every offer set that
// has text_no_setup uses it with picks_no_setup, so the pick "Set up Hermes" never shows before it works (Lead, 11 Nov
// 06:25, note b). One line, as src/ai-mode.js: a test loader and the build of a "try" file swap only this line.
const SETUP_BUILT = true
// Whether the AI step of the recommendation (the job's point 6, src/setup-rec.js) is in this build. true: the two
// answers New to Hermes and What you want go to the person's AI for that one call, and the lines that say what is sent
// (the first-time line under Kept:, the line on Helper's settings page) name them. Read only where SETUP_BUILT is true.
// false since setup-chat-2 (Lead, 11 Nov 08:50, from docs/answers/hhtech-setup-run.md): on the free model 2 of 9 AI
// sentences promised things nobody checked, a small model gave none that could be shown, each cost 2 to 12 s of dots.
// The recommendation is then the written sentence only, and only What you do goes to the AI.
const SETUP_AI_BUILT = false

// ---- src/setup-data.js ----
// Generated by scripts/build.mjs from content/helper-setup-chat-v1.json (hhcontent's set-up conversation) and
// content/dash-setup-list-v2.json (its set-up list: names, why sentences, steps). Only the fields the code reads.
// Edit the JSON, then build.
const SETUP_DATA = {
  "questions": {
    "Q_NEW": {
      "text": "Are you new to Hermes?",
      "answers": [
        {
          "id": "new",
          "label": "Yes, I'm new",
          "kept_as": "Yes, I'm new"
        },
        {
          "id": "some",
          "label": "I've used it a bit",
          "kept_as": "I've used it a bit"
        },
        {
          "id": "well",
          "label": "I know it well",
          "kept_as": "I know it well"
        },
        {
          "id": "skip",
          "label": "Skip",
          "kept_as": null
        }
      ],
      "typed": {
        "order": [
          "well",
          "some",
          "new"
        ],
        "lists": {
          "well": [
            "not new",
            "no",
            "nope",
            "know it",
            "know hermes",
            "used it a lot",
            "for months",
            "for a while",
            "expert",
            "very well"
          ],
          "some": [
            "a bit",
            "a little",
            "some",
            "sometimes",
            "a few times",
            "kind of",
            "sort of",
            "somewhat"
          ],
          "new": [
            "yes",
            "yeah",
            "yep",
            "new",
            "just started",
            "first time",
            "beginner",
            "never used",
            "just installed"
          ]
        }
      }
    },
    "Q_GOAL": {
      "text": "Do you want jobs at set times, phone chats, or something else?",
      "answers": [
        {
          "id": "schedule",
          "label": "Do things at set times",
          "kept_as": "Do things at set times",
          "item": "scheduled_job"
        },
        {
          "id": "phone",
          "label": "Talk to it from my phone",
          "kept_as": "Talk to it from my phone",
          "item": "chat_apps"
        },
        {
          "id": "bots",
          "label": "Several bots, one per job",
          "kept_as": "Several bots, one per job",
          "item": "second_bot"
        },
        {
          "id": "unsure",
          "label": "Not sure yet",
          "kept_as": null,
          "item": null
        }
      ],
      "typed": {
        "order": [
          "schedule",
          "phone",
          "bots"
        ],
        "lists": {
          "schedule": [
            "every morning",
            "every evening",
            "every day",
            "every week",
            "each morning",
            "each day",
            "daily",
            "weekly",
            "remind",
            "reminder",
            "reminders",
            "schedule",
            "scheduled",
            "set times",
            "briefing",
            "summary every",
            "summaries"
          ],
          "phone": [
            "phone",
            "mobile",
            "telegram",
            "whatsapp",
            "discord",
            "slack",
            "signal",
            "chat app",
            "text me",
            "message me"
          ],
          "bots": [
            "bots",
            "several bots",
            "second bot",
            "another bot",
            "more than one bot",
            "team of bots",
            "a bot for",
            "profiles"
          ]
        }
      }
    }
  },
  "look": {
    "parts": {
      "LOOK_OPEN": "I looked at your Hermes.",
      "model_ok": "You have a model, the AI that thinks, and it answers.",
      "model_not": "You have no model that answers yet (the AI that thinks).",
      "model_unread": "I couldn't check your model this time.",
      "scheduled_job_done": "You have {n} scheduled job.",
      "scheduled_job_done_plural": "You have {n} scheduled jobs.",
      "scheduled_job_not": "You have no scheduled jobs yet.",
      "second_bot_done": "You have {n} bots.",
      "second_bot_not": "You have one bot so far.",
      "personality_done": "Your Hermes has its own personality text.",
      "personality_not": "Its personality text is still the starter one.",
      "chat_apps_cannot": "I can't see whether you use a chat app.",
      "read_failed": "I couldn't read that part this time."
    },
    "under": {
      "faint": "Read from your Hermes on this computer. Nothing was sent, and no AI was used.",
      "button": "What did you look at?"
    },
    "list": [
      "Hermes installed: yes",
      "A model that answers: {yes|no|couldn't check}",
      "Its own personality text: {yes|no}",
      "Scheduled jobs: {n}",
      "Bots: {n}",
      "I can't see: first chat, chat apps, tools, memory, safety."
    ]
  },
  "rule_order": [
    "first_chat",
    "personality",
    "chat_apps",
    "tools_apps",
    "memory",
    "scheduled_job",
    "second_bot",
    "safety",
    "skills"
  ],
  "goal_item": {
    "schedule": "scheduled_job",
    "phone": "chat_apps",
    "bots": "second_bot",
    "unsure": null
  },
  "seeable": [
    "personality",
    "scheduled_job",
    "second_bot"
  ],
  "reasons": {
    "R1": "Hermes needs a model before anything else.",
    "R2_new": "You're new, so first check that Hermes answers you.",
    "R2_skip": "The usual first step is to check that Hermes answers.",
    "R3_schedule": "You want Hermes to do things at set times.",
    "R3_phone": "You want to talk to Hermes from your phone.",
    "R3_bots": "You want several bots, one per job.",
    "R4": "This is next in the order the Hermes docs suggest."
  },
  "lines": {
    "F2": {
      "text": "Thanks, {name}. I'll help you set up Hermes for that. Are you new to Hermes?",
      "text_no_name": "Thanks. I'll help you set up Hermes for that. Are you new to Hermes?"
    },
    "F3": {
      "text": "That's fine. I'll help you set up Hermes. Are you new to Hermes?"
    },
    "WORK_SECRET": {
      "text": "Thanks. I didn't keep that, because it looks like a password or a long number. Are you new to Hermes?"
    },
    "WORK_LONG_2": {
      "text": "Thanks. I didn't keep that, because it is too long. Are you new to Hermes?"
    },
    "Q_GOAL": {
      "text": "Do you want jobs at set times, phone chats, or something else?"
    },
    "SETUP_REASK": {
      "text": "When you're ready: are you new to Hermes?"
    },
    "SETUP_REASK_GOAL": {
      "text": "When you're ready: do you want jobs, phone chats, or more?"
    },
    "REC": {
      "text": "{reason} Next: {card}. {why} Want the steps?",
      "answers": [
        "Show me the steps",
        "I've done this already",
        "Something else",
        "Not now"
      ]
    },
    "STEP": {
      "text": "Step {n} of {total}: {step}",
      "answers": [
        "Done",
        "I'm stuck",
        "Stop for now"
      ],
      "last_step_answers": [
        "It worked",
        "It didn't work",
        "Stop for now"
      ]
    },
    "STUCK": {
      "text": "Your own Hermes can help with this. Paste this into a new chat there.",
      "answers": [
        "Done, it works now",
        "Stop for now"
      ],
      "paste_label": "Text for your own Hermes",
      "paste": "I'm setting up {card} in Hermes. I'm stuck at this step: {step} Please help me, one small step at a time."
    },
    "STUCK_MODEL": {
      "text": "Your Hermes can't answer yet, so it can't help here. The docs page Quickstart walks through it.",
      "button": "Open the Quickstart",
      "url": "https://hermes-agent.nousresearch.com/docs/getting-started/quickstart"
    },
    "DONE_SEEN": {
      "text": "I can see it now. {seen_part}"
    },
    "NOT_SEEN": {
      "text": "I can't see it yet. I only look at your main bot.",
      "answers": [
        "Show me the steps",
        "I did it on another bot",
        "Not now"
      ],
      "answers_second_bot": [
        "Show me the steps",
        "Not now"
      ],
      "text_second_bot": "I can't see it yet. You have one bot so far."
    },
    "DONE_SAID": {
      "text": "Good. I'll remember that you did it."
    },
    "ALREADY_SEEABLE": {
      "text": "I can't see that yet. {not_part}",
      "answers": [
        "Show me the steps",
        "I did it on another bot",
        "Count it as done",
        "Not now"
      ],
      "answers_second_bot": [
        "Show me the steps",
        "Count it as done",
        "Not now"
      ],
      "not_part": {
        "personality": "Its personality text is still the starter one.",
        "scheduled_job": "You have no scheduled jobs yet.",
        "second_bot": "You have one bot so far."
      }
    },
    "SOMETHING_ELSE": {
      "text": "Fine, here's another."
    },
    "NOT_NOW": {
      "text": "That's fine. I'll keep your place.",
      "offer": "general_2"
    },
    "ALL_DONE": {
      "text": "That's everything on my list.",
      "offer": "general_2"
    },
    "BACK_DONE": {
      "text": "Hi again, {name}. I can see it now. {seen_part}",
      "text_no_name": "Hi again. I can see it now. {seen_part}"
    },
    "BACK_REC": {
      "text": "Hi again, {name}. We stopped at {card}. {why} Want the steps?",
      "text_no_name": "Hi again. We stopped at {card}. {why} Want the steps?",
      "answers": [
        "Show me the steps",
        "I've done this already",
        "Something else",
        "Not now"
      ]
    },
    "BACK_Q": {
      "text": "Hi again, {name}. Before we go on: are you new to Hermes?",
      "text_no_name": "Hi again. Before we go on: are you new to Hermes?"
    },
    "BACK": {
      "text": "Hi again, {name}.",
      "text_no_name": "Hi again.",
      "offer": "general_2"
    },
    "RESTART": {
      "text": "Sure, let's start again. Are you new to Hermes?"
    },
    "BACK_SEEN": {
      "text": "Hi again, {name}. {back_part}",
      "text_no_name": "Hi again. {back_part}",
      "parts": {
        "scheduled_job": "I can see you have {n} scheduled job.",
        "scheduled_job_plural": "I can see you have {n} scheduled jobs.",
        "personality": "I can see your Hermes has its own personality text.",
        "second_bot": "I can see you have {n} bots."
      }
    },
    "BACK_NEXT": {
      "text": "We stopped at {card}. {why} Want the steps?",
      "answers": [
        "Show me the steps",
        "I've done this already",
        "Something else",
        "Not now"
      ]
    },
    "ALREADY_COUNT": {
      "text": "Fine. I'll count it as done."
    },
    "STEP_BACK": {
      "text": "Back to step {n} of {total}: {step}"
    }
  },
  "restart_phrases": [
    "start again",
    "start over",
    "ask me again",
    "set up again",
    "redo the questions",
    "ask the questions again",
    "restart"
  ],
  "ask_phrases": [
    "what should i set up",
    "what do i set up",
    "what should i do first",
    "where do i start",
    "where should i start",
    "what should i do next",
    "what to set up",
    "help me set up",
    "set up hermes",
    "help me get started",
    "what next",
    "now what",
    "how do i get started",
    "get started",
    "where do i begin",
    "where to begin",
    "what do i need to set up",
    "set up first",
    "i'm lost",
    "im lost",
    "i don't know where to begin",
    "i dont know where to begin"
  ],
  "keeps": [
    {
      "key": "setup_new",
      "row": "New to Hermes",
      "kept_line": "Kept: new to Hermes: {label}."
    },
    {
      "key": "setup_goal",
      "row": "What you want Hermes to do",
      "kept_line": "Kept: {label or typed}."
    },
    {
      "key": "setup_done_said",
      "row": "You said you've done",
      "kept_line": null
    },
    {
      "key": "setup_current",
      "row": "Next to set up",
      "kept_line": null
    }
  ],
  "ai": {
    "instructions": "You are Helper, inside the Hermes app. Write one short message that recommends the next thing to set up.\nRules:\n1. Recommend only this: {card}. Use that name exactly.\n2. Say why it fits the person, using the lines About them and What they want. If both say (not told), use The reason.\n3. Do not write steps, clicks, commands or screen names. The steps are shown under your message.\n4. Do not name any other thing to set up, any app, company, price, time or number.\n5. Do not ask a question. Do not use \"!\". Do not use the person's name.\n6. Never say you will set anything up. The person does it.\n7. At most two sentences and 35 words.\nAbout them: {work or (not told)}\nWhat they want: {goal kept_as, or the typed text, or (not told)}\nNew to Hermes: {Q_NEW kept_as or (not told)}\nWhat I can see: {SEEN line without LOOK_OPEN}\nThe thing: {card}: {why}\nThe reason: {reason}",
    "aliases": {
      "model": [
        "model"
      ],
      "first_chat": [
        "first chat"
      ],
      "personality": [
        "personality",
        "soul.md"
      ],
      "chat_apps": [
        "chat app",
        "telegram",
        "whatsapp",
        "discord",
        "slack",
        "signal"
      ],
      "tools_apps": [
        "tools and apps",
        "connector",
        "gmail"
      ],
      "skills": [
        "skill"
      ],
      "memory": [
        "memory"
      ],
      "scheduled_job": [
        "scheduled job"
      ],
      "second_bot": [
        "second bot"
      ],
      "safety": [
        "safety",
        "yolo"
      ]
    },
    "later_names": [
      "mcp servers",
      "plugins",
      "voice",
      "bot group chats",
      "subagents",
      "kanban",
      "sandbox",
      "backup model",
      "phone access",
      "move or back up",
      "code editor"
    ],
    "max_words": 35,
    "max_sentences": 2
  },
  "items": {
    "model": {
      "name": "A model",
      "why": "The AI that does the thinking. Your app may already have a free one.",
      "steps": [
        "Open Settings (Ctrl and comma; Cmd and comma on a Mac). Click Providers.",
        "Sign in to the AI company you use, or paste its key.",
        "Go to Model, then Main model. Pick the company, then the model.",
        "Click Apply under the model list.",
        "Check: open a new chat. The model's name shows in the typing box, left of the microphone."
      ]
    },
    "first_chat": {
      "name": "First chat",
      "why": "Ask Hermes one small thing, to see that it works.",
      "steps": [
        "Click New session at the top of the left list (or Ctrl+N; Cmd+N on a Mac).",
        "Ask something small you can check yourself.",
        "Check: Hermes answers, with no error.",
        "Check: ask one more thing in the same chat. It carries on.",
        "To come back: click Helper in the left list."
      ]
    },
    "personality": {
      "name": "Its personality",
      "why": "A short text that tells your Hermes who it is and how to talk.",
      "steps": [
        "Click Bots at the top of the left list.",
        "Right-click your main bot, then click \"Edit…\".",
        "Click the button \"Advanced — model, skills, toolsets, SOUL.md\".",
        "The big box under the skills list is SOUL.md. Write who your bot is and how it talks.",
        "Click Save. To come back: click Sessions at the top of the left list, then Helper."
      ]
    },
    "chat_apps": {
      "name": "Chat apps",
      "why": "Talk to your Hermes from Telegram or another chat app on your phone.",
      "steps": [
        "Click Messaging in the left list.",
        "On the Telegram card, click Create with QR. Scan the code with Telegram on your phone.",
        "Hermes makes the bot, lets only you in, and restarts by itself.",
        "Check: send your new Telegram bot a message. It answers while this computer is on.",
        "To come back: click Helper in the left list."
      ]
    },
    "tools_apps": {
      "name": "Tools and apps",
      "why": "Actions Hermes can take, and outside apps like Gmail it can use.",
      "steps": [
        "Click Capabilities in the left list, then Tools. Each group of actions has a switch.",
        "Most are on already. Switch one off only if you never want it used.",
        "Click Connectors to link an app such as Gmail.",
        "With no Nous account, linking your first app makes a free one for you."
      ]
    },
    "memory": {
      "name": "Memory",
      "why": "Short notes Hermes keeps about you, so it remembers between chats.",
      "steps": [
        "Nothing to switch on. Memory is on from the start.",
        "In a chat, say what to keep, like: Remember that I run a tennis club.",
        "Check: start a new chat and ask what it remembers about you.",
        "To see everything it keeps, type /journey in a chat."
      ]
    },
    "scheduled_job": {
      "name": "Scheduled jobs",
      "why": "Hermes does a job for you at set times, like every morning.",
      "steps": [
        "In a chat, ask in plain words, like: Every morning at 9, send me a short news summary.",
        "Check: open Scheduled jobs. The job Hermes made is there.",
        "No job? Make one by hand: click New cron, type a name and the job, then Create cron."
      ]
    },
    "second_bot": {
      "name": "A second bot",
      "why": "A bot is one separate Hermes, with its own name, memory and skills.",
      "steps": [
        "Click Bots at the top of the left list.",
        "Press + (New bot or group chat), then New bot.",
        "Fill in its Name, Title and Description, then click Create Bot.",
        "Check: the new bot says hello in its own chat.",
        "To come back: click Sessions at the top of the left list, then Helper."
      ]
    },
    "safety": {
      "name": "Safety",
      "why": "Hermes asks you first before it runs anything risky on your computer.",
      "steps": [
        "Nothing to switch on. Asking first is on from the start.",
        "When Hermes asks, read what it wants to run. Then say yes or no.",
        "Keep YOLO off. It is a switch in the bar under the chat that stops the asking.",
        "In a chat app, only people on its allowed list can talk to it.",
        "These choices live in Settings, Safety."
      ]
    },
    "skills": {
      "name": "Skills",
      "why": "Written know-how that teaches Hermes one task. Many come already installed.",
      "steps": [
        "Click Capabilities in the left list, then Skills. Each skill has a switch.",
        "To add one: Source, then Optional. Open the skill's card and click Install.",
        "You don't need to add any first. Hermes picks a fitting skill by itself."
      ]
    }
  }
}

// ---- src/live-data.js ----
// Generated by scripts/build.mjs from content/helper-talk-live-v2.json (hhcontent's data for Helper's AI step),
// with the rows made from content/helper-talk-v2.json and content/helper-wants-v1.json. Edit the JSON, then build.
const LIVE_DATA = {
  "seconds": 12,
  "code_answers": [
    "K1",
    "HELLO",
    "HELLO_SAME",
    "THANKS",
    "OK",
    "HOW",
    "WHO",
    "AI",
    "AI_PICK",
    "AI_WRITES",
    "BYE",
    "CUT",
    "WRONG",
    "RM1",
    "RM2",
    "RM3",
    "RM4",
    "RM5",
    "RM6",
    "TP",
    "H1",
    "F1",
    "F2",
    "F3",
    "N1a",
    "NAME_AGAIN",
    "NAME_NEW",
    "COST",
    "WHERE",
    "W1",
    "W2",
    "term",
    "row",
    "question",
    "plain",
    "skill",
    "wants",
    "OK_SAME",
    "THANKS_SAME",
    "HOW_SAME",
    "BYE_SAME",
    "CUT_SAME",
    "WRONG_SAME",
    "anything from small_talk kind again"
  ],
  "go_to_ai": [
    "N1",
    "N1_AGAIN",
    "MEAN_NONE",
    "AGAIN",
    "plain with why \"what do you mean\"",
    "STUCK",
    "STUCK_SAME"
  ],
  "follow_up": {
    "phrases": [
      "and then",
      "then what",
      "what then",
      "what next",
      "what's next",
      "whats next",
      "next",
      "and next",
      "what now",
      "now what",
      "then",
      "how",
      "how?",
      "what do you mean",
      "what does that mean",
      "meaning",
      "i don't get it",
      "i dont get it",
      "explain",
      "explain that",
      "tell me more",
      "more",
      "go on",
      "and",
      "like what",
      "for example",
      "such as"
    ]
  },
  "rows": [
    {
      "id": "mem0",
      "subject": "mem",
      "title": "Memory",
      "text": "Memory is short notes Hermes keeps about you and your work.",
      "kw": [
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
        "memorise",
        "rember",
        "remeber",
        "rememeber",
        "remmber",
        "memmory",
        "memorry",
        "memroy",
        "memeory"
      ],
      "weak": [],
      "shows": {
        "kind": "plain",
        "topic": "mem"
      }
    },
    {
      "id": "mem1",
      "subject": "mem",
      "title": "Memory: things about me and how I like things",
      "text": "Hermes does that by itself. It keeps short notes about you and reads them in each new chat.",
      "kw": [
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
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "mem",
        "need": "mem1"
      }
    },
    {
      "id": "mem2",
      "subject": "mem",
      "title": "Memory: what we talked about before",
      "text": "Hermes saves every chat. It can search your old chats when you ask.",
      "kw": [
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
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "mem",
        "need": "mem2"
      }
    },
    {
      "id": "mem3",
      "subject": "mem",
      "title": "Memory: it forgot what I told it",
      "text": "New notes show up in the next chat, not this one. Start a new chat and ask again.",
      "kw": [
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
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "mem",
        "need": "mem3"
      }
    },
    {
      "id": "mem4",
      "subject": "mem",
      "title": "Memory: keep two things apart",
      "text": "Each bot keeps its own notes. For separate notes, use a separate bot.",
      "kw": [
        "separate",
        "apart",
        "private",
        "work and",
        "different"
      ],
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "mem",
        "need": "mem4"
      }
    },
    {
      "id": "mod0",
      "subject": "mod",
      "title": "Choosing a model",
      "text": "A model is the AI that does the thinking. Hermes needs one to answer.",
      "kw": [
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
        "smartest",
        "modle",
        "modell",
        "chat gpt",
        "chatgtp"
      ],
      "weak": [],
      "shows": {
        "kind": "plain",
        "topic": "mod"
      }
    },
    {
      "id": "mod1",
      "subject": "mod",
      "title": "Choosing a model: has ChatGPT",
      "text": "You can sign in to Hermes with your ChatGPT plan. The docs do not say which plans work.",
      "kw": [
        "chatgpt",
        "openai",
        "gpt",
        "codex",
        "chat gpt",
        "chatgtp"
      ],
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "mod",
        "need": "mod1"
      }
    },
    {
      "id": "mod2",
      "subject": "mod",
      "title": "Choosing a model: has Claude",
      "text": "A Claude Max plan works only with extra paid credits. Claude Pro does not work.",
      "kw": [
        "claude",
        "anthropic"
      ],
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "mod",
        "need": "mod2"
      }
    },
    {
      "id": "mod3",
      "subject": "mod",
      "title": "Choosing a model: free, or private",
      "text": "Hermes can run an AI on your own computer. No account, and nothing leaves your computer.",
      "kw": [
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
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "mod",
        "need": "mod3"
      }
    },
    {
      "id": "mod4",
      "subject": "mod",
      "title": "Choosing a model: pays for neither, or does not know",
      "text": "The quickest start is a paid Nous plan. One sign-in gives you many AIs to choose from.",
      "kw": [
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
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "mod",
        "need": "mod4"
      }
    },
    {
      "id": "msg0",
      "subject": "msg",
      "title": "From a phone or chat app",
      "text": "You can chat with Hermes from apps like Telegram, WhatsApp or Slack.",
      "kw": [
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
        "smartphone",
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
      "weak": [],
      "shows": {
        "kind": "plain",
        "topic": "msg"
      }
    },
    {
      "id": "msg1",
      "subject": "msg",
      "title": "From a phone or chat app: Telegram",
      "text": "Telegram has a quick setup. In the app, open Messaging and press Create with QR.",
      "kw": [
        "telegram",
        "telegramm",
        "telegrm",
        "telgram",
        "telegam",
        "telegarm"
      ],
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "msg",
        "need": "msg1"
      }
    },
    {
      "id": "msg2",
      "subject": "msg",
      "title": "From a phone or chat app: another app Hermes lists",
      "text": "Hermes works with that app. In the Hermes app, open Messaging to set it up.",
      "kw": [
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
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "msg",
        "need": "msg2"
      }
    },
    {
      "id": "msg3",
      "subject": "msg",
      "title": "From a phone or chat app: answers at any time",
      "text": "It answers only while its computer is on. For answers at any time, that computer must stay on.",
      "kw": [
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
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "msg",
        "need": "msg3"
      }
    },
    {
      "id": "sch0",
      "subject": "sch",
      "title": "On a schedule",
      "text": "Hermes can do jobs on a schedule, such as a summary every morning.",
      "kw": [
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
        "alarm",
        "shedule",
        "schedual",
        "scedule",
        "automaticaly",
        "automaticly"
      ],
      "weak": [],
      "shows": {
        "kind": "plain",
        "topic": "sch"
      }
    },
    {
      "id": "sch1",
      "subject": "sch",
      "title": "On a schedule: a regular summary or report",
      "text": "Hermes can repeat a job every day or week. Ask it once, in plain words.",
      "kw": [
        "summary",
        "report",
        "news",
        "digest",
        "list",
        "daily update",
        "daily updates",
        "weekly update",
        "weekly updates",
        "morning update",
        "update every",
        "updates every",
        "update me every",
        "an update each",
        "every morning",
        "daily",
        "weekly"
      ],
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "sch",
        "need": "sch1"
      }
    },
    {
      "id": "sch2",
      "subject": "sch",
      "title": "On a schedule: a reminder",
      "text": "Hermes can remind you once, or again and again. Just ask it in plain words.",
      "kw": [
        "remind",
        "reminder",
        "reminders",
        "don't forget",
        "tomorrow",
        "in an hour"
      ],
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "sch",
        "need": "sch2"
      }
    },
    {
      "id": "sch3",
      "subject": "sch",
      "title": "On a schedule: keep an eye on something",
      "text": "Hermes can check something on a schedule and tell you what it found.",
      "kw": [
        "check",
        "checks",
        "watch",
        "monitor",
        "alert",
        "tell me when",
        "price",
        "prices"
      ],
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "sch",
        "need": "sch3"
      }
    },
    {
      "id": "sch4",
      "subject": "sch",
      "title": "On a schedule: does it run while I am away",
      "text": "Jobs run only while Hermes is running on a computer that is on.",
      "kw": [
        "away",
        "asleep",
        "turned off",
        "switched off",
        "laptop closed",
        "laptop is closed",
        "when off",
        "computer is off"
      ],
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "sch",
        "need": "sch4"
      }
    },
    {
      "id": "sch5",
      "subject": "sch",
      "title": "On a schedule: checking email on a schedule",
      "text": "Yes. Connect your email to Hermes first. Then ask it once, in plain words.",
      "kw": [
        "email",
        "emails",
        "e-mail",
        "mail",
        "my mail",
        "gmail",
        "inbox",
        "outlook"
      ],
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "sch",
        "need": "sch5"
      }
    },
    {
      "id": "svc0",
      "subject": "svc",
      "title": "A service you use",
      "text": "MCP links Hermes to a service you already use, such as GitHub.",
      "kw": [
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
        "my accounts",
        "gmial",
        "calender"
      ],
      "weak": [],
      "shows": {
        "kind": "plain",
        "topic": "svc"
      }
    },
    {
      "id": "svc1",
      "subject": "svc",
      "title": "A service you use: a named service",
      "text": "Hermes has a list of ready-made links to services. Ask your own Hermes to add yours.",
      "kw": [
        "google calendar",
        "gmail",
        "google drive",
        "google sheets",
        "google mail",
        "google",
        "calendar",
        "github",
        "notion",
        "linear",
        "one drive",
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
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "svc",
        "need": "svc1"
      }
    },
    {
      "id": "svc2",
      "subject": "svc",
      "title": "A service you use: is it safe, what can it see",
      "text": "Nothing is linked until you add it. You can also limit what Hermes may use there.",
      "kw": [
        "safe",
        "see",
        "access",
        "private",
        "privacy",
        "permission",
        "permissions"
      ],
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "svc",
        "need": "svc2"
      }
    },
    {
      "id": "bot0",
      "subject": "bot",
      "title": "More than one bot",
      "text": "Each bot is a separate Hermes with its own settings and notes.",
      "kw": [
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
      "weak": [],
      "shows": {
        "kind": "plain",
        "topic": "bot"
      }
    },
    {
      "id": "bot1",
      "subject": "bot",
      "title": "More than one bot: a different job",
      "text": "That fits a second bot. Each bot is a separate Hermes with its own settings and notes.",
      "kw": [
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
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "bot",
        "need": "bot1"
      }
    },
    {
      "id": "bot2",
      "subject": "bot",
      "title": "More than one bot: working together",
      "text": "Each bot is a separate Hermes. They can hand work to each other with @ and a name.",
      "kw": [
        "together",
        "team",
        "hand over",
        "pass",
        "each other",
        "help each other"
      ],
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "bot",
        "need": "bot2"
      }
    },
    {
      "id": "bot3",
      "subject": "bot",
      "title": "More than one bot: only a fresh chat",
      "text": "You may not need a second, separate Hermes. One Hermes can hold many chats at once.",
      "kw": [
        "new chat",
        "fresh chat",
        "start over",
        "another conversation",
        "same job"
      ],
      "weak": [
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
      "shows": {
        "kind": "row",
        "topic": "bot",
        "need": "bot3"
      }
    },
    {
      "id": "use0",
      "subject": "use",
      "title": "Using less",
      "text": "Tokens are small pieces of words. Your AI counts them, and long chats use the most.",
      "kw": [
        "token",
        "tokens",
        "usage",
        "use less",
        "uses less",
        "using less",
        "less usage",
        "uses a lot",
        "uses so much",
        "uses too much",
        "using too much",
        "using a lot",
        "uses up",
        "costs too much",
        "cost too much",
        "costing too much",
        "costs a lot",
        "too expensive",
        "so expensive",
        "cheaper",
        "save money",
        "spend less",
        "pay less",
        "lower cost",
        "lower the cost",
        "reduce cost",
        "reduce the cost",
        "credits",
        "quota",
        "rate limit",
        "usage limit",
        "runs out",
        "run out",
        "ran out",
        "running out",
        "hit the limit",
        "hit a limit",
        "hit my limit",
        "reached the limit",
        "limit reached",
        "so slow",
        "too slow",
        "is slow",
        "slow answers",
        "answers slowly",
        "takes forever",
        "takes so long",
        "takes too long",
        "faster answers",
        "costing me",
        "cost me",
        "costs me",
        "too much money",
        "so much money",
        "a lot of money",
        "spending too much",
        "spending so much",
        "bill",
        "take forever",
        "taking forever",
        "took forever",
        "takes ages",
        "take ages",
        "taking ages",
        "took ages",
        "slows down",
        "slowing down",
        "slowed down",
        "speed it up",
        "speed up",
        "slow",
        "context window",
        "context length",
        "context is full",
        "too long",
        "fills up",
        "filling up",
        "filled up",
        "long chat",
        "long chats",
        "long conversation",
        "tokns",
        "toknes",
        "tokenz",
        "tokkens",
        "useage",
        "usuage"
      ],
      "weak": [],
      "shows": {
        "kind": "plain",
        "topic": "use"
      }
    },
    {
      "id": "use1",
      "subject": "use",
      "title": "Using less: each message or question uses many tokens (his own question)",
      "text": "Long chats use the most tokens, small pieces of words. For a fresh chat, click \"New session\" at the top left.",
      "kw": [
        "token",
        "tokens",
        "tokns",
        "toknes",
        "use less",
        "uses less",
        "using less",
        "less usage",
        "uses a lot",
        "uses so much",
        "uses too much",
        "using too much",
        "using a lot",
        "uses up",
        "each message",
        "every message",
        "each question",
        "every question",
        "per message",
        "per question",
        "context window",
        "context length",
        "context is full",
        "too long",
        "fills up",
        "filling up",
        "filled up",
        "long chat",
        "long chats",
        "long conversation"
      ],
      "weak": [
        "token",
        "tokens",
        "usage",
        "use less",
        "uses less",
        "using less",
        "less usage",
        "uses a lot",
        "uses so much",
        "uses too much",
        "using too much",
        "using a lot",
        "uses up",
        "costs too much",
        "cost too much",
        "costing too much",
        "costs a lot",
        "too expensive",
        "so expensive",
        "cheaper",
        "save money",
        "spend less",
        "pay less",
        "lower cost",
        "lower the cost",
        "reduce cost",
        "reduce the cost",
        "credits",
        "quota",
        "rate limit",
        "usage limit",
        "runs out",
        "run out",
        "ran out",
        "running out",
        "hit the limit",
        "hit a limit",
        "hit my limit",
        "reached the limit",
        "limit reached",
        "so slow",
        "too slow",
        "is slow",
        "slow answers",
        "answers slowly",
        "takes forever",
        "takes so long",
        "takes too long",
        "faster answers",
        "costing me",
        "cost me",
        "costs me",
        "too much money",
        "so much money",
        "a lot of money",
        "spending too much",
        "spending so much",
        "bill",
        "take forever",
        "taking forever",
        "took forever",
        "takes ages",
        "take ages",
        "taking ages",
        "took ages",
        "slows down",
        "slowing down",
        "slowed down",
        "speed it up",
        "speed up",
        "slow",
        "context window",
        "context length",
        "context is full",
        "too long",
        "fills up",
        "filling up",
        "filled up",
        "long chat",
        "long chats",
        "long conversation"
      ],
      "shows": {
        "kind": "row",
        "topic": "use",
        "need": "use1"
      }
    },
    {
      "id": "use2",
      "subject": "use",
      "title": "Using less: it costs too much",
      "text": "Long chats cost the most. For a fresh chat, click \"New session\" at the top left. A cheaper AI also helps.",
      "kw": [
        "cost",
        "costs",
        "costing",
        "expensive",
        "cheaper",
        "cheap",
        "money",
        "save money",
        "spend less",
        "pay less",
        "price",
        "bill",
        "costs too much",
        "too expensive",
        "costing me",
        "cost me",
        "costs me",
        "too much money",
        "so much money",
        "a lot of money",
        "spending too much",
        "spending so much"
      ],
      "weak": [
        "token",
        "tokens",
        "usage",
        "use less",
        "uses less",
        "using less",
        "less usage",
        "uses a lot",
        "uses so much",
        "uses too much",
        "using too much",
        "using a lot",
        "uses up",
        "costs too much",
        "cost too much",
        "costing too much",
        "costs a lot",
        "too expensive",
        "so expensive",
        "cheaper",
        "save money",
        "spend less",
        "pay less",
        "lower cost",
        "lower the cost",
        "reduce cost",
        "reduce the cost",
        "credits",
        "quota",
        "rate limit",
        "usage limit",
        "runs out",
        "run out",
        "ran out",
        "running out",
        "hit the limit",
        "hit a limit",
        "hit my limit",
        "reached the limit",
        "limit reached",
        "so slow",
        "too slow",
        "is slow",
        "slow answers",
        "answers slowly",
        "takes forever",
        "takes so long",
        "takes too long",
        "faster answers",
        "costing me",
        "cost me",
        "costs me",
        "too much money",
        "so much money",
        "a lot of money",
        "spending too much",
        "spending so much",
        "bill",
        "take forever",
        "taking forever",
        "took forever",
        "takes ages",
        "take ages",
        "taking ages",
        "took ages",
        "slows down",
        "slowing down",
        "slowed down",
        "speed it up",
        "speed up",
        "slow",
        "context window",
        "context length",
        "context is full",
        "too long",
        "fills up",
        "filling up",
        "filled up",
        "long chat",
        "long chats",
        "long conversation"
      ],
      "shows": {
        "kind": "row",
        "topic": "use",
        "need": "use2"
      }
    },
    {
      "id": "use3",
      "subject": "use",
      "title": "Using less: a usage limit runs out",
      "text": "Each message uses part of your limit, and long chats use more. For a fresh chat, click \"New session\" at the top left.",
      "kw": [
        "limit",
        "limits",
        "runs out",
        "run out",
        "ran out",
        "running out",
        "quota",
        "credits",
        "rate limit",
        "usage limit",
        "hit the limit",
        "hit a limit",
        "hit my limit",
        "reached the limit",
        "limit reached"
      ],
      "weak": [
        "token",
        "tokens",
        "usage",
        "use less",
        "uses less",
        "using less",
        "less usage",
        "uses a lot",
        "uses so much",
        "uses too much",
        "using too much",
        "using a lot",
        "uses up",
        "costs too much",
        "cost too much",
        "costing too much",
        "costs a lot",
        "too expensive",
        "so expensive",
        "cheaper",
        "save money",
        "spend less",
        "pay less",
        "lower cost",
        "lower the cost",
        "reduce cost",
        "reduce the cost",
        "credits",
        "quota",
        "rate limit",
        "usage limit",
        "runs out",
        "run out",
        "ran out",
        "running out",
        "hit the limit",
        "hit a limit",
        "hit my limit",
        "reached the limit",
        "limit reached",
        "so slow",
        "too slow",
        "is slow",
        "slow answers",
        "answers slowly",
        "takes forever",
        "takes so long",
        "takes too long",
        "faster answers",
        "costing me",
        "cost me",
        "costs me",
        "too much money",
        "so much money",
        "a lot of money",
        "spending too much",
        "spending so much",
        "bill",
        "take forever",
        "taking forever",
        "took forever",
        "takes ages",
        "take ages",
        "taking ages",
        "took ages",
        "slows down",
        "slowing down",
        "slowed down",
        "speed it up",
        "speed up",
        "slow",
        "context window",
        "context length",
        "context is full",
        "too long",
        "fills up",
        "filling up",
        "filled up",
        "long chat",
        "long chats",
        "long conversation"
      ],
      "shows": {
        "kind": "row",
        "topic": "use",
        "need": "use3"
      }
    },
    {
      "id": "use4",
      "subject": "use",
      "title": "Using less: answers are slow",
      "text": "Big AIs and long chats can make answers slow. A smaller, faster AI can help.",
      "kw": [
        "slow",
        "slowly",
        "so slow",
        "too slow",
        "takes forever",
        "takes long",
        "takes so long",
        "takes too long",
        "faster",
        "speed",
        "laggy",
        "lag",
        "take forever",
        "taking forever",
        "took forever",
        "takes ages",
        "take ages",
        "taking ages",
        "took ages",
        "slows down",
        "slowing down",
        "slowed down",
        "speed it up",
        "speed up"
      ],
      "weak": [
        "token",
        "tokens",
        "usage",
        "use less",
        "uses less",
        "using less",
        "less usage",
        "uses a lot",
        "uses so much",
        "uses too much",
        "using too much",
        "using a lot",
        "uses up",
        "costs too much",
        "cost too much",
        "costing too much",
        "costs a lot",
        "too expensive",
        "so expensive",
        "cheaper",
        "save money",
        "spend less",
        "pay less",
        "lower cost",
        "lower the cost",
        "reduce cost",
        "reduce the cost",
        "credits",
        "quota",
        "rate limit",
        "usage limit",
        "runs out",
        "run out",
        "ran out",
        "running out",
        "hit the limit",
        "hit a limit",
        "hit my limit",
        "reached the limit",
        "limit reached",
        "so slow",
        "too slow",
        "is slow",
        "slow answers",
        "answers slowly",
        "takes forever",
        "takes so long",
        "takes too long",
        "faster answers",
        "costing me",
        "cost me",
        "costs me",
        "too much money",
        "so much money",
        "a lot of money",
        "spending too much",
        "spending so much",
        "bill",
        "take forever",
        "taking forever",
        "took forever",
        "takes ages",
        "take ages",
        "taking ages",
        "took ages",
        "slows down",
        "slowing down",
        "slowed down",
        "speed it up",
        "speed up",
        "slow",
        "context window",
        "context length",
        "context is full",
        "too long",
        "fills up",
        "filling up",
        "filled up",
        "long chat",
        "long chats",
        "long conversation"
      ],
      "shows": {
        "kind": "row",
        "topic": "use",
        "need": "use4"
      }
    },
    {
      "id": "tool",
      "subject": "words",
      "title": "Tools",
      "text": "Tools are actions Hermes can take, like searching the web or editing files.",
      "kw": [
        "tool",
        "tools"
      ],
      "weak": [],
      "shows": {
        "kind": "term",
        "term": "tool"
      }
    },
    {
      "id": "skill",
      "subject": "words",
      "title": "Skills",
      "text": "A skill is a set of written steps that teach Hermes one task.",
      "kw": [
        "skill",
        "skills"
      ],
      "weak": [],
      "shows": {
        "kind": "term",
        "term": "skill"
      }
    },
    {
      "id": "plugin",
      "subject": "words",
      "title": "Plugins",
      "text": "A plugin is an add-on that gives Hermes a new feature.",
      "kw": [
        "plugin",
        "plugins",
        "plug-in",
        "plug-ins",
        "add-on",
        "add-ons"
      ],
      "weak": [],
      "shows": {
        "kind": "term",
        "term": "plugin"
      }
    },
    {
      "id": "mcp",
      "subject": "words",
      "title": "MCP",
      "text": "MCP links Hermes to a service you already use, such as GitHub.",
      "kw": [
        "mcp",
        "mcps"
      ],
      "weak": [],
      "shows": {
        "kind": "term",
        "term": "mcp"
      }
    },
    {
      "id": "soul",
      "subject": "words",
      "title": "SOUL.md",
      "text": "SOUL.md is the file that says who your Hermes is.",
      "kw": [
        "soul.md",
        "soul md",
        "soul",
        "soul file"
      ],
      "weak": [],
      "shows": {
        "kind": "term",
        "term": "soul"
      }
    },
    {
      "id": "profile",
      "subject": "words",
      "title": "Profile",
      "text": "That is one separate Hermes with its own settings and notes. The \"Bots\" tab lists them.",
      "kw": [
        "profile",
        "profiles"
      ],
      "weak": [],
      "shows": {
        "kind": "term",
        "term": "profile"
      }
    },
    {
      "id": "w_web",
      "subject": "web",
      "title": "Search the web",
      "text": "Hermes can search the web and read web pages. That is a built-in tool, an action it can take.",
      "kw": [
        "web search",
        "search engine",
        "google things",
        "google something",
        "google it",
        "webpages",
        "webpage",
        "search web",
        "search internet",
        "search online",
        "search google",
        "search news",
        "searches web",
        "searches internet",
        "searches online",
        "searches google",
        "searches news",
        "searching web",
        "searching internet",
        "searching online",
        "searching google",
        "searching news",
        "look up web",
        "look up internet",
        "look up online",
        "look up google",
        "look up news",
        "looks up web",
        "looks up internet",
        "looks up online",
        "looks up google",
        "looks up news",
        "find web",
        "find internet",
        "find online",
        "find google",
        "find news",
        "research web",
        "research internet",
        "research online",
        "research google",
        "research news",
        "check web",
        "check internet",
        "check online",
        "check google",
        "check news",
        "browse web",
        "browse internet",
        "browse online",
        "browse google",
        "browse news",
        "look stuff up web",
        "look stuff up internet",
        "look stuff up online",
        "look stuff up google",
        "look stuff up news",
        "looks stuff up web",
        "looks stuff up internet",
        "looks stuff up online",
        "looks stuff up google",
        "looks stuff up news",
        "look things up web",
        "look things up internet",
        "look things up online",
        "look things up google",
        "look things up news",
        "looks things up web",
        "looks things up internet",
        "looks things up online",
        "looks things up google",
        "looks things up news"
      ],
      "weak": [
        "web",
        "internet",
        "online",
        "google",
        "news"
      ],
      "shows": {
        "kind": "want",
        "row": "w_web"
      }
    },
    {
      "id": "w_browser",
      "subject": "web",
      "title": "Use a website for me",
      "text": "Hermes can open a website, click, type and fill in forms. That is a built-in tool, an action it can take.",
      "kw": [
        "browser automation",
        "use a browser",
        "use the browser",
        "click website",
        "click websites",
        "click web page",
        "click web pages",
        "click site",
        "click sites",
        "click form",
        "click forms",
        "click browser",
        "clicks website",
        "clicks websites",
        "clicks web page",
        "clicks web pages",
        "clicks site",
        "clicks sites",
        "clicks form",
        "clicks forms",
        "clicks browser",
        "fill website",
        "fill websites",
        "fill web page",
        "fill web pages",
        "fill site",
        "fill sites",
        "fill form",
        "fill forms",
        "fill browser",
        "fills website",
        "fills websites",
        "fills web page",
        "fills web pages",
        "fills site",
        "fills sites",
        "fills form",
        "fills forms",
        "fills browser",
        "fill in website",
        "fill in websites",
        "fill in web page",
        "fill in web pages",
        "fill in site",
        "fill in sites",
        "fill in form",
        "fill in forms",
        "fill in browser",
        "fill out website",
        "fill out websites",
        "fill out web page",
        "fill out web pages",
        "fill out site",
        "fill out sites",
        "fill out form",
        "fill out forms",
        "fill out browser",
        "log in website",
        "log in websites",
        "log in web page",
        "log in web pages",
        "log in site",
        "log in sites",
        "log in form",
        "log in forms",
        "log in browser",
        "sign in website",
        "sign in websites",
        "sign in web page",
        "sign in web pages",
        "sign in site",
        "sign in sites",
        "sign in form",
        "sign in forms",
        "sign in browser",
        "open website",
        "open websites",
        "open web page",
        "open web pages",
        "open site",
        "open sites",
        "open form",
        "open forms",
        "open browser",
        "opens website",
        "opens websites",
        "opens web page",
        "opens web pages",
        "opens site",
        "opens sites",
        "opens form",
        "opens forms",
        "opens browser",
        "navigate website",
        "navigate websites",
        "navigate web page",
        "navigate web pages",
        "navigate site",
        "navigate sites",
        "navigate form",
        "navigate forms",
        "navigate browser",
        "book website",
        "book websites",
        "book web page",
        "book web pages",
        "book site",
        "book sites",
        "book form",
        "book forms",
        "book browser",
        "order website",
        "order websites",
        "order web page",
        "order web pages",
        "order site",
        "order sites",
        "order form",
        "order forms",
        "order browser",
        "use website",
        "use websites",
        "use web page",
        "use web pages",
        "use site",
        "use sites",
        "use form",
        "use forms",
        "use browser",
        "control website",
        "control websites",
        "control web page",
        "control web pages",
        "control site",
        "control sites",
        "control form",
        "control forms",
        "control browser"
      ],
      "weak": [
        "website",
        "websites",
        "web page",
        "web pages",
        "site",
        "sites",
        "form",
        "forms",
        "browser"
      ],
      "shows": {
        "kind": "want",
        "row": "w_browser"
      }
    },
    {
      "id": "w_xpost",
      "subject": "web",
      "title": "Post on X for me",
      "text": "Hermes comes with a skill called \"xurl\". Its written steps teach Hermes to search and post on X.",
      "kw": [
        "post twitter",
        "post tweet",
        "post tweets",
        "post on x",
        "post to x",
        "post x account",
        "post x.com",
        "posts twitter",
        "posts tweet",
        "posts tweets",
        "posts on x",
        "posts to x",
        "posts x account",
        "posts x.com",
        "posting twitter",
        "posting tweet",
        "posting tweets",
        "posting on x",
        "posting to x",
        "posting x account",
        "posting x.com",
        "tweet twitter",
        "tweet tweet",
        "tweet tweets",
        "tweet on x",
        "tweet to x",
        "tweet x account",
        "tweet x.com",
        "reply twitter",
        "reply tweet",
        "reply tweets",
        "reply on x",
        "reply to x",
        "reply x account",
        "reply x.com",
        "publish twitter",
        "publish tweet",
        "publish tweets",
        "publish on x",
        "publish to x",
        "publish x account",
        "publish x.com",
        "send twitter",
        "send tweet",
        "send tweets",
        "send on x",
        "send to x",
        "send x account",
        "send x.com",
        "write twitter",
        "write tweet",
        "write tweets",
        "write on x",
        "write to x",
        "write x account",
        "write x.com",
        "search twitter",
        "search tweet",
        "search tweets",
        "search on x",
        "search to x",
        "search x account",
        "search x.com",
        "read twitter",
        "read tweet",
        "read tweets",
        "read on x",
        "read to x",
        "read x account",
        "read x.com",
        "dm twitter",
        "dm tweet",
        "dm tweets",
        "dm on x",
        "dm to x",
        "dm x account",
        "dm x.com"
      ],
      "weak": [
        "twitter",
        "tweet",
        "tweets",
        "on x",
        "to x",
        "x account",
        "x.com"
      ],
      "shows": {
        "kind": "want",
        "row": "w_xpost"
      }
    },
    {
      "id": "w_reddit",
      "subject": "web",
      "title": "Read Reddit",
      "text": "There is an optional skill, \"reddit-reading\". You add it first. Its written steps teach Hermes to read and search Reddit.",
      "kw": [
        "read reddit",
        "read subreddit",
        "read subreddits",
        "reads reddit",
        "reads subreddit",
        "reads subreddits",
        "search reddit",
        "search subreddit",
        "search subreddits",
        "check reddit",
        "check subreddit",
        "check subreddits",
        "follow reddit",
        "follow subreddit",
        "follow subreddits",
        "summarize reddit",
        "summarize subreddit",
        "summarize subreddits",
        "summarise reddit",
        "summarise subreddit",
        "summarise subreddits",
        "browse reddit",
        "browse subreddit",
        "browse subreddits",
        "watch reddit",
        "watch subreddit",
        "watch subreddits",
        "look at reddit",
        "look at subreddit",
        "look at subreddits",
        "find reddit",
        "find subreddit",
        "find subreddits"
      ],
      "weak": [
        "reddit",
        "subreddit",
        "subreddits"
      ],
      "shows": {
        "kind": "want",
        "row": "w_reddit"
      }
    },
    {
      "id": "w_docs",
      "subject": "files",
      "title": "Read my documents",
      "text": "Hermes can read Word, Excel and PDF files. This is built in. Scanned pages come out empty.",
      "kw": [
        "read pdf",
        "read pdfs",
        "read word file",
        "read word files",
        "read word document",
        "read word documents",
        "read docx",
        "read excel",
        "read spreadsheet",
        "read spreadsheets",
        "read document",
        "read documents",
        "read file",
        "read files",
        "read contract",
        "read contracts",
        "reads pdf",
        "reads pdfs",
        "reads word file",
        "reads word files",
        "reads word document",
        "reads word documents",
        "reads docx",
        "reads excel",
        "reads spreadsheet",
        "reads spreadsheets",
        "reads document",
        "reads documents",
        "reads file",
        "reads files",
        "reads contract",
        "reads contracts",
        "open pdf",
        "open pdfs",
        "open word file",
        "open word files",
        "open word document",
        "open word documents",
        "open docx",
        "open excel",
        "open spreadsheet",
        "open spreadsheets",
        "open document",
        "open documents",
        "open file",
        "open files",
        "open contract",
        "open contracts",
        "summarize pdf",
        "summarize pdfs",
        "summarize word file",
        "summarize word files",
        "summarize word document",
        "summarize word documents",
        "summarize docx",
        "summarize excel",
        "summarize spreadsheet",
        "summarize spreadsheets",
        "summarize document",
        "summarize documents",
        "summarize file",
        "summarize files",
        "summarize contract",
        "summarize contracts",
        "summarise pdf",
        "summarise pdfs",
        "summarise word file",
        "summarise word files",
        "summarise word document",
        "summarise word documents",
        "summarise docx",
        "summarise excel",
        "summarise spreadsheet",
        "summarise spreadsheets",
        "summarise document",
        "summarise documents",
        "summarise file",
        "summarise files",
        "summarise contract",
        "summarise contracts",
        "summary pdf",
        "summary pdfs",
        "summary word file",
        "summary word files",
        "summary word document",
        "summary word documents",
        "summary docx",
        "summary excel",
        "summary spreadsheet",
        "summary spreadsheets",
        "summary document",
        "summary documents",
        "summary file",
        "summary files",
        "summary contract",
        "summary contracts",
        "go through pdf",
        "go through pdfs",
        "go through word file",
        "go through word files",
        "go through word document",
        "go through word documents",
        "go through docx",
        "go through excel",
        "go through spreadsheet",
        "go through spreadsheets",
        "go through document",
        "go through documents",
        "go through file",
        "go through files",
        "go through contract",
        "go through contracts",
        "look at pdf",
        "look at pdfs",
        "look at word file",
        "look at word files",
        "look at word document",
        "look at word documents",
        "look at docx",
        "look at excel",
        "look at spreadsheet",
        "look at spreadsheets",
        "look at document",
        "look at documents",
        "look at file",
        "look at files",
        "look at contract",
        "look at contracts",
        "understand pdf",
        "understand pdfs",
        "understand word file",
        "understand word files",
        "understand word document",
        "understand word documents",
        "understand docx",
        "understand excel",
        "understand spreadsheet",
        "understand spreadsheets",
        "understand document",
        "understand documents",
        "understand file",
        "understand files",
        "understand contract",
        "understand contracts",
        "extract pdf",
        "extract pdfs",
        "extract word file",
        "extract word files",
        "extract word document",
        "extract word documents",
        "extract docx",
        "extract excel",
        "extract spreadsheet",
        "extract spreadsheets",
        "extract document",
        "extract documents",
        "extract file",
        "extract files",
        "extract contract",
        "extract contracts",
        "analyze pdf",
        "analyze pdfs",
        "analyze word file",
        "analyze word files",
        "analyze word document",
        "analyze word documents",
        "analyze docx",
        "analyze excel",
        "analyze spreadsheet",
        "analyze spreadsheets",
        "analyze document",
        "analyze documents",
        "analyze file",
        "analyze files",
        "analyze contract",
        "analyze contracts",
        "analyse pdf",
        "analyse pdfs",
        "analyse word file",
        "analyse word files",
        "analyse word document",
        "analyse word documents",
        "analyse docx",
        "analyse excel",
        "analyse spreadsheet",
        "analyse spreadsheets",
        "analyse document",
        "analyse documents",
        "analyse file",
        "analyse files",
        "analyse contract",
        "analyse contracts"
      ],
      "weak": [
        "pdf",
        "pdfs",
        "word file",
        "word files",
        "word document",
        "word documents",
        "docx",
        "excel",
        "spreadsheet",
        "spreadsheets",
        "document",
        "documents",
        "file",
        "files",
        "contract",
        "contracts"
      ],
      "shows": {
        "kind": "want",
        "row": "w_docs"
      }
    },
    {
      "id": "w_pdf",
      "subject": "files",
      "title": "Make or change a PDF",
      "text": "Hermes comes with a skill called \"pdf\". Its written steps teach Hermes to make, merge, fill in and edit PDF files.",
      "kw": [
        "make pdf",
        "make pdfs",
        "create pdf",
        "create pdfs",
        "merge pdf",
        "merge pdfs",
        "combine pdf",
        "combine pdfs",
        "fill pdf",
        "fill pdfs",
        "fill in pdf",
        "fill in pdfs",
        "fill out pdf",
        "fill out pdfs",
        "edit pdf",
        "edit pdfs",
        "change pdf",
        "change pdfs",
        "split pdf",
        "split pdfs",
        "ocr pdf",
        "ocr pdfs"
      ],
      "weak": [
        "pdf",
        "pdfs"
      ],
      "shows": {
        "kind": "want",
        "row": "w_pdf"
      }
    },
    {
      "id": "w_office",
      "subject": "files",
      "title": "Make Word or Excel files",
      "text": "Hermes comes with a skill called \"microsoft-office\". Its written steps teach Hermes to make and edit Word, PowerPoint and Excel files.",
      "kw": [
        "make word",
        "make powerpoint",
        "make excel",
        "make slides",
        "make presentation",
        "make presentations",
        "make deck",
        "make spreadsheet",
        "make spreadsheets",
        "make docx",
        "make pptx",
        "make xlsx",
        "create word",
        "create powerpoint",
        "create excel",
        "create slides",
        "create presentation",
        "create presentations",
        "create deck",
        "create spreadsheet",
        "create spreadsheets",
        "create docx",
        "create pptx",
        "create xlsx",
        "write word",
        "write powerpoint",
        "write excel",
        "write slides",
        "write presentation",
        "write presentations",
        "write deck",
        "write spreadsheet",
        "write spreadsheets",
        "write docx",
        "write pptx",
        "write xlsx",
        "edit word",
        "edit powerpoint",
        "edit excel",
        "edit slides",
        "edit presentation",
        "edit presentations",
        "edit deck",
        "edit spreadsheet",
        "edit spreadsheets",
        "edit docx",
        "edit pptx",
        "edit xlsx",
        "change word",
        "change powerpoint",
        "change excel",
        "change slides",
        "change presentation",
        "change presentations",
        "change deck",
        "change spreadsheet",
        "change spreadsheets",
        "change docx",
        "change pptx",
        "change xlsx",
        "draft word",
        "draft powerpoint",
        "draft excel",
        "draft slides",
        "draft presentation",
        "draft presentations",
        "draft deck",
        "draft spreadsheet",
        "draft spreadsheets",
        "draft docx",
        "draft pptx",
        "draft xlsx",
        "prepare word",
        "prepare powerpoint",
        "prepare excel",
        "prepare slides",
        "prepare presentation",
        "prepare presentations",
        "prepare deck",
        "prepare spreadsheet",
        "prepare spreadsheets",
        "prepare docx",
        "prepare pptx",
        "prepare xlsx"
      ],
      "weak": [
        "word",
        "powerpoint",
        "excel",
        "slides",
        "presentation",
        "presentations",
        "deck",
        "spreadsheet",
        "spreadsheets",
        "docx",
        "pptx",
        "xlsx"
      ],
      "shows": {
        "kind": "want",
        "row": "w_office"
      }
    },
    {
      "id": "w_notes",
      "subject": "files",
      "title": "Use my Obsidian notes",
      "text": "Hermes comes with a skill called \"obsidian\". Its written steps teach Hermes to read, search and edit your Obsidian notes.",
      "kw": [
        "read obsidian",
        "search obsidian",
        "find obsidian",
        "write obsidian",
        "edit obsidian",
        "create obsidian",
        "add obsidian",
        "make obsidian",
        "use obsidian",
        "open obsidian",
        "notes obsidian",
        "note obsidian",
        "vault obsidian",
        "work with obsidian",
        "access obsidian"
      ],
      "weak": [
        "obsidian"
      ],
      "shows": {
        "kind": "want",
        "row": "w_notes"
      }
    },
    {
      "id": "w_meeting",
      "subject": "files",
      "title": "Sort out meeting notes",
      "text": "Hermes comes with a skill called \"meeting-action-items\". Its written steps teach Hermes to turn meeting notes into decisions and tasks.",
      "kw": [
        "action items meeting",
        "action items meetings",
        "action items meeting notes",
        "action items minutes",
        "action points meeting",
        "action points meetings",
        "action points meeting notes",
        "action points minutes",
        "tasks meeting",
        "tasks meetings",
        "tasks meeting notes",
        "tasks minutes",
        "decisions meeting",
        "decisions meetings",
        "decisions meeting notes",
        "decisions minutes",
        "to-do meeting",
        "to-do meetings",
        "to-do meeting notes",
        "to-do minutes",
        "to-dos meeting",
        "to-dos meetings",
        "to-dos meeting notes",
        "to-dos minutes",
        "todo meeting",
        "todo meetings",
        "todo meeting notes",
        "todo minutes",
        "todos meeting",
        "todos meetings",
        "todos meeting notes",
        "todos minutes",
        "owners meeting",
        "owners meetings",
        "owners meeting notes",
        "owners minutes",
        "tickets meeting",
        "tickets meetings",
        "tickets meeting notes",
        "tickets minutes",
        "who does what meeting",
        "who does what meetings",
        "who does what meeting notes",
        "who does what minutes",
        "follow-ups meeting",
        "follow-ups meetings",
        "follow-ups meeting notes",
        "follow-ups minutes",
        "follow ups meeting",
        "follow ups meetings",
        "follow ups meeting notes",
        "follow ups minutes"
      ],
      "weak": [
        "meeting",
        "meetings",
        "meeting notes",
        "minutes"
      ],
      "shows": {
        "kind": "want",
        "row": "w_meeting"
      }
    },
    {
      "id": "w_code",
      "subject": "files",
      "title": "Write and run code",
      "text": "Hermes can read, change and run code on your computer. This is built in.",
      "kw": [
        "coding",
        "programming",
        "write code",
        "write script",
        "write scripts",
        "write program",
        "write programs",
        "write python",
        "write javascript",
        "writes code",
        "writes script",
        "writes scripts",
        "writes program",
        "writes programs",
        "writes python",
        "writes javascript",
        "run code",
        "run script",
        "run scripts",
        "run program",
        "run programs",
        "run python",
        "run javascript",
        "runs code",
        "runs script",
        "runs scripts",
        "runs program",
        "runs programs",
        "runs python",
        "runs javascript",
        "fix code",
        "fix script",
        "fix scripts",
        "fix program",
        "fix programs",
        "fix python",
        "fix javascript",
        "read code",
        "read script",
        "read scripts",
        "read program",
        "read programs",
        "read python",
        "read javascript",
        "edit code",
        "edit script",
        "edit scripts",
        "edit program",
        "edit programs",
        "edit python",
        "edit javascript",
        "debug code",
        "debug script",
        "debug scripts",
        "debug program",
        "debug programs",
        "debug python",
        "debug javascript",
        "review code",
        "review script",
        "review scripts",
        "review program",
        "review programs",
        "review python",
        "review javascript",
        "change code",
        "change script",
        "change scripts",
        "change program",
        "change programs",
        "change python",
        "change javascript",
        "help code",
        "help script",
        "help scripts",
        "help program",
        "help programs",
        "help python",
        "help javascript"
      ],
      "weak": [
        "code",
        "script",
        "scripts",
        "program",
        "programs",
        "python",
        "javascript"
      ],
      "shows": {
        "kind": "want",
        "row": "w_code"
      }
    },
    {
      "id": "w_computer",
      "subject": "files",
      "title": "Click and type for me",
      "text": "Hermes can click and type in the apps on your computer. It is built in, and the docs call it Computer Use.",
      "kw": [
        "computer use",
        "click mouse",
        "click keyboard",
        "click my screen",
        "click my desktop",
        "click my computer",
        "click my mac",
        "click my pc",
        "click my laptop",
        "click my apps",
        "clicks mouse",
        "clicks keyboard",
        "clicks my screen",
        "clicks my desktop",
        "clicks my computer",
        "clicks my mac",
        "clicks my pc",
        "clicks my laptop",
        "clicks my apps",
        "type mouse",
        "type keyboard",
        "type my screen",
        "type my desktop",
        "type my computer",
        "type my mac",
        "type my pc",
        "type my laptop",
        "type my apps",
        "types mouse",
        "types keyboard",
        "types my screen",
        "types my desktop",
        "types my computer",
        "types my mac",
        "types my pc",
        "types my laptop",
        "types my apps",
        "control mouse",
        "control keyboard",
        "control my screen",
        "control my desktop",
        "control my computer",
        "control my mac",
        "control my pc",
        "control my laptop",
        "control my apps",
        "controls mouse",
        "controls keyboard",
        "controls my screen",
        "controls my desktop",
        "controls my computer",
        "controls my mac",
        "controls my pc",
        "controls my laptop",
        "controls my apps",
        "drive mouse",
        "drive keyboard",
        "drive my screen",
        "drive my desktop",
        "drive my computer",
        "drive my mac",
        "drive my pc",
        "drive my laptop",
        "drive my apps",
        "operate mouse",
        "operate keyboard",
        "operate my screen",
        "operate my desktop",
        "operate my computer",
        "operate my mac",
        "operate my pc",
        "operate my laptop",
        "operate my apps",
        "take over mouse",
        "take over keyboard",
        "take over my screen",
        "take over my desktop",
        "take over my computer",
        "take over my mac",
        "take over my pc",
        "take over my laptop",
        "take over my apps",
        "move mouse",
        "move keyboard",
        "move my screen",
        "move my desktop",
        "move my computer",
        "move my mac",
        "move my pc",
        "move my laptop",
        "move my apps"
      ],
      "weak": [
        "mouse",
        "keyboard",
        "my screen",
        "my desktop",
        "my computer",
        "my mac",
        "my pc",
        "my laptop",
        "my apps"
      ],
      "shows": {
        "kind": "want",
        "row": "w_computer"
      }
    },
    {
      "id": "w_image",
      "subject": "pics",
      "title": "Make pictures",
      "text": "Hermes can make pictures from your words. That is a built-in tool, an action it can take. The picture service costs money.",
      "kw": [
        "image generation",
        "make image",
        "make images",
        "make picture",
        "make pictures",
        "make photo",
        "make photos",
        "make logo",
        "make logos",
        "make drawing",
        "make drawings",
        "make art",
        "make illustration",
        "make illustrations",
        "makes image",
        "makes images",
        "makes picture",
        "makes pictures",
        "makes photo",
        "makes photos",
        "makes logo",
        "makes logos",
        "makes drawing",
        "makes drawings",
        "makes art",
        "makes illustration",
        "makes illustrations",
        "create image",
        "create images",
        "create picture",
        "create pictures",
        "create photo",
        "create photos",
        "create logo",
        "create logos",
        "create drawing",
        "create drawings",
        "create art",
        "create illustration",
        "create illustrations",
        "creates image",
        "creates images",
        "creates picture",
        "creates pictures",
        "creates photo",
        "creates photos",
        "creates logo",
        "creates logos",
        "creates drawing",
        "creates drawings",
        "creates art",
        "creates illustration",
        "creates illustrations",
        "generate image",
        "generate images",
        "generate picture",
        "generate pictures",
        "generate photo",
        "generate photos",
        "generate logo",
        "generate logos",
        "generate drawing",
        "generate drawings",
        "generate art",
        "generate illustration",
        "generate illustrations",
        "generates image",
        "generates images",
        "generates picture",
        "generates pictures",
        "generates photo",
        "generates photos",
        "generates logo",
        "generates logos",
        "generates drawing",
        "generates drawings",
        "generates art",
        "generates illustration",
        "generates illustrations",
        "draw image",
        "draw images",
        "draw picture",
        "draw pictures",
        "draw photo",
        "draw photos",
        "draw logo",
        "draw logos",
        "draw drawing",
        "draw drawings",
        "draw art",
        "draw illustration",
        "draw illustrations",
        "draws image",
        "draws images",
        "draws picture",
        "draws pictures",
        "draws photo",
        "draws photos",
        "draws logo",
        "draws logos",
        "draws drawing",
        "draws drawings",
        "draws art",
        "draws illustration",
        "draws illustrations",
        "design image",
        "design images",
        "design picture",
        "design pictures",
        "design photo",
        "design photos",
        "design logo",
        "design logos",
        "design drawing",
        "design drawings",
        "design art",
        "design illustration",
        "design illustrations",
        "paint image",
        "paint images",
        "paint picture",
        "paint pictures",
        "paint photo",
        "paint photos",
        "paint logo",
        "paint logos",
        "paint drawing",
        "paint drawings",
        "paint art",
        "paint illustration",
        "paint illustrations"
      ],
      "weak": [
        "image",
        "images",
        "picture",
        "pictures",
        "photo",
        "photos",
        "logo",
        "logos",
        "drawing",
        "drawings",
        "art",
        "illustration",
        "illustrations"
      ],
      "shows": {
        "kind": "want",
        "row": "w_image"
      }
    },
    {
      "id": "w_see",
      "subject": "pics",
      "title": "Look at my pictures",
      "text": "Hermes can look at a picture you give it. This is built in. If your AI reads only text, another AI describes it.",
      "kw": [
        "look at image",
        "look at images",
        "look at picture",
        "look at pictures",
        "look at photo",
        "look at photos",
        "look at screenshot",
        "look at screenshots",
        "looks at image",
        "looks at images",
        "looks at picture",
        "looks at pictures",
        "looks at photo",
        "looks at photos",
        "looks at screenshot",
        "looks at screenshots",
        "see image",
        "see images",
        "see picture",
        "see pictures",
        "see photo",
        "see photos",
        "see screenshot",
        "see screenshots",
        "sees image",
        "sees images",
        "sees picture",
        "sees pictures",
        "sees photo",
        "sees photos",
        "sees screenshot",
        "sees screenshots",
        "describe image",
        "describe images",
        "describe picture",
        "describe pictures",
        "describe photo",
        "describe photos",
        "describe screenshot",
        "describe screenshots",
        "read image",
        "read images",
        "read picture",
        "read pictures",
        "read photo",
        "read photos",
        "read screenshot",
        "read screenshots",
        "reads image",
        "reads images",
        "reads picture",
        "reads pictures",
        "reads photo",
        "reads photos",
        "reads screenshot",
        "reads screenshots",
        "analyze image",
        "analyze images",
        "analyze picture",
        "analyze pictures",
        "analyze photo",
        "analyze photos",
        "analyze screenshot",
        "analyze screenshots",
        "analyse image",
        "analyse images",
        "analyse picture",
        "analyse pictures",
        "analyse photo",
        "analyse photos",
        "analyse screenshot",
        "analyse screenshots",
        "understand image",
        "understand images",
        "understand picture",
        "understand pictures",
        "understand photo",
        "understand photos",
        "understand screenshot",
        "understand screenshots",
        "explain image",
        "explain images",
        "explain picture",
        "explain pictures",
        "explain photo",
        "explain photos",
        "explain screenshot",
        "explain screenshots",
        "what is in image",
        "what is in images",
        "what is in picture",
        "what is in pictures",
        "what is in photo",
        "what is in photos",
        "what is in screenshot",
        "what is in screenshots",
        "what's in image",
        "what's in images",
        "what's in picture",
        "what's in pictures",
        "what's in photo",
        "what's in photos",
        "what's in screenshot",
        "what's in screenshots"
      ],
      "weak": [
        "image",
        "images",
        "picture",
        "pictures",
        "photo",
        "photos",
        "screenshot",
        "screenshots"
      ],
      "shows": {
        "kind": "want",
        "row": "w_see"
      }
    },
    {
      "id": "w_video",
      "subject": "pics",
      "title": "Make a video from text",
      "text": "Hermes can make a video from text or from a picture. That tool, an action it can take, is switched off at first.",
      "kw": [
        "text to video",
        "text-to-video",
        "video generation",
        "make video",
        "make videos",
        "make clip",
        "make clips",
        "makes video",
        "makes videos",
        "makes clip",
        "makes clips",
        "create video",
        "create videos",
        "create clip",
        "create clips",
        "creates video",
        "creates videos",
        "creates clip",
        "creates clips",
        "generate video",
        "generate videos",
        "generate clip",
        "generate clips",
        "generates video",
        "generates videos",
        "generates clip",
        "generates clips",
        "produce video",
        "produce videos",
        "produce clip",
        "produce clips"
      ],
      "weak": [
        "video",
        "videos",
        "clip",
        "clips"
      ],
      "shows": {
        "kind": "want",
        "row": "w_video"
      }
    },
    {
      "id": "w_anim",
      "subject": "pics",
      "title": "Make an animated explainer",
      "text": "Hermes comes with a skill called \"manim-video\". Its written steps teach Hermes to make animated maths videos.",
      "kw": [
        "make animation",
        "make animations",
        "make animated",
        "make explainer",
        "make explainers",
        "make manim",
        "makes animation",
        "makes animations",
        "makes animated",
        "makes explainer",
        "makes explainers",
        "makes manim",
        "create animation",
        "create animations",
        "create animated",
        "create explainer",
        "create explainers",
        "create manim",
        "creates animation",
        "creates animations",
        "creates animated",
        "creates explainer",
        "creates explainers",
        "creates manim",
        "generate animation",
        "generate animations",
        "generate animated",
        "generate explainer",
        "generate explainers",
        "generate manim",
        "produce animation",
        "produce animations",
        "produce animated",
        "produce explainer",
        "produce explainers",
        "produce manim",
        "video animation",
        "video animations",
        "video animated",
        "video explainer",
        "video explainers",
        "video manim",
        "videos animation",
        "videos animations",
        "videos animated",
        "videos explainer",
        "videos explainers",
        "videos manim"
      ],
      "weak": [
        "animation",
        "animations",
        "animated",
        "explainer",
        "explainers",
        "manim"
      ],
      "shows": {
        "kind": "want",
        "row": "w_anim"
      }
    },
    {
      "id": "w_presenter",
      "subject": "pics",
      "title": "Make a presenter video",
      "text": "There is an optional skill, \"ai-presenter-video\". You add it first. Its written steps teach Hermes to make a video of an AI presenter.",
      "kw": [
        "video presenter",
        "video talking head",
        "video avatar",
        "video spokesperson",
        "videos presenter",
        "videos talking head",
        "videos avatar",
        "videos spokesperson",
        "make presenter",
        "make talking head",
        "make avatar",
        "make spokesperson",
        "create presenter",
        "create talking head",
        "create avatar",
        "create spokesperson",
        "generate presenter",
        "generate talking head",
        "generate avatar",
        "generate spokesperson"
      ],
      "weak": [
        "presenter",
        "talking head",
        "avatar",
        "spokesperson"
      ],
      "shows": {
        "kind": "want",
        "row": "w_presenter"
      }
    },
    {
      "id": "w_youtube",
      "subject": "pics",
      "title": "Sum up a YouTube video",
      "text": "Hermes comes with a skill called \"youtube-content\". Its written steps teach Hermes to turn a YouTube video's words into a summary.",
      "kw": [
        "summarize youtube",
        "summarize yt video",
        "summarize yt videos",
        "summarise youtube",
        "summarise yt video",
        "summarise yt videos",
        "summary youtube",
        "summary yt video",
        "summary yt videos",
        "summaries youtube",
        "summaries yt video",
        "summaries yt videos",
        "sum up youtube",
        "sum up yt video",
        "sum up yt videos",
        "transcript youtube",
        "transcript yt video",
        "transcript yt videos",
        "transcripts youtube",
        "transcripts yt video",
        "transcripts yt videos",
        "notes youtube",
        "notes yt video",
        "notes yt videos",
        "tldr youtube",
        "tldr yt video",
        "tldr yt videos",
        "key points youtube",
        "key points yt video",
        "key points yt videos",
        "blog youtube",
        "blog yt video",
        "blog yt videos",
        "thread youtube",
        "thread yt video",
        "thread yt videos"
      ],
      "weak": [
        "youtube",
        "yt video",
        "yt videos"
      ],
      "shows": {
        "kind": "want",
        "row": "w_youtube"
      }
    },
    {
      "id": "w_meme",
      "subject": "pics",
      "title": "Make memes",
      "text": "There is an optional skill, \"meme-generation\". You add it first. Its written steps teach Hermes to put text on known meme pictures.",
      "kw": [
        "meme",
        "memes"
      ],
      "weak": [],
      "shows": {
        "kind": "want",
        "row": "w_meme"
      }
    },
    {
      "id": "w_voice",
      "subject": "voice",
      "title": "Talk to it out loud",
      "text": "You can talk to Hermes out loud and hear it answer. It is built in, and the docs call it Voice Mode.",
      "kw": [
        "voice mode",
        "by voice",
        "with my voice",
        "use my voice",
        "talk out loud",
        "speak out loud",
        "voice chat",
        "voice conversation",
        "voice conversations",
        "microphone",
        "talk to it out loud"
      ],
      "weak": [],
      "shows": {
        "kind": "want",
        "row": "w_voice"
      }
    },
    {
      "id": "w_aloud",
      "subject": "voice",
      "title": "Read answers out loud",
      "text": "Hermes can turn its answers into speech. This is built in, and the standard voice is free.",
      "kw": [
        "text to speech",
        "text-to-speech",
        "tts",
        "read aloud",
        "read it out",
        "voice message",
        "voice messages",
        "read aloud answers",
        "read aloud answer",
        "read aloud replies",
        "read aloud reply",
        "read aloud text",
        "read aloud messages",
        "read out answers",
        "read out answer",
        "read out replies",
        "read out reply",
        "read out text",
        "read out messages",
        "aloud answers",
        "aloud answer",
        "aloud replies",
        "aloud reply",
        "aloud text",
        "aloud messages",
        "spoken answers",
        "spoken answer",
        "spoken replies",
        "spoken reply",
        "spoken text",
        "spoken messages",
        "audio answers",
        "audio answer",
        "audio replies",
        "audio reply",
        "audio text",
        "audio messages"
      ],
      "weak": [
        "answers",
        "answer",
        "replies",
        "reply",
        "text",
        "messages"
      ],
      "shows": {
        "kind": "want",
        "row": "w_aloud"
      }
    },
    {
      "id": "w_stt",
      "subject": "voice",
      "title": "Turn voice notes into text",
      "text": "Hermes turns voice messages from Telegram or WhatsApp into text by itself. This is built in.",
      "kw": [
        "voice note",
        "voice notes",
        "voice memo",
        "voice memos",
        "transcribe",
        "transcription",
        "speech to text",
        "speech-to-text",
        "into text voice note",
        "into text voice notes",
        "into text voice message",
        "into text voice messages",
        "into text voice memo",
        "into text voice memos",
        "into text recording",
        "into text recordings",
        "into text audio",
        "to text voice note",
        "to text voice notes",
        "to text voice message",
        "to text voice messages",
        "to text voice memo",
        "to text voice memos",
        "to text recording",
        "to text recordings",
        "to text audio",
        "transcribe voice note",
        "transcribe voice notes",
        "transcribe voice message",
        "transcribe voice messages",
        "transcribe voice memo",
        "transcribe voice memos",
        "transcribe recording",
        "transcribe recordings",
        "transcribe audio",
        "transcribes voice note",
        "transcribes voice notes",
        "transcribes voice message",
        "transcribes voice messages",
        "transcribes voice memo",
        "transcribes voice memos",
        "transcribes recording",
        "transcribes recordings",
        "transcribes audio",
        "write out voice note",
        "write out voice notes",
        "write out voice message",
        "write out voice messages",
        "write out voice memo",
        "write out voice memos",
        "write out recording",
        "write out recordings",
        "write out audio",
        "type out voice note",
        "type out voice notes",
        "type out voice message",
        "type out voice messages",
        "type out voice memo",
        "type out voice memos",
        "type out recording",
        "type out recordings",
        "type out audio",
        "write down voice note",
        "write down voice notes",
        "write down voice message",
        "write down voice messages",
        "write down voice memo",
        "write down voice memos",
        "write down recording",
        "write down recordings",
        "write down audio"
      ],
      "weak": [
        "voice note",
        "voice notes",
        "voice message",
        "voice messages",
        "voice memo",
        "voice memos",
        "recording",
        "recordings",
        "audio"
      ],
      "shows": {
        "kind": "want",
        "row": "w_stt"
      }
    },
    {
      "id": "w_music",
      "subject": "voice",
      "title": "Write a song",
      "text": "Hermes comes with a skill called \"songwriting-and-ai-music\". Its written steps teach Hermes songwriting, and how to brief Suno, a music AI.",
      "kw": [
        "write song",
        "write songs",
        "write music",
        "write lyrics",
        "writes song",
        "writes songs",
        "writes music",
        "writes lyrics",
        "make song",
        "make songs",
        "make music",
        "make lyrics",
        "create song",
        "create songs",
        "create music",
        "create lyrics",
        "compose song",
        "compose songs",
        "compose music",
        "compose lyrics",
        "generate song",
        "generate songs",
        "generate music",
        "generate lyrics"
      ],
      "weak": [
        "song",
        "songs",
        "music",
        "lyrics"
      ],
      "shows": {
        "kind": "want",
        "row": "w_music"
      }
    },
    {
      "id": "w_papers",
      "subject": "web",
      "title": "Find research papers",
      "text": "Hermes comes with a skill called \"arxiv\". Its written steps teach Hermes to search research papers on arXiv.",
      "kw": [
        "find paper",
        "find papers",
        "find arxiv",
        "find studies",
        "search paper",
        "search papers",
        "search arxiv",
        "search studies",
        "look up paper",
        "look up papers",
        "look up arxiv",
        "look up studies",
        "read paper",
        "read papers",
        "read arxiv",
        "read studies",
        "summarize paper",
        "summarize papers",
        "summarize arxiv",
        "summarize studies",
        "summarise paper",
        "summarise papers",
        "summarise arxiv",
        "summarise studies",
        "check paper",
        "check papers",
        "check arxiv",
        "check studies"
      ],
      "weak": [
        "paper",
        "papers",
        "arxiv",
        "studies"
      ],
      "shows": {
        "kind": "want",
        "row": "w_papers"
      }
    },
    {
      "id": "w_maps",
      "subject": "web",
      "title": "Find places and routes",
      "text": "Hermes comes with a skill called \"maps\". Its written steps teach Hermes to find places, routes and time zones.",
      "kw": [
        "find map",
        "find maps",
        "find route",
        "find routes",
        "find directions",
        "find address",
        "find addresses",
        "find nearby",
        "find time zone",
        "find time zones",
        "get map",
        "get maps",
        "get route",
        "get routes",
        "get directions",
        "get address",
        "get addresses",
        "get nearby",
        "get time zone",
        "get time zones",
        "look up map",
        "look up maps",
        "look up route",
        "look up routes",
        "look up directions",
        "look up address",
        "look up addresses",
        "look up nearby",
        "look up time zone",
        "look up time zones",
        "plan map",
        "plan maps",
        "plan route",
        "plan routes",
        "plan directions",
        "plan address",
        "plan addresses",
        "plan nearby",
        "plan time zone",
        "plan time zones",
        "show map",
        "show maps",
        "show route",
        "show routes",
        "show directions",
        "show address",
        "show addresses",
        "show nearby",
        "show time zone",
        "show time zones",
        "search map",
        "search maps",
        "search route",
        "search routes",
        "search directions",
        "search address",
        "search addresses",
        "search nearby",
        "search time zone",
        "search time zones",
        "check map",
        "check maps",
        "check route",
        "check routes",
        "check directions",
        "check address",
        "check addresses",
        "check nearby",
        "check time zone",
        "check time zones",
        "how far map",
        "how far maps",
        "how far route",
        "how far routes",
        "how far directions",
        "how far address",
        "how far addresses",
        "how far nearby",
        "how far time zone",
        "how far time zones"
      ],
      "weak": [
        "map",
        "maps",
        "route",
        "routes",
        "directions",
        "address",
        "addresses",
        "nearby",
        "time zone",
        "time zones"
      ],
      "shows": {
        "kind": "want",
        "row": "w_maps"
      }
    },
    {
      "id": "w_stocks",
      "subject": "web",
      "title": "Check stock prices",
      "text": "There is an optional skill, \"stocks\". You add it first. Its written steps teach Hermes to look up stock and crypto prices.",
      "kw": [
        "check stock",
        "check stocks",
        "check shares",
        "check crypto",
        "check bitcoin",
        "look up stock",
        "look up stocks",
        "look up shares",
        "look up crypto",
        "look up bitcoin",
        "compare stock",
        "compare stocks",
        "compare shares",
        "compare crypto",
        "compare bitcoin",
        "follow stock",
        "follow stocks",
        "follow shares",
        "follow crypto",
        "follow bitcoin",
        "quote stock",
        "quote stocks",
        "quote shares",
        "quote crypto",
        "quote bitcoin",
        "quotes stock",
        "quotes stocks",
        "quotes shares",
        "quotes crypto",
        "quotes bitcoin",
        "price stock",
        "price stocks",
        "price shares",
        "price crypto",
        "price bitcoin",
        "prices stock",
        "prices stocks",
        "prices shares",
        "prices crypto",
        "prices bitcoin"
      ],
      "weak": [
        "stock",
        "stocks",
        "shares",
        "crypto",
        "bitcoin"
      ],
      "shows": {
        "kind": "want",
        "row": "w_stocks"
      }
    },
    {
      "id": "w_prices",
      "subject": "web",
      "title": "Watch a price for me",
      "text": "Hermes comes with a skill called \"product-price-monitor\". Its written steps teach Hermes to watch prices and alert you at your target.",
      "kw": [
        "watch price",
        "watch prices",
        "watch flight",
        "watch flights",
        "watch listing",
        "watch listings",
        "watch deal",
        "watch deals",
        "watches price",
        "watches prices",
        "watches flight",
        "watches flights",
        "watches listing",
        "watches listings",
        "watches deal",
        "watches deals",
        "track price",
        "track prices",
        "track flight",
        "track flights",
        "track listing",
        "track listings",
        "track deal",
        "track deals",
        "tracks price",
        "tracks prices",
        "tracks flight",
        "tracks flights",
        "tracks listing",
        "tracks listings",
        "tracks deal",
        "tracks deals",
        "monitor price",
        "monitor prices",
        "monitor flight",
        "monitor flights",
        "monitor listing",
        "monitor listings",
        "monitor deal",
        "monitor deals",
        "alert price",
        "alert prices",
        "alert flight",
        "alert flights",
        "alert listing",
        "alert listings",
        "alert deal",
        "alert deals",
        "alerts price",
        "alerts prices",
        "alerts flight",
        "alerts flights",
        "alerts listing",
        "alerts listings",
        "alerts deal",
        "alerts deals",
        "drops price",
        "drops prices",
        "drops flight",
        "drops flights",
        "drops listing",
        "drops listings",
        "drops deal",
        "drops deals",
        "tell me when price",
        "tell me when prices",
        "tell me when flight",
        "tell me when flights",
        "tell me when listing",
        "tell me when listings",
        "tell me when deal",
        "tell me when deals",
        "keep an eye price",
        "keep an eye prices",
        "keep an eye flight",
        "keep an eye flights",
        "keep an eye listing",
        "keep an eye listings",
        "keep an eye deal",
        "keep an eye deals"
      ],
      "weak": [
        "price",
        "prices",
        "flight",
        "flights",
        "listing",
        "listings",
        "deal",
        "deals"
      ],
      "shows": {
        "kind": "want",
        "row": "w_prices"
      }
    },
    {
      "id": "COST",
      "subject": "cost",
      "title": "What Hermes costs",
      "text": "Hermes itself is free. The AI it uses can cost money, depending on which one you choose.",
      "kw": [
        "cost",
        "costs",
        "price",
        "pay",
        "free",
        "money"
      ],
      "weak": [],
      "shows": {
        "kind": "COST"
      }
    },
    {
      "id": "WHERE",
      "subject": "cost",
      "title": "My computer or one that stays on",
      "text": "Both work. Hermes answers and runs jobs only while its computer is on. For any time, use a computer that stays on.",
      "kw": [
        "cloud",
        "server",
        "vps",
        "laptop",
        "always on",
        "24/7"
      ],
      "weak": [],
      "shows": {
        "kind": "WHERE"
      }
    },
    {
      "id": "CN1",
      "subject": "svc",
      "title": "Gmail and Google apps: Connectors",
      "text": "The Hermes app links apps such as Gmail through its \"Connectors\" page. Click \"Capabilities\", then the \"Connectors\" tab.",
      "kw": [
        "gmail",
        "google calendar",
        "google drive",
        "calendar",
        "drive"
      ],
      "weak": [],
      "shows": {
        "kind": "CN1"
      }
    },
    {
      "id": "msg0-then",
      "subject": "msg",
      "title": "",
      "text": "In the Hermes app, open Messaging and pick your chat app. For Telegram, press Create with QR.",
      "kw": [],
      "weak": [],
      "next_of": "msg0",
      "shows": {
        "kind": "extra",
        "line": "msg0-then"
      }
    },
    {
      "id": "msg1-then",
      "subject": "msg",
      "title": "",
      "text": "Scan the code with Telegram on your phone. Hermes makes the bot, lets only you in, and restarts by itself.",
      "kw": [],
      "weak": [],
      "next_of": "msg1",
      "shows": {
        "kind": "extra",
        "line": "msg1-then"
      }
    },
    {
      "id": "bot1-next",
      "subject": "bot",
      "title": "",
      "text": "Open \"Bots\", press \"+\", then \"New bot\". It asks for a name, a title and a description.",
      "kw": [],
      "weak": [],
      "next_of": "bot1",
      "shows": {
        "kind": "extra",
        "line": "bot1-next"
      }
    },
    {
      "id": "use-more",
      "subject": "use",
      "title": "",
      "text": "When a chat gets long, start a fresh one. Click \"New session\" at the top left.",
      "kw": [],
      "weak": [],
      "next_of": "use0",
      "shows": {
        "kind": "extra",
        "line": "use-more"
      }
    },
    {
      "id": "use1-next",
      "subject": "use",
      "title": "",
      "text": "In a Hermes chat, not here, type /usage and send it. It shows what each message carries, like the list of actions Hermes can take.",
      "kw": [],
      "weak": [],
      "next_of": "use1",
      "shows": {
        "kind": "extra",
        "line": "use1-next"
      }
    },
    {
      "id": "use1-next-mean",
      "subject": "use",
      "title": "",
      "text": "Open a chat with Hermes and type /usage as your message. Hermes answers with a list of what takes up room in that chat.",
      "kw": [],
      "weak": [],
      "next_of": "use1-next",
      "follow_only": true,
      "shows": {
        "kind": "extra",
        "line": "use1-next-mean"
      }
    },
    {
      "id": "use3-next",
      "subject": "use",
      "title": "",
      "text": "In a Hermes chat, not here, type /usage and send it. It shows what each message carries, like the list of actions Hermes can take.",
      "kw": [],
      "weak": [],
      "next_of": "use3",
      "shows": {
        "kind": "extra",
        "line": "use3-next"
      }
    },
    {
      "id": "use3-next-mean",
      "subject": "use",
      "title": "",
      "text": "Open a chat with Hermes and type /usage as your message. Hermes answers with a list of what takes up room in that chat.",
      "kw": [],
      "weak": [],
      "next_of": "use3-next",
      "follow_only": true,
      "shows": {
        "kind": "extra",
        "line": "use3-next-mean"
      }
    },
    {
      "id": "skill-mean",
      "subject": "words",
      "title": "",
      "text": "Think of a skill as a recipe. Hermes follows its steps when a task needs it.",
      "kw": [],
      "weak": [],
      "next_of": "skill",
      "follow_only": true,
      "shows": {
        "kind": "extra",
        "line": "skill-mean"
      }
    },
    {
      "id": "plugin-mean",
      "subject": "words",
      "title": "",
      "text": "It is like an app on your phone. You add it, and Hermes gets one more feature.",
      "kw": [],
      "weak": [],
      "next_of": "plugin",
      "follow_only": true,
      "shows": {
        "kind": "extra",
        "line": "plugin-mean"
      }
    }
  ],
  "stop_words": [
    "a",
    "an",
    "the",
    "i",
    "me",
    "my",
    "it",
    "is",
    "are",
    "to",
    "of",
    "for",
    "and",
    "or",
    "in",
    "on",
    "do",
    "does",
    "can",
    "could",
    "how",
    "what",
    "which",
    "who",
    "why",
    "when",
    "you",
    "your",
    "this",
    "that",
    "with",
    "be",
    "have",
    "has",
    "about",
    "so",
    "if",
    "at",
    "by",
    "from",
    "as",
    "not",
    "just",
    "get",
    "use",
    "using",
    "want",
    "will",
    "would",
    "there",
    "any",
    "its",
    "it's",
    "i'm"
  ],
  "max_handed": 5,
  "subjects": [
    {
      "id": "mem",
      "title": "Memory"
    },
    {
      "id": "mod",
      "title": "Choosing a model"
    },
    {
      "id": "msg",
      "title": "From a phone or chat app"
    },
    {
      "id": "sch",
      "title": "On a schedule"
    },
    {
      "id": "svc",
      "title": "A service you use"
    },
    {
      "id": "bot",
      "title": "More than one bot"
    },
    {
      "id": "use",
      "title": "Using less: fewer tokens, limits, slow answers"
    },
    {
      "id": "words",
      "title": "What a word means: tools, skills, plugins, MCP, SOUL.md, bots"
    },
    {
      "id": "web",
      "title": "Search and use the web"
    },
    {
      "id": "files",
      "title": "Files and my computer"
    },
    {
      "id": "pics",
      "title": "Pictures and video"
    },
    {
      "id": "voice",
      "title": "Voice and sound"
    },
    {
      "id": "cost",
      "title": "Cost, and which computer"
    },
    {
      "id": "talk",
      "title": "ordinary talk: hello, thanks, ok, a cut-off word, \"what do you mean\", \"and then?\" about the conversation so far"
    },
    {
      "id": "build",
      "title": "the person asks Helper to make, build, install, connect or do something for them"
    },
    {
      "id": "none",
      "title": "anything else, or a question about Hermes that none of the words above covers"
    }
  ],
  "input": {
    "text": "Conversation so far:\n{last_lines}\n\nThe person's newest message: {message}",
    "text_no_lines": "The person's newest message: {message}",
    "cut_at_chars": 1500,
    "temperature": 0.2,
    "work_line": "About them: {work}"
  },
  "first_call": {
    "text": "You sort messages for Helper, a part of the Hermes app that explains Hermes to newcomers.\nRead the person's newest message (and the conversation before it, if any). Reply with ONE word from this list and nothing else:\n{subjects: one per line, as id = title}",
    "max_tokens": 20
  },
  "writer": {
    "text": "You are Helper, inside the Hermes app. You help a newcomer understand Hermes, in plain words.\nReply to the person's newest message. Rules:\n1. Use only the checked facts below. Add nothing that is not in them: no other steps, commands, names, numbers, prices or screen names.\n2. Never say that Hermes cannot do something, does not have something or does not work, unless a fact below says so.\n3. If none of the facts answers the message, reply with only the word NONE.\n4. If the person asks you to make, build, install, connect or do something for them, reply with only the word BUILD.\n5. If the message is ordinary talk (hello, thanks, ok, a cut-off word), reply with one short friendly sentence. Add no fact.\n5b. End with a statement. Never end with \"ask me\", \"let me know\", \"feel free to ask\" or a question. Helper shows things to pick under your reply.\n6. If they ask what you meant, answer again from the facts in other words. If they ask what comes next, give the next step from the facts. If the facts do not say what comes next, say you have not checked that yet.\n7. Do not repeat Helper's last line. Say it in other words, unless the person asks you to say it again.\n8. At most two sentences and 40 words. At most one question. Do not use \"!\". Do not use the person's name. Never offer to do anything for them. Never test them.\n9. On the last line write USED: and the ids of the facts you used, or USED: none.\n10. Do not guess anything about the person: not their job, place, plans, team, customers or needs. Only their own messages and the line About them tell you about them. Use that line only to choose which facts fit best.\n{work_line}\nChecked facts:\n{rows: one per line, as [id] text; or (none)}",
    "max_tokens": 200
  },
  "pick_only": {
    "text": "You are Helper, inside the Hermes app. Choose which one of Helper's checked lines answers the person's newest message.\nReply with only one id from the list, or TALK if it is ordinary talk (hello, thanks, ok, a cut-off word), or BUILD if they ask Helper to make, install or do something, or NONE if no line answers it. Nothing else.\nIf they ask what comes next, choose the line that gives the next step.\n{work_line}\nIf a line About them is given, use it only to choose the line that fits them best.\n{rows: one per line, as [id] text; or (no lines)}",
    "max_tokens": 20
  },
  "checks": {
    "ok_caps": [
      "Hermes",
      "Helper",
      "I",
      "Hi",
      "Hello",
      "Yes",
      "No",
      "You",
      "It",
      "That",
      "This",
      "Sure",
      "Thanks",
      "Ok",
      "OK",
      "Sorry",
      "Glad",
      "What",
      "Which",
      "Any",
      "Feel",
      "Ask",
      "Happy",
      "Nice",
      "There",
      "Then",
      "First",
      "Just",
      "Let",
      "Welcome",
      "Great",
      "So",
      "In",
      "If",
      "For",
      "To",
      "The",
      "A",
      "Is",
      "Do",
      "Can",
      "Hermes's",
      "Of",
      "Not",
      "AI",
      "Hey"
    ],
    "not_words": {
      "cannot": [
        "can't",
        "cant",
        "cannot",
        "can not",
        "unable"
      ],
      "does_not": [
        "doesn't",
        "doesnt",
        "does not",
        "don't",
        "dont",
        "do not",
        "didn't",
        "did not"
      ],
      "is_not": [
        "isn't",
        "is not",
        "aren't",
        "are not",
        "won't",
        "will not"
      ],
      "no_have": [
        "no built-in",
        "not have",
        "has no",
        "have no",
        "there is no",
        "there are no"
      ],
      "not": [
        "not",
        "never"
      ]
    },
    "not_cut_first": [
      "not checked",
      "haven't checked",
      "have not checked",
      "don't have checked",
      "doesn't say",
      "does not say",
      "don't say",
      "do not say"
    ],
    "test_phrases": [
      "do you know",
      "what do you know",
      "have you heard",
      "can you tell me what",
      "do you understand",
      "can you guess",
      "try to remember"
    ],
    "money_cut_first": [
      "feel free",
      "free to ask"
    ],
    "money_words": [
      "free",
      "paid",
      "pay",
      "price",
      "prices",
      "cost",
      "costs",
      "cheap",
      "cheaper",
      "expensive",
      "subscription",
      "plan",
      "plans",
      "$",
      "€",
      "£",
      "dollar",
      "euro"
    ],
    "max_words": 40,
    "max_sentences": 2,
    "gloss": [
      {
        "term": "\\bmodels?\\b",
        "explained_by": "\\bAIs?\\b",
        "ignore_case": true
      },
      {
        "term": "\\bmemory\\b",
        "explained_by": "\\bnotes?\\b|\\bremembers?\\b",
        "ignore_case": true
      },
      {
        "term": "\\bskills?\\b",
        "explained_by": "\\bsteps\\b|\\bteach",
        "ignore_case": true
      },
      {
        "term": "\\btools?\\b",
        "explained_by": "\\bactions?\\b",
        "ignore_case": true
      },
      {
        "term": "\\bplugins?\\b",
        "explained_by": "\\badd-on",
        "ignore_case": true
      },
      {
        "term": "\\bMCP\\b",
        "explained_by": "\\bservices?\\b",
        "ignore_case": false
      },
      {
        "term": "\\bbots?\\b",
        "explained_by": "separate Hermes|\\b(?:its|their) own\\b",
        "ignore_case": true
      },
      {
        "term": "\\bkeys?\\b",
        "explained_by": "\\bsecret\\b",
        "ignore_case": true
      },
      {
        "term": "\\bsubscriptions?\\b",
        "explained_by": "\\bplan\\b",
        "ignore_case": true
      },
      {
        "term": "SOUL\\.md",
        "explained_by": "\\bfile\\b",
        "ignore_case": true
      },
      {
        "term": "\\btokens?\\b",
        "explained_by": "pieces? of (?:a )?words?|word[- ]?pieces?|(?:text|word) units?|units? of (?:text|words?)|(?:small|short|tiny) (?:pieces?|bits?|chunks?|parts?) of (?:text|a word|words)|bits? of text|chunks? of text",
        "ignore_case": true,
        "was_c6": "pieces of words|word pieces",
        "changed": "live changes-6: hhtech-ai-share section 4 point 1: \"small text units\" and \"a small piece of a word\" explain tokens and were refused."
      }
    ],
    "r9_pattern": "\\bI(?:'ll| will| can)?\\s+(?:set up|install|connect|build|create)\\b",
    "r6_pattern": "\\b(?:profiles?|providers?|gateways?|toolsets?|cron|sessions?|agents?|API|config\\w*|yaml|CLI|terminal|command line|OAuth|LLMs?|servers?|VPS|context|prompts?|webhooks?|endpoints?|backend|daemon|runtime)\\b",
    "r8_never": [
      "course",
      "tutor",
      "teacher",
      "academy",
      "chatbot",
      "assistant",
      "wizard",
      "guide",
      "lesson",
      "quiz"
    ],
    "r5_patterns": [
      "\\bmodels?\\b",
      "\\bmemory\\b",
      "\\bskills?\\b",
      "\\btools?\\b",
      "\\bplugins?\\b",
      "\\bMCP\\b",
      "\\bbots?\\b",
      "\\bkeys?\\b",
      "\\bsubscriptions?\\b",
      "SOUL\\.md",
      "\\btokens?\\b"
    ],
    "skills": [
      "apple-notes",
      "apple-reminders",
      "findmy",
      "imessage",
      "claude-code",
      "codex",
      "computer-use",
      "hermes-agent",
      "architecture-diagram",
      "ascii-video",
      "baoyu-infographic",
      "claude-design",
      "humanizer",
      "manim-video",
      "p5js",
      "popular-web-designs",
      "songwriting-and-ai-music",
      "sdlc-review",
      "email-inbox-triage",
      "himalaya",
      "youtube-content",
      "obsidian",
      "document-to-action-items",
      "google-workspace",
      "maps",
      "meeting-action-items",
      "microsoft-office",
      "product-price-monitor",
      "teams-meeting-pipeline",
      "weekly-review-planning",
      "arxiv",
      "competitor-news-monitor",
      "grounded-citations",
      "xurl",
      "codebase-inspection",
      "dogfood",
      "github",
      "requesting-code-review",
      "simplify-code",
      "spike",
      "systematic-debugging",
      "test-driven-development",
      "blocked-page-recovery",
      "agent-merge-conflict-arbiter",
      "antigravity-cli",
      "blackbox",
      "dynamic-workflow",
      "grok",
      "opencode",
      "openhands",
      "hyperliquid",
      "solana",
      "one-three-one-rule",
      "ai-presenter-video",
      "anatomy",
      "archify",
      "ascii-art",
      "auteur",
      "baoyu-article-illustrator",
      "baoyu-comic",
      "brag",
      "brag-slim",
      "comfyui",
      "concept-diagrams",
      "creative-ideation",
      "design-md",
      "draw-your-font",
      "dream-loop",
      "excalidraw",
      "heartmula",
      "hyperframes",
      "impeccable",
      "ip-as-logo",
      "kanban-video-orchestrator",
      "meme-generation",
      "mono-color",
      "pixel-art",
      "pretext",
      "simple-english",
      "sketch",
      "social-media-content-calendar",
      "system-atlas",
      "tldraw-offline",
      "unreal-mcp",
      "jupyter-notebook",
      "actual-setup",
      "docker-management",
      "hermes-s6-container-supervision",
      "inference-sh-cli",
      "pinggy-tunnel",
      "setup-wizard-generator",
      "watchers",
      "adversarial-ux-test",
      "agentmail",
      "3-statement-model",
      "comps-analysis",
      "dcf-model",
      "excel-author",
      "lbo-model",
      "merger-model",
      "polymarket",
      "pptx-author",
      "stocks",
      "minecraft-modpack-server",
      "pokemon-player",
      "fitness-nutrition",
      "neuroskill-bci",
      "fastmcp",
      "mcp-oauth-remote-gateway",
      "mcporter",
      "gif-search",
      "songsee",
      "accelerate",
      "axolotl",
      "chroma",
      "dspy",
      "evaluating-llms-harness",
      "faiss",
      "flash-attention",
      "lambda-labs",
      "llama-cpp",
      "modal",
      "nemo-curator",
      "obliteratus",
      "peft",
      "pytorch-fsdp",
      "pytorch-lightning",
      "saelens",
      "segment-anything-model",
      "serving-llms-vllm",
      "simpo",
      "slime",
      "tensorrt-llm",
      "torchtitan",
      "unsloth",
      "stripe-link-cli",
      "stripe-projects",
      "canvas",
      "decision-questionnaire",
      "here-now",
      "live-dashboard",
      "memento-flashcards",
      "property-listings",
      "shop",
      "siyuan",
      "telephony",
      "bioinformatics",
      "blogwatcher",
      "darwinian-evolver",
      "domain-intel",
      "drug-discovery",
      "gitnexus-explorer",
      "llm-wiki",
      "osint-investigation",
      "parallel-cli",
      "research-paper-writing",
      "rss-feeds",
      "scrapling",
      "1password",
      "godmode",
      "oss-forensics",
      "sherlock",
      "unbroker",
      "web-pentest",
      "openhue",
      "reddit-reading",
      "ast-grep",
      "code-wiki",
      "grill-me",
      "hermes-agent-skill-authoring",
      "inspecting-hermes-desktop-dom",
      "node-inspect-debugger",
      "pr-lens",
      "python-debugpy",
      "rest-graphql-debug",
      "subagent-driven-development",
      "cloudflare-temporary-deploy",
      "har-derived-api-client",
      "page-agent",
      "publish-site",
      "scrollcraft",
      "yuanbao"
    ],
    "c24": {
      "person_pattern": "\\b(?:you are|you're|youre|you work|you run|you own|you teach|you study|you manage|you coach|you sell|you have|you've got|as an?|being an?|for your|with your|at your|in your|your)\\s+",
      "person_ok": [
        "welcome",
        "right",
        "new",
        "here",
        "sure",
        "ready",
        "able",
        "asking",
        "looking",
        "trying",
        "own",
        "hermes",
        "bot",
        "bots",
        "computer",
        "phone",
        "messages",
        "message",
        "question",
        "questions",
        "chats",
        "chat",
        "notes",
        "files",
        "first",
        "next",
        "setup",
        "model",
        "settings",
        "screen",
        "laptop",
        "browser",
        "time",
        "way",
        "choice",
        "free",
        "glad",
        "happy",
        "very",
        "all",
        "set",
        "the",
        "one"
      ]
    },
    "c26": [
      "the person",
      "checked facts",
      "USED",
      "about them:",
      "what the person does",
      "the rows",
      "the facts given",
      "my notes"
    ],
    "c27": [
      {
        "id": "money",
        "asks": [
          "pay",
          "paid",
          "paying",
          "cost",
          "costs",
          "price",
          "money",
          "free",
          "subscription",
          "expensive",
          "cheap",
          "charge"
        ],
        "gives": [
          "pay",
          "paid",
          "free",
          "cost",
          "costs",
          "price",
          "money",
          "charge",
          "subscription",
          "nothing extra"
        ]
      },
      {
        "id": "choice",
        "asks": [
          "best",
          "which",
          "pick",
          "choose",
          "recommend",
          "should i use",
          "what should i"
        ],
        "gives": [
          "pick",
          "choose",
          "start",
          "try",
          "use",
          "recommend",
          "best",
          "if you",
          "free",
          "paid",
          "plan",
          "open",
          "not checked",
          "haven't checked",
          "do not say",
          "don't say"
        ]
      },
      {
        "id": "next",
        "asks_whole": [
          "then",
          "and then",
          "then what",
          "what then",
          "what next",
          "what's next",
          "whats next",
          "next",
          "and next",
          "what now",
          "now what"
        ],
        "gives": [
          "then",
          "next",
          "after",
          "open",
          "click",
          "press",
          "paste",
          "copy",
          "type",
          "send",
          "add",
          "choose",
          "pick",
          "scan",
          "not checked",
          "haven't checked",
          "do not say",
          "don't say"
        ]
      }
    ],
    "c16_allow": {
      "words": [
        "guide",
        "guides"
      ],
      "speaks_of_helper": "\\b(?:I|I'm|me|my|Helper|Helper's)\\b|\\byour guides?\\b"
    },
    "c28": [
      "ask me",
      "let me know",
      "feel free to ask",
      "feel free to",
      "just ask",
      "any questions",
      "any other questions",
      "anything else",
      "happy to help",
      "here to help"
    ],
    "c29": {
      "skip": [
        "run",
        "runs",
        "work",
        "works",
        "own",
        "teach",
        "study",
        "manage",
        "coach",
        "sell",
        "have",
        "small",
        "big",
        "local"
      ],
      "step_words": [
        "then",
        "next",
        "after",
        "first",
        "now",
        "step",
        "steps",
        "start",
        "open",
        "press",
        "click",
        "type",
        "paste",
        "scan",
        "go"
      ],
      "lead_ins": [
        "your",
        "about",
        "for",
        "like"
      ]
    }
  },
  "no_reply": {
    "starts": [
      "Thinking Process",
      "Thinking process:",
      "Thought process",
      "<think>"
    ],
    "holds": [
      "**Analyze",
      "**Analysis",
      "**Task:**",
      "**Request:**"
    ]
  },
  "slow_ai": {
    "id": "SLOW_A",
    "text": "Your AI took too long to answer, so I answered from my own notes. To make it quicker for me, paste this into a new chat with your Hermes.",
    "paste_text": "Please add this to my config.yaml, under auxiliary: a block helping_hand: with reasoning_effort: \"none\". It switches thinking off only for Helper's short calls, not for my own chats. Show me the change before you save it."
  },
  "lines_by_mode": {
    "are_you_an_ai": {
      "no_ai_step": "AI",
      "ai_picks_line": "AI_PICK",
      "ai_writes": "AI_WRITES"
    },
    "first_time_grey": {
      "no_ai_step": "I keep this in the Hermes app on this computer. Nothing you type to me goes to any AI or anyone. Never tell me passwords.",
      "ai_picks_line": "I keep this in the Hermes app on this computer. Your messages can go to your AI, but not your name. Never tell me passwords.",
      "ai_writes": "I keep this in the Hermes app on this computer. Your messages can go to your AI, but not your name. Never tell me passwords."
    },
    "settings_top_line_2": {
      "no_ai_step": null,
      "ai_picks_line": "These go to your AI: What you do, New to Hermes, What you want. Only when Helper asks it for help.",
      "ai_writes": "These go to your AI: What you do, New to Hermes, What you want. Only when Helper asks it for help."
    },
    "settings_top_line_2_work_only": {
      "no_ai_step": null,
      "ai_picks_line": "Only What you do goes to your AI. Only when Helper asks it for help.",
      "ai_writes": "Only What you do goes to your AI. Only when Helper asks it for help."
    },
    "work_told": {
      "no_ai_step": null,
      "ai_picks_line": "I also tell your AI what you do when I ask it for help.",
      "ai_writes": "I also tell your AI what you do when I ask it for help."
    },
    "setup_told": {
      "no_ai_step": null,
      "ai_picks_line": "Your AI also gets what you do, what you want and if you're new. It gets them only when I ask it for help.",
      "ai_writes": "Your AI also gets what you do, what you want and if you're new. It gets them only when I ask it for help."
    }
  }
}

// ---- src/key-check.js ----
// What the person typed, checked by code before anything goes to a model (build-v1.md section 7;
// content/v1-strings.md part 4, K1; docs/answers/hhtech-v1-strings-check.md point 2).
// Order matters: 1) pasted key, on the FULL text; 2) build words, on the full text; 3) the
// 500-character cut. A key that starts at character 491 is caught on the full text and missed
// after the cut (hhtech, ran), so the key check must come first.

// hhcontent's key shapes (content/helper-talk-v2.json key_patterns, changes-10: one list, read
// the same by route2.py and settings_read.py), exactly. A match on any one counts as a key. No
// flags: case matters.
const KEY_PATTERNS = TALK_DATA.key_patterns.map(p => new RegExp(p))

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

// ---- src/secret-rule.js ----
// Does a text look like it holds a secret? hhcontent's changes-12 rule (with changes-13's data lines), ported
// rule for rule from dev/checks/hhcontent-talk-v2/secret_rule.py (looks_secret), fixed rules, no model. The
// lists come from the talk data (keeps.remember.refuse; the rule in plain words: refuse.rule_12).
// Used by "remember that ..." (src/talk.js, after the K1 check, before the "too long" check) and by every line
// of the settings box (src/settings-file.js: the whole line and the part after its first colon). Names keep
// the old word list (refuse.words), not this rule.
// tests/secret-rule.test.mjs puts refuse_tests.py's cases, three sets of made-up secrets and a few thousand
// random strings to both and compares each result.
//   looksSecret(text)  null (not a secret by these rules) or the Python's reason, such as "secret word and a value"
// Python's idea of a letter is \p{L} here, of a digit \p{N} (Lead: "a letter and a digit must be \p{L} and \p{N}");
// Python's str.isdigit() differs on a few signs that are numbers but not digits (½, Ⅳ): the port counts them,
// the Python does not (a test lists it).
// The build joins every src file into one scope, so every name here starts with SR_ or sr.

const SR_RF = TALK_DATA.keeps.remember.refuse
const SR_V = SR_RF.value
const SR_WR = SR_RF.word_run

// Python's whitespace (str.split, str.strip, \s on text): JavaScript's \s without U+FEFF, with U+001C to U+001F
// and U+0085.
const SR_WS = '\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const SR_WS_RUN = new RegExp(`[${SR_WS}]+`, 'gu')
const SR_WS_EDGE = new RegExp(`^[${SR_WS}]+|[${SR_WS}]+$`, 'gu')
const srSplit = s => s.split(SR_WS_RUN).filter(Boolean)
const srStrip = s => s.replace(SR_WS_EDGE, '')

// A pattern from the data, written for Python's re, as a JavaScript RegExp with the u flag: \d is any decimal
// digit and \s Python's whitespace, as in Python on text. Exported for the tests (every pattern must compile).
function pyRegExp(pattern, flags = '') {
  let out = ''
  let inClass = false
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\') {
      const n = pattern[++i]
      if (n === 'd') out += '\\p{Nd}'
      else if (n === 's') out += inClass ? SR_WS : `[${SR_WS}]`
      else out += '\\' + n
    } else {
      if (c === '[' && !inClass) inClass = true
      else if (c === ']' && inClass) inClass = false
      out += c
    }
  }
  return new RegExp(out, 'u' + flags)
}

const srEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const srChars = s => Array.from(s)
// Strips any of the signs in `set` from both ends (Python's str.strip(set)).
function srStripSet(s, set) {
  const a = srChars(s)
  let i = 0
  let j = a.length
  while (i < j && set.includes(a[i])) i++
  while (j > i && set.includes(a[j - 1])) j--
  return a.slice(i, j).join('')
}

// taken off both ends of a token before it is compared with a word (step 2)
const SR_EDGE = '"\'()[]{},.;!?'
const srLow = s => srStrip(s.toLowerCase().replace(/\u2018/g, "'").replace(/\u2019/g, "'").replace(SR_WS_RUN, ' '))
// step 2: ':' followed by a space (or the end) and '=' become tokens of their own
const SR_COLON = new RegExp(`:(?=[${SR_WS}]|$)`, 'gu')
const srTokens = s => srSplit(s.replace(SR_COLON, ' : ').split('=').join(' = '))
const srBare = tok => srStripSet(tok, SR_EDGE).toLowerCase()

// one letter added, missing, changed, or two neighbours swapped
function srOneOff(x, y) {
  if (x === y) return true
  let a = srChars(x)
  let b = srChars(y)
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const d = []
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d.push(i)
    return d.length === 1 || (d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]])
  }
  if (a.length > b.length) [a, b] = [b, a]
  const short = a.join('')
  for (let i = 0; i < b.length; i++) if (b.slice(0, i).concat(b.slice(i + 1)).join('') === short) return true
  return false
}

const SR_NOT_VALUES = SR_V.not_values.map(p => pyRegExp(p))
const SR_LETTER = /\p{L}/u
const SR_DIGIT = /\p{N}/u
// step 3: a value is one run with no spaces that has enough digits, or letters with digits, or a sign
function srIsValue(tok) {
  const t = srStripSet(tok, '"\'(),.;')
  const a = srChars(t)
  if (a.length < SR_V.min_chars) return false
  if (SR_NOT_VALUES.some(re => re.test(t))) return false
  const digits = a.filter(c => SR_DIGIT.test(c)).length
  const letters = a.filter(c => SR_LETTER.test(c)).length
  return (
    digits >= SR_V.digits_alone ||
    (letters > 0 && digits >= SR_V.digits_with_letters && a.length >= SR_V.min_chars_with_letters) ||
    (a.some(c => SR_V.signs.includes(c)) && (letters > 0 || digits > 0))
  )
}

// positions just after each whole-word match of any of the words (multi-word words too)
function srFind(words, toks) {
  const b = toks.map(srBare)
  const out = []
  for (const w of words) {
    const ws = srSplit(w)
    const k = ws.length
    for (let i = 0; i < b.length - k + 1; i++) if (ws.every((x, n) => b[i + n] === x)) out.push(i + k)
  }
  return out
}
const srFindTypo = toks => toks.flatMap((t, i) => (srChars(srBare(t)).length >= SR_RF.typo_min_letters && SR_RF.typo_words.some(w => srOneOff(srBare(t), w)) ? [i + 1] : []))

const SR_DIGITS_RUN = pyRegExp(SR_RF.digits_pattern)
const SR_PHRASES = SR_RF.not_secret_phrases.map(p => new RegExp('(?<![a-z0-9])' + srEscape(p) + '(?![a-z0-9])', 'gu'))
const SR_WORD = pyRegExp(`^(?:${SR_WR.word})$`)
const SR_LINKS = new Set([...SR_RF.link_words, ':', '='])

function looksSecret(text) {
  if (KEY_PATTERNS.some(re => re.test(text))) return 'key pattern'
  if (SR_DIGITS_RUN.test(text)) return 'long number'
  let t = ' ' + srLow(text) + ' '
  for (const re of SR_PHRASES) t = t.replace(re, ' ~ ') // step 1
  const toksCut = srTokens(t)
  const toks = srTokens(text)
  const hasValue = toks.some(srIsValue)
  const strong = srFind(SR_RF.secret_words, toksCut).concat(srFindTypo(toksCut))
  if (strong.length && hasValue) return 'secret word and a value' // step 4
  // step 5: a secret word, then within a few words 'is' or ':' and something that is not a description
  for (const end of strong) {
    for (let j = end; j < Math.min(end + SR_RF.link_within + 1, toksCut.length); j++) {
      if (SR_LINKS.has(srBare(toksCut[j])) || toksCut[j] === ':' || toksCut[j] === '=') {
        if (j + 1 < toksCut.length && !SR_RF.after_link_not_value.includes(srBare(toksCut[j + 1]))) return 'secret word, is, and a word'
        break
      }
    }
  }
  if (srFind(SR_RF.maybe_words, toksCut).length && hasValue) return 'maybe word and a value' // step 6
  // step 7: a short label, 'is' or ':', one value at the end
  for (let j = 1; j <= Math.min(SR_RF.shape.max_label_words, toks.length - 1); j++) {
    if ((toks[j] === ':' || toks[j] === '=' || SR_RF.link_words.includes(srBare(toks[j]))) && j === toks.length - 2 && srIsValue(toks[toks.length - 1])) return 'label, is, and a value'
  }
  // step 8: many plain words in a row (recovery words)
  let run = 0
  for (const x of toks) {
    const x2 = srStripSet(x, ',.;')
    if (SR_WORD.test(x2) && !SR_WR.not_these.includes(x2.toLowerCase())) {
      run += 1
      if (run >= SR_WR.min_words) return 'many plain words in a row'
    } else run = 0
  }
  return null
}

// ---- src/state.js ----
// What the page keeps in ctx.storage on the person's computer.
// Keys the page reads back: tab (dashboard | learn | my_setup), helperWidth (the width Helper's window was dragged
// to, 360 to 600 px). Anything unexpected in storage falls back to the default.
// dash-v1: the first build's tabs (Setup, Your setup) left the page; their keys step, answers and remember are no
// longer read or written by the page (their parked files, src/steps.js and src/setup-tab.js, still name them).
// About the person, only the record of what Helper keeps (talk v2 row 3): never what they do, never the
// conversation, nothing about their bots (the Dashboard reads Hermes each time it opens). STORED_KEYS is every key
// the plugin may write; tests/state.test.mjs reads every storage call in src/ and fails on a key outside it.

// 'kept' is the one record of what Helper keeps about the person, by fixed rules (src/kept.js).
// 'met' (changes-14, keeps.met): true once Helper has said hello, so the name is asked only on the first
// visit; nothing about the person, and no Forget removes it (src/page.js).
const STORED_KEYS = ['tab', 'helperWidth', 'kept', 'met']
// dash-v1: the three tabs, Dashboard first (only it is built)
const TAB_IDS = ['dashboard', 'learn', 'my_setup']

function readState(get) {
  const tab = get('tab', TAB_IDS[0])
  return {
    tab: TAB_IDS.includes(tab) ? tab : TAB_IDS[0],
    helperWidth: clampHelperWidth(get('helperWidth', HELPER_PX))
  }
}

// ---- src/kept.js ----
// The one stored record of what Helper keeps about the person (JSON keeps.storage), under the
// storage key 'kept': { name, work, mod, msg, svc, asked: [...], told, told_work } (live-v2 changes-4: work, what the
// person does, and told_work, the line that the AI is told it was shown). Every field is optional.
// cleanKept() is how it is read back: anything unexpected is dropped, so a record edited by hand
// or written by an older build can never put something into Helper's lines that the rules would
// not keep. The page and the settings page do the reading and writing with their own storage
// calls (tests/state.test.mjs lists them); nothing here touches storage.

const KEPT_DATA = TALK_DATA.keeps
const KEPT_MODS = KEPT_DATA.answers.mod.values.map(v => v.need)
const KEPT_APPS = new Set(Object.values(KEPT_DATA.answers.msg.names))
// A service is kept from the services named in keeps.answers, or from a picked answer's own service.
const KEPT_SERVICES = new Set([...Object.values(KEPT_DATA.answers.svc.names), ...TALK_DATA.topics.flatMap(t => t.question.answers.map(a => a.service).filter(Boolean))])
const KEPT_LIM = KEPT_DATA.remember.limits
const KEPT_NAME_MAX = 30
// live-v2 changes-4 (keeps.work.limits): what the person does, as kept: 1 to 12 words, at most 80 characters, no
// question mark, no key, and (unless the caller checked it already) nothing that looks secret. The same rule for the
// keep in the conversation, the stored record, the settings page and the guard before it is sent (input.work_line).
const KEPT_WORK = KEPT_DATA.work.limits
const workSqueeze = s => String(s).replace(/\s+/g, ' ').trim()
function workOk(v, { withSecretRule = true } = {}) {
  if (typeof v !== 'string' || !v.trim()) return false
  const words = v.trim().split(/\s+/).length
  if (words < KEPT_WORK.min_words || words > KEPT_WORK.max_words || Array.from(v).length > KEPT_WORK.max_chars) return false
  if (v.includes('?') || looksLikeKey(v)) return false
  return !withSecretRule || !looksSecret(v)
}
const keptPlain = (v, max) => typeof v === 'string' && v.trim() !== '' && Array.from(v).length <= max && !looksLikeKey(v)

const KEPT_SETUP_NEW = SETUP_DATA.questions.Q_NEW.answers.filter(a => a.kept_as).map(a => a.id)
const KEPT_SETUP_GOALS = SETUP_DATA.questions.Q_GOAL.answers.map(a => a.id)
const KEPT_SETUP_ITEMS = SETUP_DATA.rule_order

function cleanKept(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out = {}
  if (keptPlain(v.name, KEPT_NAME_MAX)) out.name = v.name
  if (workOk(v.work)) out.work = v.work
  if (KEPT_MODS.includes(v.mod)) out.mod = v.mod
  if (KEPT_APPS.has(v.msg)) out.msg = v.msg
  if (KEPT_SERVICES.has(v.svc)) out.svc = v.svc
  if (Array.isArray(v.asked)) {
    const asked = v.asked.filter(t => keptPlain(t, KEPT_LIM.max_chars)).slice(0, KEPT_LIM.max_things)
    if (asked.length) out.asked = asked
  }
  // setup-chat (content/helper-setup-chat-v1.json keeps.rows): the Q_NEW answer, what the person wants (a picked label
  // or a typed text that passes the What you do rule) with its goal, the things said done, the thing recommended last
  if (KEPT_SETUP_NEW.includes(v.setup_new)) out.setup_new = v.setup_new
  if (KEPT_SETUP_GOALS.includes(v.setup_goal_id) && workOk(v.setup_goal)) {
    out.setup_goal = v.setup_goal
    out.setup_goal_id = v.setup_goal_id
  }
  if (Array.isArray(v.setup_done_said)) {
    const said = [...new Set(v.setup_done_said.filter(x => KEPT_SETUP_ITEMS.includes(x)))]
    if (said.length) out.setup_done_said = said
  }
  if (KEPT_SETUP_ITEMS.includes(v.setup_current) || v.setup_current === 'model') out.setup_current = v.setup_current
  if (Object.keys(out).length && v.told === true) out.told = true
  if ((out.work || out.setup_new || out.setup_goal) && v.told_work === true) out.told_work = true
  return out
}

const hasKept = kept => ['name', 'work', 'mod', 'msg', 'svc', 'setup_new', 'setup_goal', 'setup_current'].some(k => kept[k]) || (kept.asked || []).length > 0 || (kept.setup_done_said || []).length > 0

// What goes to storage: the cleaned record, or null when nothing is left (then the key is removed,
// told with it, as "Forget all" does).
function keptToStore(kept) {
  const clean = cleanKept(kept)
  return hasKept(clean) ? clean : null
}

// ---- src/talk.js ----
// How Helper answers, as plain code: hhcontent's order of steps (content/helper-talk-v2.md
// section 2.1, changes-7 and changes-8) ported from the team's route2.py, reading hhcontent's data
// (src/talk-data.js, made by the build from content/helper-talk-v2.json). No React, no storage of
// its own, and no AI step: nothing here sends anything anywhere.
// tests/talk.test.mjs replays every conversation route2.py itself ran and must get the same result
// at every turn, the stored record included.
//   freshVisit(stage, kept, met)  what Helper knows in this visit: the stage of the opening, the
//                                 open question, what was asked and found, the name and what the
//                                 person does, `kept`, the stored record (written by the page,
//                                 src/kept.js), and `met`, whether Helper has said hello before (changes-14).
//   turn(text, visit)             a typed message -> a result { kind, ... }
//   pick, pickTopic, press, skip, sayLine, change, rmPick, forgetAnswer   what the person picks or presses
//   lineFor(result, visit, typed, opts)   the result as the line Helper says, its answers, its button
//                                 and the small faint lines under it
// What is kept follows hhcontent's fixed rules (JSON keeps, content/helper-keeps-v1.md): no model
// and no question decides it. Typed "what do you know about me", "forget my name" and "forget
// everything" (keeps.typed, A1, A2, A4) are not in route2.py; they are ported from hhtech's
// settings_step and hhcontent's changes-8 rule, and come straight after the remember step.

const TOPICS = Object.fromEntries(TALK_DATA.topics.map(t => [t.id, t]))
const TOPIC_IDS = TALK_DATA.topics.map(t => t.id)
const TERMS = Object.fromEntries(TALK_DATA.terms.map(t => [t.id, t]))
const TERM_IDS = TALK_DATA.terms.map(t => t.id)
const BUILD = TALK_DATA.build
const OPENING = TALK_DATA.opening
const FIXED = TALK_DATA.fixed
const KEEPS = TALK_DATA.keeps
const KEEP_REMEMBER = KEEPS.remember
const KEEP_TYPED = KEEPS.typed
const TOPIC_ASKS = TALK_DATA.asks_for_topics
const TOPIC_PICKS = Object.fromEntries(TALK_DATA.topic_picks.map(p => [p.gives, p]))
const SKILL_NAMES = new Map(TALK_DATA.skills.map(s => [s.name, s]))
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
// changes-16/17 (JSON lonely_words, route2.py lonely_ok): a listed key word counts only with one of its
// needs_one_of phrases in the message (when it has that list) and none of its not_with words. Every key-word
// list goes through it (topics, needs, weak words, the wants rows); the typed answers to Helper's own service
// question use hits(), as route2.py's hit(), and are not affected.
const LONELY = TALK_DATA.lonely_words || {}
function lonelyOk(t, p) {
  const r = LONELY[p]
  if (!r) return true
  return (!r.needs_one_of || r.needs_one_of.some(q => hits(t, q))) && !(r.not_with || []).some(q => hits(t, q))
}
const whichOf = (t, list) => list.filter(p => hits(t, p) && lonelyOk(t, p))
// A start counts when it is the whole message, or the next character is not a to z, 0 to 9 or '.
const startsWith = (t, list) => list.some(p => t === p || (t.startsWith(p) && /[^a-z0-9']/.test(t[p.length])))
function cutIgnored(t) {
  for (const p of TALK_DATA.ignore_phrases) t = t.replace(wordRe(p, 'g'), '$1 $2')
  return talkNorm(t)
}
// Python's str.split() and len(): words split on any space, length in characters (not UTF-16 units).
const typedWords = s => String(s).trim().split(/\s+/).filter(Boolean)
const charCount = s => Array.from(s).length
const capFirst = s => {
  const chars = Array.from(s)
  return chars.length ? chars[0].toUpperCase() + chars.slice(1).join('') : s
}

// The request step: null, the words that make it a request (H1), or { h2: words } for a question whether
// Hermes can build something (changes-16, H2).
function buildHit(text) {
  const t = cutIgnored(talkNorm(text)) // the ignore phrases are cut before this step too
  if (startsWith(t, BUILD.skip_starts) || whichOf(t, BUILD.how_phrases).length) return null // a question about how is never a request
  // changes-16 (build.build_question_rule): "can it build ...?" is a question about Hermes
  const q = whichOf(t, BUILD.build_question_words)
  if (startsWith(t, BUILD.make_not_when_starts) && q.length) return { h2: q[0] }
  const w = whichOf(t, BUILD.build_words)
  if (w.length) return w[0]
  const pair = BUILD.build_pair
  const doing = whichOf(t, pair.and_one_of)
  if (hits(t, pair.must_have) && doing.length) return pair.must_have + ' + ' + doing[0]
  // changes-15 (build.make_words): make me ..., can you make ..., unless the next words are on
  // make_not_followed_by, or the message starts as a question about Hermes
  if (!startsWith(t, BUILD.make_not_when_starts)) {
    for (const m of BUILD.make_words) {
      const re = wordRe(m, 'g')
      re.lastIndex = 0
      let x
      while ((x = re.exec(t))) {
        // the match ends after the character that follows the words (as route2.py's m.end())
        const rest = t.slice(x.index + x[0].length).replace(/^[ ,]+/, '')
        if (rest && !startsWith(rest, BUILD.make_not_followed_by)) return m
      }
    }
  }
  return softwareHit(t) // changes-17
}
// changes-17 (build.software_rule): lead-ins cut again and again, then a software verb as the first word and a
// software thing (one or two words) after at most software_between_max words, none of them on software_between_not.
function softwareHit(t) {
  const leads = [...BUILD.software_lead_ins].sort((a, b) => b.length - a.length)
  let again = true
  while (again) {
    again = false
    for (const p of leads) {
      if (t !== p && startsWith(t, [p])) {
        t = t.slice(p.length).replace(/^[ ,]+/, '')
        again = true
      }
    }
  }
  const ws = t.match(/[a-z0-9'-]+/g) || []
  const max = BUILD.software_between_max
  if (!ws.length || !BUILD.software_verbs.includes(ws[0])) return null
  for (let i = 1; i < Math.min(ws.length, max + 3); i++) {
    const between = ws.slice(1, i)
    if (between.length > max || between.some(w => BUILD.software_between_not.includes(w))) return null
    for (const th of BUILD.software_things) {
      const n = th.split(' ').length
      if (ws.slice(i, i + n).join(' ') === th) return ws[0] + ' + ' + th
    }
  }
  return null
}
const questionForm = t => t.includes('?') || startsWith(t, OPENING.question_starts)
// changes-11 mail_on_schedule: when sch and svc both match by full key words and the message has a
// key word of sch5 (email on a schedule), only sch counts.
const SCH5_WORDS = ((TOPICS.sch && TOPICS.sch.needs) || []).filter(n => n.id === 'sch5').flatMap(n => n.key_words)
function strongTopics(t) {
  let ids = TOPIC_IDS.filter(k => whichOf(t, TOPICS[k].key_words.concat(TOPICS[k].misspellings)).length)
  if (whichOf(t, TALK_DATA.chat_apps).length) ids = ids.filter(k => k !== 'svc')
  if (ids.includes('sch') && ids.includes('svc') && whichOf(t, SCH5_WORDS).length) ids = ids.filter(k => k !== 'svc')
  return ids
}
const anyTerm = t => TERM_IDS.some(k => whichOf(t, TERMS[k].key_words).length)
function needsFor(t, topic, answering) {
  let ns = TOPICS[topic].needs.filter(n => whichOf(t, n.key_words).length && (answering || !n.only_when_answering))
  // changes-11: a need that wins over the others (sch5, email on a schedule)
  if (ns.some(n => n.wins_over_other_needs)) ns = ns.filter(n => n.wins_over_other_needs)
  if (ns.length > 1) ns = ns.filter(n => !n.only_if_no_other_need)
  return ns.map(n => n.id)
}

/* ---------- the wants (row 5): hhcontent's content/helper-wants-v1.json, as src/wants-data.js ---------- */
// The order of steps is hhtech's wants_step.py with fixes6_step.py on top of route2.py (changes-6
// fixes 2 and 3, changes-8's article before "NAME skill"); route2.py itself stops at the wants
// question. visit.wants false: the steps below do nothing, which is route2.py exactly (the tests
// replay route2.py's own conversations that way).
const WROWS = WANTS_DATA.rows
const WANT_ROWS = Object.fromEntries(WROWS.map(r => [r.id, r]))
const WGROUPS = Object.fromEntries(WANTS_DATA.groups.map(g => [g.id, g]))
const asLabel = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const GROUP_BY_LABEL = new Map(WANTS_DATA.question.answers.map(a => [asLabel(a.label), a.gives_group]))
const WSKILLS = new Map(WANTS_DATA.skills.map(s => [s.name, s]))
const SERVICE_LINES = WANTS_DATA.service_lines
// A row matches when one of its key words is in the message, or one of its things and one of its
// actions are both in it. Whole words, as every key word (helper-wants-v1.json match_rule).
const wantsOf = t => WROWS.filter(r => whichOf(t, r.key_words || []).length || (whichOf(t, r.things || []).length && whichOf(t, r.actions || []).length)).map(r => r.id)
// The near miss: the groups one of whose subject words is in the message.
const nearOf = t => WANTS_DATA.groups.filter(g => whichOf(t, g.subject_words).length).map(g => g.id)
// A skill by its name only when the name and "skill" sit next to each other (changes-6 fix 3,
// changes-8): hhcontent's skill_next.py PATTERNS, word for word; {n} is the name, or the name with
// spaces for its hyphens. tests/talk-wants.test.mjs compares these with skill_next.py's own.
const SKILL_NEXT_PATTERNS = ['(?:the|a|an|this|that) {n} skills?', 'skills? (?:called|named) \\"?{n}\\"?', 'skills? for {n}', '\\"{n}\\" skills?']
// Wants fixes v1 (helper-wants-v1.json skill_name_rule_wf1, hhcontent's wants_fixes_step.py): a name that
// is an ordinary word counts after "skill(s) for" only as the last word of the message ("is there a skill
// for shop" names shop; "skills for shop owners" names nothing). "the shop skill" still counts.
const WF1 = WANTS_DATA.skill_name_rule_wf1
const ORDINARY_NAMES = new Set(WF1.ordinary_names)
// skill_for_unknown: "skill(s) for <word>" (or "that can", "which can") where the word is not on
// skill_for_not_after ("is there a skill for me" stays the line about what a skill is)
const SKILL_FOR = new RegExp('(^|[^a-z0-9])' + WF1.skill_for_pattern)
function skillForUnknown(t) {
  const m = SKILL_FOR.exec(t)
  return !!m && !WF1.skill_for_not_after.includes(m[2])
}
const SKILL_RES = WANTS_DATA.skills.map(s => {
  const names = [...new Set([s.name, s.name.replace(/-/g, ' ')])]
  const lastOnly = p => (ORDINARY_NAMES.has(s.name) && p.startsWith('skills? for') ? '\\s*[?.!]*$' : '')
  const alts = names.flatMap(n => SKILL_NEXT_PATTERNS.map(p => p.replace(/\\"/g, '"').replace('{n}', escapeRe(n)) + lastOnly(p)))
  // A name never ends right before a hyphen, so 'a skill called "brag-slim"' names brag-slim only, not
  // brag too (the Builder's rule, in the reference since wants fixes v1: wants_fixes_step.py a).
  return [s.name, new RegExp('(^|[^a-z0-9])(?:' + alts.join('|') + ')($|[^a-z0-9-])')]
})
// The skills a message names. Where one name's match lies inside another's ('a skill called brag
// slim' is brag and brag-slim), only the longer counts (the Builder's rule, now wants_fixes_step.py b).
function skillOf(t) {
  const found = SKILL_RES.map(([n, re]) => [n, re.exec(t)]).filter(([, m]) => m).map(([n, m]) => [n, m.index, m.index + m[0].length])
  const inside = (a, b) => a !== b && b[1] <= a[1] && a[2] <= b[2] && b[2] - b[1] > a[2] - a[1]
  return [...new Set(found.filter(a => !found.some(b => inside(a, b))).map(([n]) => n))].sort()
}
// The row a skill has, if any (a hand-written row wins over S1 and S2).
const rowOfSkill = name => WROWS.find(r => r.thing === name)
// Changes-6 fix 6: where svc's row for a named service would show, Gmail, Google Calendar and
// Google Drive get line CN1 (the app's Connectors page) and GitHub gets S1 for the built-in skill
// github. A result gets serviceLine; the rest stays as it was (found, kept, the visit).
function withServiceLine(out, st) {
  if (st.wants === false || out.topic !== 'svc' || out.need !== 'svc1') return out
  const s = SERVICE_LINES[st.service]
  if (s) out.serviceLine = s.line === 'S1' ? { line: 'S1', skill: s.skill } : { line: s.line }
  return out
}
// At most four things to pick on screen (answers.max_at_once): a longer list shows three and
// "More", which shows the next ones the same way (helper-talk-v2.json answers.more).
function pageOf(items) {
  const max = TALK_DATA.answers.max_at_once
  if (items.length <= max) return items
  const shown = max - 1
  return [...items.slice(0, shown), { id: 'more-' + items[shown].id, label: 'More', more: items.slice(shown) }]
}

// Steps 4 and 5: the topic and the need, by key words.
function byCode(text, st) {
  const t = cutIgnored(talkNorm(text))
  let strong = strongTopics(t)
  // the rows (wants_step.py by_code2): while a topic question is open, only in a question
  let rows = st.wants === false ? [] : wantsOf(t)
  if (rows.length && st.pending && !questionForm(t)) rows = []
  // fix 2: a row takes svc off only when the svc word matched is that row's own key word or thing;
  // otherwise svc stays and the rows are not looked at
  if (rows.length && strong.includes('svc')) {
    const svcWords = whichOf(t, TOPICS.svc.key_words.concat(TOPICS.svc.misspellings))
    const owned = rows.some(id => svcWords.some(w => (WANT_ROWS[id].key_words || []).includes(w) || (WANT_ROWS[id].things || []).includes(w)))
    if (owned) strong = strong.filter(k => k !== 'svc')
    else rows = []
  }
  const r = { topic: null, need: null, term: null, several: null, strong_one: strong.length === 1, rows: null }
  if (strong.length > 1) {
    r.several = strong
    return r
  }
  if (strong.length === 1) r.topic = strong[0]
  else {
    if (rows.length) {
      r.rows = rows
      return r
    }
    if (!st.pending || questionForm(t)) {
      const terms = TERM_IDS.filter(k => whichOf(t, TERMS[k].key_words).length)
      if (terms.length === 1) {
        // wants fixes v1 (skill_for_unknown): in a question, "skill(s) for / that can ..." and a word that is
        // not on skill_for_not_after is not the line about what a skill is: turn() goes on to N2 or N1
        if (st.wants !== false && TERMS[terms[0]].key_words.includes('skill') && questionForm(t) && skillForUnknown(t)) return r
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
      if (topic === 'svc' && answering && !strong.length && !unsure && !t.includes('?') && !questionForm(t)) r.need = 'svc1' // ask-fix-t1: a question is not a service name
      else if (st.found[topic] && !unsure) r.need = st.found[topic]
    }
  }
  return r
}

/* ---------- the visit ---------- */
// stage: 'name' (Helper asked "What's your name?"), 'work' ("What do you do?"), 'open'.
// pending: the topic whose question is open. asked: topics whose question was asked in this visit.
// found: { topic: need } shown in this visit. lastq: Helper's last line was a question.
// service: the service last named, for the text to paste. kept: the stored record (keeps.storage).
// rmText: the message that led to "Do you mean me, or your own Hermes?", for the answer to it.
// wants: the wants steps are on (row 5); false only for replaying route2.py, which has none.
// changes-14/15: met, the mark that Helper has said hello (its own storage key, keeps.met; it outlives the
// visit and no Forget removes it); last, lastKey, lastTopic: Helper's last line in this visit (route2.py
// note_last), for ordinary talk and for never saying the same line twice; rejected: the lines the person
// called wrong in this visit (no_repeat.rejected_rule), never stored.
// live-v2 changes-3: lastAnswer, lastAnswerKey, lastByAgain: this visit's last answer line, for "again"
// (small_talk.again_rule). changes-4: keepWork, the keep rule of keeps.work (false only for replaying route2.py,
// which keeps nothing at "What do you do?"); workLong, WORK_LONG was said once at this question. aiOff: the AI step is
// off for the rest of this visit (hhtech-weak-ai; set by src/page.js). live-v2 changes-5 (set by src/page.js): aiTried,
// the visit has made its first AI call; slow, the slow-AI line SLOW_A: null, 'due' (owed after the next answer that
// may have it, src/live-turn.js slowFollows), 'said'.
function freshVisit(stage = 'open', kept = {}, met = false) {
  return { stage, pending: null, found: {}, asked: [], lastq: false, name: null, work: null, service: null, kept, rmText: null, wants: true, met, last: null, lastKey: null, lastTopic: null, rejected: [], lastAnswer: null, lastAnswerKey: null, lastByAgain: false, keepWork: true, workLong: false, aiOff: false, aiTried: false, slow: null, lastOffer: null, lastParts: null, c9: true }
}
// A later visit: only the stored record and the met mark are carried over. met: Helper has said hello on an
// earlier visit (changes-14, keeps.met). Builder: a kept name counts as met too (route2.py writes both at F1,
// so a name never stands without met there), so a record from a build before the mark is not asked the name
// again. The window's first line, and so the stage, is opening()'s: met, BACK and no question; else OPEN.
const laterVisit = (kept, met = false) => {
  const k = kept || {}
  const was = met === true || !!k.name
  return freshVisit(was ? 'open' : 'name', k, was)
}
// changes-14 (route2.py opening): the window opens.
function opening(st) {
  let out
  if (st.met) {
    st.stage = 'open'
    out = { kind: 'BACK', name: st.kept.name || null }
  } else {
    st.stage = 'name'
    out = { kind: 'OPEN' }
  }
  noteLast(st, out)
  return attachOffer(out, st, null) // offer-t1: BACK carries the offer general
}
// route2.py line_key: "the same line" is the same kind, topic, need, term and buttons. Builder: also the same
// wants row, skill or group (the plugin's own lines; route2.py has none), so two different rows are two lines.
const lineKey = o => JSON.stringify([o.kind, o.topic || null, o.need || null, o.term || null, o.buttons || [], o.row || null, o.skill || null, o.group || null])
// live-v2 changes-3 (small_talk.again_brings_back): the kinds an answer line has, in this plugin's words (the
// data's wants is this plugin's want; its "skill by name", the skills-by-name line S1 or S2, is this plugin's skill)
const AGAIN_BACK = (TALK_DATA.small_talk.again_brings_back || []).map(k => (k === 'wants' ? 'want' : k === 'skill by name' ? 'skill' : k))
// what a line brought back by "again" leaves out: its faint Kept: line and what only that moment had
const AGAIN_DROP = ['kept', 'first', 'name_taken', 'thing', 'repeat_of', 'by_again', 'code', 'work_first', 'weak_hit', 'offer']
function noteLast(st, o) {
  if (!o) return o
  st.last = o.kind
  st.lastKey = lineKey(o)
  st.lastTopic = ['row', 'question', 'plain', 'then'].includes(o.kind) ? o.topic || null : null // live changes-6: then
  // ask-fix-t1 (route2.py last_next reads last_key's fields): the parts of Helper's last line, for its then line and its button
  st.lastParts = { kind: o.kind, topic: o.topic || null, need: o.need || null, term: o.term || null, row: o.row || null, line: o.line || o.id || null }
  st.lastByAgain = !!o.by_again
  if (AGAIN_BACK.includes(o.kind)) {
    st.lastAnswer = Object.fromEntries(Object.entries(o).filter(([k]) => !AGAIN_DROP.includes(k)))
    st.lastAnswerKey = st.lastKey
  }
  return o
}
// route2.py again_line: (1) the last answer line when it is not the line just before; (2) it once more when it
// is, unless that line was itself brought back by again (then AGAIN); (3) none: MEAN_NONE, or AGAIN after MEAN_NONE
function againLine(st) {
  const a = st.lastAnswer
  if (a && st.lastAnswerKey !== st.lastKey) return { ...a }
  if (a) return st.lastByAgain ? { kind: 'AGAIN' } : { ...a }
  return { kind: st.last === 'MEAN_NONE' ? 'AGAIN' : 'MEAN_NONE' }
}

/* ---------- what Helper keeps (route2.py: keep, keep_typed, kept_need, remember) ---------- */
// Writes one thing into the visit's record, and notes on the result that the faint kept line must
// show (and the first-time line, once). The page writes the record to storage after every turn.
function keep(st, out, key, value) {
  if (key === 'asked') st.kept.asked = [...(st.kept.asked || []), value]
  else st.kept[key] = value
  out.kept = [...(out.kept || []), key]
  // live-v2 changes-4 (keeps.tell.work_told): the first time what the person does is kept, the line that the AI is
  // told goes under the Kept: line (AI builds); shown again only after it was deleted and kept anew
  // (review: only in a build that shows that line, so a record carried into an AI build still gets it once)
  if (key === 'work' && !st.kept.told_work && LIVE_DATA.lines_by_mode.work_told[AI_MODE]) {
    st.kept.told_work = true
    out.work_first = true
  }
  if (!st.kept.told) {
    st.kept.told = true
    out.first = true
  }
}

// The names a typed answer gives (keeps.answers.<topic>.names: typed word -> name). Wants fixes v1
// (route2.py keep_typed and typed_change): a matched word inside a longer matched word does not count,
// so "one drive" is OneDrive only, not Google Drive too ("drive").
function typedNames(t, names) {
  let ws = Object.keys(names).filter(w => hits(t, w))
  ws = ws.filter(w => !ws.some(v => v !== w && hits(v, w)))
  return new Set(ws.map(w => names[w]))
}
// Rule 2: an answer typed to Helper's own open question, found by code's words.
function keepTyped(t, topic, need, st, out) {
  const A = KEEPS.answers
  if (t.includes('?') || !A[topic]) return
  const unsure = whichOf(t, TALK_DATA.unsure_words).length > 0
  if (topic === 'mod') {
    const v = A.mod.values.find(x => x.need === need)
    if (v && whichOf(t, v.typed_words).length && !(unsure && v.typed_not_with_unsure_words)) keep(st, out, 'mod', need)
  } else if (!unsure && !(topic === 'svc' && need !== 'svc1') && !(topic === 'msg' && need === 'msg3')) {
    const names = typedNames(t, A[topic].names)
    if (names.has('Google Calendar')) names.delete('Google')
    if (names.size === 1) keep(st, out, topic, [...names][0])
  }
}

// keeps.use: the need a kept answer gives for this topic, or null.
function keptNeed(topic, st) {
  const k = st.kept
  if (topic === 'mod') return k.mod || null
  if (topic === 'msg' && k.msg) return k.msg === 'Telegram' ? 'msg1' : 'msg2'
  if (topic === 'svc' && k.svc) return 'svc1'
  return null
}
// A row shown from what is kept: for a service, the kept one fills the text to paste.
function fromKept(topic, st) {
  const need = keptNeed(topic, st)
  st.found[topic] = need
  if (topic === 'svc') st.service = st.kept.svc
  return { kind: 'row', topic, need, used: 'kept' }
}

function stripLead(t) {
  const leads = [...KEEP_REMEMBER.lead_ins].sort((a, b) => b.length - a.length)
  let again = true
  while (again) {
    again = false
    for (const p of leads) {
      if (t !== p && startsWith(t, [p])) {
        t = t.slice(p.length).replace(/^[ ,.:]+/, '')
        again = true
      }
    }
  }
  return t
}

// Step 1 b: "remember that ..." said to Helper. Returns out, or null when the message is not for
// this step.
function remember(text, st, out) {
  if (st.pending === 'mem') return null // there the message is the answer about Hermes
  const raw = Array.from(String(text).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim())
  const t = stripLead(talkNorm(text))
  const rawT = t ? raw.slice(raw.length - charCount(t)).join('') : ''
  const starts = [...KEEP_REMEMBER.request_starts].sort((a, b) => b.length - a.length)
  const start = starts.find(p => t.startsWith(p) && (p.endsWith(':') || t.length === p.length || !/[a-z0-9']/.test(t[p.length])))
  if (start && !t.includes('?')) {
    const cut = KEEP_REMEMBER.thing_starts_at_last_word.includes(start) ? 'remember '.length : start.length
    const thing = Array.from(rawT).slice(cut).join('').replace(/^[\s:,-]*(?:that\b)?[\s:,-]*/i, '').trim()
    const n = typedWords(thing).length
    const lim = KEEP_REMEMBER.limits
    const asked = st.kept.asked || []
    if (n < lim.min_words) out.kind = 'RM3'
    else if (looksSecret(thing)) out.kind = 'RM6' // changes-12: keeps.remember.refuse.rule_12 (src/secret-rule.js), was: a refused word or 8 digits
    else if (n > lim.max_words || charCount(thing) > lim.max_chars) out.kind = 'RM5'
    // keeps.remember.same_thing (changes-10, the Builder's review fix now in route2.py): the same
    // thing in other capitals counts as kept already, as the settings page reads it.
    else if (asked.some(a => a.toLowerCase() === thing.toLowerCase())) out.kind = 'RM1'
    else if (asked.length >= lim.max_things) out.kind = 'RM4'
    else {
      keep(st, out, 'asked', thing)
      out.kind = 'RM1'
      out.thing = thing
    }
    return out
  }
  const U = KEEP_REMEMBER.unsure
  const tc = cutIgnored(talkNorm(text))
  if (!st.lastq && whichOf(tc, U.about).length && whichOf(tc, U.said_to).length && !whichOf(tc, TALK_DATA.hermes_words).length) {
    out.kind = 'RM2'
    st.lastq = true
    st.rmText = text
    return out
  }
  return null
}

// Step 1 b, second half (keeps.typed): "what do you know about me" (A1), "forget my name" and the
// like (A2, one kind of thing), "forget everything" (A4). Whole phrases, no model. A2 and A4 are
// skipped for a question about Hermes (not_when, changes-8). Returns { kind, what } or null.
function typedAboutKept(text) {
  const t = talkNorm(text)
  let s = null
  if (whichOf(t, KEEP_TYPED.see.key_words).length) s = { kind: 'A1' }
  else {
    for (const [what, words] of Object.entries(KEEP_TYPED.forget_one.key_words)) {
      if (whichOf(t, words).length) {
        s = { kind: 'A2', what }
        break
      }
    }
    if (!s && whichOf(t, KEEP_TYPED.forget_all.key_words).length) s = { kind: 'A4' }
  }
  if (s && (s.kind === 'A2' || s.kind === 'A4')) {
    const nw = KEEP_TYPED.not_when
    if (questionForm(t) && (whichOf(t, nw.hermes_words).length || (whichOf(t, nw.it_words).length && !whichOf(t, nw.helper_words).length))) return null
  }
  return s
}
const hasKeptValues = kept => hasKept(kept)
// What A1, A2 and A4 do to the visit: A1 answers at once, A2 and A4 ask for a Yes first, and
// there is nothing to ask about when nothing like that is kept.
function aboutKept(s, st) {
  st.pending = null
  st.lastq = false
  if (s.kind === 'A1') return { kind: 'A1' }
  const there = s.kind === 'A4' ? hasKeptValues(st.kept) : s.what === 'asked' ? (st.kept.asked || []).length > 0 : !!st.kept[s.what]
  if (!there) return { kind: 'A-none' }
  st.lastq = true
  return s.kind === 'A4' ? { kind: 'A4' } : { kind: 'A2', what: s.what }
}

// changes-7: the topics show only when the person asks what they can ask (line TP).
const TP_CUTS = ['hey', 'hi', 'hello', 'ok', 'okay', 'so', 'helper', 'and']
function asksTopics(text) {
  let t = talkNorm(text)
  let again = true
  while (again) {
    again = false
    for (const p of TP_CUTS) {
      if (t !== p && startsWith(t, [p])) {
        t = t.slice(p.length).replace(/^[ ,.:!]+/, '')
        again = true
      }
    }
  }
  t = t.replace(/[ ?!.]+$/, '') || t
  if (!(TOPIC_ASKS.whole_message.includes(t) || whichOf(t, TOPIC_ASKS.phrases).length)) return false
  const tc = cutIgnored(t)
  return !(strongTopics(tc).length || anyTerm(tc))
}

// changes-7: N1a, a skill named in a clear pattern and on no official list; N1, everything else.
// null: an official skill named that way (changes-19: all 186 are answered, N1b is gone).
const SKILL_PATTERNS = [/skills? (?:called|named) "?([a-z0-9][a-z0-9 -]{0,40}?)"?(?=$|[^a-z0-9 -])/, /"([a-z0-9][a-z0-9 -]{0,40})" skills?/]
function dontKnow(text) {
  const t = talkNorm(text)
  for (const p of SKILL_PATTERNS) {
    const m = p.exec(t)
    if (m) {
      const n = m[1].trim().replace(/ /g, '-')
      if (!SKILL_NAMES.has(n)) return 'N1a'
      return null
    }
  }
  return 'N1'
}

// changes-10 (opening.name_refused, the Builder's review fix now in route2.py): a name holding a
// word Helper never keeps (keeps.remember.refuse.words, and in a name also opening
// .name_refused_words_also: pin, pins) or a key shape is no name, as a name with digits is none.
const refusedName = s => whichOf(talkNorm(s), KEEP_REMEMBER.refuse.words.concat(OPENING.name_refused_words_also || [])).length > 0 || looksLikeKey(s)
function codeName(text, strongOnly = false) {
  const name = codeNameRaw(text, strongOnly)
  return name && !refusedName(name) ? name : null
}
// helper-builder-qs-v1.md point 1 (route2.py strong_match): the first place name_strong_pattern matches, or
// null when the word it caught is on opening.not_a_name or name_strong_stop ("call me tomorrow"). No second match.
function strongMatch(text) {
  const m = NAME_STRONG.exec(text)
  if (m && (OPENING.not_a_name.includes(m[1].toLowerCase()) || OPENING.name_strong_stop.includes(m[1].toLowerCase()))) return null
  return m
}
// route2.py tail_ok: after a name typed on a later visit only spaces, . , ! and name_new_may_follow's words
const MAY_FOLLOW = [...OPENING.name_new_may_follow].sort((a, b) => b.length - a.length).map(w => new RegExp('(^|[^a-z0-9])' + escapeRe(w) + '(?=$|[^a-z0-9])', 'g'))
function tailOk(rest) {
  let t = talkNorm(rest)
  for (const re of MAY_FOLLOW) t = t.replace(re, '$1 ')
  return /^[\s.,!]*$/.test(t)
}
function codeNameRaw(text, strongOnly) {
  let m = strongMatch(text)
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
  let m = strongMatch(text)
  if (!m) {
    m = NAME_WEAK.exec(text)
    if (m) {
      const w = m[1]
      const after = text.slice(m.index + m[0].length).toLowerCase()
      if (!(/^\p{Lu}/u.test(w) && !OPENING.not_a_name.includes(w.toLowerCase()) && more.after_name.some(a => after.startsWith(a)))) m = null
    }
  }
  if (!m) return [null, null]
  if (refusedName(m[1])) return [null, null] // changes-10: opening.name_refused
  const rest = text.slice(m.index + m[0].length).replace(/^(?:[\s,.!:]+|and\b|here\b)+/i, '')
  const rt = cutIgnored(talkNorm(rest))
  if (!rt) return [null, null]
  const hasKey = strongTopics(rt).length > 0 || anyTerm(rt)
  return questionForm(rt) || (hasKey && !startsWith(rt, more.self_starts)) ? [capFirst(m[1]), rest] : [null, null]
}

/* ---------- changes-11: route2.py's steps after hhtech's run of e86b410 ---------- */
// A name typed at stage open (a later visit skips the name question): NAME_AGAIN for the kept name
// (alone, or caught by the name patterns), NAME_NEW for a clear "my name is ..." (at most six words,
// no question mark), which replaces the kept name. A single other word is not taken as a name.
// Nothing while Helper's own question is open. Returns { kind, name } or null; NAME_NEW keeps.
function nameLater(text, st, out) {
  if (st.pending || st.lastq) return null
  const kn = st.kept.name
  const raw = String(text).trim().replace(/[.!]+$/, '')
  if (kn && raw.toLowerCase() === kn.toLowerCase()) return { kind: 'NAME_AGAIN', name: kn }
  if (String(text).includes('?') || typedWords(text).length > 6) return null
  const strong = codeName(text, true)
  const m = NAME_WEAK.exec(text)
  const weak = m ? capFirst(m[1]) : null
  if (kn && [(strong || '').toLowerCase(), (weak || '').toLowerCase()].includes(kn.toLowerCase())) return { kind: 'NAME_AGAIN', name: kn }
  if (!strong) return null
  // helper-builder-qs-v1.md point 1: NAME_NEW only when the name ends the message (polite words may follow)
  const sm = strongMatch(text)
  if (!tailOk(text.slice(sm.index + sm[0].length))) return null
  keep(st, out, 'name', strong)
  st.name = strong
  return { kind: 'NAME_NEW', name: strong }
}
// "what is ..." (JSON what_is): the topic whose plain line explains the one word asked about, or null.
// Anchored at the start as Python's re.match is, whatever the data's pattern begins with.
const WHAT_IS = TALK_DATA.what_is ? new RegExp('^(?:' + TALK_DATA.what_is.pattern + ')') : null
function whatIs(t) {
  const m = WHAT_IS && WHAT_IS.exec(t)
  if (!m) return null
  const x = m[1].replace(/^[ ?.!]+|[ ?.!]+$/g, '')
  const found = Object.entries(TALK_DATA.what_is.words).filter(([, ws]) => ws.includes(x)).map(([k]) => k)
  return found.length === 1 ? found[0] : null
}
// COST (a question with a cost word) or WHERE (a where word), when no topic and no term matched.
// Builder (not in route2.py, which has no rows; please check): a row of the wants counts as a topic
// here, so "can it keep an eye on airline ticket prices" is the prices row, not the cost line. Only
// where byCode would look at the rows: not while Helper's own question is open and the message is
// no question (there route2.py's order stands).
function fixedByWords(t, st) {
  // live-v2 changes-3 (cost.amount_rule): what something costs, asked with only price words of topic use, is COST
  const C = TALK_DATA.cost
  if ((C.amount_asks || []).length && questionForm(t) && whichOf(t, C.amount_asks).length && strongTopics(t).join() === 'use' && !anyTerm(t) && TOPICS.use && whichOf(t, TOPICS.use.key_words.concat(TOPICS.use.misspellings || [])).every(w => C.use_price_words.includes(w))) return 'COST'
  if (strongTopics(t).length || anyTerm(t)) return null
  if (st.wants !== false && wantsOf(t).length && !(st.pending && !questionForm(t))) return null
  if (questionForm(t) && whichOf(t, TALK_DATA.cost.words).length) return 'COST'
  if (whichOf(t, TALK_DATA.where.words).length) return 'WHERE'
  return null
}
// keeps.typed_change: where a row shows for a topic something is already kept for (chat app,
// service, ChatGPT or Claude), the person says of themselves that they use another one: the newest
// replaces the kept one. Not in a question, not with a not-word or an unsure word, and only when
// code finds exactly one new name.
function typedChange(t, topic, st, out) {
  const TC = KEEPS.typed_change
  if (!TC || !['msg', 'svc', 'mod'].includes(topic) || !st.kept[topic]) return
  if (t.includes('?') || questionForm(t) || whichOf(t, TC.question_words).length || whichOf(t, TC.not_words).length || whichOf(t, TALK_DATA.unsure_words).length) return
  if (!whichOf(t, TC.self_words).length) return
  let vs
  if (topic === 'mod') vs = KEEPS.answers.mod.values.filter(v => (v.need === 'mod1' || v.need === 'mod2') && whichOf(t, v.typed_words).length).map(v => v.need)
  else {
    const names = typedNames(t, KEEPS.answers[topic].names)
    if (names.has('Google Calendar')) names.delete('Google')
    vs = [...names]
  }
  if (vs.length === 1 && vs[0] !== st.kept[topic]) keep(st, out, topic, vs[0])
}
const samePair = (a, b) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000')

// The service a "named service" line is about, for its text to paste: the picked answer's own, the
// name of the first of the need's key words that is in the message (the list has the longest
// first), the message itself when it was the answer to "Which service?", or the one named earlier
// in this visit.
function serviceIn(text, st, answered) {
  const need = TOPICS.svc && TOPICS.svc.needs.find(n => n.id === 'svc1')
  if (!need) return st.service
  const t = cutIgnored(talkNorm(text))
  const word = need.key_words.find(p => hits(t, p))
  if (word && need.service_names && need.service_names[word]) return need.service_names[word]
  if (answered && text.trim()) return Array.from(text.trim()).slice(0, TALK_DATA.limits.service_chars_in_paste).join('')
  return st.service
}

/* ---------- changes-14, -15, -17: ordinary talk, and never the same line twice ---------- */
const ST = TALK_DATA.small_talk
// talk-live: the first-time faint line under the first "Kept:" (lines_by_mode.first_time_grey, by src/ai-mode.js)
const FIRST_TIME = LIVE_DATA.lines_by_mode.first_time_grey[AI_MODE]
// live-v2 changes-4: under the first Kept: of what the person does, in a build that calls an AI
// live changes-6: once the set-up conversation sends its two answers too, setup_told takes work_told's place
const WORK_TOLD = LIVE_DATA.lines_by_mode[SETUP_BUILT && SETUP_AI_BUILT ? 'setup_told' : 'work_told'][AI_MODE]
// live-v2 changes-1: the kinds after which "how" is kind mean; the data's "wants" is this plugin's want
const HOW_AFTER = ST.how_after_rows.after.flatMap(k => (k === 'wants' ? ['want'] : k === 'then' ? ['then', 'rowthen'] : [k]))
const NR = TALK_DATA.no_repeat
const LETTER = /\p{L}/u
const ONE_WORD = /^(?:\p{L}|['-]){2,30}$/u
// changes-17 (opening.one_word_name): at "What's your name?" a one-word reply is the name, unless the word is
// on not_a_name or is a topic or term key word. An ending . or ! is cut off; a ? makes it a question.
function oneWordName(text, st) {
  if (st.stage !== 'name') return false
  const raw = String(text).trim().replace(/[.!]+$/, '').trim()
  if (!ONE_WORD.test(raw) || !LETTER.test(raw)) return false
  const t = cutIgnored(talkNorm(raw))
  return !OPENING.not_a_name.includes(t) && !strongTopics(t).length && !anyTerm(t)
}
// changes-17: the person says Helper was wrong (no_repeat's words; a bare no, nope or nah at the start not counted)
const saysWrong = t => whichOf(t, NR.wrong_anywhere).length > 0 || startsWith(t, NR.wrong_starts.filter(w => !ST.no_words.includes(w)))
const WEAK_ALL = TALK_DATA.topics.flatMap(x => x.weak_key_words || [])
// Step 0 b (JSON small_talk, route2.py small_talk): the kind of an ordinary message, or null. Whole messages only.
function smallTalk(text, st) {
  if (oneWordName(text, st)) return null // Ty and Will at What's your name? are names
  let t = talkNorm(text)
  let again = true
  while (again) {
    again = false
    let t2 = t.replace(/[ ?!.,]+$/, '')
    for (const w of ST.cut_end_words) {
      if (t2.endsWith(' ' + w)) {
        t2 = t2.slice(0, -w.length).replace(/[ ,]+$/, '')
        again = true
      }
    }
    for (const w of ST.cut_start_words) {
      if (t2 !== w && startsWith(t2, [w])) {
        t2 = t2.slice(w.length).replace(/^[ ,:.]+/, '')
        again = true
      }
    }
    t = t2
  }
  const opening = st.stage === 'name' || st.stage === 'work'
  let kind = (Object.entries(ST.kinds).find(([, ws]) => ws.includes(t)) || [null])[0]
  if (kind === null) {
    // changes-17 thanks_tail: "ty so much", "thx a lot"
    for (const w of [...ST.kinds.thanks].sort((a, b) => b.length - a.length)) {
      if (startsWith(t, [w]) && ST.thanks_tail.includes(t.slice(w.length).replace(/^[ ,!.]+|[ ,!.]+$/g, ''))) {
        kind = 'thanks'
        break
      }
    }
  }
  if (kind === null && !opening) kind = greetMore(t) // live changes-6: live_c6.greet_more
  if (kind === null && !opening && !st.pending && correction(t, st)) kind = 'wrong' // live changes-6: live_c6.correction_rule
  if (kind === null) {
    const letters = /[a-z0-9]/.test(t)
    const one = /^[a-z]+$/.test(t)
    const tc = cutIgnored(t)
    const known = strongTopics(tc).length > 0 || anyTerm(tc) || whichOf(tc, WEAK_ALL).length > 0
    const ws = typedWords(t)
    if (!letters || (one && t.length === 1)) kind = 'cut' // rules a and b
    else if (!opening && saysWrong(t) && !known) kind = 'wrong' // changes-17 wrong_rule_17
    else if (!opening && !st.pending && !known) {
      // live-v2 changes-1 and -2: "how", "and", "and then" right after a line from rows is kind mean (checked just
      // before rule c; the whole message after the usual cuts, so an entry may have two words)
      if (ST.how_after_rows.words.includes(t) && HOW_AFTER.includes(st.last)) kind = 'mean'
      else if (one && ((t.length >= 2 && t.length <= 3) || ST.cut_question_words.includes(t))) kind = 'cut' // rule c
      else if (ws.length <= 4 && ST.cut_dangling.includes(ws[ws.length - 1])) kind = 'cut' // rule d
      else if (ws.length <= 3 && ws.length > 1 && OPENING.question_starts.includes(ws[0]) && ws.slice(1).every(w => ST.cut_small_words.includes(w))) kind = 'cut' // changes-17 rule e
    }
  }
  if (kind === null) return null
  // changes-15 no_rule: a bare no right after an answer, with nothing open, says the answer was wrong
  if (kind === 'ok' && ST.no_words.includes(t) && !st.pending && ST.no_means_wrong_after.includes(st.last)) kind = 'wrong'
  if (opening && !['thanks', 'how', 'who', 'ai', 'bye', 'cut'].includes(kind)) return null // at_opening
  // when_pending: the answer to Helper's question (live-v2 changes-3: again too; stuck is taken, as wrong)
  if (st.pending && (kind === 'ok' || kind === 'mean' || kind === 'again')) return null
  return kind
}
/* ---------- live changes-6 (route2.py greet_more, correction, c6_line), offer-t1 and ask-fix-t1 (offer_route, how_that, about_ok) ---------- */
const C6 = TALK_DATA.live_c6
const knownWords = tc => strongTopics(tc).length > 0 || anyTerm(tc) || whichOf(tc, WEAK_ALL).length > 0
// live_c6.greet_more: a greeting, thanks or bye with a few more words
function greetMore(t) {
  if (t.includes('?') || typedWords(t).length > 9 || knownWords(cutIgnored(t))) return null
  let first = null
  let rest = ''
  for (const k of ['hello', 'thanks', 'bye', 'ok']) {
    for (const w of [...ST.kinds[k]].sort((a, b) => b.length - a.length)) {
      if (startsWith(t, [w])) {
        first = k
        rest = t.slice(w.length)
        break
      }
    }
    if (first) break
  }
  if (!first) return null
  if (C6.greet_more.question_words.some(q => hits(rest, q))) return null
  const has = k => ST.kinds[k].some(w => w.length > 2 && hits(t, w))
  if (has('bye')) return 'bye'
  if (has('thanks')) return 'thanks'
  return first === 'ok' ? null : first
}
// live_c6.correction_rule: a correction right after a topic's plain line or its then line (or with only Helper's
// not-clear or cut-off line between), naming no other topic
function correction(t, st) {
  const la = st.lastAnswer || {}
  let topic
  if (['plain', 'then'].includes(st.last) && st.lastTopic) topic = st.lastTopic
  else if (['MEAN_NONE', 'CUT', 'CUT_SAME'].includes(st.last) && ['plain', 'then'].includes(la.kind)) topic = la.topic
  else return false
  if (!startsWith(t, NR.wrong_starts) || ST.no_words.includes(t.trim())) return false
  const tc = cutIgnored(t)
  let ts = strongTopics(tc)
  if (!ts.length) ts = TOPIC_IDS.filter(k => whichOf(tc, TOPICS[k].weak_key_words).length)
  return ts.length > 0 && ts.every(x => x === topic)
}
// live_c6: PRIV, POWER, HVC, or null
function c6Line(t) {
  if (whichOf(t, C6.privacy_words).length) return 'PRIV'
  if (whichOf(t, C6.power_words).length) return 'POWER'
  if (whichOf(t, C6.vs_names).length && whichOf(t, C6.vs_words).length) return 'HVC'
  return null
}
const THEN_W = ['how', 'and', 'and then', 'then', 'what next', 'next', 'now what', 'then what', 'what then', 'and next']
// ask-fix-t1 (about_rule): a row found by key words is final only when the message has one of its about words
const ABOUT_ROWS = TALK_DATA.about_rule.rows
const aboutOk = (t, need) => !ABOUT_ROWS[need] || whichOf(t, ABOUT_ROWS[need]).length > 0
// offer-t1 and ask-fix-t1 (route2.py offer_route): the kind of a new line, 'ROW:<need>', or null. tw: cut, normed message
const OW = TALK_DATA.offer_words
function offerRoute(tw) {
  const t = tw.replace(/[ ?!.]+$/, '')
  const has = k => whichOf(t, OW[k]).length > 0
  if (has('migrate') || (has('computer') && /\b(?:move|moving|migrate|transfer|copy)\b/.test(t))) {
    if (has('computer')) return 'MIG_PC'
    if (has('listed_apps')) return 'MIG_APP'
    if (has('chatgpt_names')) return 'MIG_CHATGPT'
    if (has('not_listed_apps')) return 'MIG_NOT_LISTED'
    return 'MIG'
  }
  const m = WHAT_IS && WHAT_IS.exec(t)
  if (m && OW.agent_what.includes(m[1].replace(/^[ ?.!]+|[ ?.!]+$/g, ''))) return 'AGENT'
  if (has('key')) return has('key_where') ? 'KEY_WHERE' : startsWith(t, OW.key_what_starts) ? 'KEY_WHAT' : 'KEY'
  if (has('personality')) return 'PERSONALITY'
  if (has('stuck_more')) return 'STUCK'
  if (has('free')) return 'FREE'
  if (has('model_change')) return 'MODEL_CHANGE'
  if (has('model_for') && hits(t, 'for')) return 'MODEL_FOR'
  if (has('own_ai') && whichOf(t, ABOUT_ROWS.mod3).length) return 'ROW:mod3'
  if (has('skill_add')) return 'SKILL_ADD'
  if (has('plugin_which')) return 'PLUGIN_WHICH'
  if (has('plugin_add')) return 'PLUGIN_ADD'
  if (has('coding_ask')) return 'CODING'
  if (has('what_hermes_any')) return 'HERMES'
  if (knownWords(t)) return null // a strong, weak or term key word: the topics answer it
  if (has('laptop_off')) return 'ROW:msg3'
  if (OW.what_hermes.includes(t)) return 'HERMES'
  if (has('update')) return 'UPDATE'
  if (has('safe')) return 'SAFE'
  if (has('start')) return 'START'
  return null
}
// ask-fix-t1 (small_talk.how_that, route2.py last_next and how_that): "ok and how do I do that", by Helper's last line
const HT = ST.how_that
const HT_CUT = new RegExp('^(?:(?:' + HT.cut_first.map(escapeRe).join('|') + ')\\b[ ,]*)+(?=\\S)')
// the then line and the button (next) of Helper's last line: [then or null, next or null]
function lastNext(st) {
  const p = st.lastParts || {}
  if (p.kind === 'row') {
    const n = TOPICS[p.topic].needs.find(x => x.id === p.need)
    return [n.then || null, n.next || null]
  }
  if (p.kind === 'plain') return [TOPICS[p.topic].plain.then || null, TOPICS[p.topic].plain.next || null]
  if (p.kind === 'term') return [null, TERMS[p.term].next || null]
  // Builder: a row of the wants (route2.py has none) with text to paste counts as a line whose button is a paste box
  if (p.kind === 'want' && WANT_ROWS[p.row] && WANT_ROWS[p.row].next && WANT_ROWS[p.row].next.kind === 'paste') return [null, { kind: 'paste', label: WANT_ROWS[p.row].next.label, paste_text: WANT_ROWS[p.row].next.paste_text }]
  if (FIXED[p.kind]) return [null, FIXED[p.kind].next || null]
  return [null, null]
}
function howThat(text, st) {
  let t = talkNorm(text).replace(/[ ?!.,]+$/, '')
  t = t.replace(HT_CUT, '').trim() || t
  if (!HT.phrases.includes(t)) return null
  // (1) the things to pick stay
  if (st.pending || st.lastq || st.lastOffer || ['TP', 'W1', 'W2', 'C1', 'can-q'].includes(st.last)) return { kind: 'PICK_FIRST', same_picks: true }
  const [then, nx] = lastNext(st)
  const p = st.lastParts || {}
  if (then) {
    st.pending = null
    return p.kind === 'row' ? { kind: 'rowthen', topic: p.topic, need: p.need } : { kind: 'then', topic: p.topic }
  }
  if (nx && nx.kind === 'line') return { kind: 'nextline', of: p.kind, topic: p.topic, need: p.need, term: p.term, text: nx.text, id: nx.id }
  if (nx && nx.kind === 'paste') return { kind: 'HOW_PASTE', label: nx.label, button: nx, topic: p.topic }
  if (nx && nx.kind === 'part') return { kind: 'HOW_PART', label: nx.label, button: nx, topic: p.topic }
  return null
}
// live changes-9 (not in route2.py): a next line's second wording (use1-next-mean), by the next line's id
const NEXT_MEAN = Object.fromEntries(TALK_DATA.topics.flatMap(t => [t.plain.next, ...t.needs.map(n => n.next)]).filter(n => n && n.mean).map(n => [n.id, n.mean]))

/* ---------- offer-t1 (JSON offers; route2.py offer_set, attach_offer, press_offer) ---------- */
const OF = TALK_DATA.offers
// the offer a line carries: a fixed line's own, or keeps.work.offer_t1's (WORK_LONG_2, WORK_SECRET)
const offerOfLine = kind => (FIXED[kind] && FIXED[kind].offer) || (KEEPS.work.offers || {})[kind] || null
// [set id, question text, pick ids]
function offerSet(sid, prevTopic = null) {
  const S = OF.sets
  if (sid === 'after_topic') {
    const bt = S.after_topic.by_topic
    if (prevTopic && bt[prevTopic]) {
      const [a, b] = bt[prevTopic]
      return ['after_topic:' + prevTopic, S.after_topic.template.replace('{say1}', OF.things[a].say).replace('{say2}', OF.things[b].say), [a, b]]
    }
    sid = 'general'
  }
  const s = S[sid]
  if (!SETUP_BUILT && s.text_no_setup) return [sid, s.text_no_setup, s.picks_no_setup]
  return [sid, s.text, s.picks]
}
// A line with an offer gets it (o.offer: { set, text, picks }); never the same set twice in a row (its instead set).
// prevTopic: the topic of Helper's last answer before this line, for after_topic.
function attachOffer(o, st, prevTopic = null) {
  const of = o && !setupOpens(o.kind, st) && offerOfLine(o.kind)
  if (!of) {
    st.lastOffer = null
    return o
  }
  let [sid, text, picks] = offerSet(of, prevTopic)
  if (sid === st.lastOffer) [sid, text, picks] = offerSet(sid.startsWith('after_topic:') ? OF.sets.after_topic.instead : OF.sets[sid].instead)
  o.offer = { set: sid, text, picks }
  st.lastOffer = sid
  return o
}
// setup-chat: with the set-up conversation built, the four lines that end the opening (F2, F3, WORK_SECRET,
// WORK_LONG_2) ask Q_NEW in place of their offer, until that question has been answered or is kept
const SETUP_OPENERS = ['F2', 'F3', 'WORK_SECRET', 'WORK_LONG_2']
const setupOpens = (kind, st) => SETUP_BUILT && SETUP_OPENERS.includes(kind) && !st.kept.setup_new && !(st.setup && st.setup.newAnswered)
// An offer by its set id, as a line carries it (the set-up conversation's NOT_NOW, ALL_DONE and BACK end with one)
function offerSaid(sid, st) {
  let [id, text, picks] = offerSet(sid)
  if (id === st.lastOffer) [id, text, picks] = offerSet(OF.sets[id].instead)
  st.lastOffer = id
  return { set: id, text, answers: { kind: 'offer', hint: OF.hint, items: picks.map(p => ({ id: 'offer-' + p, label: OF.things[p].label, offer: p })) } }
}
// whether a thing picked under an offer starts the set-up conversation (offers.things.setup)
const offerIsSetup = thing => OF.things[thing].gives.kind === 'setup_chat'
// the message holds a key word of a topic or a Hermes term
const hasTopicWord = text => knownWords(cutIgnored(talkNorm(text)))
// Every offer question this build can show: [set id, text, pick ids] (tests; the after_topic sets by topic)
const offerSets = () => [...Object.keys(OF.sets).filter(k => k !== 'after_topic').map(k => offerSet(k)), ...Object.keys(OF.sets.after_topic.by_topic).map(t => offerSet('after_topic', t))]

// The fixed line for a small-talk kind: [line, the name for HELLO or the topic for a plain line].
function smallLine(kind, st) {
  const name = st.name || st.kept.name || null
  if (kind === 'hello') return [st.lastq || ['BACK', 'HELLO', 'HELLO_SAME'].includes(st.last) ? 'HELLO_SAME' : 'HELLO', name]
  if (kind === 'ai') return [LIVE_DATA.lines_by_mode.are_you_an_ai[AI_MODE], null] // talk-live: AI, AI_PICK or AI_WRITES
  if (kind === 'mean' && (st.last === 'then' || st.last === 'rowthen')) return ['MEAN_NONE', null] // live changes-6
  if (kind === 'mean') return st.lastTopic && st.last !== 'plain' ? ['plain', st.lastTopic] : ['MEAN_NONE', null]
  return [{ thanks: 'THANKS', ok: 'OK', how: 'HOW', who: 'WHO', bye: 'BYE', cut: 'CUT', wrong: 'WRONG', stuck: 'STUCK' }[kind], null] // changes-3: stuck
}
// Builder: the plugin's own kinds that route2.py does not have, kept out of no_repeat like the data's exempt
// ones: a skill named by name (changes-15's own words: "a skill named by name") and what Helper keeps, asked
// by typing (A1, A2, A4: the person's own record, or a Yes/No question that must be asked each time).
const EXEMPT_ALSO = ['skill', 'A1', 'A2', 'A4', 'A-none']
// changes-15 (JSON no_repeat, route2.py no_repeat): never the same line twice in a row in answer to typed
// messages, and never a line the person just called wrong in this visit. The line in its place drops the open
// question and keeps any "Kept:" line the original carried. live-v2 (no_repeat.asked_again): a message that
// asks for it again in so many words gets the same line.
function noRepeat(out, st, text) {
  const k = out.kind
  // live-v2 changes-3: what "again" brings back is final
  if (out.by_again) {
    st.rejected = []
    return out
  }
  const t = talkNorm(text)
  const saidWrong = startsWith(t, NR.wrong_starts) || whichOf(t, NR.wrong_anywhere).length > 0
  if (saidWrong && st.lastKey) st.rejected.push(st.lastKey)
  if (!saidWrong && whichOf(t, NR.asked_again).length) {
    st.rejected = []
    return out
  }
  const avoid = [st.lastKey, ...st.rejected]
  if (NR.exempt.includes(k) || EXEMPT_ALSO.includes(k) || !avoid.includes(lineKey(out))) {
    if (!saidWrong) st.rejected = []
    return out
  }
  const group = (Object.entries(NR.groups).find(([, ks]) => ks.includes(k)) || ['answer'])[0]
  const cands = []
  for (const c of NR.in_place[group]) {
    if (c === 'plain') {
      if (out.topic) cands.push({ kind: 'plain', topic: out.topic })
    } else if (c === 'ai_line') cands.push({ kind: LIVE_DATA.lines_by_mode.are_you_an_ai[AI_MODE] }) // changes-3: group who
    else if (c === 'HELLO') cands.push({ kind: 'HELLO', name: st.name || st.kept.name || null }) // changes-3: with the name
    else cands.push({ kind: c })
  }
  const next = cands.find(x => !avoid.includes(lineKey(x))) || cands.find(x => lineKey(x) !== st.lastKey)
  // no other line to say (not possible with today's data: every in_place group has two lines that are not
  // 'plain'): the line as chosen, rather than a crash
  if (!next) return out
  for (const x of ['kept', 'first', 'name_taken', 'thing', 'work_first']) if (x in out) next[x] = out[x]
  next.repeat_of = k
  st.pending = null
  st.lastq = false
  return next
}

/* ---------- live-v2 changes-4: what the person does (keeps.work) ---------- */
const WORK = KEEPS.work
const workEnd = s => s.replace(/[.!\s]+$/, '')
const workWhole = t => t.replace(/[ ?!.,]+$/, '').trim()
// Steps 2 to 7 at "What do you do?". Returns { kind, more } for a line of this step, or null when the message is
// to be answered as an ordinary message (a question, or a topic or term word that does not start like "I run").
function workStep(text, t, st, out) {
  if (questionForm(t)) return null // 2
  if ((strongTopics(t).length || anyTerm(t)) && !startsWith(t, OPENING.name_with_more.self_starts)) return null // 3
  const whole = workWhole(talkNorm(text))
  st.stage = 'open'
  // 4 (review: "change what I do" typed again at WORK_ASK is no answer either)
  if (Object.values(ST.kinds).some(ws => ws.includes(whole)) || WORK.non_answers.includes(whole) || WORK.non_answers.includes(talkNorm(text).trim()) || WORK.typed_change.ask_again_words.includes(whole)) return { kind: 'F3' }
  if (looksSecret(text)) return { kind: 'WORK_SECRET' } // 5
  const value = workEnd(workSqueeze(text))
  if (!workOk(value, { withSecretRule: false })) {
    // 6: too long; the first time the question stays open
    if (!st.workLong) {
      st.workLong = true
      st.stage = 'work'
      return { kind: 'WORK_LONG' }
    }
    st.workLong = false
    return { kind: 'WORK_LONG_2' }
  }
  st.workLong = false
  keep(st, out, 'work', value) // 7
  st.work = value
  if (st.name && st.kept.name !== st.name) keep(st, out, 'name', st.name)
  // (review: after WORK_ASK on a later visit the name is the kept one)
  return { kind: 'F2', more: { name: st.name || st.kept.name || null, work: value } }
}
// keeps.work.typed_change: "I'm a teacher now" replaces (or keeps) what the person does; "change what I do" asks
// WORK_ASK, and the reply goes through workStep. Returns { kind, more } or null.
function workChange(text, st, out) {
  const TC = WORK.typed_change
  const whole = workWhole(talkNorm(text))
  if (TC.ask_again_words.includes(whole)) {
    st.stage = 'work'
    st.workLong = false
    st.pending = null
    return { kind: 'WORK_ASK' }
  }
  const raw = workSqueeze(String(text).replace(/[\u2018\u2019]/g, "'"))
  let t = stripLead(talkNorm(raw))
  if (startsWith(t, ['actually'])) t = t.slice('actually'.length).replace(/^[ ,]+/, '')
  if (!startsWith(t, TC.starts) || !whichOf(t, TC.now_words).length) return null
  // (the rule names keeps.typed_change.not_words; changes-4's own list is not_with: review, both count)
  if (t.includes('?') || questionForm(t) || whichOf(t, TC.not_with).length || whichOf(t, KEEPS.typed_change.not_words).length || strongTopics(t).length || anyTerm(t)) return null
  // the value: the message as typed, from where t starts, with end marks and the now-word at its end cut
  let value = workEnd(Array.from(raw).slice(Array.from(raw).length - charCount(t)).join(''))
  const nowAtEnd = [...TC.now_words].sort((a, b) => b.length - a.length).find(w => value.toLowerCase().endsWith(' ' + w))
  if (nowAtEnd) value = workEnd(value.slice(0, value.length - nowAtEnd.length).replace(/[ ,]+$/, ''))
  if (!value || looksSecret(text) || !workOk(value)) return null
  keep(st, out, 'work', value)
  return { kind: 'F2', more: { name: st.name || st.kept.name || null, work: value } }
}

// One typed message -> a result (route2.py turn, changes-14's wrapper): the steps below, then no_repeat; met
// is set when the opening ends here, and the line is noted as Helper's last.
function turn(text, st) {
  return turnParts(text, st).out
}
// talk-live: the same, with the result before no_repeat as well (pre, a copy), which decides whether the AI
// step is asked (src/live-turn.js goesToAi); out is the line shown when it is not, and the fallback when it is.
function turnParts(text, st) {
  const wasOpening = st.stage === 'name' || st.stage === 'work'
  const prevTopic = st.lastTopic // offer-t1: the topic of Helper's last line, for offers.sets.after_topic
  const steps = turnSteps(text, st)
  const pre = { ...steps }
  if (steps.kind === 'PICK_FIRST') return { pre, out: steps } // ask-fix-t1: nothing changes, the same things to pick stay
  const out = noRepeat(steps, st, text)
  if (wasOpening && st.stage === 'open') st.met = true // keeps.met.written_when: the opening ended, by any route
  noteLast(st, out)
  return { pre, out: attachOffer(out, st, prevTopic) }
}
// The order of steps is route2.py's _turn(), with no model.
function turnSteps(text, st) {
  const out = {}
  const openAtStart = st.stage === 'open'
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
  // ask-fix-t1 (small_talk.how_that): "ok and how do I do that", first at stage open, before small talk and any AI call
  if (st.stage === 'open') {
    const hw = howThat(text, st)
    if (hw) return Object.assign(out, hw)
  }
  // 0 b. ordinary talk (changes-14): hello, thanks, ok, cut off, "what do you mean", "that's wrong" ...
  const sk = smallTalk(text, st)
  // ask-fix-t1 (mean_rule_ask_fix_t1): the mean words themselves right after a word line with a mean field
  if (sk === 'mean' && st.last === 'term' && TERMS[st.lastParts.term].mean && ST.kinds.mean.some(w => w.length > 4 && hits(talkNorm(text), w))) {
    st.stage = 'open'
    return done('termmean', { term: st.lastParts.term })
  }
  // live-v2 changes-3 (small_talk.again_rule): this visit's last answer line again, or AGAIN or MEAN_NONE
  if (sk === 'again') {
    st.stage = 'open'
    const { kind, ...more } = againLine(st)
    return done(kind, { ...more, by_again: true })
  }
  if (sk === 'mean') {
    const bare = talkNorm(text).replace(/[ ?!.]+$/, '')
    const w = bare.replace(/^(?:(?:ok|okay|so|and|cool|right)\b[ ,]*)+(?=\S)/, '').trim() || bare
    const thenWord = THEN_W.includes(w) || THEN_W.includes(bare)
    // live changes-6 (then_rule): the then words right after a plain line that has a then line
    if (thenWord && st.last === 'plain' && st.lastTopic && TOPICS[st.lastTopic].plain.then) {
      st.stage = 'open'
      return done('then', { topic: st.lastTopic })
    }
    // live changes-9 (not in route2.py; st.c9 false only for replaying it): the then words right after a row with a then
    // line (msg1), and right after a topic's then line when one row of that topic has one (msg0-then, then msg1-then)
    if (st.c9 !== false && thenWord && st.last === 'row') {
      const n = TOPICS[st.lastParts.topic].needs.find(x => x.id === st.lastParts.need)
      if (n && n.then) return done('rowthen', { topic: st.lastParts.topic, need: n.id })
    }
    if (st.c9 !== false && thenWord && st.last === 'then' && st.lastTopic) {
      const ns = TOPICS[st.lastTopic].needs.filter(x => x.then)
      if (ns.length === 1) return done('rowthen', { topic: st.lastTopic, need: ns[0].id })
    }
    // live changes-9: kind mean right after a next line with a second wording (use1-next, use3-next)
    if (st.c9 !== false && ['extra', 'nextline'].includes(st.last) && NEXT_MEAN[st.lastParts.line]) return done('nextmean', { id: NEXT_MEAN[st.lastParts.line].id })
  }
  if (sk) {
    const [line, x] = smallLine(sk, st)
    st.stage = 'open'
    if (line === 'plain') return done('plain', { topic: x, why: 'what do you mean' })
    return line === 'HELLO' ? done(line, { name: x }) : done(line)
  }
  // 1 b. a request to Helper to remember something; then what Helper keeps, asked about by typing
  if (remember(text, st, out)) return out
  const about = typedAboutKept(text)
  if (about) return Object.assign(out, aboutKept(about, st))
  // 1 c. the person asks what they can ask
  if (asksTopics(text)) {
    st.stage = 'open'
    st.pending = null
    st.lastq = false
    out.kind = 'TP'
    return out
  }
  // 2. a request to do it
  const built = buildHit(text)
  if (built && built.h2) {
    st.stage = 'open'
    return done('H2', { why: built.h2 }) // changes-16
  }
  if (built) {
    st.stage = 'open'
    return done('H1', { why: built })
  }
  const t = cutIgnored(talkNorm(text))
  // 3. the opening
  if (st.stage === 'name' || st.stage === 'work') {
    let name = null
    let ordinary
    if (st.stage === 'name') {
      const [taken, rest] = nameWithMore(text)
      const both = taken !== null
      if (both) {
        // name and question in one message: take the name, answer the rest. The opening ends
        // here, so the name is kept now (keeps rule 1).
        st.name = taken
        out.name_taken = taken
        text = rest
        keep(st, out, 'name', taken)
      }
      name = both ? null : codeName(text, true)
      // changes-17: a one-word name ("Will") is not a question
      ordinary = both || (!name && (strongTopics(t).length > 0 || anyTerm(t) || questionForm(t)) && !oneWordName(text, st))
      if (!name && !ordinary) name = codeName(text)
      if (name && oneWordName(text, st)) name = capFirst(String(text).trim().replace(/[.!]+$/, '').trim()) // "Ty!" is Ty
    } else if (st.keepWork !== false) {
      // live-v2 changes-4: the reply to "What do you do?" (keeps.work steps 2 to 7; step 1, a key, is above)
      const w = workStep(text, t, st, out)
      if (w) return done(w.kind, w.more)
      ordinary = true
    } else ordinary = questionForm(t)
    if (!ordinary) {
      let work = null
      const n = typedWords(text).length
      if (st.stage === 'work' && n >= 1 && n <= OPENING.work_max_words) work = text.trim()
      st.name = name || st.name
      st.work = work
      if (work || st.stage === 'work') {
        st.stage = 'open'
        // changes-15: the name was written at F1 already; only a name new here would be written now. What the
        // person does is used for this visit only, never kept.
        if (st.name && st.kept.name !== st.name) keep(st, out, 'name', st.name)
        return done('F2', { name: st.name, work })
      }
      // changes-15: met and the name are written as soon as the name question is answered; the first
      // "Kept:" line shows under F1
      st.stage = 'work'
      st.met = true
      if (st.name) keep(st, out, 'name', st.name)
      return done('F1', { name: st.name })
    }
    st.stage = 'open'
    st.lastq = false
  }
  // a skill by its name, next to "skill" (changes-6 fix 3): before the topics, so "is there a
  // github skill" gets the skill, not the service question. A row for that skill wins; else S1
  // (built in) or S2 (optional, with the clicks to add it); changes-19: no skill is left out.
  if (st.wants !== false) {
    // The Builder's rule, in the reference since wants fixes v1 (wants_fixes_step.py c): a group's own label typed as it is on its
    // button ("pictures and video") is that group, as if picked; else "I don't know that one" (N2).
    // Only when the conversation was already open as the message came, as the reference has it. The
    // reference checks it first, before "remember that ..." and the other early steps; here it stays at
    // its old place, after them: none of the four labels reaches those steps (tests/talk-wf1.test.mjs).
    const group = openAtStart ? GROUP_BY_LABEL.get(asLabel(cutIgnored(talkNorm(text)))) : null
    if (group) return done('G1', { group, buttons: pickGroupSteps(group, st).buttons })
    const sk = skillOf(cutIgnored(talkNorm(text)))
    if (sk.length === 1) {
      const row = rowOfSkill(sk[0])
      if (row) return done('want', { row: row.id })
      return done('skill', { skill: sk[0] })
    }
  }
  // a skill named in a clear pattern is looked up before the terms
  const dk = dontKnow(text)
  if (dk === 'N1a') return done(dk)
  // changes-11, in route2.py's order: a name on a later visit, "what is ...", cost, where
  if (st.stage === 'open') {
    // live-v2 changes-4 (keeps.work.typed_change and ask_again): what the person does, said again by typing
    if (st.keepWork !== false) {
      const wc = workChange(text, st, out)
      if (wc) return done(wc.kind, wc.more)
    }
    const nl = nameLater(text, st, out)
    if (nl) return done(nl.kind, { name: nl.name })
    const tw = cutIgnored(talkNorm(text))
    // offer-t1: offer_words, new lines from the docs; ask-fix-t1 (offer_words.pending_rule): while a question is open,
    // only a message in question form, and never FREE or a row
    let orr = offerRoute(tw)
    if (st.pending && !(orr && questionForm(tw) && orr !== 'FREE' && !orr.startsWith('ROW:'))) orr = null
    if (orr && orr.startsWith('ROW:')) return done('row', { topic: orr.slice(4, 7), need: orr.slice(4) })
    if (orr) return done(orr)
    const wi = whatIs(tw)
    if (wi) return done('plain', { topic: wi, why: 'what is' })
    // live changes-6: PRIV, POWER, HVC; not as the answer to Helper's own question
    const c6 = st.pending ? null : c6Line(tw)
    if (c6) return done(c6)
    const fx = fixedByWords(tw, st)
    if (fx) return done(fx)
  }
  // 4 and 5. the topic and the need, by key words
  const code = byCode(text, st)
  out.code = code
  const { topic, several } = code
  let { need } = code
  // live changes-6 (mod3_guard): mod3 is not the answer when the message names a hosted or free AI
  if (need === 'mod3' && whichOf(t, C6.hosted_words).length) need = code.need = null
  // ask-fix-t1 (about_rule): a key word alone never shows the row (a weak hit)
  if (need && topic && st.pending !== topic && !aboutOk(t, need)) {
    out.weak_hit = need
    need = code.need = null
  }
  // the rows: one is shown; two or more, "Which one do you mean?" with their labels (three and
  // "More" when over four; wants_step.py shows the first four)
  if (code.rows) return code.rows.length === 1 ? done('want', { row: code.rows[0] }) : done('W1', { buttons: code.rows })
  if (code.term) return done('term', { term: code.term })
  // changes-11: two terms that are a pair (skill and plugin) get W2, which compares them
  if (several && (TALK_DATA.w1_pairs || []).some(p => samePair(p.terms, several))) return done('W2', { buttons: several })
  // 7. the first that fits
  if (topic && need) {
    const answered = st.pending === topic
    // keeps rule 2: only an answer to Helper's own open question, and only when code found it;
    // changes-11 (keeps.typed_change): otherwise the newest thing said may replace the kept one
    if (answered) keepTyped(t, topic, need, st, out)
    else typedChange(t, topic, st, out)
    st.found[topic] = need
    if (topic === 'svc') st.service = serviceIn(text, st, answered)
    return withServiceLine(done('row', { topic, need }), st)
  }
  if (several) return done('W1', { buttons: several.slice(0, TALK_DATA.answers.max_at_once) })
  // ask-fix-t1 (about_rule.weak_hit_then.no_ai): the topic's own question again, also when it was asked before; only if
  // that question was Helper's last line, the don't-know line. A kept answer is not shown for a weak hit.
  if (out.weak_hit && topic) {
    if (TOPICS[topic].question.answers.length && st.lastKey !== lineKey({ kind: 'question', topic })) {
      if (!st.asked.includes(topic)) st.asked.push(topic)
      const r = done('question', { topic })
      st.pending = topic
      return r
    }
    return done('N1')
  }
  // keeps.use: something is kept for this topic, so its question is not asked
  if (topic && keptNeed(topic, st)) {
    const r = fromKept(topic, st)
    return withServiceLine(done('row', { topic: r.topic, need: r.need, used: 'kept' }), st)
  }
  if (topic && !st.lastq && !st.asked.includes(topic)) {
    st.asked.push(topic)
    const r = done('question', { topic })
    st.pending = topic
    return r
  }
  if (topic) return done('plain', { topic })
  // the near miss: no row, but a subject word of exactly one group: N2 with that group's rows
  if (st.wants !== false) {
    const g = nearOf(t)
    if (g.length === 1) return done('N2', { group: g[0] })
  }
  return done(dontKnow(text) || 'skill by name')
}

/* ---------- what the person picks or presses ---------- */
// An answer picked under a topic question: its need's row at once. No key words, no model. A
// picked answer to one of the three questions is kept (keeps rule 2).
function pickSteps(topic, i, st) {
  const a = TOPICS[topic].question.answers[i]
  st.found[topic] = a.gives
  st.pending = null
  st.lastq = false
  if (a.service) st.service = a.service
  const out = { kind: 'row', topic, need: a.gives }
  if (topic === 'mod') keep(st, out, 'mod', a.gives)
  else if (topic === 'msg' && (a.gives === 'msg1' || a.gives === 'msg2')) keep(st, out, 'msg', a.label)
  else if (topic === 'svc' && a.service) keep(st, out, 'svc', a.service)
  return withServiceLine(out, st)
}

// A topic picked under TP or C1. A pick that holds several topics: line C1. Else the kept row, the
// topic's question if not asked yet, or its plain line. The held pick "Web, files, pictures and
// voice" (held_picks.wants, changes-9): the wants question can-q at once, its four groups to pick
// (route2.py pick_topic).
function pickTopicSteps(topic, st) {
  if (TALK_DATA.held_picks && TALK_DATA.held_picks.includes(topic)) {
    st.pending = null
    st.lastq = false
    return { kind: 'can-q', buttons: WANTS_DATA.groups.map(g => g.id) }
  }
  const held = TOPIC_PICKS[topic]
  if (held && held.holds) {
    st.pending = null
    st.lastq = false
    return { kind: held.line, buttons: held.holds }
  }
  if (keptNeed(topic, st)) {
    const r = fromKept(topic, st)
    st.pending = null
    st.lastq = false
    return withServiceLine(r, st)
  }
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

// The link "Change" beside "From what I keep": the topic's question is asked again. A question
// still open is dropped for it.
function changeSteps(topic, st) {
  if (!st.asked.includes(topic)) st.asked.push(topic)
  st.pending = topic
  st.lastq = true
  return { kind: 'question', topic }
}

// A button under "Which one do you mean?", with the message that led to it. A row's button: that
// row.
function pressSteps(choice, text, st) {
  st.lastq = false
  if (WANT_ROWS[choice]) return pickWantSteps(choice, st)
  if (TERMS[choice]) return { kind: 'term', term: choice }
  const ns = needsFor(cutIgnored(talkNorm(text)), choice, false)
  if (ns.length !== 1) return { kind: 'plain', topic: choice }
  st.found[choice] = ns[0]
  if (choice === 'svc') st.service = serviceIn(text, st, false)
  return withServiceLine({ kind: 'row', topic: choice, need: ns[0] }, st)
}

// A group picked under "What do you want Hermes to do?": line G1 with the group's rows to pick.
// Not a question, so lastq stays false (helper-wants-v1.md 6.3).
function pickGroupSteps(group, st) {
  st.pending = null
  st.lastq = false
  return { kind: 'G1', group, buttons: WROWS.filter(r => r.group === group).map(r => r.id) }
}
// A row picked (under G1, N2 or "Which one do you mean?"): its line and its button. No key words.
function pickWantSteps(id, st) {
  st.pending = null
  st.lastq = false
  return { kind: 'want', row: id }
}

// An answer under "Do you mean me, or your own Hermes?" (RM2): 'helper' or 'hermes'.
function rmPickSteps(who, st) {
  st.lastq = false
  if (who === 'helper') return { kind: 'RM3' }
  return pressSteps('mem', st.rmText || '', st)
}

// Skip, at "What's your name?" or "What do you do?". A name given before Skip is kept now.
// changes-14: a pressed Skip is remembered (met). changes-15: a name given before Skip was written at F1.
function skip(st) {
  if (st.stage !== 'name' && st.stage !== 'work') return null
  st.stage = 'open'
  st.lastq = false
  st.pending = null
  st.met = true
  const out = { kind: 'F3' }
  noteLast(st, out)
  if (st.name && st.kept.name !== st.name) keep(st, out, 'name', st.name)
  return attachOffer(out, st, null) // offer-t1: F3 carries the offer general
}

// A button that makes Helper say one more pre-written line.
function sayLineSteps(line, st) {
  st.lastq = false
  st.pending = null
  return { kind: 'extra', line }
}

// offer-t1 (route2.py press_offer): a thing picked under an offer, by its id only, never by key words.
// ask-fix-t1 point 8 (not in route2.py): a pick of the pay offer (ChatGPT, Claude, Neither, I want it free) is kept
// as a picked answer to the model question is.
function pressOffer(thing, st) {
  const g = OF.things[thing].gives
  const prevTopic = st.lastTopic
  let o
  if (g.kind === 'topic_pick') o = pickTopicSteps(g.id, st)
  else if (g.kind === 'term') o = { kind: 'term', term: g.id }
  else if (g.kind === 'row') {
    o = { kind: 'row', topic: g.id.slice(0, 3), need: g.id }
    if (thing.startsWith('pay_')) {
      st.found.mod = g.id
      keep(st, o, 'mod', g.id)
    }
  } else if (g.kind === 'setup_chat') o = { kind: 'SETUP_' + g.id }
  else o = { kind: g.id }
  noteLast(st, o)
  return attachOffer(o, st, prevTopic)
}

// "See what I keep" pressed where Helper's settings page cannot open: the list, as for A1.
const seeKept = st => noteLast(st, aboutKept({ kind: 'A1' }, st))
// "Delete all of it" under that list: the A4 question.
const askForgetAll = st => noteLast(st, aboutKept({ kind: 'A4' }, st))

// Yes or No under "Delete your name?" (what: name, mod, msg, svc, asked) or "Delete everything I
// keep about you?" (what: 'all'). Yes deletes from the visit's record; the page then writes it.
// When nothing is left, the whole record goes, told as well (keeps.storage), so the first-time
// line shows again at the next keep. A forgotten name is not used again in this visit either.
function forgetAnswerSteps(what, yes, st) {
  st.lastq = false
  st.pending = null
  if (!yes) return { kind: 'A-no', what }
  if (what !== 'all') delete st.kept[what]
  if (what === 'work') delete st.kept.told_work // changes-4: told again when kept anew
  if (what === 'all' || !hasKeptValues(st.kept)) for (const k of Object.keys(st.kept)) delete st.kept[k]
  if (what === 'all' || what === 'name') st.name = null
  return { kind: 'A-yes', what }
}

// changes-14/15 (route2.py conv: note_last after a pick or a button): Helper's last line, whatever led to it.
// Every pick and button below notes its line; st is each one's last argument.
const noted = fn => (...a) => noteLast(a[a.length - 1], fn(...a))
const pick = noted(pickSteps)
const pickTopic = noted(pickTopicSteps)
const change = noted(changeSteps)
const press = noted(pressSteps)
const pickGroup = noted(pickGroupSteps)
const pickWant = noted(pickWantSteps)
const rmPick = noted(rmPickSteps)
const sayLine = noted(sayLineSteps)
const forgetAnswer = noted(forgetAnswerSteps)

/* ---------- from a result to what Helper says ---------- */
const fillSlots = (text, slots) => text.replace(/\{(\w+)\}/g, (m, k) => (slots[k] != null ? String(slots[k]) : m))

// Hermes's own screens a "part" button opens: the address, and the name the button's label takes.
// Each address ran in Hermes Desktop v0.23.0 (docs/build/talk-v1-stage1.md). Bots has no address:
// a line that would end in "Open Bots" gets no button; in its place Helper says the data's line
// about where that tab is. A part that is not listed here gets nothing.
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
  Object.values(FIXED).forEach(f => take(f.next)) // ask-fix-t1: PRIV-next, SAFE-next
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
const labelOf = id => (TOPICS[id] ? TOPICS[id].pick.label : WANT_ROWS[id] ? WANT_ROWS[id].label : TALK_DATA.held_labels[id] || TERMS[id].label)
const yesNo = (answers, what) => ({ kind: 'question', hint: TALK_DATA.answers.hint_under_question, items: answers.map(a => ({ id: `forget-${what}-${a.gives}`, label: a.label, forget: [what, a.gives === 'yes'] })) })
// A group's rows to pick (under G1 and N2), three and "More" when over four.
const rowPicks = (ids, kind) => ({ kind, hint: TALK_DATA.answers.hint_under_question, items: pageOf(ids.map(id => ({ id, label: WANT_ROWS[id].label, want: id }))) })
// A row's button: "Show me what to ask" (text to paste) or, for an optional skill, "Show me how to
// add it" (the app's clicks, then the line that it works from the next new chat).
function wantNext(n, name) {
  if (n.kind === 'steps') return { kind: 'steps', label: n.label, steps: n.steps.map(s => fillSlots(s, { name })), after: fillSlots(n.after, { name }) }
  return { kind: 'paste', label: n.label, text: n.paste_text }
}
// A source as the talk data writes it: "file line N" (or "lines" for several of one file).
const sourceText = sources => (sources || []).map(s => `${s.file} line ${s.line}`).join('; ') || null
// S1 or S2 for a skill with no row of its own: Helper's fixed line, the box "From the Hermes docs"
// with the page's own words (not Helper's voice), and for an optional skill the clicks to add it.
// Skill lines v1 (content/helper-skill-lines-v1.md): the line says "It teaches Hermes to {say}", the
// skill's own plain words; a skill whose say is null gets the old sentence, kept as text_fixed.
function skillLine(name, said) {
  const s = WSKILLS.get(name)
  const f = WANTS_DATA.fixed[s.kind === 'optional' ? 'S2' : 'S1']
  const text = s.say != null && /\{say\}/.test(f.text) ? fillSlots(f.text, { name, say: s.say }) : fillSlots(f.text_fixed !== undefined ? f.text_fixed : f.text, { name })
  const docs = { head: WANTS_DATA.fixed['box-head'].text, words: s.docs_words, source: `${s.page} line ${s.line}` }
  return said(s.kind === 'optional' ? 'S2' : 'S1', text, { source: docs.source, docs, next: f.next ? wantNext(f.next, name) : null })
}

// The words for one kept thing (keeps.things[].kept_words): "Peter", "you pay for ChatGPT",
// "you use WhatsApp", "you use Gmail", or the thing as asked.
function keptWords(key, value) {
  if (key === 'mod') {
    const v = KEEPS.answers.mod.values.find(x => x.need === value)
    return v ? v.value : String(value)
  }
  const thing = KEEPS.things.find(x => x.id === key)
  return fillSlots(thing ? thing.kept_words : '{value}', { name: value, app: value, service: value, thing: value, work: value, value })
}
// The rows of the list behind "See what I keep" (keeps.tell.see.rows), in their order.
function keptRows(kept) {
  const R = KEEPS.tell.see.rows
  const rows = []
  if (kept.name) rows.push(fillSlots(R.name, { name: kept.name }))
  if (kept.work) rows.push(fillSlots(R.work, { work: kept.work })) // changes-4: second, after the name
  if (kept.mod) rows.push(fillSlots(R.mod, { value: keptWords('mod', kept.mod) }))
  if (kept.msg) rows.push(fillSlots(R.msg, { app: kept.msg }))
  if (kept.svc) rows.push(fillSlots(R.svc, { service: kept.svc }))
  for (const t of kept.asked || []) rows.push(fillSlots(R.asked, { thing: t }))
  return rows
}
// The faint line at every keep: "Kept: Peter." Values kept in the same moment share one line, each
// ending with a full stop. The first time anything is kept, the first-time line goes under it
// (the version for a build with no AI step).
function keptNote(result, st) {
  if (!result.kept || !result.kept.length) return null
  const words = result.kept.map(k => (k === 'asked' ? result.thing : keptWords(k, st.kept[k])))
  // items: what this line says was kept, [key, value] each, so the page can mark the line once
  // that is no longer kept (forgotten, or replaced by a newer one)
  const items = result.kept.map(k => [k, k === 'asked' ? result.thing : st.kept[k]])
  // workTold: changes-4's line that the AI is told what the person does (lines_by_mode.work_told; none with no AI step)
  return { text: fillSlots(KEEPS.tell.kept_line, { kept_words: words.join('. ') }), link: KEEPS.tell.link.words, first: result.first ? FIRST_TIME : null, ...(result.work_first && WORK_TOLD ? { workTold: WORK_TOLD } : {}), items }
}
// Is one thing a faint line named still kept, as it was then? In any capitals (a name saved again
// as "anna" on the settings page is still Anna; "asked" things count the same way in the remember
// step and on the settings page).
function stillKept(kept, [key, value]) {
  const same = a => String(a).toLowerCase() === String(value).toLowerCase()
  if (key === 'asked') return (kept.asked || []).some(same)
  return kept[key] != null && same(kept[key])
}
// A faint line (note: "Kept: ...", or used: "From what I keep: ...") that is no longer true: none
// of what it named is kept any more. (A line names one thing in all but one rare case, a name and
// a typed change in one message; such a line is struck once both are gone.) A thing kept again
// later makes its old line true again, and it is no longer struck.
function noteForgotten(note, kept) {
  if (!note || !kept) return false
  const items = note.items || (note.topic ? [[note.topic, note.value]] : [])
  return items.length > 0 && !items.some(item => stillKept(kept, item))
}

// The opening line. changes-14 (keeps.met): when the window opens on a visit whose met mark is set, Helper says
// BACK ("Hi again, {name}. What would you like Hermes to help you with?", or without the name) and asks no
// opening question; else OPEN with "What's your name?". With no visit: OPEN's line (for the tests).
function openingLine(st = null) {
  if (!st) return lineFor({ kind: 'OPEN' }, freshVisit('name'))
  return lineFor(opening(st), st)
}

// result: what turn, pick, pickTopic, press, skip, sayLine, change, rmPick or forgetAnswer
// returned. typed: the person's words (for the text to paste under "your own Hermes can").
// opts.settingsPage: Helper's page in Hermes's Settings exists (A1 then offers it). opts.keptShown: the
// conversation shows that something was kept (keptWasShown; A1 with nothing kept then says it was deleted).
// Returns { line, text, source, answers, next, paste, note, used, hint, rows, docs }:
//   docs: the box "From the Hermes docs" { head, words, source } (S1, S2), the page's own words;
//   next may also be { kind: 'steps', label, steps, after } (the clicks to add an optional skill);
//   an answer to pick may be { more: [the next ones] } ("More", three at a time, src/page.js).
//   note: the faint "Kept: ..." line { text, link, first }; used: "From what I keep: ..." { text,
//   link, topic }; hint: a small faint line (N_HINT); rows: the list of kept things (A1).
// live-v2 changes-2 (keeps.tell.see.see_line_deleted_when): whether this conversation shows that something was kept:
// a faint "Kept:" or "From what I keep:" line, a kept row in the list, or the "Done." line of a delete (all, or one
// thing). Only what this conversation shows counts, never the met mark, so every visit answers alike.
function keptWasShown(log) {
  const done = [KEEPS.tell.see.delete_all.after_yes, KEEP_TYPED.forget_one.after_yes]
  return log.some(e => e.who === 'helper' && !!(e.note || e.used || (e.rows && e.rows.length) || done.includes(e.text)))
}
// setup-chat: the text and the Q_NEW answers of a line that opens the set-up conversation
const setupOpener = (kind, st) => {
  const q = openQNew(kind, st)
  return [q.text, { answers: q.answers }]
}
function lineFor(result, st, typed = '', opts = {}) {
  // asTyped: the person's own name as filled into the line, for the view to leave as typed (src/quotes.js)
  const asTyped = [st.name, result.name].filter(s => typeof s === 'string' && /['"]/.test(s))
  // offer-t1: the offer a line carries, shown by the page as a second bubble with its things to pick
  const offer = result.offer ? { set: result.offer.set, text: result.offer.text, answers: { kind: 'offer', hint: OF.hint, items: result.offer.picks.map(id => ({ id: 'offer-' + id, label: OF.things[id].label, offer: id })) } } : null
  const said = (line, text, more = {}) => ({ line, text, source: null, answers: null, next: null, paste: null, note: keptNote(result, st), used: null, hint: null, rows: null, docs: null, ...(offer ? { offer } : {}), ...(asTyped.length ? { asTyped } : {}), ...more })
  const named = f => (st.name ? fillSlots(f.text, { name: st.name }) : f.text_no_name || f.text)
  // offer-t1: the faint hint N_HINT is no longer shown; the offer dont_know takes its place
  const dontKnowLine = id => said(id, FIXED[id].text)
  const RM = Object.fromEntries(KEEP_REMEMBER.lines.map(l => [l.id, l]))
  const ONE = KEEP_TYPED.forget_one
  const ALL = KEEPS.tell.see.delete_all
  switch (result.kind) {
    case 'K1':
      return said('K1', FIXED.K1.text)
    case 'H1':
    case 'H2': {
      // changes-16: H2 ("can it build ...?") has its own text to paste, filled the same way as H1's
      const request = Array.from(String(typed).trim()).slice(0, TALK_DATA.limits.request_chars_in_paste).join('').replace(/"/g, "'")
      return said(result.kind, FIXED[result.kind].text, { source: FIXED[result.kind].source || null, paste: fillSlots(FIXED[result.kind].paste_text, { request }) })
    }
    case 'OPEN':
      return said('OPEN', FIXED.OPEN.text)
    // changes-14: a later visit (BACK) and a hello greet by the kept name, or without one
    case 'BACK':
    case 'HELLO': {
      const f = FIXED[result.kind]
      return said(result.kind, result.name ? fillSlots(f.text, { name: result.name }) : f.text_no_name || f.text)
    }
    // changes-14/15: ordinary talk and the lines no_repeat puts in place of a repeat: one line, nothing to pick
    case 'HELLO_SAME':
    case 'THANKS':
    case 'OK':
    case 'HOW':
    case 'WHO':
    case 'AI':
    case 'AI_PICK':
    case 'AI_WRITES':
    case 'BYE':
    case 'CUT':
    case 'MEAN_NONE':
    case 'WRONG':
    case 'AGAIN':
    // live-v2 changes-3: each kind's own line in place of a repeat, and STUCK
    case 'OK_SAME':
    case 'THANKS_SAME':
    case 'HOW_SAME':
    case 'BYE_SAME':
    case 'CUT_SAME':
    case 'WRONG_SAME':
    case 'STUCK':
    case 'STUCK_SAME':
      return said(result.kind, FIXED[result.kind].text)
    // live-v2 changes-4: what the person does, not kept (a secret, too long) or asked again
    case 'WORK_SECRET':
    case 'WORK_LONG':
    case 'WORK_LONG_2':
    case 'WORK_ASK': {
      if (setupOpens(result.kind, st)) return said(result.kind, ...setupOpener(result.kind, st))
      return said(result.kind, WORK.lines[result.kind])
    }
    case 'F1':
      return said('F1', named(FIXED.F1))
    case 'F2':
      if (setupOpens('F2', st)) return said('F2', ...setupOpener('F2', st))
      // talk-live-2: on a later visit (WORK_ASK, a typed change) the result carries the kept name
      return said('F2', result.name && !st.name ? fillSlots(FIXED.F2.text, { name: result.name }) : named(FIXED.F2))
    case 'F3':
      if (setupOpens('F3', st)) return said('F3', ...setupOpener('F3', st))
      return said('F3', FIXED.F3.text)
    case 'TP':
      return said('TP', FIXED.TP.text, { answers: topicPicks() })
    case 'N1':
    case 'N1a':
    case 'N1_AGAIN': // changes-15: in place of a second don't-know line, the faint hint under it as under N1
      return dontKnowLine(result.kind)
    case 'skill by name':
      // an official skill asked about by its name that the skill step did not settle (two at once)
      return { ...dontKnowLine('N1'), line: 'N1-skill' }
    case 'W1': {
      const items = result.buttons.map(id => ({ id, label: labelOf(id), which: id }))
      return said('W1', FIXED.W1.text, { answers: { kind: 'which', hint: TALK_DATA.answers.hint_under_question, items: pageOf(items) } })
    }
    // changes-11: skill and plugin compared, then the same two picks as under W1
    case 'W2': {
      const items = result.buttons.map(id => ({ id, label: labelOf(id), which: id }))
      return said('W2', FIXED.W2.text, { source: FIXED.W2.source || null, answers: { kind: 'which', hint: TALK_DATA.answers.hint_under_question, items: pageOf(items) } })
    }
    // changes-11: the cost line and where to run Hermes, each with its "Open ..." button
    case 'COST':
    case 'WHERE':
      return said(result.kind, FIXED[result.kind].text, { source: FIXED[result.kind].source || null, next: nextFor(FIXED[result.kind].next, null, st) })
    // changes-11: a name typed on a later visit
    case 'NAME_AGAIN':
    case 'NAME_NEW':
      return said(result.kind, fillSlots(FIXED[result.kind].text, { name: result.name }))
    case 'can-q': {
      const q = WANTS_DATA.question
      return said('can-q', q.text, { answers: { kind: 'question', hint: TALK_DATA.answers.hint_under_question, items: q.answers.map(a => ({ id: 'group-' + a.gives_group, label: a.label, group: a.gives_group })) } })
    }
    case 'G1':
      return said('G1', WANTS_DATA.fixed.G1.text, { answers: rowPicks(result.buttons, 'rows') })
    case 'N2':
      return said('N2', WANTS_DATA.fixed.N2.text, { answers: rowPicks(WROWS.filter(r => r.group === result.group).map(r => r.id), 'rows') })
    // talk-live: a reply the person's AI wrote (ai_writes): its words only, no source, nothing to pick
    case 'written':
      return said('written', result.text)
    // talk-live: the Connectors line picked by the person's AI (ai_picks_line), as a row shows it
    case 'CN1':
      return said('CN1', WANTS_DATA.fixed.CN1.text, { source: sourceText(WANTS_DATA.fixed.CN1.sources) })
    case 'want': {
      const r = WANT_ROWS[result.row]
      return said(r.id, r.text, { source: sourceText(r.sources), next: wantNext(r.next, r.thing) })
    }
    case 'skill':
      return skillLine(result.skill, said)
    case 'term': {
      const t = TERMS[result.term]
      return said('term-' + t.id, t.text, { source: t.source, next: nextFor(t.next, null, st) })
    }
    case 'question': {
      const q = TOPICS[result.topic].question
      const answers = q.answers.length ? { kind: 'question', hint: TALK_DATA.answers.hint_under_question, items: q.answers.map((a, i) => ({ id: `${result.topic}-${i}`, label: a.label, answer: [result.topic, i] })) } : null
      return said(q.id, q.text, { answers })
    }
    case 'plain': {
      const p = TOPICS[result.topic].plain
      return said(p.id, p.text, { source: p.source, next: nextFor(p.next, result.topic, st) })
    }
    case 'row': {
      const n = TOPICS[result.topic].needs.find(x => x.id === result.need)
      const used = result.used === 'kept' ? { text: fillSlots(KEEPS.use.used_line, { kept_words: keptWords(result.topic, st.kept[result.topic]) }), link: KEEPS.use.used_link.words, topic: result.topic, value: st.kept[result.topic] } : null
      // changes-6 fix 6: Gmail, Google Calendar, Google Drive: CN1; GitHub: the github skill (S1)
      if (result.serviceLine && result.serviceLine.line === 'S1') return { ...skillLine(result.serviceLine.skill, said), used }
      if (result.serviceLine) {
        const f = WANTS_DATA.fixed[result.serviceLine.line]
        // changes-16: CN2 names the service it was asked about ({service}: Google Calendar or Google Drive)
        return said(result.serviceLine.line, fillSlots(f.text, { service: st.service }), { source: sourceText(f.sources), used })
      }
      return said(n.id, n.text, { source: n.source, next: nextFor(n.next, result.topic, st), used })
    }
    case 'extra': {
      const x = EXTRA_LINES[result.line]
      return said(x.id, x.text, { source: x.source })
    }
    // live changes-6 and -9: a then line (msg0-then, msg1-then); ask-fix-t1: the text of the last line's button, a word
    // line's second wording with the word line's button; live changes-9: a next line's second wording
    case 'then': {
      const x = TOPICS[result.topic].plain.then
      return said(x.id, x.text, { source: x.source || null })
    }
    case 'rowthen': {
      const x = TOPICS[result.topic].needs.find(n => n.id === result.need).then
      return said(x.id, x.text, { source: x.source || null })
    }
    case 'nextline':
      return said(result.id, result.text, { source: (EXTRA_LINES[result.id] || {}).source || null })
    case 'termmean': {
      const t = TERMS[result.term]
      return said(t.mean.id, t.mean.text, { source: t.mean.source || null, next: nextFor(t.next, null, st) })
    }
    case 'nextmean': {
      const x = Object.values(NEXT_MEAN).find(m => m.id === result.id)
      return said(x.id, x.text, { source: x.source || null })
    }
    // ask-fix-t1: the same things to pick stay under it (the page shows the last line's again)
    case 'PICK_FIRST':
      return said('PICK_FIRST', FIXED.PICK_FIRST.text, { samePicks: true })
    // ask-fix-t1: the last line's button again, named in the line
    case 'HOW_PASTE':
    case 'HOW_PART': {
      const next = nextFor(result.button, result.topic || null, st)
      return said(result.kind, fillSlots(FIXED[result.kind].text, { label: next && next.label ? next.label : result.label }), { next })
    }
    case 'RM1':
    case 'RM3':
    case 'RM4':
    case 'RM5':
    case 'RM6':
      return said(result.kind, RM[result.kind].text)
    case 'RM2':
      return said('RM2', RM.RM2.text, { answers: { kind: 'question', hint: TALK_DATA.answers.hint_under_question, items: RM.RM2.answers.map(a => ({ id: `rm-${a.gives}`, label: a.label, rm: a.gives === 'RM3' ? 'helper' : 'hermes' })) } })
    case 'A1': {
      const rows = keptRows(st.kept)
      // live-v2 changes-2: nothing kept, and this conversation shows something was kept (opts.keptShown, from the
      // page's keptWasShown): it was deleted. Else nothing was kept yet.
      if (!rows.length) return opts.keptShown ? said('A1-deleted', KEEPS.tell.see.see_line_deleted) : said('A1-none', KEEPS.tell.see.see_line_nothing)
      // with Helper's settings page: its button, and under the list the way there by hand
      const next = opts.settingsPage ? { kind: 'settings', label: KEEPS.after_settings_page_exists.button_under_see } : { kind: 'forget-all', label: ALL.label }
      return said('A1', KEEPS.tell.see.see_line, { rows, next, hint: opts.settingsPage ? KEEPS.after_settings_page_exists.by_hand : null })
    }
    case 'A2':
      return said('A2-' + result.what, ONE.questions[result.what], { answers: yesNo(ONE.answers, result.what) })
    case 'A4':
      return said('A4', ALL.question, { answers: yesNo(ALL.answers, 'all') })
    case 'A-none':
      return said('A-none', ONE.nothing_kept)
    case 'A-yes':
      return said('A-yes', result.what === 'all' ? ALL.after_yes : ONE.after_yes)
    case 'A-no':
      return said('A-no', result.what === 'all' ? ALL.after_no : ONE.after_no)
    default: {
      // a line that shows the topics it holds ("What Hermes can do")
      const f = FIXED[result.kind]
      if (!f) return dontKnowLine('N1')
      // live changes-6, offer-t1, ask-fix-t1: a fixed line from the docs (PRIV, MIG, KEY ...), with its button if it has one
      if (!result.buttons) return said(result.kind, f.text, { source: f.source || null, next: nextFor(f.next, null, st) })
      return said(result.kind, f.text, { source: f.source || null, answers: { kind: 'pair', hint: TALK_DATA.answers.hint_under_topics, items: (result.buttons || []).map(id => ({ id, label: labelOf(id), topic: id })) } })
    }
  }
}

// The hint in the empty message box. With nothing to pick it is hhdesign's stand-in: the
// data has no words for it.
const REPLY_HINT = 'Reply to Helper'
const hintFor = entry => (entry && entry.answers && entry.answers.items.length ? entry.answers.hint : REPLY_HINT)

// ---- src/setup-reads.js ----
// The reads of the set-up list (content/dash-setup-list-v2.json items[].read), as fixed rules. Pure code, no React, no
// Hermes, no AI: src/setup-look.js reads Hermes and hands the answers here.
//
// One copy (dash-v2, the two branches joined): the Dashboard (src/dash.js, src/dash-rules.js) and Helper's set-up
// conversation (src/setup-look.js) both use these. They began as src/dash-rules.js of job/dash-v1 (65b108b).
// Which bot the reads name is the caller's: the set-up conversation reads the main bot, the Dashboard the bot the app
// has open.
//   install        always done: this page runs only inside an installed Hermes
//   model          setup.runtime_check { profile: main bot } says ok: true (Hermes's own free plan counts)
//   personality    profiles.describe { name: main bot }: soul is not empty and not one of Hermes's starter texts
//   chat_apps      host.status(): gateway_platforms names at least one chat app (not used by the set-up conversation)
//   scheduled_job  cron.manage { action: 'list', profile: main bot, include_disabled: true }: at least one job
//   second_bot     profiles.list: two or more bots
// A read that failed or has not come back is "not known" (null): never shown as done.

/* ---------- Hermes's starter personality texts (hermes_cli/default_soul.py, Hermes v0.23.0) ---------- */
// DEFAULT_SOUL_MD and the four _LEGACY_TEMPLATE_SOULS, copied as hhtech copied them into its test page
// (hhtech-dash-reads.md 1.5); tests/dash-rules.test.mjs compares them with tests/fixtures/hermes-default-souls.json.
const STARTER_HEAD =
  "# Hermes Agent Persona\n\n<!--\nThis file defines the agent's personality and tone.\nThe agent will embody whatever you write here.\nEdit this to customize how Hermes communicates with you.\n\n"
const STARTER_TAIL = 'This file is loaded fresh each message -- no restart needed.\nDelete the contents (or this file) to use the default personality.\n-->'
const STARTER_NOW =
  'You are Hermes Agent, built by Nous Research. Be direct: match the length of your reply to the weight of the ask \u2014 a one-line question gets a one-line answer, and finished work gets a short report of what changed, what\'s verified, and what\'s left, never a replay of the process. No filler ("Great question," "I\'d be happy to"), no restating the request back, no re-summarizing what you already said, no narrating tool calls the user can see. Plain claims over adjectives; when unsure, say so plainly. Agree because it\'s right, not because the user said it. Depth is earned \u2014 give it when the user asks for detail, teaches, or the stakes demand it, not by default.'
const STARTER_SOULS = [
  STARTER_NOW,
  STARTER_HEAD +
    'Examples:\n  - "You are a warm, playful assistant who uses kaomoji occasionally."\n  - "You are a concise technical expert. No fluff, just facts."\n  - "You speak like a friendly coworker who happens to know everything."\n\n' +
    STARTER_TAIL,
  STARTER_HEAD + STARTER_TAIL,
  'You are Hermes Agent, an intelligent AI assistant created by Nous Research. You are helpful, knowledgeable, and direct. You assist users with a wide range of tasks including answering questions, writing and editing code, analyzing information, creative work, and executing actions via your tools. You communicate clearly, admit uncertainty when appropriate, and prioritize being genuinely useful over being verbose unless otherwise directed below. Be targeted and efficient in your exploration and investigations.',
  STARTER_NOW.replaceAll('\u2014', '--')
]
// Hermes's own normalising (_normalize_soul): one kind of line end, no leading BOM, trimmed.
const soulNormal = text => String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\ufeff/, '').trim()
const STARTER_SET = new Set(STARTER_SOULS.map(soulNormal))
const isStarterSoul = text => STARTER_SET.has(soulNormal(text))

/* ---------- which bot ---------- */
// The bots from profiles.list ({ profiles: [{ name, is_default }] }), or null when the read gave none.
function botRows(value) {
  const list = value && Array.isArray(value.profiles) ? value.profiles : null
  if (!list) return null
  const rows = list.filter(p => p && typeof p.name === 'string' && p.name.trim())
  return rows.length ? rows : null
}
// The main bot: the one Hermes marks as default; else the one called default; else the first.
function mainBotName(rows) {
  if (!rows || !rows.length) return null
  const marked = rows.find(p => p.is_default === true) || rows.find(p => p.name === 'default') || rows[0]
  return marked.name
}
// The bot the app has open (host.state.profile; '' from Hermes means the default one).
const openBotName = profile => (typeof profile === 'string' && profile.trim() ? profile.trim() : 'default')

/* ---------- the six rules ---------- */
// reads: { bots, model, soul, status, cron }, each { ok: true, value } | { ok: false } | undefined (still waiting).
// Returns { install, model, personality, chat_apps, scheduled_job, second_bot }: true, false, or null (not known).
function doneFlags(reads) {
  const got = r => (r && r.ok ? r.value : undefined)
  const known = r => !!(r && r.ok)
  const rows = known(reads.bots) ? botRows(got(reads.bots)) : null
  const soul = known(reads.soul) && got(reads.soul) && typeof got(reads.soul).soul === 'string' ? got(reads.soul).soul : null
  const platforms = known(reads.status) && got(reads.status) ? got(reads.status).gateway_platforms : undefined
  const cron = known(reads.cron) ? got(reads.cron) : null
  const jobs = cron && typeof cron === 'object' ? (Number.isInteger(cron.count) ? cron.count : Array.isArray(cron.jobs) ? cron.jobs.length : null) : null
  return {
    install: true,
    model: known(reads.model) && got(reads.model) && typeof got(reads.model) === 'object' ? got(reads.model).ok === true : null,
    personality: known(reads.soul) ? (soul === null ? null : soulNormal(soul) !== '' && !isStarterSoul(soul)) : null,
    chat_apps: known(reads.status) && got(reads.status) && typeof got(reads.status) === 'object' ? !!platforms && typeof platforms === 'object' && Object.keys(platforms).length > 0 : null,
    scheduled_job: jobs === null ? null : jobs >= 1,
    second_bot: rows ? rows.length >= 2 : null
  }
}


/* ---------- a read that always ends ---------- */
// A read that gives up after `ms` (the host's own timer, cleaned up with the plugin). A host door that throws
// instead of rejecting counts as a failed read. Every read ends as { ok: true, value } or { ok: false }.
function makeReader(ctx) {
  return (fn, ms) =>
    new Promise(resolve => {
      let done = false
      const end = r => {
        if (done) return
        done = true
        stop()
        resolve(r)
      }
      const stop = ctx.setTimeout(() => end({ ok: false }), ms)
      Promise.resolve()
        .then(fn)
        .then(
          value => end({ ok: true, value }),
          () => end({ ok: false })
        )
    })
}

// ---- src/setup-chat.js ----
// The set-up conversation (setup-chat; content/helper-setup-chat-v1.json, the content team's): after "What do you
// do?" Helper asks two questions (Q_NEW, Q_GOAL), looks at what is set up, recommends one thing by a fixed rule
// (R1 to R5), gives its steps one at a time, and picks up where it left off on the next visit.
// Pure code: no React, no Hermes, no AI. What Hermes holds is read by src/setup-look.js and handed in as `seen`:
//   seen = { model: 'ok' | 'not' | 'unread', soul: true | false | null, jobs: number | null, bots: number | null }
//   (null = that read failed: Helper then says it couldn't read it, never a guess)
// Every word said here is the team's (src/setup-data.js, made by the build from its two files).
// What is kept between visits (the visit's kept record, src/kept.js): setup_new (the Q_NEW answer id), setup_goal (the
// label or the typed text) with setup_goal_id, setup_done_said (the things the person said are done), setup_current
// (the thing last recommended). Not kept: Skip, Not sure yet, what the look saw, Something else.

const SU = SETUP_DATA
const SU_L = SU.lines
const SU_P = SU.look.parts
const SETUP_ITEMS = SU.items
const SU_Q_NEW = SU.questions.Q_NEW
const SU_Q_GOAL = SU.questions.Q_GOAL
const suFill = (text, slots) => text.replace(/\{([a-z_]+)\}/g, (m, k) => (slots[k] !== undefined ? slots[k] : m))

/* ---------- the rule (hhcontent's build.py, choose) ---------- */
// model: ok | not | unread; isNew: new | some | well | skip; goal: schedule | phone | bots | unsure;
// done: the ids done (seen by a read, said by the person, or Something else in this visit). Returns [item, rule].
function choose(model, isNew, goal, done) {
  const has = id => (done instanceof Set ? done.has(id) : done.includes(id))
  if (model === 'not') return ['model', 'R1']
  if ((isNew === 'new' || isNew === 'skip') && !has('first_chat')) return ['first_chat', 'R2']
  const g = SU.goal_item[goal]
  if (g && !has(g)) return [g, 'R3']
  for (const it of SU.rule_order) {
    if (it === 'first_chat' && (isNew === 'some' || isNew === 'well')) continue
    if (!has(it)) return [it, 'R4']
  }
  return [null, 'R5']
}
const suReasonId = (rule, isNew, goal) => (rule === 'R1' ? 'R1' : rule === 'R2' ? (isNew === 'new' ? 'R2_new' : 'R2_skip') : rule === 'R3' ? 'R3_' + goal : 'R4')
// The written recommendation, without "Want the steps?" (build.py rec_text)
const recText = (item, rule, isNew, goal) => suFill(SU_L.REC.text, { reason: SU.reasons[suReasonId(rule, isNew, goal)], card: SU.items[item].name, why: SU.items[item].why }).replace(/ Want the steps\?$/, '')
const SU_REC_TAIL = SU_L.REC.text.match(/ (Want the steps\?)$/)[1]

/* ---------- the look, as words ---------- */
const suJobsPart = n => (n === null ? SU_P.read_failed : n === 0 ? SU_P.scheduled_job_not : suFill(n === 1 ? SU_P.scheduled_job_done : SU_P.scheduled_job_done_plural, { n }))
const suBotsPart = n => (n === null ? SU_P.read_failed : n < 2 ? SU_P.second_bot_not : suFill(SU_P.second_bot_done, { n }))
const suSoulPart = s => (s === null ? SU_P.read_failed : s ? SU_P.personality_done : SU_P.personality_not)
const suModelPart = m => ({ ok: SU_P.model_ok, not: SU_P.model_not, unread: SU_P.model_unread })[m]
// SEEN: "I looked at your Hermes." + the model part + the goal part (build.py seen_line)
function seenLine(seen, goal) {
  const g = SU.goal_item[goal] || 'personality'
  const part = g === 'chat_apps' ? SU_P.chat_apps_cannot : g === 'scheduled_job' ? suJobsPart(seen.jobs) : g === 'second_bot' ? suBotsPart(seen.bots) : suSoulPart(seen.soul)
  return [SU_P.LOOK_OPEN, suModelPart(seen.model), part].join(' ')
}
// What a read says about one thing: true (done), false (not done), null (the read failed), undefined (cannot be seen)
function seenDone(item, seen) {
  if (item === 'model') return seen.model === 'unread' ? null : seen.model === 'ok'
  if (item === 'scheduled_job') return seen.jobs === null ? null : seen.jobs >= 1
  if (item === 'second_bot') return seen.bots === null ? null : seen.bots >= 2
  if (item === 'personality') return seen.soul
  return undefined
}
// "I can see it now. {seen_part}" (build.py seen_part)
const suSeenPart = (item, seen) => (item === 'scheduled_job' ? suJobsPart(seen.jobs) : item === 'second_bot' ? suBotsPart(seen.bots) : item === 'personality' ? SU_P.personality_done : SU_P.model_ok)
// The six lines behind "What did you look at?"
function lookList(seen) {
  const yn = v => (v === null ? "couldn't check" : v ? 'yes' : 'no')
  const n = v => (v === null ? "couldn't check" : String(v))
  const [a, b, c, d, e, f] = SU.look.list
  return [a, b.replace(/\{[^}]*\}/, seen.model === 'unread' ? "couldn't check" : seen.model === 'ok' ? 'yes' : 'no'), c.replace(/\{[^}]*\}/, yn(seen.soul)), d.replace('{n}', n(seen.jobs)), e.replace('{n}', n(seen.bots)), f]
}
// The things done: seen by a read, said by the person (kept), Something else in this visit
function doneSet(st, seen) {
  const done = new Set([...(st.kept.setup_done_said || []), ...((st.setup && st.setup.other) || [])])
  for (const it of SU.seeable) if (seenDone(it, seen) === true) done.add(it)
  return done
}

/* ---------- what Helper says, in the page's shape ---------- */
const SU_HINT = TALK_DATA.answers.hint_under_question
const suSaid = (line, text, more = {}) => ({ line, text, source: null, answers: null, next: null, paste: null, note: null, used: null, hint: null, rows: null, docs: null, ...more })
// things to pick: [action, label]; the page hands the action back to setupPress
const suPicks = pairs => ({ kind: 'setup', hint: SU_HINT, items: pairs.map(([action, label]) => ({ id: 'setup-' + action, label, setup: action })) })
const suNEW_PICKS = () => suPicks(SU_Q_NEW.answers.map(a => ['new:' + a.id, a.label]))
const suGOAL_PICKS = () => suPicks(SU_Q_GOAL.answers.map(a => ['goal:' + a.id, a.label]))
const suREC_PICKS = labels => suPicks(['rec:steps', 'rec:already', 'rec:other', 'rec:notnow'].map((a, i) => [a, labels[i]]))
const suNamed = (line, name, slots = {}) => (name ? suFill(line.text, { ...slots, name }) : suFill(line.text_no_name, slots))
const suOf = st => (st.setup = st.setup || { stage: null, item: null, step: 0, other: [], reasked: {}, asked: {} })
// the faint "Kept: ..." line under a line (the page strikes it when the thing is no longer kept)
// live changes-6 (lines_by_mode.first_time_grey.setup_told): under the first Kept: line of what goes to the AI (what
// you do, new to Hermes, what you want), once: "Your AI also gets ...". Only in a build that sends them.
const SU_TOLD = SETUP_AI_BUILT ? LIVE_DATA.lines_by_mode.setup_told[AI_MODE] : null
const suKeptNote = (st, key, words, value) => {
  const told = SU_TOLD && !st.kept.told_work ? { workTold: SU_TOLD } : {}
  if (told.workTold) st.kept.told_work = true
  return { text: words, link: TALK_DATA.keeps.tell.link.words, first: null, items: [[key, value]], ...told }
}
const SU_KEPT_LINE = Object.fromEntries(SU.keeps.map(k => [k.key, k.kept_line]))

/* ---------- the lines that open it ---------- */
// F2, F3, WORK_SECRET, WORK_LONG_2 with the set-up conversation built: the team's new text and the Q_NEW answers
// (src/talk.js lineFor calls this for those four)
function openQNew(kind, st) {
  const s = suOf(st)
  s.stage = 'new'
  s.asked.new = true
  return { text: kind === 'F2' ? suNamed(SU_L.F2, st.name || st.kept.name || null) : SU_L[kind].text, answers: suNEW_PICKS() }
}

/* ---------- typed answers ---------- */
const suFlat = text => talkNorm(text).replace(/[ ?!.,]+$/, '')
const suInList = (t, list) => whichOf(t, list).length > 0
function suTypedNew(text) {
  const t = suFlat(text)
  for (const k of SU_Q_NEW.typed.order) if (suInList(t, SU_Q_NEW.typed.lists[k])) return k
  return 'skip'
}
function suTypedGoal(text) {
  const t = suFlat(text)
  for (const k of SU_Q_GOAL.typed.order) if (suInList(t, SU_Q_GOAL.typed.lists[k])) return k
  return 'unsure'
}
const isRestart = text => suInList(suFlat(text), SU.restart_phrases)
const isSetupAsk = text => suInList(suFlat(text), SU.ask_phrases)
const suLabelOf = (answers, text) => answers.findIndex(a => suFlat(a) === suFlat(text))
const SU_STEP_NEXT = ['next', 'done', 'what next', 'ok', 'okay', 'did it', 'yes', 'now what']
const SU_REC_YES = ['yes', 'yeah', 'yep', 'ok', 'okay', 'sure', 'show me', 'steps', 'go on', 'please']
const SU_UNSURE = ['skip', 'not sure', 'not sure yet', "i'm not sure", 'im not sure', "i don't know", 'i dont know', "don't know", 'dont know', 'no idea', 'nothing']
const SU_REC_NO = ['no', 'not now', 'later', 'stop', 'nope']

/* ---------- the moves ---------- */
// Each move is { look: whether the page must read Hermes first, go(seen) -> the lines Helper says }.
// seen may be null when look is false.
const suMove = (look, go) => ({ look, go })

function suRecommend(st, seen, lead = []) {
  const s = suOf(st)
  const isNew = st.kept.setup_new || 'skip'
  const goal = st.kept.setup_goal_id || s.goal || 'unsure'
  const [item, rule] = choose(seen.model, isNew, goal, doneSet(st, seen))
  if (!item) {
    s.stage = null
    s.item = null
    delete st.kept.setup_current
    return [...lead, suSaid('ALL_DONE', SU_L.ALL_DONE.text, { setupOffer: SU_L.ALL_DONE.offer })]
  }
  s.stage = 'rec'
  s.item = item
  s.rule = rule
  st.kept.setup_current = item
  // rec: what the AI step may reword (src/setup-rec.js): the written text stands unless a checked reply replaces it
  return [...lead, suSaid('REC', recText(item, rule, isNew, goal) + ' ' + SU_REC_TAIL, { answers: suREC_PICKS(SU_L.REC.answers), rec: { item, rule, isNew, goal } })]
}
// the open step's three answers (the last step's on the last step)
function suStepPicks(st) {
  const s = suOf(st)
  const last = s.step === SU.items[s.item].steps.length - 1
  const labels = last ? SU_L.STEP.last_step_answers : SU_L.STEP.answers
  const acts = last ? ['step:worked', 'step:stuck', 'step:stop'] : ['step:done', 'step:stuck', 'step:stop']
  return suPicks(acts.map((a, i) => [a, labels[i]]))
}
const suStepSlots = s => ({ n: s.step + 1, total: SU.items[s.item].steps.length, step: SU.items[s.item].steps[s.step] })
function suStepLine(st) {
  const s = suOf(st)
  s.stage = 'step'
  return suSaid('STEP', suFill(SU_L.STEP.text, suStepSlots(s)), { answers: suStepPicks(st) })
}
function suNotNow(st) {
  suOf(st).stage = null
  return [suSaid('NOT_NOW', SU_L.NOT_NOW.text, { setupOffer: SU_L.NOT_NOW.offer })]
}
function suSaidDone(st, item) {
  const list = st.kept.setup_done_said || []
  if (!list.includes(item)) st.kept.setup_done_said = [...list, item]
}
// "It worked" (or "Done, it works now"): Helper reads again
function suWorked(st, seen) {
  const s = suOf(st)
  const item = s.item
  const d = seenDone(item, seen)
  if (d === undefined) {
    suSaidDone(st, item)
    return suRecommend(st, seen, [suSaid('DONE_SAID', SU_L.DONE_SAID.text)])
  }
  if (d === true) return suRecommend(st, seen, [suSaid('DONE_SEEN', suFill(SU_L.DONE_SEEN.text, { seen_part: suSeenPart(item, seen) }))])
  if (d === null) {
    // the read failed: Helper says so and takes the person's word, never a guess (Decided myself, in the report)
    suSaidDone(st, item)
    return suRecommend(st, seen, [suSaid('READ_FAILED', SU_P.read_failed + ' ' + SU_L.DONE_SAID.text)])
  }
  s.stage = 'notseen'
  return [suSaid('NOT_SEEN', ...suNotSeenWords(item))]
}
// setup-chat-2 (changes-1 NOT_SEEN): bots are counted across the whole Hermes, so for A second bot "I only look at your
// main bot" and "I did it on another bot" are untrue: its own line and two answers
const suNotSeenActs = item => (item === 'second_bot' ? ['notseen:steps', 'notseen:notnow'] : ['notseen:steps', 'notseen:otherbot', 'notseen:notnow'])
const suNotSeenLabels = item => (item === 'second_bot' ? SU_L.NOT_SEEN.answers_second_bot : SU_L.NOT_SEEN.answers)
const suNotSeenWords = item => [item === 'second_bot' ? SU_L.NOT_SEEN.text_second_bot : SU_L.NOT_SEEN.text, { answers: suPicks(suNotSeenActs(item).map((a, i) => [a, suNotSeenLabels(item)[i]])) }]

// setup-chat-2 (changes-1 ALREADY_SEEABLE): "I've done this already". Helper has just read again (the move's look). A
// thing it cannot see: kept as said done (DONE_SAID). Seen done now: DONE_SEEN, not kept as said. The read failed:
// Helper says so and takes the person's word (as after It worked). Not seen: "I can't see that yet." with the look's
// own sentence and four answers (three for A second bot); nothing is kept until one of them says so.
const suAlreadyActs = item => (item === 'second_bot' ? ['already:steps', 'already:count', 'already:notnow'] : ['already:steps', 'already:otherbot', 'already:count', 'already:notnow'])
const suAlreadyLabels = item => (item === 'second_bot' ? SU_L.ALREADY_SEEABLE.answers_second_bot : SU_L.ALREADY_SEEABLE.answers)
function suAlready(st, seen) {
  const s = suOf(st)
  const item = s.item
  const d = SU.seeable.includes(item) ? seenDone(item, seen) : undefined
  if (d === true) return suRecommend(st, seen, [suSaid('DONE_SEEN', suFill(SU_L.DONE_SEEN.text, { seen_part: suSeenPart(item, seen) }))])
  if (d === undefined || d === null) {
    suSaidDone(st, item)
    return suRecommend(st, seen, [d === null ? suSaid('READ_FAILED', SU_P.read_failed + ' ' + SU_L.DONE_SAID.text) : suSaid('DONE_SAID', SU_L.DONE_SAID.text)])
  }
  s.stage = 'already'
  return [suSaid('ALREADY_SEEABLE', suFill(SU_L.ALREADY_SEEABLE.text, { not_part: SU_L.ALREADY_SEEABLE.not_part[item] }), { answers: suPicks(suAlreadyActs(item).map((a, i) => [a, suAlreadyLabels(item)[i]])) })]
}
function suStuck(st) {
  const s = suOf(st)
  s.stage = 'stuck'
  const answers = suPicks(['stuck:works', 'stuck:stop'].map((a, i) => [a, SU_L.STUCK.answers[i]]))
  // its own Hermes cannot answer yet: the docs page instead, opened in the person's browser
  if (s.item === 'model') return [suSaid('STUCK_MODEL', SU_L.STUCK_MODEL.text, { answers, next: { kind: 'docs', label: SU_L.STUCK_MODEL.button, url: SU_L.STUCK_MODEL.url } })]
  const text = suFill(SU_L.STUCK.paste, { card: SU.items[s.item].name, step: SU.items[s.item].steps[s.step] })
  // the text to paste, open at once in its box (as the slow-AI line's)
  return [suSaid('STUCK', SU_L.STUCK.text, { answers, paste: text, pasteLabel: SU_L.STUCK.paste_label })]
}
function suAnswerNew(st, id) {
  const s = suOf(st)
  const a = SU_Q_NEW.answers.find(x => x.id === id)
  let note = null
  if (a.kept_as) {
    st.kept.setup_new = id
    note = suKeptNote(st, 'setup_new', suFill(SU_KEPT_LINE.setup_new, { label: a.label }), id)
  } else delete st.kept.setup_new
  s.newAnswered = true
  s.stage = 'goal'
  s.asked.goal = true
  return [suSaid('Q_GOAL', SU_L.Q_GOAL.text, { answers: suGOAL_PICKS(), note })]
}
function suAnswerGoal(st, id, typed, seen) {
  const s = suOf(st)
  const a = SU_Q_GOAL.answers.find(x => x.id === id)
  const text = typed ? workSqueeze(typed) : a.kept_as
  let note = null
  s.goal = id
  if (text && (!typed || workOk(text))) {
    st.kept.setup_goal = text
    st.kept.setup_goal_id = id
    note = suKeptNote(st, 'setup_goal', SU_KEPT_LINE.setup_goal.replace(/\{[^}]*\}/, text), text)
  } else {
    delete st.kept.setup_goal
    delete st.kept.setup_goal_id
  }
  s.seen = seen
  // under the look line: the Kept: line, the faint line, and the button "What did you look at?"
  const look = suSaid('SEEN', seenLine(seen, id), { note, hint: SU.look.under.faint, next: { kind: 'setup', label: SU.look.under.button, setup: 'lookwhat' } })
  return suRecommend(st, seen, [look])
}
function suRestart(st) {
  const s = suOf(st)
  for (const k of ['setup_new', 'setup_goal', 'setup_goal_id', 'setup_current']) delete st.kept[k]
  Object.assign(s, { stage: 'new', item: null, step: 0, goal: null, newAnswered: false, asked: { new: true }, reasked: {} })
  return [suSaid('RESTART', SU_L.RESTART.text, { answers: suNEW_PICKS() })]
}
// "what should I set up first": the question not answered yet first, else the look and the recommendation
function suAsk(st) {
  const s = suOf(st)
  if (!st.kept.setup_new && !s.newAnswered) {
    s.stage = 'new'
    s.asked.new = true
    return suMove(false, () => [suSaid('Q_NEW', SU_Q_NEW.text, { answers: suNEW_PICKS() })])
  }
  if (!st.kept.setup_goal_id && !s.goal) {
    s.stage = 'goal'
    s.asked.goal = true
    return suMove(false, () => [suSaid('Q_GOAL', SU_L.Q_GOAL.text, { answers: suGOAL_PICKS() })])
  }
  return suMove(true, seen => {
    s.seen = seen
    const look = suSaid('SEEN', seenLine(seen, st.kept.setup_goal_id || s.goal || 'unsure'), { hint: SU.look.under.faint, next: { kind: 'setup', label: SU.look.under.button, setup: 'lookwhat' } })
    return suRecommend(st, seen, [look])
  })
}

// A thing picked, or a button pressed: its action. Returns a move, or null when the action is not for this stage.
function setupPress(action, st) {
  const s = suOf(st)
  const [kind, id] = action.split(':')
  // "What did you look at?": the six short lines, under the look's own opening sentence (Decided myself: the data has
  // no sentence for above the list)
  // While a recommendation waits for its answer, its four answers stay under the list, so the person is not left
  // with nothing to pick.
  if (action === 'lookwhat')
    return s.seen ? suMove(false, () => [suSaid('LOOK_LIST', SU_P.LOOK_OPEN, { rows: lookList(s.seen), hint: SU.look.under.faint, answers: s.stage === 'rec' ? suREC_PICKS(SU_L.REC.answers) : null })]) : null
  if (kind === 'new' && s.stage === 'new') return suMove(false, () => suAnswerNew(st, id))
  if (kind === 'goal' && s.stage === 'goal') return suMove(true, seen => suAnswerGoal(st, id, null, seen))
  if (kind === 'rec' && s.stage === 'rec') {
    if (id === 'steps') return suMove(false, () => ((s.step = 0), [suStepLine(st)]))
    if (id === 'notnow') return suMove(false, () => suNotNow(st))
    if (id === 'other')
      return suMove(true, seen => {
        s.other.push(s.item)
        return suRecommend(st, seen, [suSaid('SOMETHING_ELSE', SU_L.SOMETHING_ELSE.text)])
      })
    if (id === 'already') return suMove(true, seen => suAlready(st, seen))
  }
  if (kind === 'already' && s.stage === 'already') {
    if (id === 'steps') return suMove(false, () => ((s.step = 0), [suStepLine(st)]))
    if (id === 'notnow') return suMove(false, () => suNotNow(st))
    if ((id === 'otherbot' && s.item !== 'second_bot') || id === 'count')
      return suMove(true, seen => {
        suSaidDone(st, s.item)
        return suRecommend(st, seen, [id === 'count' ? suSaid('ALREADY_COUNT', SU_L.ALREADY_COUNT.text) : suSaid('DONE_SAID', SU_L.DONE_SAID.text)])
      })
  }
  if (kind === 'step' && s.stage === 'step') {
    if (id === 'done') return suMove(false, () => ((s.step += 1), [suStepLine(st)]))
    if (id === 'worked') return suMove(true, seen => suWorked(st, seen))
    if (id === 'stuck') return suMove(false, () => suStuck(st))
    if (id === 'stop') return suMove(false, () => suNotNow(st))
  }
  if (kind === 'stuck' && s.stage === 'stuck') {
    if (id === 'works') return suMove(true, seen => suWorked(st, seen))
    if (id === 'stop') return suMove(false, () => suNotNow(st))
  }
  if (kind === 'notseen' && s.stage === 'notseen') {
    if (id === 'steps') return suMove(false, () => ((s.step = 0), [suStepLine(st)]))
    if (id === 'notnow') return suMove(false, () => suNotNow(st))
    if (id === 'otherbot' && s.item !== 'second_bot')
      return suMove(true, seen => {
        suSaidDone(st, s.item)
        return suRecommend(st, seen, [suSaid('DONE_SAID', SU_L.DONE_SAID.text)])
      })
  }
  return null
}

// A typed message. Returns a move when the set-up conversation takes it, else null (the ordinary talk answers it;
// the page then calls setupAfter for the line that asks the open question again, once).
// hasTopicWord: the message holds a key word of a topic or a Hermes term (src/talk.js)
function setupTyped(text, st, hasTopicWord = () => false) {
  const s = suOf(st)
  const t = suFlat(text)
  if (!t || looksLikeKey(text)) return null
  if (isRestart(text)) return suMove(false, () => suRestart(st))
  const question = text.includes('?')
  if (s.stage === 'new') {
    const i = suLabelOf(SU_Q_NEW.answers.map(a => a.label), text)
    if (i >= 0) return suMove(false, () => suAnswerNew(st, SU_Q_NEW.answers[i].id))
    if (isSetupAsk(text)) return suAsk(st)
    if (question || hasTopicWord(text)) return null
    return suMove(false, () => suAnswerNew(st, suTypedNew(text)))
  }
  if (s.stage === 'goal') {
    const i = suLabelOf(SU_Q_GOAL.answers.map(a => a.label), text)
    if (i >= 0) return suMove(true, seen => suAnswerGoal(st, SU_Q_GOAL.answers[i].id, null, seen))
    if (isSetupAsk(text)) return suAsk(st)
    if (question) return null
    // typed in place of "Not sure yet": nothing is kept (Decided myself: the data lists no such words)
    if (SU_UNSURE.includes(t)) return suMove(true, seen => suAnswerGoal(st, 'unsure', null, seen))
    return suMove(true, seen => suAnswerGoal(st, suTypedGoal(text), text, seen))
  }
  if (s.stage === 'rec') {
    const i = suLabelOf(SU_L.REC.answers, text)
    const act = i >= 0 ? ['rec:steps', 'rec:already', 'rec:other', 'rec:notnow'][i] : SU_REC_YES.includes(t) ? 'rec:steps' : SU_REC_NO.includes(t) ? 'rec:notnow' : null
    if (act) return setupPress(act, st)
  }
  if (s.stage === 'step') {
    const last = s.step === SU.items[s.item].steps.length - 1
    const labels = last ? SU_L.STEP.last_step_answers : SU_L.STEP.answers
    // the answers of either kind of step count, typed at any step: "It worked" at a step before the last is Done
    const i = Math.max(suLabelOf(labels, text), suLabelOf(last ? SU_L.STEP.answers : SU_L.STEP.last_step_answers, text))
    const act = i >= 0 ? [last ? 'step:worked' : 'step:done', 'step:stuck', 'step:stop'][i] : SU_STEP_NEXT.includes(t) ? (last ? 'step:worked' : 'step:done') : null
    if (act) return setupPress(act, st)
  }
  if (s.stage === 'stuck') {
    const i = suLabelOf(SU_L.STUCK.answers, text)
    if (i >= 0) return setupPress(['stuck:works', 'stuck:stop'][i], st)
  }
  if (s.stage === 'notseen') {
    const i = suLabelOf(suNotSeenLabels(s.item), text)
    if (i >= 0) return setupPress(suNotSeenActs(s.item)[i], st)
  }
  if (s.stage === 'already') {
    const i = suLabelOf(suAlreadyLabels(s.item), text)
    if (i >= 0) return setupPress(suAlreadyActs(s.item)[i], st)
  }
  if (isSetupAsk(text) && !hasTopicWord(text)) return suAsk(st)
  return null
}

// After the ordinary talk answered a question typed in place of an answer to SU_Q_NEW or Q_GOAL: the line that asks
// again, once for each question; else null.
function setupAfter(st) {
  const s = suOf(st)
  if (s.stage === 'new' && !s.reasked.new) {
    s.reasked.new = true
    return suSaid('SETUP_REASK', SU_L.SETUP_REASK.text, { answers: suNEW_PICKS() })
  }
  if (s.stage === 'goal' && !s.reasked.goal) {
    s.reasked.goal = true
    return suSaid('SETUP_REASK_GOAL', SU_L.SETUP_REASK_GOAL.text, { answers: suGOAL_PICKS() })
  }
  // setup-chat-2 (changes-1 STEP_BACK; hhtech-setup-run 1.1: the step was gone after a typed question): while a step is
  // open, after every answer, the step again with its own answers, so Done goes on to the next step. Not after I'm
  // stuck or Stop for now (the stage is then another).
  if (s.stage === 'step' && s.item && SU.items[s.item]) return suSaid('STEP_BACK', suFill(SU_L.STEP_BACK.text, suStepSlots(s)), { answers: suStepPicks(st) })
  return null
}

// setup-chat-2 (changes-1 BACK_SEEN): the one thing a return visit names as seen done: the goal's thing if it is, else
// the first seen done in the order the data's BACK_SEEN gives (scheduled_job, personality, second_bot). What is there
// now, not what changed since (Helper keeps nothing of what it read). null: nothing seen done.
const SU_BACK_ORDER = ['scheduled_job', 'personality', 'second_bot']
function suBackPart(st, seen) {
  const goal = SU.goal_item[st.kept.setup_goal_id]
  const item = [goal, ...SU_BACK_ORDER].find(it => it && SU_BACK_ORDER.includes(it) && seenDone(it, seen) === true)
  const P = SU_L.BACK_SEEN.parts
  if (item === 'scheduled_job') return suFill(seen.jobs === 1 ? P.scheduled_job : P.scheduled_job_plural, { n: seen.jobs })
  if (item === 'second_bot') return suFill(P.second_bot, { n: seen.bots })
  if (item === 'personality') return P.personality
  return null
}
// The opening of a later visit (met is true), after Helper has read Hermes. Returns the lines.
function setupOpening(st, seen) {
  const s = suOf(st)
  const name = st.kept.name || null
  const cur = st.kept.setup_current
  s.seen = seen
  if (cur && SU.items[cur]) {
    s.item = cur
    if (seenDone(cur, seen) === true) return suRecommend(st, seen, [suSaid('BACK_DONE', suNamed(SU_L.BACK_DONE, name, { seen_part: suSeenPart(cur, seen) }))])
    s.stage = 'rec'
    const slots = { card: SU.items[cur].name, why: SU.items[cur].why }
    // setup-chat-2 (changes-1): something else Helper can see is done now: say that, then where we stopped
    const part = suBackPart(st, seen)
    if (part) return [suSaid('BACK_SEEN', suNamed(SU_L.BACK_SEEN, name, { back_part: part })), suSaid('BACK_NEXT', suFill(SU_L.BACK_NEXT.text, slots), { answers: suREC_PICKS(SU_L.BACK_NEXT.answers) })]
    return [suSaid('BACK_REC', suNamed(SU_L.BACK_REC, name, slots), { answers: suREC_PICKS(SU_L.BACK_REC.answers) })]
  }
  if (!st.kept.setup_new) {
    s.stage = 'new'
    s.asked.new = true
    return [suSaid('BACK_Q', suNamed(SU_L.BACK_Q, name), { answers: suNEW_PICKS() })]
  }
  if (!st.kept.setup_goal_id) {
    // SU_Q_NEW answered, SU_Q_GOAL never shown: "Q_GOAL with the Hi again opening" (the data's BACK_Q note)
    s.stage = 'goal'
    s.asked.goal = true
    return [suSaid('BACK', suNamed(SU_L.BACK, name)), suSaid('Q_GOAL', SU_L.Q_GOAL.text, { answers: suGOAL_PICKS() })]
  }
  const back = suSaid('BACK', suNamed(SU_L.BACK, name))
  const lines = suRecommend(st, seen, [back])
  // everything done: the old BACK alone, with its offer (the data's BACK: "Unchanged, for R5 (all done) only")
  if (lines.at(-1).line === 'ALL_DONE') return [{ ...back, setupOffer: SU_L.BACK.offer }]
  return lines
}
// "start again" from Helper's settings page (the button "Ask me the set-up questions again"): the same as typed
const setupRestartMove = st => suMove(false, () => suRestart(st))
// The four rows of what the set-up conversation keeps, for Helper's settings page: [key, the row's name, what it shows]
function setupRows(kept) {
  const name = Object.fromEntries(SU.keeps.map(k => [k.key, k.row]))
  const rows = []
  const a = SU_Q_NEW.answers.find(x => x.id === kept.setup_new)
  if (a) rows.push(['setup_new', name.setup_new, a.label])
  if (kept.setup_goal) rows.push(['setup_goal', name.setup_goal, kept.setup_goal])
  const said = (kept.setup_done_said || []).filter(id => SU.items[id])
  if (said.length) rows.push(['setup_done_said', name.setup_done_said, said.map(id => SU.items[id].name).join(', ')])
  if (kept.setup_current && SU.items[kept.setup_current]) rows.push(['setup_current', name.setup_current, SU.items[kept.setup_current].name])
  return rows
}
// The stored keys behind each row, and the ones "Ask me the set-up questions again" clears (the things said done stay)
const SETUP_ROW_KEYS = { setup_new: ['setup_new'], setup_goal: ['setup_goal', 'setup_goal_id'], setup_done_said: ['setup_done_said'], setup_current: ['setup_current'] }
const SETUP_ASKED_KEYS = ['setup_new', 'setup_goal', 'setup_goal_id', 'setup_current']
const SETUP_ALL_KEYS = [...SETUP_ASKED_KEYS, 'setup_done_said']
// The pick "Set up Hermes" under an offer (offers.things.setup): the question not answered yet, else the look and REC
const setupAskMove = st => suAsk(st)
// Whether a later visit opens with the set-up conversation (always, once it is built)
const SETUP_UNSEEN = { model: 'unread', soul: null, jobs: null, bots: null }

// ---- src/setup-look.js ----
// The look of the set-up conversation (setup-chat): Helper reads what is set up in the person's Hermes, on this
// computer, with no AI call and nothing sent anywhere. The reads are the set-up list's (content/dash-setup-list-v2.json
// items[].read), the main bot only, as hhtech ran them in the app (docs/answers/hhtech-dash-reads.md, -reads2.md):
//   host.profiles.list()                                             the bots; the main bot is the one marked default
//   setup.runtime_check { profile: main }                            a model that answers
//   profiles.describe { name: main }                                 its personality text (SOUL.md)
//   cron.manage { action: 'list', profile: main, include_disabled }  its scheduled jobs (always with profile)
// Every read ends as { ok: true, value } or { ok: false } (failed, threw, or gave no answer in LOOK_READ_MS); a failed
// read is "couldn't check" (null, or model 'unread'), never a guess. The rules that turn the answers into done or not
// done are src/setup-reads.js (the Dashboard job's), and so is makeReader (one copy, shared with src/dash.js).

const LOOK_READ_MS = 8000
// What Helper has seen when nothing could be read (also before the first look comes back)
const LOOK_UNSEEN = { model: 'unread', soul: null, jobs: null, bots: null }

// The reads' answers as what the set-up conversation uses (src/setup-chat.js `seen`)
function seenFrom(reads) {
  const f = doneFlags(reads)
  const rows = reads.bots && reads.bots.ok ? botRows(reads.bots.value) : null
  const cron = reads.cron && reads.cron.ok ? reads.cron.value : null
  const jobs = cron && typeof cron === 'object' ? (Number.isInteger(cron.count) ? cron.count : Array.isArray(cron.jobs) ? cron.jobs.length : null) : null
  return { model: f.model === null ? 'unread' : f.model ? 'ok' : 'not', soul: f.personality, jobs, bots: rows ? rows.length : null }
}

// look() reads Hermes now and resolves with `seen`; it never rejects.
function makeLook(ctx, host) {
  const read = makeReader(ctx)
  const request = (method, params) => read(() => host.request(method, params, LOOK_READ_MS), LOOK_READ_MS)
  return async function look() {
    try {
      const bots = await read(() => host.profiles.list(), LOOK_READ_MS)
      const rows = bots.ok ? botRows(bots.value) : null
      // the main bot's three reads need its name; when the bots read failed they are not made (never another bot's answer)
      const main = mainBotName(rows)
      const notRead = Promise.resolve({ ok: false })
      const [model, soul, cron] = await Promise.all([
        main ? request('setup.runtime_check', { profile: main }) : notRead,
        main ? request('profiles.describe', { name: main }) : notRead,
        main ? request('cron.manage', { action: 'list', profile: main, include_disabled: true }) : notRead
      ])
      return seenFrom({ bots: rows ? bots : { ok: false }, model, soul, cron })
    } catch {
      return { ...LOOK_UNSEEN }
    }
  }
}

// ---- src/live-rows.js ----
// Which of Helper's checked rows the person's AI is handed (talk-live row 2): hhtech's live.py score, by_words
// and rank_in (dev/checks/hhtech-live-reply/live.py lines 45 to 57), the follow-up rule and the next lines of
// content/helper-talk-live-v2.json (follow_up, rows). Never more than 5 rows, never a whole list.
// No React, no requests: tests/live-rows.test.mjs compares the ids with live.py's on the same data.

const LIVE_ROWS = LIVE_DATA.rows
const LIVE_ROW = Object.fromEntries(LIVE_ROWS.map(r => [r.id, r]))
// the rows word matching and the subjects rank (the next lines have no key words of their own)
const SCORED = LIVE_ROWS.filter(r => !r.next_of)
// a row's next lines: its button's line, its then line (live changes-6 and -9) and, on a follow-up only, its second
// wording (ask-fix-t1 skill-mean, plugin-mean; live changes-9 use1-next-mean); a next line may have one of its own
const NEXT_OF = {}
for (const r of LIVE_ROWS.filter(x => x.next_of)) (NEXT_OF[r.next_of] = NEXT_OF[r.next_of] || []).push(r)
const STOP = new Set(LIVE_DATA.stop_words)
const MAX_HANDED = LIVE_DATA.max_handed

// live.py words(): the words of 3 letters or more that are not stop words, lower case
const liveWords = s => new Set((String(s).toLowerCase().match(/[a-z0-9']+/g) || []).filter(w => !STOP.has(w) && w.length > 2))

// live.py score(): 2 for each key word found, 0.5 if any weak word is found, 0.5 for each word shared
// with the row's text and title
function rowScore(text, row) {
  const t = talkNorm(text)
  let s = 2 * whichOf(t, row.kw).length + 0.5 * Math.min(1, whichOf(t, row.weak).length)
  const mine = liveWords(text)
  for (const w of liveWords(row.text + ' ' + row.title)) if (mine.has(w)) s += 0.5
  return s
}

// live.py by_words(): every row scored, best first (Python sorts the (score, id) pairs from the top, so of
// two rows with the same score the greater id comes first), the first 4, those with 2 or more
function byWords(text, k = 4) {
  const scored = SCORED.map(r => [rowScore(text, r), r.id])
  scored.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
  return scored.slice(0, k).filter(([s]) => s >= 2).map(([, id]) => id)
}

// live.py rank_in(): a subject's rows by the same score, best first, rows with the same score in the data's
// order; the first 5, score 0 included
function rankIn(text, subject, k = MAX_HANDED) {
  const rows = SCORED.filter(r => r.subject === subject).map(r => [rowScore(text, r), r.id])
  rows.sort((a, b) => b[0] - a[0])
  return rows.slice(0, k).map(([, id]) => id)
}

// rows.from item 2: a next line is handed with its row, right after it; then cut at 5
// followUp: the message is a follow-up, so the second wordings are handed too
function withNext(ids, followUp = false) {
  const out = []
  const add = id => {
    if (!out.includes(id)) out.push(id)
    for (const n of NEXT_OF[id] || []) if (followUp || !n.follow_only) add(n.id)
  }
  ids.forEach(add)
  return out.slice(0, MAX_HANDED)
}

// The row of a line code showed, from the visit's note of Helper's last line (src/talk.js lineKey: kind, topic,
// need, term, buttons, row, ...). null: a line that came from no row.
function rowOfKey(key) {
  if (!key) return null
  let k
  try {
    k = JSON.parse(key)
  } catch {
    return null
  }
  if (!Array.isArray(k)) return null
  const [kind, topic, need, term, , row] = k
  // live changes-6 and -9, ask-fix-t1: a then line, a word line's second wording and the text of a line's button
  // came from the row they belong to
  const id = kind === 'row' || kind === 'rowthen' ? need : kind === 'termmean' ? term : kind === 'nextline' ? need || term || (LIVE_ROWS.find(r => r.shows.kind === 'plain' && r.shows.topic === topic) || {}).id : kind === 'plain' || kind === 'then' ? (LIVE_ROWS.find(r => r.shows.kind === 'plain' && r.shows.topic === topic) || {}).id : kind === 'term' ? term : kind === 'want' ? row : ['COST', 'WHERE', 'CN1'].includes(kind) ? kind : null
  return id && LIVE_ROW[id] ? id : null
}

// follow_up.rule: the kinds of Helper's last line that came from rows. The data says wants; the plugin's kind
// is want. written: a reply the AI wrote that used rows.
const FROM_ROWS = ['row', 'plain', 'term', 'want', 'COST', 'WHERE', 'written', 'then', 'rowthen', 'termmean', 'nextline']
const FOLLOW_CUT = ['ok', 'okay', 'so', 'and', 'cool', 'right']
const PHRASES = LIVE_DATA.follow_up.phrases
// the whole message, end marks and the lead words ok, okay, so, and, cool, right cut, is one of the phrases
function isFollowPhrase(text) {
  const bare = s => s.replace(/[ ?!.,]+$/, '').trim()
  let t = bare(talkNorm(text))
  if (PHRASES.includes(t)) return true
  for (;;) {
    const w = FOLLOW_CUT.find(c => t.startsWith(c + ' ') || t.startsWith(c + ','))
    if (!w) return false
    t = t.slice(w.length).replace(/^[ ,]+/, '')
    if (PHRASES.includes(bare(t))) return true
  }
}

// Whether a message is a follow-up (follow_up.rule): Helper's last line came from rows, and the no-AI turn
// found ordinary talk of kind mean (plain with why "what do you mean", or MEAN_NONE) or kind stuck, or the message
// is a phrase.
// before: the visit's note of Helper's last line as it was before this message ({ last, lastKey, liveRows }).
function isFollowUp(text, pre, before) {
  const fromRows = before.last === 'written' ? !!(before.liveRows && before.liveRows.ids.length) : FROM_ROWS.includes(before.last)
  if (!fromRows) return false
  const mean = pre.kind === 'MEAN_NONE' || (pre.kind === 'plain' && pre.why === 'what do you mean')
  // live-v2 changes-3: kind stuck ("that didn't work") is a follow-up too
  const stuck = pre.kind === 'STUCK' || pre.kind === 'STUCK_SAME'
  return mean || stuck || isFollowPhrase(text)
}

// follow_up.rows: the rows handed for the person's previous message, in the same order, each with its next
// line; if that message got a line from code, the row of that line with its next line. At most 5.
function followRows(before) {
  if (before.liveRows && before.liveRows.key === before.lastKey) return withNext(before.liveRows.ids, true)
  const id = rowOfKey(before.lastKey)
  return id ? withNext([id], true) : []
}

// What a handed row shows when the AI picks it (pick_only.read): the result code would give for that row.
function resultOfRow(id) {
  const r = LIVE_ROW[id]
  return r ? { ...r.shows } : null
}

// ---- src/live-checks.js ----
// Reading what the person's AI sent back, and the checks a written reply must pass before it is shown
// (talk-live row 4). A port of hhcontent's check_live.py (fix and run_checks, dev/checks/hhcontent-live-v2),
// with the checks c18 and c23 that need the conversation, which only the page has. The lists come from
// content/helper-talk-live-v2.json checks (src/live-data.js); the Python patterns of the talk data go through
// pyRegExp. tests/live-checks.test.mjs gives every recorded reply the flags check_live.py gives it.
// The person is never told a check failed: a failure only means the pre-written line is shown.

const LC = LIVE_DATA.checks
const SUBJECT_IDS = LIVE_DATA.subjects.map(s => s.id)
const LC_R9 = pyRegExp(LC.r9_pattern, 'i')
const LC_R6 = pyRegExp(LC.r6_pattern, 'gi')
const LC_R8 = new RegExp('\\b(?:' + LC.r8_never.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi')
// live changes-6 (checks.list c16.allow_c6, check_live.py c16_fails): guide and guides fail only in a sentence that
// speaks of Helper; every other product word fails as before
const C16_HELPER = pyRegExp(LC.c16_allow.speaks_of_helper, '')
function c16Fails(reply) {
  for (const sent of String(reply).split(/(?<=[.!?])\s+/)) {
    for (const m of sent.matchAll(LC_R8)) if (!LC.c16_allow.words.includes(m[0].toLowerCase()) || C16_HELPER.test(sent)) return true
  }
  return false
}
const LC_R5 = LC.r5_patterns.map(p => pyRegExp(p, 'i'))
const GLOSS_RX = LC.gloss.map(g => [pyRegExp(g.term, g.ignore_case ? 'i' : ''), pyRegExp(g.explained_by, 'i')])
const OK_CAPS = new Set(LC.ok_caps)
const liveEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SKILL_RX = LC.skills.map(s => [s.toLowerCase(), new RegExp('(^|[^a-z0-9-])' + liveEsc(s.toLowerCase()) + '($|[^a-z0-9-])')])
const NOT_RX = Object.fromEntries(Object.entries(LC.not_words).map(([cls, ws]) => [cls, ws.map(w => new RegExp("(^|[^a-z'])" + liveEsc(w) + "($|[^a-z'])", 'g'))]))
const MONEY_RX = LC.money_words.map(m => [m, new RegExp('(^|[^a-z])' + liveEsc(m) + '($|[^a-z])')])
const ASKED_AGAIN = TALK_DATA.no_repeat.asked_again

// live-v2 changes-5, checks_c5.no_reply (it replaces talk-live-2's constants from hhtech-weak-ai): before any other
// check, the text is no reply (the same as no answer in 12 s) when, after trimming, it starts with one of starts (any
// case), holds one of holds (exact), or holds <think> with no </think>. As check_c5.py's no_reply(): a reply that
// starts with a closed <think> block counts too (talk-live-2 cut a closed block first).
const NR_STARTS = LIVE_DATA.no_reply.starts.map(s => s.toLowerCase())
const NR_HOLDS = LIVE_DATA.no_reply.holds
function noReply(raw) {
  const s = String(raw == null ? '' : raw).trim()
  const low = s.toLowerCase()
  return NR_STARTS.some(p => low.startsWith(p)) || NR_HOLDS.some(h => s.includes(h)) || (s.includes('<think>') && !s.includes('</think>'))
}

// <think>...</think> blocks, and an unclosed <think> with everything after it (a reply cut off by max_tokens
// while the model still thinks)
const cutThink = s => String(s || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '')

// first_call.read: lower case, <think> cut, the first word that is a subject id; none found: none
function readSubject(raw) {
  const words = cutThink(raw).toLowerCase().match(/[a-z_]+/g) || []
  return words.find(w => SUBJECT_IDS.includes(w)) || 'none'
}

// pick_only.read: <think> cut, then spaces, full stops, brackets, backticks and quote marks at both ends.
// Returns { id } for a handed id, or { word: 'TALK' | 'BUILD' | 'NONE' }; anything else counts as NONE.
function readPick(raw, ids) {
  const a = cutThink(raw).replace(/^[\s.[\]`"']+|[\s.[\]`"']+$/g, '')
  if (ids.includes(a)) return { id: a }
  const up = a.toUpperCase()
  if (up.startsWith('TALK')) return { word: 'TALK' }
  if (up.startsWith('BUILD')) return { word: 'BUILD' }
  return { word: 'NONE' }
}

// c0 and c1, the two fixes (check_live.py fix(), and writer.read for USED:). Returns { text, used }: used is
// the ids after the last USED: (null when there is none: not a failure, as run).
function readWritten(raw) {
  let s = cutThink(raw).trim()
  // live changes-6 (checks_c5.used_reader, check_live.py read_used): the label in any case (USED, Used, used), the last
  // one; from the label to the end of its line is the list, cut from the reply. When nothing is left after trimming
  // spaces, full stops and commas, or only the word none, there is no reply ("Used: none." is never shown). A second
  // label still in the reply fails c26.
  const usedAll = [...s.matchAll(/\bused\s*:(.*)$/gim)]
  let used = null
  if (usedAll.length) {
    const m = usedAll[usedAll.length - 1]
    used = m[1].match(/[A-Za-z_0-9-]+/g) || []
    s = (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim()
    if (/^(?:none)?$/i.test(s.replace(/^[\s.,]+|[\s.,]+$/g, ''))) s = ''
  }
  // a code fence around the whole reply, then quote marks around the whole reply
  s = s.replace(/^```\w*\s*|\s*```$/g, '').trim()
  if (s.length > 1 && '"\'\u201c'.includes(s[0]) && '"\'\u201d'.includes(s[s.length - 1])) s = s.slice(1, -1).trim()
  // c1: curly quotes straight, "!" to ".", a dash between words to ", ", ";" to ","
  s = s.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/!/g, '.')
  s = s.replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/\s*;\s*/g, ', ')
  return { text: s, used }
}

// c2: the whole reply is the word NONE or BUILD (as writer.read: a reply that starts with it, any case)
function replyWord(text) {
  const up = String(text).trim().toUpperCase()
  return up.startsWith('NONE') ? 'NONE' : up.startsWith('BUILD') ? 'BUILD' : null
}

function notClasses(text) {
  let t = String(text).toLowerCase()
  for (const p of LC.not_cut_first) t = t.split(p).join(' ')
  const found = new Set()
  for (const cls of ['no_have', 'cannot', 'does_not', 'is_not', 'not']) {
    for (const re of NOT_RX[cls]) {
      re.lastIndex = 0
      if (re.test(t)) {
        found.add(cls)
        re.lastIndex = 0
        t = t.replace(re, ' ')
      }
    }
  }
  return found
}
const moneyCut = s => {
  let t = String(s).toLowerCase()
  for (const p of LC.money_cut_first) t = t.split(p).join(' ')
  return t
}
// c23's "the same words": lower case, marks dropped, spaces squeezed
const sameWords = s => talkNorm(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()

// The checks c3 to c23 on a reply after c0 and c1 (check_live.py run_checks, in the data's order). Every
// failed check is listed (the turn shows the fallback when the list is not empty).
//   rows: the rows handed, [{ id, text }]; used: the ids after USED: (or null)
//   talk: { lastLine: Helper's last line as shown, message: the person's newest message } for c18 and c23
// live-v2 changes-4, c24: a claim about the person beyond what was kept (checks.list c24, apply_c4_check.py
// c24_fails): after each "you run", "as a", "your" ... up to 3 words in the same sentence part; a word of 3 letters
// or more that is not a stop word, not on person_ok, and (with or without a final s) not a word of what was kept, of
// the person's newest message or of the rows handed fails. Returns the first such word, or null.
const C24_RX = new RegExp(LC.c24.person_pattern, 'gi')
const C24_STOP = new Set([...LIVE_DATA.stop_words, ...LC.c24.person_ok])
const c24Words = s => new Set((String(s || '').toLowerCase().match(/[a-z']+/g) || []).map(w => w.replace(/s+$/, '')))
function c24Fails(reply, work, message, hand) {
  const allowed = new Set([...c24Words(work), ...c24Words(message), ...c24Words(hand)])
  C24_RX.lastIndex = 0
  for (const m of String(reply).matchAll(C24_RX)) {
    const part = reply.slice(m.index + m[0].length).split(/[.,;!?]/)[0]
    for (const w of (part.match(/[A-Za-z']+/g) || []).slice(0, 3)) {
      const lw = w.toLowerCase()
      if (lw.length >= 3 && !C24_STOP.has(lw) && !allowed.has(lw.replace(/s+$/, ''))) return w
    }
  }
  return null
}

function replyFlags(reply, rows, used, talk = {}) {
  const ids = rows.map(r => r.id)
  const textOf = Object.fromEntries(rows.map(r => [r.id, r.text]))
  const hand = rows.map(r => r.text).join(' ').toLowerCase()
  const out = []
  if (used && used.some(u => !ids.includes(u) && u.toLowerCase() !== 'none')) out.push('c3 USED not handed')
  const nw = (reply.match(/\S+/g) || []).length
  const ns = reply.trim().split(/(?<=[.!?])\s+/).filter(s => s.trim()).length
  if (nw > LC.max_words) out.push(`c4 words ${nw}`)
  if (ns > LC.max_sentences) out.push(`c5 sentences ${ns}`)
  if (reply.split('?').length - 1 > 1) out.push('c6 two ?')
  if (LC_R9.test(reply)) out.push('c7 offer')
  for (const n of reply.match(/\b\d[\d.,:]*\b/g) || []) if (!hand.includes(n.toLowerCase())) out.push('c8 number ' + n)
  for (const m of reply.matchAll(/"([^"]{2,40})"/g)) if (!hand.includes(m[1].toLowerCase())) out.push('c9 quoted ' + m[1])
  for (const m of reply.matchAll(/`([^`]+)`|(?:^|\s)(\/[a-z][a-z-]+)|\b(hermes [a-z]+ [a-z-]+)/g)) {
    const c = m[1] || m[2] || m[3]
    if (!hand.includes(c.toLowerCase())) out.push('c10 command ' + c)
  }
  const low = reply.toLowerCase()
  for (const [s, re] of SKILL_RX) if (re.test(low) && !hand.includes(s)) out.push('c11 skill ' + s)
  for (const m of reply.matchAll(/(?<![.!?]\s)(?<!^)\b([A-Z][A-Za-z0-9]+)/g)) if (!OK_CAPS.has(m[1]) && !hand.includes(m[1].toLowerCase())) out.push('c12 name ' + m[1])
  LC_R6.lastIndex = 0
  for (const m of reply.matchAll(LC_R6)) if (!hand.includes(m[0].toLowerCase())) out.push('c13 jargon ' + m[0])
  const hc = notClasses(hand)
  for (const cls of [...notClasses(reply)].filter(c => !hc.has(c)).sort()) out.push('c14 no-claim ' + cls)
  if (/http|www\.|\(/.test(reply)) out.push('c15 link or (')
  if (c16Fails(reply)) out.push('c16 product word')
  if (LC.test_phrases.some(p => low.includes(p))) out.push('c17 test')
  if (reply.includes('?') && /\?\s*$/.test(talk.lastLine || '')) out.push('c18 a second question')
  const mc = moneyCut(reply)
  for (const [m, re] of MONEY_RX) if (re.test(mc) && !hand.includes(m)) out.push('c19 money ' + m)
  const uh = (used || []).filter(u => ids.includes(u)).map(u => textOf[u]).join(' ').toLowerCase()
  if (c20Fails(uh, low)) out.push('c20 dropped only/never')
  // live changes-6 (c21.what): ordinary talk only when no row was handed, or the USED line lists nothing or only none;
  // a reply with no USED line after rows were handed gets every other check, as a reply from rows does
  if (!ids.length || (used && (!used.length || (used.length === 1 && used[0].toLowerCase() === 'none')))) {
    if (/\d/.test(reply) || reply.includes('"') || LC_R5.some(rx => rx.test(reply)) || MONEY_RX.some(([, re]) => re.test(mc))) out.push('c21 talk with a fact word')
  }
  for (const [rx, gl] of GLOSS_RX) if (rx.test(reply) && !gl.test(reply)) out.push('c22 term unexplained ' + rx.source)
  if (talk.lastLine && sameWords(reply) === sameWords(talk.lastLine) && !whichOf(talkNorm(talk.message || ''), ASKED_AGAIN).length) out.push('c23 the same as the last line')
  // c24, after c23 (changes-4: "Run c24 after c23")
  const c24Word = c24Fails(reply, talk.work, talk.message, hand)
  if (c24Word) out.push('c24 about the person ' + c24Word)
  // live-v2 changes-5: c26 and c27 after c24 (c25 has adopted: false and is not built)
  const c26Word = c26Fails(reply, hand)
  if (c26Word) out.push('c26 notes shown ' + c26Word)
  for (const id of c27Fails(reply, talk.message || '')) out.push('c27 ' + id)
  // offer-t1 (changes-8) c28, then live changes-9 c29 (only when the About them line was in the call)
  if (c28Fails(reply)) out.push('c28 ends on an invitation or a question')
  const c29Word = talk.workHanded ? c29Fails(reply, talk.work, hand) : null
  if (c29Word) out.push('c29 what the person does ' + c29Word)
  return out
}

// live-v2 changes-5 c26: the reply holds one of the words (any case): the model's own notes or an instruction label
// shown to the person. "USED" counts only in capitals, as a word (check_c5.py). Returns the word found, or null.
const C26_WORDS = LC.c26.filter(w => w !== 'USED').map(w => w.toLowerCase())
// live changes-6 (c26.skip_in_hand): a word that is also in the handed rows does not fail the reply; USED in capitals
// always fails, and so does a label still in the reply after the reader cut the last one (used_reader)
function c26Fails(reply, hand = '') {
  const low = String(reply).toLowerCase()
  const h = String(hand).toLowerCase()
  const w = C26_WORDS.find(x => low.includes(x) && !h.includes(x))
  if (w) return w
  return /\bUSED\b/.test(reply) || /\bused\s*:/i.test(reply) ? 'USED' : null
}
// c20: a used row says only or never and the reply does not. Builder (job setup-chat point 14, hhtech-ask-run 19f; told
// to Lead): "only" also counts as kept when the reply holds the three words that follow it in the row ("only while
// Hermes is" / "It runs while Hermes is running ..."): the condition is still said. "never" must be said.
function c20Fails(usedText, low) {
  if (!/\b(only|never)\b/.test(usedText) || /\b(only|never)\b/.test(low)) return false
  if (/\bnever\b/.test(usedText)) return true
  const flat = s => s.replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ')
  const after = [...flat(usedText).matchAll(/\bonly ((?:[a-z0-9']+ ){2}[a-z0-9']+)/g)].map(m => m[1])
  return !(after.length && after.every(a => flat(low).includes(a)))
}
// offer-t1 (changes-8) c28: the reply's last sentence ends with ? or holds one of ends (any case)
function c28Fails(reply) {
  const sents = String(reply).trim().split(/(?<=[.!?])\s+/).filter(s => s.trim())
  const last = (sents[sents.length - 1] || '').toLowerCase()
  return /\?\s*$/.test(last) || LC.c28.some(e => last.includes(e.toLowerCase()))
}
// live changes-9 c29 (check_c9.py c29): what the person does used as a step or as a fact about Hermes. Work words: runs
// of 3 letters or more in the kept line, not stop words, not on skip, not a word of the handed facts; matched whole,
// also with a final s, es or ing. Fails when a sentence with a work word also holds a step word, or holds a work word
// that is not led in (none of lead_ins among the 3 words before it, and the word before it is not a led-in work word).
const C29_STOP = new Set([...LIVE_DATA.stop_words, ...LC.c29.skip])
function c29Fails(reply, work, hand) {
  if (!work) return null
  const hw = new Set(String(hand).toLowerCase().match(/[a-z]{3,}/g) || [])
  const ww = (String(work).toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !C29_STOP.has(w) && !hw.has(w))
  if (!ww.length) return null
  const rx = new RegExp('^(?:' + ww.map(liveEsc).join('|') + ')(?:s|es|ing)?$')
  for (const sent of String(reply).split(/(?<=[.!?])\s+/)) {
    const toks = sent.toLowerCase().match(/[a-z']+/g) || []
    const at = toks.map((t, i) => (rx.test(t) ? i : -1)).filter(i => i >= 0)
    if (!at.length) continue
    if (toks.some(t => LC.c29.step_words.includes(t))) return 'in a step sentence'
    const led = new Set()
    for (const i of at) {
      if (toks.slice(Math.max(0, i - 3), i).some(t => LC.c29.lead_ins.includes(t)) || led.has(i - 1)) led.add(i)
      else return 'not led in: ' + toks[i]
    }
  }
  return null
}
// live-v2 changes-5 c27: for each class, when the person's newest message (only that one) asks it (a word of asks, or
// the whole message one of asks_whole), the reply must hold a word of gives. Returns the failed class ids, in order.
// whole: as check_c5.py's whole(): lower case, end marks and spaces cut, then ok, okay, so, and, cool, right in front.
// A word: not next to a letter or an apostrophe (check_c5.py's hasw).
const c27Whole = t => String(t).toLowerCase().trim().replace(/[?.! ]+$/, '').replace(/^(?:(?:ok|okay|so|and|cool|right)\b[ ,]*)+/, '').trim()
const c27Has = (t, w) => new RegExp("(^|[^a-z'])" + liveEsc(w.toLowerCase()) + "($|[^a-z'])").test(String(t).toLowerCase())
// live changes-7 (c27.apostrophes): curly apostrophes in the message and in the reply are read as straight ones
const c27Apos = s => String(s).replace(/[\u2018\u2019]/g, "'")
function c27Fails(reply, message) {
  reply = c27Apos(reply)
  message = c27Apos(message)
  const w = c27Whole(message)
  return LC.c27.filter(c => ((c.asks || []).some(x => c27Has(message, x)) || (c.asks_whole || []).includes(w)) && !c.gives.some(g => c27Has(reply, g))).map(c => c.id)
}

// The whole reading of a written reply: { word: 'NONE' | 'BUILD' } (c2), { fail } (empty after c0, or the
// first failed check), or { text, used } that may be shown.
function judgeWritten(raw, rows, talk = {}) {
  const { text, used } = readWritten(raw)
  if (!text) return { fail: 'c0 empty' }
  const word = replyWord(text)
  if (word) return { word }
  const flags = replyFlags(text, rows, used, talk)
  if (flags.length) return { fail: flags[0], flags }
  return { text, used: used || [] }
}

// ---- src/live-request.js ----
// What is sent to the person's AI (talk-live row 3): the instructions and the input of each call, made from
// the texts of content/helper-talk-live-v2.json (src/live-data.js). Never anything Helper keeps, not even the
// name (input.never_sent, input.name_check; Lead, 11 Nov 00:55). tests/live-request.test.mjs keeps a name,
// answers and a "remember that ..." and finds none of them in any request, in any capitals.

const LV_IN = LIVE_DATA.input
const LV_FIXED = TALK_DATA.fixed
const LV_LINE_CHARS = 200
const LV_LAST_LINES = 4
// A slot such as {rows: one per line, as [id] text; or (none)} is filled with the rows, or with what follows
// "or " when there are none.
function fillList(text, slot, lines) {
  return text.replace(new RegExp('\\{' + slot + '[^}]*\\}'), m => {
    const empty = (m.match(/or (\([^)]*\))\}$/) || [, ''])[1]
    return lines.length ? lines.join('\n') : empty
  })
}
const firstCallText = () => fillList(LIVE_DATA.first_call.text, 'subjects', LIVE_DATA.subjects.map(s => `${s.id} = ${s.title}`))
const rowLines = ids => ids.filter(id => LIVE_ROW[id]).map(id => `[${id}] ${LIVE_ROW[id].text}`)
// live-v2 changes-4 (input.work_line): what the person does, the one kept value ever sent, as one labelled line; null
// when nothing is kept or the value fails the guard (not secret, no key, within keeps.work.limits). Never the name.
// names: the kept name and this visit's name; a value that holds one of them as a whole word, in any capitals, is
// left out (input.work_line.never: the name is never in this line; review)
function workLine(work, names = []) {
  if (!workOk(work)) return null
  if (names.filter(n => typeof n === 'string' && n.trim()).some(n => new RegExp('(^|[^\\p{L}\\p{N}])' + lvEsc(n.trim()) + '($|[^\\p{L}\\p{N}])', 'iu').test(work))) return null
  return LV_IN.work_line.replace('{work}', () => work.replace(/\s+/g, ' ').trim())
}
// the slot {work_line} on its own line: the work line, or the slot and its line break left out
const fillWork = (text, work, names) => {
  const w = workLine(work, names)
  return w ? text.replace('{work_line}', () => w) : text.replace(/\{work_line\}\n?/, '')
}
const writerText = (ids, work = null, names = []) => fillList(fillWork(LIVE_DATA.writer.text, work, names), 'rows', rowLines(ids))
const pickText = (ids, work = null, names = []) => fillList(fillWork(LIVE_DATA.pick_only.text, work, names), 'rows', rowLines(ids))

// Which lines of the conversation may ever be sent, decided when they are said (the page notes it on the
// log entries): { you, helper } for the person's message and Helper's answer.
//   left out: a pasted key (K1), "remember that ..." and its RM line, what Helper keeps asked about by typing
//   (A1, A2, A4 and their Yes and No), the person's line that gave the name (the answer at "What's your
//   name?", a name typed later, a name given with a question) and Helper's line that holds that name as typed
//   (review) and an answer Helper keeps (the AI, the chat app, the service: picked or typed) with the line that
//   answers it, and a line said from what is kept ("From what I keep: ..."), which shows the kept answer
const LV_NEVER = /^(?:K1|RM\d|A1|A2|A4|A-none|A-yes|A-no|NAME_AGAIN|NAME_NEW)$/
// talk-live-2 (review): an answer to "What do you do?" that was not kept (too long, or looking secret) says about the
// person more than the one work line; it is not sent either
const LV_WORK_NOT_KEPT = /^(?:WORK_LONG|WORK_LONG_2|WORK_SECRET)$/
function sendable(result) {
  const k = (result && result.kind) || ''
  if (LV_NEVER.test(k)) return { you: false, helper: false }
  if ((result.kept || []).some(x => x !== 'name') || result.used === 'kept') return { you: false, helper: false }
  return { you: !(k === 'F1' || result.name_taken || LV_WORK_NOT_KEPT.test(k)), helper: true }
}

// Helper's line as it may be sent: its shown text, and for a line that greets by name its text with no name
// (BACK and HELLO text_no_name, F2 without the name, F1 as "Nice to meet you. What do you do?").
function helperText(entry) {
  const f = LV_FIXED[entry.line]
  if (f && ['BACK', 'HELLO', 'F1', 'F2'].includes(entry.line)) return f.text_no_name || f.text.replace(/,? ?\{name\}/g, '')
  return entry.text || ''
}
const lvEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The last 4 lines of this visit that may be sent, oldest first, "Person: ..." or "Helper: ...", each cut at
// 200 characters. names: the kept name and this visit's name; a line that still holds one of them as a whole
// word, in any capitals, is left out (input.name_check).
function lastLines(log, names = []) {
  const nameRes = names.filter(n => typeof n === 'string' && n.trim()).map(n => new RegExp('(^|[^\\p{L}\\p{N}])' + lvEsc(n.trim()) + '($|[^\\p{L}\\p{N}])', 'iu'))
  const out = []
  for (const e of log) {
    if (e.send === false) continue
    const text = e.who === 'you' ? e.text : helperText(e)
    // (review) a line that looks like a secret by Helper's secret rule is never sent, also later
    if (!text || nameRes.some(re => re.test(text)) || looksSecret(text)) continue
    out.push(`${e.who === 'you' ? 'Person' : 'Helper'}: ${Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, LV_LINE_CHARS).join('')}`)
  }
  return out.slice(-LV_LAST_LINES)
}

// The input of every call: the lines, then the newest message (as the person typed it, apart from a name given
// in the same message, which the page cuts off first), cut at 1500 characters.
function inputText(message, lines) {
  // both slots filled in one pass, so a typed "{message}" in a line is left as typed (review)
  const fill = { last_lines: lines.join('\n'), message: String(message).trim() }
  const t = (lines.length ? LV_IN.text : LV_IN.text_no_lines).replace(/\{(last_lines|message)\}/g, (m, k) => fill[k])
  return Array.from(t).slice(0, LV_IN.cut_at_chars).join('')
}

// llm.oneshot's params for one call (src/model-call.js: task helping_hand, no session, no profile)
const liveParams = (instructions, input, maxTokens) => oneshotParams({ instructions, input, temperature: LV_IN.temperature, max_tokens: maxTokens })

// ---- src/live-turn.js ----
// One typed message with the AI step (talk-live rows 5 and 6). No React, and every request and clock is passed
// in, so the tests drive time (as src/model-call.js). The order is content/helper-talk-live-v2.json order.steps:
//   1. the no-AI turn runs first, exactly as before (src/talk.js turnParts); its line is the fallback, and what
//      it keeps is kept at once;
//   2. code's own answers are shown with no call (liveWhyNot);
//   3. a follow-up gets the rows of the person's previous message; 4. else word matching; 5. else the first
//      call picks a subject;
//   6. the writer call (ai_writes) or the pick call (ai_picks_line), then the checks;
//   7. the chosen line is noted as Helper's last line (liveApply).
// Any failure (a thrown request, no text, NONE, a failed check) gives null: the page shows the fallback and
// says nothing about it. The 12 seconds and one call at a time are the page's (src/page.js).

const LIVE_SECONDS = LIVE_DATA.seconds
// The second call starts only when at least this much of the 12 s is left (decided: a call that cannot finish
// in time is not started).
const SECOND_CALL_MIN_MS = 4000
const LV_GO = LIVE_DATA.go_to_ai
const LV_DONT_KNOW = ['N1', 'N1_AGAIN', 'AGAIN', 'MEAN_NONE']

// live-v2 changes-5 slow_ai, Lead's pick SLOW_A (job talk-live-3, point 4): Helper's line right after the written
// answer when the visit's first AI call gave no answer in 12 s or gave no_reply text; its text to paste shows at once
// under it, as H1's. Said once per visit (src/page.js keeps visit.slow: 'due', then 'said'; never stored).
const SLOW_LINE = { line: LIVE_DATA.slow_ai.id, text: LIVE_DATA.slow_ai.text, source: null, answers: null, next: null, paste: LIVE_DATA.slow_ai.paste_text, note: null, used: null, hint: null, rows: null, docs: null }
// Not after a don't-know line (hhcontent's gap: "I answered from my own notes" + "I don't have checked information"
// read oddly together; Lead: it waits for the next written answer of the visit that is not one). The don't-know lines
// are no_repeat's dont_know groups (N1, N1a, N1_AGAIN, and AGAIN in its place), N1-skill (N1's words for a skill asked
// by name) and MEAN_NONE (this file's own don't-know list for TALK, LV_DONT_KNOW). Decided by the Builder (review):
// also not after a line with things to pick, a line that asks a question or asks for more (STUCK), a goodbye (BYE),
// or a line with its own text to paste (H1, H2: two boxes to paste in a row), since SLOW_A after it would take the
// picks' place, leave the question above the newest line, or read as a second hand-over; it waits for the next answer.
const SLOW_NOT_AFTER = new Set([...TALK_DATA.no_repeat.groups.dont_know, ...TALK_DATA.no_repeat.in_place.dont_know, ...LV_DONT_KNOW, 'N1-skill', ...TALK_DATA.no_repeat.groups.stuck, ...TALK_DATA.no_repeat.groups.bye])
function slowFollows(visit, said) {
  return visit.slow === 'due' && !!said && !SLOW_NOT_AFTER.has(said.line) && !said.answers && !said.paste && !/\?\s*$/.test(String(said.text || ''))
}

// Step 2 (code_answers): only these no-AI results reach the AI, judged on the result before no_repeat, so a
// plain line given for "what do you mean" keeps its why. N1_AGAIN and AGAIN are no_repeat's own lines in place
// of an N1 or a repeat; they come only after a result this already sends.
function goesToAi(pre) {
  if (!pre) return false
  // live-v2 changes-3: anything from kind again is code's, AGAIN and MEAN_NONE included
  if (pre.by_again) return false
  // ask-fix-t1 (about_rule.weak_hit_then.with_ai): a weak hit goes on to the AI as when no row was found
  if (pre.weak_hit && (pre.kind === 'question' || pre.kind === 'N1')) return true
  if (pre.kind === 'plain') return pre.why === 'what do you mean'
  return LV_GO.includes(pre.kind)
}

// Why this message makes no call (null: it may). In this order: the switch, code's own answer, the AI step is off
// for this visit (hhtech-weak-ai: an earlier call gave no answer in 12 s or gave thinking text), the model the
// page checked is not ready (still checking, none or an error), the message looks like a secret by Helper's
// secret rule, or Hermes still works on an earlier call of Helper's (one call at a time).
function liveWhyNot({ mode = AI_MODE, pre, text, status, inHermes = 0, off = false }) {
  if (mode === 'no_ai_step') return 'no AI step'
  if (!goesToAi(pre)) return 'code answered'
  if (off) return 'AI off for this visit'
  if (!status || status.state !== 'ok') return 'model not ready'
  if (looksSecret(text)) return 'looks secret'
  if (inHermes > 0) return 'Hermes still works on a call'
  return null
}

// build: a how-question is never a request (route2.py's guard, build.skip_starts and build.how_phrases)
function isHowQuestion(text) {
  const t = cutIgnored(talkNorm(text))
  // live changes-9 (build.model_pick_rule, the third condition): a message that opens with a question word asks
  // something; the pick build is then read as none
  return startsWith(t, TALK_DATA.build.skip_starts) || whichOf(t, TALK_DATA.build.how_phrases).length > 0 || startsWith(t, TALK_DATA.model_pick_not_when_starts)
}

// The steps 3 to 6 for one message. Returns { result, rows } (a line to show in place of the fallback), or
// { fallback: why } (show the fallback).
//   text: the message as typed; message: what may be sent of it (a name given with it cut off)
//   pre, out: the no-AI turn's result before and after no_repeat; before: the visit's note of Helper's last
//   line as it was before this message ({ last, lastKey, liveRows }); lines: src/live-request.js lastLines;
//   lastLine: Helper's last line as shown; request: host.request; msLeft(): ms left of the 12 s
//   onCall(name): told before each call (for the tests' log)
//   alive(): false once the page has closed this turn (12 s, or the next message): no further call starts
//   work: what the person does as kept (live-v2 changes-4), for the work line of the second call and for c24
// A call that sends back thinking text (hhtech-weak-ai) ends the turn at once: { fallback, thinking: true }, so
// the page can turn the AI step off for the rest of the visit. A reply that is empty after reading (it sat on the
// USED: line) is an ordinary fallback.
//   names: the kept name and this visit's name: a work value holding one is not sent (src/live-request.js workLine)
async function askLive({ mode = AI_MODE, text, message = text, pre, out, before, lines = [], lastLine = '', request, msLeft = () => Infinity, alive = () => true, onCall = () => {}, work = null, names = [] }) {
  const input = inputText(message, lines)
  let thinking = false
  const call = async (name, instructions, maxTokens) => {
    if (!alive()) return null
    onCall(name)
    try {
      const res = await request('llm.oneshot', liveParams(instructions, input, maxTokens), ONESHOT_TIMEOUT_MS)
      const t = res && typeof res.text === 'string' ? res.text : null
      if (t !== null && noReply(t)) {
        thinking = true
        return null
      }
      return t
    } catch {
      return null
    }
  }
  const got = await askSteps({ mode, text, message, pre, out, before, lastLine, msLeft, call, work, names })
  return thinking ? { fallback: 'thinking text', thinking: true } : got
}

async function askSteps({ mode, text, message, pre, out, before, lastLine, msLeft, call, work, names }) {
  let ids = null
  // live changes-9 (follow_up.work_line_c9): on a follow-up the About them line is not handed
  let follow = false
  if (isFollowUp(text, pre, before)) ids = followRows(before)
  if (ids && ids.length) follow = true
  if (!ids || !ids.length) {
    ids = null
    const w = byWords(message)
    if (w.length) ids = withNext(w)
  }
  if (!ids) {
    const raw = await call('first', firstCallText(), LIVE_DATA.first_call.max_tokens)
    if (raw === null) return { fallback: 'first call failed' }
    const subject = readSubject(raw)
    if (subject === 'none') return { fallback: 'first call: none' }
    if (subject === 'build') return isHowQuestion(text) ? { fallback: 'build to a how-question' } : { result: { kind: 'H1', why: 'ai' }, rows: [] }
    ids = subject === 'talk' ? followRows(before) : withNext(rankIn(message, subject))
    if (subject === 'talk' && ids.length) follow = true
  }
  const handed = follow ? null : work
  if (msLeft() < SECOND_CALL_MIN_MS) return { fallback: 'no time for the second call' }
  const rows = ids.map(id => ({ id, text: LIVE_ROW[id].text }))
  if (mode === 'ai_picks_line') {
    const raw = await call('pick', pickText(ids, handed, names), LIVE_DATA.pick_only.max_tokens)
    if (raw === null) return { fallback: 'pick call failed' }
    const p = readPick(raw, ids)
    if (p.id) return { result: resultOfRow(p.id), rows: ids }
    if (p.word === 'TALK') return LV_DONT_KNOW.includes(out.kind) ? { result: { kind: 'OK' }, rows: [] } : { fallback: 'talk: the no-AI line' }
    if (p.word === 'BUILD') return isHowQuestion(text) ? { fallback: 'build to a how-question' } : { result: { kind: 'H1', why: 'ai' }, rows: [] }
    return { fallback: 'pick: none' }
  }
  const raw = await call('writer', writerText(ids, handed, names), LIVE_DATA.writer.max_tokens)
  if (raw === null) return { fallback: 'writer call failed' }
  const j = judgeWritten(raw, rows, { lastLine, message: text, work, workHanded: !!workLine(handed, names) })
  if (j.word === 'NONE') return { fallback: 'writer: NONE' }
  if (j.word === 'BUILD') return isHowQuestion(text) ? { fallback: 'build to a how-question' } : { result: { kind: 'H1', why: 'ai' }, rows: [] }
  if (j.fail) return { fallback: 'check ' + j.fail }
  return { result: { kind: 'written', text: j.text, used: j.used }, rows: ids }
}

// The words a written reply is told apart by (its own key for no_repeat and c23)
const writtenKey = text => JSON.stringify(['written', talkNorm(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()])

// Step 7, for a line from the AI step: never the same line twice in a row (a picked row that is Helper's last
// line again, or a line the person called wrong in this visit, gives the fallback instead; a written repeat was
// stopped by c23); what the no-AI turn kept is still told under it; the line is noted as Helper's last, and its
// rows as this message's rows (for a follow-up). Returns the result to show, or null for the fallback.
function liveApply(st, got, out, before, text) {
  if (!got || !got.result) return null
  const r = { ...got.result }
  if (r.kind !== 'written') {
    const asked = whichOf(talkNorm(text), TALK_DATA.no_repeat.asked_again).length > 0
    const k = lineKey(r)
    if (!asked && (k === before.lastKey || (st.rejected || []).includes(k))) return null
  }
  for (const x of ['kept', 'first', 'name_taken', 'thing', 'work_first']) if (x in out) r[x] = out[x]
  st.pending = null
  st.lastq = false
  // changes-3 (review): the fallback was noted as the last answer line, but it is not shown; "again" must find the
  // one before it, unless this line is an answer line itself
  if ('lastAnswer' in before) {
    st.lastAnswer = before.lastAnswer
    st.lastAnswerKey = before.lastAnswerKey
  }
  noteLast(st, r)
  // offer-t1: the offer of the line shown (a line the AI picked may carry one; a written reply carries none), judged
  // against the offer shown before this message, not the fallback's
  st.lastOffer = before.lastOffer || null
  attachOffer(r, st, before.lastTopic || null)
  if (r.kind === 'written') {
    // follow_up.rule and how_after_rows: "a written reply that used rows"; one that used none is ordinary talk
    st.last = (r.used || []).some(u => u.toLowerCase() !== 'none') ? 'written' : 'written-talk'
    st.lastKey = writtenKey(r.text)
    st.lastAnswerKey = st.lastKey // changes-3: "again" compares it with the line just before
  }
  st.liveRows = got.rows && got.rows.length ? { key: st.lastKey, ids: got.rows } : null
  return r
}

// ---- src/setup-rec.js ----
// The AI step of the set-up conversation's recommendation (setup-chat point 6; content/helper-setup-chat-v1.json ai).
// Only the recommendation sentence is the AI's: one call, and its reply is shown in place of the written
// "{reason} Next: {card}. {why}" only when it passes no_reply, c26, the name check and s1 to s8. On any fail, no reply
// or no answer in 12 s the written line is shown. "Want the steps?" and the four answers are always written.
// What is handed (ai.handed): what the person does, what they want, new or not, the look line, the thing with its why
// sentence, the written reason. Never the name, never the steps, nothing else that is kept.
// Pure code: src/page.js makes the call.

const SR = SETUP_DATA
const REC_MAX_TOKENS = 120
// llm.oneshot needs an input beside the instructions; the data gives none, so one fixed sentence (Decided myself)
const REC_INPUT = 'Write the message now.'
// The one call, asked the same way as the conversation's AI step (src/live-turn.js): task helping_hand, the live
// answers' temperature, never a session id. The page stops waiting after 12 s.
const askRec = (request, instructions) => request('llm.oneshot', liveParams(instructions, REC_INPUT, REC_MAX_TOKENS), ONESHOT_TIMEOUT_MS)
const NOT_TOLD = '(not told)'
const srEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const srHasName = (text, names) => names.filter(n => typeof n === 'string' && n.trim()).some(n => new RegExp('(^|[^\\p{L}\\p{N}])' + srEsc(n.trim()) + '($|[^\\p{L}\\p{N}])', 'iu').test(text))
// a kept text may be sent only when it passes the keep rule again and does not hold the name
const srMaySend = (text, names) => (typeof text === 'string' && workOk(text) && !srHasName(text, names) ? text.replace(/\s+/g, ' ').trim() : NOT_TOLD)

// The instructions of the one call. rec: { item, rule, isNew, goal } of the recommendation; kept: the visit's kept
// record; seen: the look; names: the kept name and this visit's name.
function recInstructions(rec, kept, seen, names = []) {
  const it = SR.items[rec.item]
  const a = SR.questions.Q_NEW.answers.find(x => x.id === kept.setup_new)
  const written = recText(rec.item, rec.rule, rec.isNew, rec.goal)
  const reason = written.slice(0, written.indexOf(' Next: '))
  const look = seenLine(seen, rec.goal).slice(SR.look.parts.LOOK_OPEN.length).trim()
  const slots = [
    [/\{work or \(not told\)\}/, srMaySend(kept.work, names)],
    [/\{goal kept_as, or the typed text, or \(not told\)\}/, srMaySend(kept.setup_goal, names)],
    [/\{Q_NEW kept_as or \(not told\)\}/, a && a.kept_as ? a.kept_as : NOT_TOLD],
    [/\{SEEN line without LOOK_OPEN\}/, look],
    [/\{why\}/, it.why],
    [/\{reason\}/, reason]
  ]
  let text = SR.ai.instructions.replace(/\{card\}/g, () => it.name)
  for (const [re, value] of slots) text = text.replace(re, () => value)
  return text
}

// s1 to s8 and the name check (hhcontent's build.py ai_check, the reference): the ids that fail
const SR_STEP_WORDS = ['click', 'press', 'tap', 'open', 'type', 'paste', 'scan', 'settings', 'menu', 'button', 'tab', 'ctrl', 'cmd', 'terminal', 'command']
const SR_S3 = new RegExp('\\b(?:' + SR_STEP_WORDS.join('|') + ')\\b')
const SR_S7A = /\b(i'll|i will|i can|i could|let me)\b(\W+\w+){0,3}?\W+(set|install|connect|create|make|add|build|do)\b/
const SR_S7B = /\b(set|install|connect|create|make|build|do)\w* (it |this |that |them )?(up )?for you/
function recFlags(reply, item, name = null) {
  const r = String(reply).trim().replace(/[\u2018\u2019]/g, "'")
  const low = r.toLowerCase()
  const fails = []
  if (!SR.ai.aliases[item].some(a => low.includes(a))) fails.push('s1')
  const others = [...Object.entries(SR.ai.aliases).filter(([k]) => k !== item).flatMap(([, v]) => v), ...SR.ai.later_names]
  if (others.some(a => new RegExp('\\b' + srEsc(a)).test(low))) fails.push('s2')
  if (SR_S3.test(low) || r.includes('`') || low.includes('http') || low.includes('www')) fails.push('s3')
  const words = r.split(/\s+/).filter(Boolean).length
  const sents = r.split(/(?<=[.!?])\s+/).filter(s => s.trim()).length
  if (words > SR.ai.max_words || sents > SR.ai.max_sentences) fails.push('s4')
  if (r.includes('?')) fails.push('s5')
  if (r.includes('!')) fails.push('s6')
  if (SR_S7A.test(low) || SR_S7B.test(low)) fails.push('s7')
  if (/\d/.test(r)) fails.push('s8')
  if (name && new RegExp('\\b' + srEsc(String(name).toLowerCase()) + '\\b').test(low)) fails.push('name')
  return fails
}

// The whole reading of the reply: { text } to show in place of the written sentence, { fail } (the written line), or
// { noReply: true } (thinking text or nothing at all: the written line, and the AI step goes off as for a slow AI).
// hand: the instructions sent, for c26 (a word of the model's notes that is also in what was handed does not fail)
function judgeRec(raw, item, names = [], hand = '') {
  if (raw == null || !String(raw).trim() || noReply(raw)) return { noReply: true }
  const { text } = readWritten(raw)
  if (!text) return { fail: 'empty' }
  const c26 = c26Fails(text, hand)
  if (c26) return { fail: 'c26 ' + c26 }
  if (srHasName(text, names)) return { fail: 'name' }
  const flags = recFlags(text, item)
  if (flags.length) return { fail: flags[0], flags }
  return { text }
}

// ---- src/settings-file.js ----
// Helper's settings page as a short file (content/helper-settings-edit-v1.md; JSON
// keeps.settings_file): the box Helper writes from the stored record, and how a box the person
// edited is read back on Save. Ported from hhcontent's settings_read.py, rule for rule; no model.
// tests/settings-file.test.mjs runs every case of hhcontent's tests.json and the Builder's own
// boxes through both, and the results must be the same.
//   renderKept(record)            the box text: one line per kept thing, with Helper's reasons
//   readBox(box)                  { result: 'read', record } or { result: 'refused', line, why, message }
//   saveBox(stored, box, answer)  steps 14 and 15: { result: 'saved' | 'refused' | 'ask' | 'not_saved', ... }
//                                 answer: undefined (not asked yet), 'yes' or 'no'
// Nothing here touches storage: the page writes `stored` when the result is 'saved'.

const KEEPS_DATA = TALK_DATA.keeps
const FILE_SF = KEEPS_DATA.settings_file
const FILE_R = FILE_SF.read
const FILE_M = FILE_R.messages
const FILE_WHY = FILE_SF.why
const FILE_BL = FILE_SF.box_lines
const FILE_LIM = KEEPS_DATA.remember.limits
const FILE_MOD_IN = { chatgpt: 'mod1', claude: 'mod2', neither: 'mod4', free: 'mod3' }
const FILE_MOD_OUT = Object.fromEntries(Object.entries(FILE_BL.mod.values).map(([word, need]) => [need, word]))
function fileNamesOf(topic) {
  const n = { ...KEEPS_DATA.answers[topic].names }
  for (const v of Object.values(n)) n[v.toLowerCase()] = v
  return n
}
const FILE_NAMES = { msg: fileNamesOf('msg'), svc: fileNamesOf('svc') }
const FILE_LABEL_OF = Object.fromEntries(Object.entries(FILE_R.labels).flatMap(([key, labels]) => labels.map(l => [l, key])))
// live-v2 changes-4: work (What you do) is a single line like the name
const FILE_SINGLE = ['name', 'work', 'mod', 'msg', 'svc']
// its reason by mode: with no AI step, nothing is told to any AI (box_lines.work.reason_no_ai_step)
const fileReason = key => (key === 'work' && AI_MODE === 'no_ai_step' && FILE_BL.work.reason_without_ai ? FILE_BL.work.reason_without_ai : FILE_BL[key].reason)
// Python's [^\W\d_]: a letter (and the few number signs that are not digits).
const FILE_LETTER = /[\p{L}\p{Nl}\p{No}]/u
const FILE_NAME_CHARS = /^(?:[\p{L}\p{Nl}\p{No}]|[ '.-])+$/u
const fileSqueeze = s => s.replace(/\s+/g, ' ').trim()
const fileLen = s => Array.from(s).length

// changes-12: read step 4, the secret rule (src/secret-rule.js, keeps.remember.refuse.rule_12) on the whole line
// and on the part after its first colon (settings_read.py secret()).
function fileSecret(line) {
  const at = line.indexOf(':')
  return looksSecret(line) !== null || (at >= 0 && looksSecret(line.slice(at + 1)) !== null)
}

// write_rules: one line per kept thing, in Helper's order; Remember lines in the order kept.
function renderKept(rec) {
  const out = []
  for (const key of FILE_SF.order) {
    if (key === 'asked') for (const t of rec.asked || []) out.push(`${FILE_BL.asked.label}: ${t} (${FILE_BL.asked.reason})`)
    else if (rec[key]) out.push(`${FILE_BL[key].label}: ${key === 'mod' ? FILE_MOD_OUT[rec[key]] : rec[key]} (${fileReason(key)})`)
  }
  return out.join('\n')
}

function fileRefuse(n, why, line, fill = {}) {
  let q = line.trim()
  q = fileLen(q) <= FILE_R.quote_max_chars ? q : Array.from(q).slice(0, FILE_R.quote_max_chars).join('').trimEnd() + '...'
  let w = FILE_WHY[why]
  for (const [k, v] of Object.entries(fill)) w = w.split(`{${k}}`).join(v)
  return { result: 'refused', line: n, why, message: [FILE_M.cannot_read.replace('{n}', String(n)), FILE_M.quote.replace('{line}', q), w] }
}

// Steps 1 to 13: all or nothing; the first line that fails stops the reading.
function readBox(box) {
  if (fileLen(box) > FILE_R.max_box_chars) return { result: 'refused', line: null, why: 'too_much', message: [FILE_M.too_much] }
  const rec = {}
  const asked = []
  const lines = box.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1
    const line = lines[i].replace(/\r/g, '')
    if (!line.trim()) continue
    if (fileSecret(line)) return { result: 'refused', line: n, why: 'secret', message: [FILE_M.secret_line.replace('{n}', String(n))] }
    const body = line.replace(/^\s*[-*\u2022]\s*/, '')
    const at = body.indexOf(':')
    if (at < 0) return fileRefuse(n, 'no_label', line)
    const key = FILE_LABEL_OF[fileSqueeze(body.slice(0, at).toLowerCase())]
    if (!key) return fileRefuse(n, 'no_label', line)
    let val = fileSqueeze(body.slice(at + 1))
    if (key === 'asked') {
      const reason = '(' + FILE_BL.asked.reason + ')'
      if (val.toLowerCase().endsWith(reason.toLowerCase())) val = val.slice(0, val.length - reason.length).trim()
      else if (val.endsWith(')') && val.includes('(')) return fileRefuse(n, 'remember_bracket', line)
    } else val = val.replace(/\s*\([^()]*\)\s*$/, '').trim()
    if (!val) return fileRefuse(n, 'empty', line)
    if (FILE_SINGLE.includes(key) && key in rec) return fileRefuse(n, 'twice', line, { label: FILE_BL[key].label })
    if (key === 'name') {
      if (fileLen(val) > 30 || !FILE_NAME_CHARS.test(val) || !FILE_LETTER.test(val)) return fileRefuse(n, 'name_value', line)
      rec.name = val
    } else if (key === 'mod') {
      const m = FILE_MOD_IN[val.toLowerCase().replace(/ /g, '')]
      if (!m) return fileRefuse(n, 'mod_value', line)
      rec.mod = m
    } else if (key === 'work') {
      // value_rules.work: 1 to 12 words, at most 80 characters, no question mark (the secret check was step 4)
      if (!workOk(val, { withSecretRule: false })) return fileRefuse(n, 'work_value', line)
      rec.work = val
    } else if (key === 'msg' || key === 'svc') {
      const v = FILE_NAMES[key][val.toLowerCase()]
      if (!v) return fileRefuse(n, key + '_value', line)
      rec[key] = v
    } else {
      const words = val.split(/\s+/).filter(Boolean).length
      if (words < FILE_LIM.min_words) return fileRefuse(n, 'remember_short', line)
      if (words > FILE_LIM.max_words || fileLen(val) > FILE_LIM.max_chars) return fileRefuse(n, 'remember_long', line)
      if (asked.some(a => a.toLowerCase() === val.toLowerCase())) return fileRefuse(n, 'same_twice', line)
      if (asked.length >= FILE_LIM.max_things) return fileRefuse(n, 'too_many', line)
      asked.push(val)
    }
  }
  if (asked.length) rec.asked = asked
  return { result: 'read', record: rec }
}

// How many kept things Save would forget: the single ones gone, and Remember lines fewer than before.
function forgetCount(old, next) {
  const n = FILE_SINGLE.filter(k => old[k] && !next[k]).length
  return n + Math.max(0, (old.asked || []).length - (next.asked || []).length)
}

// Steps 14 and 15. The forget question comes first when Save would forget something; No saves
// nothing and leaves the box as typed. A record with no values is removed whole (told too).
function saveBox(stored, box, answer) {
  const r = readBox(box)
  if (r.result === 'refused') return { ...r, stored, box }
  const next = r.record
  const n = forgetCount(stored, next)
  if (n && answer == null) {
    const question = n === 1 ? FILE_SF.would_delete.question_one : FILE_SF.would_delete.question.replace('{n}', String(n))
    return { result: 'ask', question, count: n, stored, box }
  }
  if (n && answer === 'no') return { result: 'not_saved', stored, box }
  let kept = {}
  if ([...FILE_SINGLE, 'asked'].some(k => next[k])) {
    kept = { ...next }
    if (stored.told) kept.told = true
    if (stored.told_work && kept.work) kept.told_work = true
  }
  return { result: 'saved', message: [FILE_M.saved], stored: kept, box: renderKept(kept) }
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
  // dash-v2: the tab names as Hermes's own SESSIONS | BOTS tabs, for TAB_LOOK 'hermes' below. Every class is one
  // Hermes's own tab wears (components/ui/pane-tab.tsx: TAB, TAB_IDLE, TAB_ACTIVE, TAB_ACTIVE_UNDERLINE, PaneTabLabel),
  // on the same 28 px row as today's tabs: 11 px capitals, and under the open one a 2 px line in the theme's primary
  // colour (Hermes draws that line as an inset shadow of its own class). Its hover wash and tab fills are left out: they
  // belong to Hermes's tab strip, which our header is not.
  paneTab:
    'group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-2 text-[0.6875rem] font-medium transition-colors hover:bg-transparent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--ui-accent)',
  paneTabIdle: 'text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)',
  paneTabOn: 'text-foreground shadow-[inset_0_-2px_0_var(--pane-tab-active-accent,var(--theme-primary))]',
  paneTabLabel: 'block min-w-0 truncate font-medium tracking-wide uppercase',
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
  pageActions: 'flex flex-wrap items-center gap-2 pt-1',

  // ---- Helper's page in Hermes's Settings (src/settings-page.js): Hermes's settings rows (ListRow
  // in app/settings/primitives.tsx), the text box as config-field.tsx draws a JSON value (mono,
  // min-h-28, resize-y) and ListRow's own description tone for every small line ----
  settingsPage: 'flex min-w-0 flex-col gap-2',
  settingsBelow: 'mt-3 flex min-w-0 flex-col gap-2',
  settingsBox: 'min-h-28 resize-y bg-background font-mono text-xs',
  settingsHint: 'text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)',
  settingsText: 'text-[length:var(--conversation-text-font-size)] font-medium text-foreground',
  settingsMessage: 'text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-secondary)',
  settingsAsk: 'flex flex-wrap items-center gap-2',
  settingsButtons: 'flex flex-wrap items-center gap-2',
  settingsFacts: 'flex flex-col gap-1 py-3 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)',
  // talk v2 look (hhdesign's review of e86b410): the bottom of the page under a thin divider, as Hermes's own
  // settings rows; the Forget question under its row
  settingsRule: 'mt-3 border-t border-(--ui-stroke-tertiary) pt-3',
  settingsForgetAsk: 'flex flex-wrap items-center gap-2 pb-3',
  // the message after Save and the buttons under it, 4 px apart
  settingsSaveGroup: 'flex min-w-0 flex-col items-start gap-1',
  // a line that cannot be read: three rows, 4 px apart; row 2 is the line in a mono chip that wraps anywhere
  // (Hermes's own code chip: --ui-bg-quinary, 2.5 px corners), row 3 the fix in the caption size
  settingsRefused: 'flex min-w-0 flex-col items-start gap-1',
  settingsRefusedLine: 'w-fit max-w-full wrap-anywhere rounded-[2.5px] bg-(--ui-bg-quinary) px-1.5 py-0.5 font-mono text-xs',
  settingsRefusedFix: 'text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-secondary)',

  // ---- Helper's conversation window: text to paste inside the bubble (hhdesign's notes-wants.md item 4),
  // Hermes's own small code card (components/chat/compact-markdown.tsx): an edge, readable 12 px mono, Copy at
  // the top right. The setup card's text to paste (cardPaste) stays as it is ----
  bubblePaste: 'flex w-full min-w-0 items-start gap-2 rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) py-1.5 pl-2.5 pr-1.5',
  bubblePasteText: 'wrap-anywhere min-w-0 flex-1 font-mono text-xs leading-4.5 text-(--ui-text-secondary)',
  // builder-qs (Lead, 11 Nov 00:55: the text to paste at least 12 px): the older line's too, as the bubble's
  bubblePasteTextOld: 'wrap-anywhere min-w-0 flex-1 font-mono text-xs leading-4.5 text-(--ui-text-secondary)',
  // talk-live-3 (Lead's call, 11 Nov 05:08): text the person is to type inside a line (/usage, "what can I ask you"),
  // in the paste box's code style: its edge, fill, 12 px mono and text colour, as a small inline chip
  typed: 'rounded-[2.5px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-1 font-mono text-xs text-(--ui-text-secondary)',

  // ---- dash-v1: the Dashboard tab's own shapes are the D table below (src/dash.css); from Hermes it wears these ----
  // Hermes's Tabler icons at the sizes Hermes draws them (hhtech-dash-icons.md point 1: 16 px in Settings' rows,
  // 14 px in its sub-rows); 20 px on the tiles (hhdesign's r7 size)
  // dash-v1: Hermes's own monospace type, for a command to paste
  mono: 'font-mono',
  icon14: 'size-3.5',
  icon16: 'size-4',
  icon20: 'size-5',
  // Learn and My setup are not built: one quiet line, in the caption tone, at the open step's text edge
  notBuilt: 'px-6 py-4 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)'
}

// ---- the tab names' look, behind ONE value (dash-v2; Lead's point 7: Pēteris's decision, not made yet) ----
//   'capabilities'  as built and as he has seen it: Capabilities' text tabs, sentence case, a thin faint underline
//                   under the open one
//   'hermes'        as Hermes's own tabs (SESSIONS | BOTS): capitals, a line in the theme's primary colour under the open one. Tested, and
//                   measured once in the app; no person has looked at it.
// To change the look, change the word on the next line.
const TAB_LOOK = 'capabilities'
const TAB_LOOKS = {
  capabilities: { tab: K.textTab, idle: K.textTabIdle, on: K.textTabOn, label: K.textTabLabel, labelOn: K.textTabLabelOn },
  hermes: { tab: K.paneTab, idle: K.paneTabIdle, on: K.paneTabOn, label: K.paneTabLabel, labelOn: K.paneTabLabel }
}

// dash-v1: every class of the Dashboard tab's sheet (src/dash.css, from hhdesign's design/dash-r7/build.js), in one
// table; each starts with hhd-. tests/dash-css.test.mjs checks that every name here has a rule in the sheet and
// that the sheet has no class nothing uses.
const D = {
  main: 'hhd-main',
  compact: 'hhd-compact',
  card: 'hhd-card',
  title: 'hhd-title',
  // the top box
  stats: 'hhd-stats',
  tile: 'hhd-tile',
  tileIcon: 'hhd-tile-icon',
  tileWords: 'hhd-tile-words',
  tileNum: 'hhd-tile-num',
  tileLabel: 'hhd-tile-label',
  wait: 'hhd-wait',
  // Activity
  act: 'hhd-act',
  actWords: 'hhd-act-words',
  lastUsed: 'hhd-lu',
  key: 'hhd-key',
  keySq: 'hhd-key-sq',
  keyFirst: 'hhd-key-first',
  keyLast: 'hhd-key-last',
  gridWrap: 'hhd-gridwrap',
  dayNames: 'hhd-daynames',
  months: 'hhd-months',
  month: 'hhd-month',
  grid: 'hhd-grid',
  sq: 'hhd-sq',
  l0: 'hhd-l0',
  l1: 'hhd-l1',
  l2: 'hhd-l2',
  l3: 'hhd-l3',
  today: 'hhd-today',
  // Set up
  head: 'hhd-head',
  count: 'hhd-count',
  countN: 'hhd-count-n',
  road: 'hhd-road',
  lines: 'hhd-lines',
  line: 'hhd-line',
  stop: 'hhd-stop',
  dot: 'hhd-dot',
  done: 'hhd-done',
  todo: 'hhd-todo',
  here: 'hhd-here',
  quiet: 'hhd-quiet',
  sel: 'hhd-sel',
  up: 'hhd-up',
  down: 'hhd-down',
  label: 'hhd-label',
  name: 'hhd-name',
  you: 'hhd-you',
  next: 'hhd-next',
  nextWords: 'hhd-next-words',
  nextLine: 'hhd-next-line',
  nextLabel: 'hhd-next-label',
  nextName: 'hhd-next-name',
  nextWhy: 'hhd-next-why',
  allDone: 'hhd-alldone',
  // dash-v2: the small down arrow after "Open"
  openChev: 'hhd-open-chev',
  openWord: 'hhd-open-word',
  steps: 'hhd-steps',
  caret: 'hhd-caret',
  stepsHead: 'hhd-steps-head',
  stepsIcon: 'hhd-steps-icon',
  stepsName: 'hhd-steps-name',
  stepsWhy: 'hhd-steps-why',
  ol: 'hhd-ol',
  li: 'hhd-li',
  route: 'hhd-route',
  term: 'hhd-term',
  termWhen: 'hhd-term-when',
  paste: 'hhd-paste',
  pasteText: 'hhd-paste-text',
  pasteBox: 'hhd-paste-box',
  word: 'hhd-word',
  pasteFor: 'hhd-paste-for',
  quietLine: 'hhd-quietline',
  foot: 'hhd-foot',
  // dash-v2: a source tag (worn with Hermes's chip classes), quieter than the steps
  src: 'hhd-src',
  close: 'hhd-close'
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
  dotsWait: 'hh-wait',
  dotsStill: 'hh-still',
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
  // the things to pick inside the message box (talk-r5), growing and shrinking
  picks: 'hh-picks',
  // the faint lines: what was kept, what is used; the first-time line on a line of its own
  note: 'hh-note',
  noteFirst: 'hh-note-first',
  // talk v2 fixes: the words of a faint line that is no longer true (forgotten), struck through
  gone: 'hh-gone',
  link: 'hh-link',
  // the list of what Helper keeps (A1)
  rows: 'hh-rows',
  // the box "From the Hermes docs" (S1, S2): the docs' own words, not Helper's voice
  docs: 'hh-docs',
  docsHead: 'hh-docs-head',
  docsWords: 'hh-docs-words',
  // the numbered clicks to add an optional skill, and the faint line after them
  steps: 'hh-steps',
  after: 'hh-after',
  // "More" among the things to pick: quieter than an answer (talk v2 look)
  more: 'hh-more',
  // held room: there, not seen yet
  wait: 'hh-wait',
  skip: 'hh-link hh-skip',
  grip: 'hh-grip',
  gripPill: 'hh-grip-pill'
}

// Every codicon the plugin names (sidebar row and page). scripts/check-hermes-classes.mjs checks
// they exist in the codicon font Hermes ships; a test checks the code names no others.
// dash-v1: and the Dashboard's (src/dash.js DASH_ICONS, design/dash-r7/notes.md's table), each Hermes's own.
const ICONS = ['compass', 'chevron-left', 'chevron-right', 'chevron-down', 'arrow-right', 'arrow-up', 'hubot', 'zap', 'extensions', 'cloud-download', 'robot', 'edit', 'comment', 'symbol-misc', 'watch', 'close', 'check']
// dash-v1: the Tabler icons the Dashboard takes from Hermes through the SDK's `icons` (hhtech-dash-icons.md point 1)
const TABLER_ICONS = ['Box', 'Brain', 'Lock']
// Hermes's look has one primary button per screen (hhdesign fix 6); every other button of
// ours is secondary or ghost. tests/page-render.test.mjs counts them per screen.

// ---- src/talk-css.js ----
// Generated by scripts/build.mjs from src/talk.css (the style sheet of Helper's conversation window).
// Edit the CSS, then build; tests/talk-css.test.mjs checks it.
const TALK_CSS = ".hh-win{display:flex;flex-direction:column;padding:16px var(--hh-pad,20px) 18px;background:var(--ui-sidebar-surface-background);--hh-char:168px;--hh-k:.84;--hh-pad:20px}\n.hh-win.hh-narrow{--hh-pad:14px}\n.hh-win.hh-small{--hh-char:132px;--hh-k:.66}\n.hh-conv{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;gap:9px;overflow:hidden}\n.hh-conv>*{flex:none}\n.hh-old{align-self:flex-start;max-width:86%;padding:6px 11px;border-radius:10px;background:var(--ui-bg-elevated);border:1px solid var(--ui-stroke-tertiary);font-size:13.5px;line-height:19px;color:var(--ui-text-secondary)}\n.hh-old-link{display:flex;align-items:center;gap:5px;margin-top:3px;font-size:12.5px;line-height:17px;font-weight:500;color:var(--ui-text-secondary);text-decoration:underline;text-decoration-color:var(--ui-text-quaternary);text-underline-offset:3px;cursor:pointer}\n.hh-old-link .codicon{font-size:12px}\n.hh-me{align-self:flex-end;max-width:82%;padding:6px 11px;border-radius:12px;background:var(--ui-chat-bubble-background);border:1px solid var(--dt-user-bubble-border);font-size:13.5px;line-height:19px;color:var(--ui-text-primary)}\n.hh-note{align-self:flex-start;max-width:100%;margin-top:-4px;font-size:12px;line-height:17px;color:var(--ui-text-tertiary)}\n.hh-note .hh-link{margin-left:10px;white-space:nowrap}\n.hh-link{color:inherit;text-decoration:underline;text-decoration-color:var(--ui-text-quaternary);text-underline-offset:3px;cursor:pointer}\n.hh-link:hover{text-decoration-color:currentColor}\n.hh-bubble{position:relative;align-self:flex-start;max-width:100%;margin-top:5px;padding:11px 15px 12px;border-radius:12px;background:var(--ui-bg-elevated);border:1px solid var(--ui-stroke-primary)}\n.hh-line{font-size:16px;line-height:23px;font-weight:500;text-wrap:pretty;color:var(--ui-text-primary)}\n.hh-in{margin-top:10px;padding-top:10px;border-top:1px solid var(--ui-stroke-tertiary);display:flex}\n.hh-bubble.hh-dots{display:flex;gap:5px;padding:12px 14px;margin-left:calc(var(--hh-char)*.5 - 8px)}\n.hh-dots i{width:6px;height:6px;border-radius:50%;background:var(--ui-text-quaternary)}\n.hh-dots i.hh-on{background:var(--ui-text-secondary)}\n.hh-btn{height:28px;padding:0 10px 0 12px;border-radius:6px;display:inline-flex;align-items:center;gap:7px;flex:none;font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer;background:var(--ui-bg-tertiary);color:var(--ui-text-primary);border:1px solid var(--ui-stroke-secondary)}\n.hh-btn .codicon{font-size:13px;color:var(--ui-text-secondary)}\n.hh-btn:hover{background:var(--ui-control-hover-background);border-color:var(--ui-stroke-primary)}\n.hh-btn:active{background:var(--ui-control-active-background);border-color:var(--ui-stroke-primary);filter:brightness(.8)}\n.hh-under{position:relative;flex:none;display:flex;min-height:calc(108px*var(--hh-k) + 16px)}\n.hh-charspace{flex:none;width:calc(var(--hh-char) + 12px)}\n.hh-small .hh-charspace{width:calc(var(--hh-char) + 8px)}\n.hh-tail-fill{fill:var(--ui-bg-elevated)}\n.hh-tail-edge{fill:none;stroke:var(--ui-stroke-primary);stroke-width:1px;stroke-linejoin:round;stroke-linecap:round}\n.hh-answers{flex:1;min-width:0;display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;align-content:flex-end;padding:8px 0 9px}\n.hh-answer{min-height:29px;max-width:100%;padding:4px 12px;border-radius:12px;display:inline-flex;align-items:center;flex:none;font-size:13.5px;line-height:19px;text-align:left;cursor:pointer;color:var(--ui-text-primary);background:var(--ui-chat-bubble-background);border:1px solid var(--ui-stroke-primary)}\n.hh-answer:hover{background:linear-gradient(var(--ui-control-hover-background),var(--ui-control-hover-background)),var(--ui-chat-bubble-background);border-color:var(--ui-text-quaternary)}\n.hh-answer:active{background:linear-gradient(var(--ui-control-active-background),var(--ui-control-active-background)),var(--ui-chat-bubble-background);border-color:var(--ui-text-tertiary);filter:brightness(.8)}\n.hh-answer:focus-visible,.hh-btn:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}\n.hh-picks{overflow:hidden}\n.hh-win{position:relative;flex:none;box-sizing:border-box;height:100%;min-height:0;--hh-inset:0px}\n.hh-win.hh-over{position:absolute;top:0;bottom:0;height:auto;z-index:20;border-left:1px solid var(--ui-stroke-tertiary)}\n.hh-conv{flex-direction:column-reverse;justify-content:flex-start;overflow:hidden auto;overscroll-behavior:contain;overflow-anchor:none}\n.hh-conv[data-fade=top]{mask-image:linear-gradient(to bottom,transparent 0,var(--ui-base) 20px)}\n.hh-conv[data-fade=bottom]{mask-image:linear-gradient(to top,transparent 0,var(--ui-base) 20px)}\n.hh-conv[data-fade=both]{mask-image:linear-gradient(to bottom,transparent 0,var(--ui-base) 20px,var(--ui-base) calc(100% - 20px),transparent 100%)}\n.hh-conv-in{display:flex;flex-direction:column;gap:9px}\n.hh-conv-in>*{flex:none}\n.hh-me{overflow-wrap:anywhere}\n.hh-note .hh-link{padding:0;border:0;background:none;font:inherit}\n.hh-note-first{display:block;text-wrap:pretty;color:var(--ui-text-secondary)}\n.hh-note{text-wrap:pretty}\n.hh-rows{margin:0;padding:0;list-style:none;font-size:13.5px;line-height:19px;color:var(--ui-text-secondary)}\n.hh-old .hh-rows{margin-top:3px;font-size:12.5px;line-height:17px}\n.hh-bubble{flex:none;margin-top:14px;min-width:calc(var(--hh-inset) + var(--hh-char)*.5 + 32px)}\n.hh-bubble.hh-dots{min-width:0;margin-left:calc(var(--hh-inset) + var(--hh-char)*.5 - 8px)}\n.hh-wait{visibility:hidden}\n.hh-in.hh-col{flex-direction:column;align-items:flex-start;gap:10px}\n.hh-where{font-size:13px;line-height:19px;text-wrap:pretty;color:var(--ui-text-secondary)}\n.hh-old .hh-where{margin-top:3px;font-size:12.5px;line-height:17px;color:var(--ui-text-tertiary);text-wrap:pretty}\n.hh-linkcell{position:absolute;z-index:2;left:calc(var(--hh-inset) + var(--hh-char)*.5 - 2px);top:-1px;width:22px;height:24px;overflow:visible;pointer-events:none}\n.hh-tail-short{display:block;width:22px;height:24px;overflow:visible}\n.hh-char{position:absolute;left:var(--hh-inset);bottom:calc(-8px*var(--hh-k));z-index:1;pointer-events:none}\n.hh-picks{transition:height .3s ease-in-out}\n.hh-picks .hh-answers{display:grid;grid-template-columns:repeat(var(--hh-cols,2),minmax(0,1fr));gap:6px;padding:10px 10px 0}\n.hh-picks .hh-answer{width:100%;box-sizing:border-box;min-height:32px;padding:5px 9px;justify-content:flex-start;border-radius:12px}\n.hh-skip{flex:none;align-self:center;padding:0 2px;font-size:12.5px;line-height:17px;color:var(--ui-text-tertiary)}\n.hh-grip{position:absolute;top:0;bottom:0;left:-7px;width:14px;display:flex;align-items:center;justify-content:center;cursor:col-resize;z-index:3;touch-action:none}\n.hh-grip::before{content:\"\";position:absolute;top:0;bottom:0;left:7px;width:1px;background:var(--ui-stroke-tertiary)}\n.hh-grip-pill{position:relative;width:5px;height:48px;border-radius:3px;background:var(--ui-text-quaternary)}\n.hh-old-link:focus-visible,.hh-link:focus-visible,.hh-grip:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}\n.hh-docs{margin:8px 0 0;padding:1px 0 1px 12px;border-left:2px solid var(--ui-text-tertiary)}\n.hh-docs-head{margin:0;font-size:12px;line-height:17px;font-weight:500;color:var(--ui-text-tertiary)}\n.hh-docs-words{margin:2px 0 0;font-size:13.5px;line-height:19px;font-style:italic;text-wrap:pretty;overflow-wrap:anywhere;color:var(--ui-text-secondary)}\n.hh-old .hh-docs{margin-top:4px}\n.hh-old .hh-docs-words{font-size:12.5px;line-height:17px}\n.hh-steps{margin:0;padding-left:20px;list-style:decimal;font-size:13.5px;line-height:19px;text-wrap:pretty;color:var(--ui-text-secondary)}\n.hh-steps li::marker{color:var(--ui-text-tertiary);font-variant-numeric:tabular-nums}\n.hh-steps li+li{margin-top:6px}\n.hh-old .hh-steps{margin-top:3px;font-size:12.5px;line-height:17px}\n.hh-old .hh-steps li+li{margin-top:4px}\n.hh-after{font-size:12.5px;line-height:17px;text-wrap:pretty;color:var(--ui-text-tertiary)}\n.hh-btn[aria-expanded=true] .codicon,.hh-old-link[aria-expanded=true] .codicon{transform:rotate(180deg)}\n.hh-picks .hh-answer.hh-more{background:transparent;color:var(--ui-text-secondary);border-color:var(--ui-stroke-tertiary)}\n.hh-picks .hh-answer.hh-more:hover{background:linear-gradient(var(--ui-control-hover-background),var(--ui-control-hover-background)),var(--ui-chat-bubble-background);border-color:var(--ui-text-quaternary);color:var(--ui-text-primary)}\n.hh-picks .hh-answer.hh-more:active{background:linear-gradient(var(--ui-control-active-background),var(--ui-control-active-background)),var(--ui-chat-bubble-background);border-color:var(--ui-text-tertiary);color:var(--ui-text-primary)}\n.hh-gone{text-decoration:line-through}\n.hh-dots.hh-wait i{animation:hh-dot 1.2s step-end infinite}\n.hh-dots.hh-wait i:nth-child(2){animation-delay:.4s}\n.hh-dots.hh-wait i:nth-child(3){animation-delay:.8s}\n@keyframes hh-dot{0%{background:var(--ui-text-secondary)}33.333%{background:var(--ui-text-quaternary)}}\n.hh-dots.hh-still i{animation:none;background:var(--ui-text-tertiary)}"

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
// The things to pick (src/talk-view.js Picks): how many columns a list takes (talk-r5): four are two rows
// of two, three or two one row, so no row is ever half empty; one column (stacked) when a label would wrap.
// talk v2 look (hhdesign's review of e86b410, section 3 point 1): four picks in a window 420 px or wider
// stay two by two when a label wraps to two lines inside its pick; only a label that would need three
// lines stacks them. Under 420 px, and for two or three, one line as before.
const columnsFor = (count, stacked) => (stacked || count < 2 ? 1 : count === 4 ? 2 : count)
const FOUR_TWO_LINES_PX = 420
const linesAllowed = (count, width) => (count === 4 && width >= FOUR_TWO_LINES_PX ? 2 : 1)
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

// talk-live-3: in a line that says "type", a quoted phrase to type is one word (src/quotes.js typedParts), so it
// appears whole in its code style and nothing jumps when its last word comes
function wordsOf(text) {
  const s = String(text ?? '')
  const kept = TYPE_WORD.test(s) ? s.replace(TYPED_PHRASE, m => m.replace(/\s/g, '\u0000')) : s
  return kept.trim().split(/\s+/).filter(Boolean).map(w => w.replace(/\u0000/g, ' '))
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
// A name in curly marks with no space in it is kept on one line with its marks (src/quotes.js namesWhole;
// hhdesign's review of d1ceddc, 3.1). text is already drawn by curlyQuotes.
const NAME_WHOLE = { whiteSpace: 'nowrap' }
function keepNamesWhole(text, keyAt = '') {
  const parts = namesWhole(text)
  if (!parts) return text
  return parts.map((p, i) => (typeof p === 'string' ? p : jsx('span', { style: NAME_WHOLE, 'data-hh': 'name-whole', children: p.whole }, `${keyAt}n${i}`)))
}
// talk-live-3 (Lead's call on question 5 of the c18 report): a line's words to read, with text to type in the paste
// box's code style (an inline <code>, a phrase's quote marks around it; kept on one line unless longer than NAME_WHOLE_MAX)
// and names kept whole. typeLine: whether the whole line says "type" (src/quotes.js typedParts).
function drawnWords(text, typeLine) {
  const parts = typedParts(text, typeLine)
  if (!parts) return keepNamesWhole(text)
  return parts.flatMap((p, i) =>
    typeof p === 'string'
      ? [].concat(keepNamesWhole(p, `${i}-`))
      : [jsx('code', { className: K.typed, style: Array.from(p.typed).length <= NAME_WHOLE_MAX ? NAME_WHOLE : undefined, 'data-hh': 'typed', children: p.typed }, `t${i}`)]
  )
}

// One line Helper says. A screen reader gets the whole line once (Hermes's own sr-only class);
// the copy the eye sees, growing word by word, is hidden from it. A name kept whole is one word, so it is
// always wholly in the seen part or wholly in the rest.
function Said({ clock, id, text, className, fresh = false }) {
  const words = wordsOf(text)
  const [, redraw] = useState(0)
  useEffect(() => clock.watch(id, () => redraw(n => n + 1)), [clock, id])
  const n = clock.shown(id, words.length, fresh)
  const rest = words.slice(n).join(' ')
  // talk-live-3: text to type in code style; whether the line says "type" is judged on the whole line
  const typeLine = TYPE_WORD.test(String(text ?? ''))
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
          children: [drawnWords(words.slice(0, n).join(' '), typeLine), rest ? jsx('span', { style: UNSEEN, 'data-hh': 'said-rest', children: drawnWords((n ? ' ' : '') + rest, typeLine) }, 'rest') : null]
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

// ---- src/dash-data.js ----
// Generated by scripts/build.mjs from content/dash-setup-list-v2.json (the Dashboard tab: hhcontent's 11 things and
// the tab's other words), checked against content/dash-docs-lines-v0.23.0.json. Only the fields the code reads.
// Edit the JSON, then build.
const DASH_DATA = {
  "items": [
    {
      "id": "install",
      "counts": true,
      "name": "Install Hermes",
      "mark": "Install",
      "why": "Hermes is the program itself. It works only while its computer is on.",
      "steps": [
        {
          "text": "Go to hermes-agent.nousresearch.com and download Hermes for your computer."
        },
        {
          "text": "On a Mac: open the download and drag Hermes into Applications."
        },
        {
          "text": "On Windows: open the download, and Windows installs it."
        },
        {
          "text": "Open Hermes. Its first screens take you to your first message."
        }
      ],
      "terminal": {
        "when": "Only for Linux, a server, or without the app. The docs give only these commands.",
        "paste": [
          {
            "for": "Linux, Mac or Windows WSL2",
            "text": "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash"
          },
          {
            "for": "Windows, in PowerShell",
            "text": "iex (irm https://hermes-agent.nousresearch.com/install.ps1)"
          }
        ]
      },
      "sources": [
        {
          "file": "getting-started/quickstart.md",
          "line": 53
        },
        {
          "file": "guides/team-telegram-assistant.md",
          "line": 27
        }
      ]
    },
    {
      "id": "model",
      "counts": true,
      "name": "A model",
      "mark": "Model",
      "why": "The AI that does the thinking. Your app may already have a free one.",
      "steps": [
        {
          "text": "Open Settings (Ctrl and comma; Cmd and comma on a Mac). Click Providers."
        },
        {
          "text": "Sign in to the AI company you use, or paste its key."
        },
        {
          "text": "Go to Model, then Main model. Pick the company, then the model.",
          "route": {
            "label": "Open Model settings",
            "to": "/settings?tab=config:model"
          }
        },
        {
          "text": "Click Apply under the model list."
        },
        {
          "text": "Check: open a new chat. The model's name shows in the typing box, left of the microphone."
        }
      ],
      "terminal": {
        "when": "Same thing in a terminal.",
        "paste": [
          {
            "for": "any computer",
            "text": "hermes model"
          }
        ]
      },
      "sources": [
        {
          "file": "getting-started/quickstart.md",
          "line": 84
        }
      ]
    },
    {
      "id": "first_chat",
      "counts": false,
      "name": "First chat",
      "mark": "First chat",
      "why": "Ask Hermes one small thing, to see that it works.",
      "steps": [
        {
          "text": "Click New session at the top of the left list (or Ctrl+N; Cmd+N on a Mac).",
          "route": {
            "label": "New session",
            "to": "new-chat"
          }
        },
        {
          "text": "Ask something small you can check yourself."
        },
        {
          "text": "Check: Hermes answers, with no error."
        },
        {
          "text": "Check: ask one more thing in the same chat. It carries on."
        },
        {
          "text": "To come back: click Helper in the left list."
        }
      ],
      "terminal": null,
      "sources": [
        {
          "file": "getting-started/quickstart.md",
          "line": 182
        }
      ]
    },
    {
      "id": "personality",
      "counts": true,
      "name": "Its personality",
      "mark": "Personality",
      "why": "A short text that tells your Hermes who it is and how to talk.",
      "steps": [
        {
          "text": "Click Bots at the top of the left list."
        },
        {
          "text": "Right-click your main bot, then click \"Edit…\"."
        },
        {
          "text": "Click the button \"Advanced — model, skills, toolsets, SOUL.md\"."
        },
        {
          "text": "The big box under the skills list is SOUL.md. Write who your bot is and how it talks."
        },
        {
          "text": "Click Save. To come back: click Sessions at the top of the left list, then Helper."
        }
      ],
      "terminal": null,
      "sources": [
        {
          "file": "user-guide/features/personality.md",
          "line": 9
        },
        {
          "file": "user-guide/features/personality.md",
          "line": 33
        }
      ]
    },
    {
      "id": "chat_apps",
      "counts": true,
      "name": "Chat apps",
      "mark": "Chat apps",
      "why": "Talk to your Hermes from Telegram or another chat app on your phone.",
      "steps": [
        {
          "text": "Click Messaging in the left list.",
          "route": {
            "label": "Open Messaging",
            "to": "/messaging"
          }
        },
        {
          "text": "On the Telegram card, click Create with QR. Scan the code with Telegram on your phone."
        },
        {
          "text": "Hermes makes the bot, lets only you in, and restarts by itself."
        },
        {
          "text": "Check: send your new Telegram bot a message. It answers while this computer is on."
        },
        {
          "text": "To come back: click Helper in the left list."
        }
      ],
      "terminal": {
        "when": "For Discord, Slack, WhatsApp and the others the docs give a terminal command.",
        "paste": [
          {
            "for": "any computer",
            "text": "hermes gateway setup"
          }
        ]
      },
      "sources": [
        {
          "file": "getting-started/quickstart.md",
          "line": 45
        }
      ]
    },
    {
      "id": "tools_apps",
      "counts": false,
      "name": "Tools and apps",
      "mark": "Tools and apps",
      "why": "Actions Hermes can take, and outside apps like Gmail it can use.",
      "steps": [
        {
          "text": "Click Capabilities in the left list, then Tools. Each group of actions has a switch."
        },
        {
          "text": "Most are on already. Switch one off only if you never want it used."
        },
        {
          "text": "Click Connectors to link an app such as Gmail."
        },
        {
          "text": "With no Nous account, linking your first app makes a free one for you."
        }
      ],
      "terminal": null,
      "sources": [
        {
          "file": "user-guide/features/tools.md",
          "line": 13
        },
        {
          "file": "user-guide/features/tool-gateway.md",
          "line": 124
        }
      ]
    },
    {
      "id": "skills",
      "counts": false,
      "name": "Skills",
      "mark": "Skills",
      "why": "Written know-how that teaches Hermes one task. Many come already installed.",
      "steps": [
        {
          "text": "Click Capabilities in the left list, then Skills. Each skill has a switch."
        },
        {
          "text": "To add one: Source, then Optional. Open the skill's card and click Install."
        },
        {
          "text": "You don't need to add any first. Hermes picks a fitting skill by itself."
        }
      ],
      "terminal": null,
      "sources": [
        {
          "file": "getting-started/quickstart.md",
          "line": 295
        },
        {
          "file": "getting-started/quickstart.md",
          "line": 297
        }
      ]
    },
    {
      "id": "memory",
      "counts": false,
      "name": "Memory",
      "mark": "Memory",
      "why": "Short notes Hermes keeps about you, so it remembers between chats.",
      "steps": [
        {
          "text": "Nothing to switch on. Memory is on from the start."
        },
        {
          "text": "In a chat, say what to keep, like: Remember that I run a tennis club."
        },
        {
          "text": "Check: start a new chat and ask what it remembers about you."
        },
        {
          "text": "To see everything it keeps, type /journey in a chat."
        }
      ],
      "terminal": null,
      "sources": [
        {
          "file": "user-guide/features/memory.md",
          "line": 9
        }
      ]
    },
    {
      "id": "scheduled_job",
      "counts": true,
      "name": "Scheduled jobs",
      "mark": "Scheduled jobs",
      "why": "Hermes does a job for you at set times, like every morning.",
      "steps": [
        {
          "text": "In a chat, ask in plain words, like: Every morning at 9, send me a short news summary."
        },
        {
          "text": "Check: open Scheduled jobs. The job Hermes made is there."
        },
        {
          "text": "No job? Make one by hand: click New cron, type a name and the job, then Create cron.",
          "route": {
            "label": "Open Scheduled jobs",
            "to": "/cron"
          }
        }
      ],
      "terminal": null,
      "sources": [
        {
          "file": "getting-started/learning-path.md",
          "line": 80
        },
        {
          "file": "getting-started/quickstart.md",
          "line": 273
        }
      ]
    },
    {
      "id": "second_bot",
      "counts": true,
      "name": "A second bot",
      "mark": "Second bot",
      "why": "A bot is one separate Hermes, with its own name, memory and skills.",
      "steps": [
        {
          "text": "Click Bots at the top of the left list."
        },
        {
          "text": "Press + (New bot or group chat), then New bot."
        },
        {
          "text": "Fill in its Name, Title and Description, then click Create Bot."
        },
        {
          "text": "Check: the new bot says hello in its own chat."
        },
        {
          "text": "To come back: click Sessions at the top of the left list, then Helper."
        }
      ],
      "terminal": null,
      "sources": [
        {
          "file": "user-guide/bot-mode.md",
          "line": 8
        },
        {
          "file": "user-guide/bot-mode.md",
          "line": 13
        },
        {
          "file": "getting-started/learning-path.md",
          "line": 83
        }
      ]
    },
    {
      "id": "safety",
      "counts": false,
      "name": "Safety",
      "mark": "Safety",
      "why": "Hermes asks you first before it runs anything risky on your computer.",
      "steps": [
        {
          "text": "Nothing to switch on. Asking first is on from the start."
        },
        {
          "text": "When Hermes asks, read what it wants to run. Then say yes or no."
        },
        {
          "text": "Keep YOLO off. It is a switch in the bar under the chat that stops the asking."
        },
        {
          "text": "In a chat app, only people on its allowed list can talk to it."
        },
        {
          "text": "These choices live in Settings, Safety."
        }
      ],
      "terminal": null,
      "sources": [
        {
          "file": "user-guide/security.md",
          "line": 26
        },
        {
          "file": "getting-started/learning-path.md",
          "line": 163
        }
      ]
    }
  ],
  "total": 6,
  "words": {
    "tabs": {
      "dashboard": "Dashboard",
      "learn": "Learn",
      "my_setup": "My setup"
    },
    "tabListLabel": "Helper tabs",
    "notBuilt": "Nothing here yet. What is ready is on Dashboard.",
    "stats": {
      "bots_one": "bot",
      "bots": "bots",
      "skills_one": "skill",
      "skills": "skills",
      "plugins_one": "plugin on in this bot",
      "plugins": "plugins on in this bot",
      "not_known": "Helper could not read this number just now.",
      "waiting": "Counting",
      "plugins_short_one": "plugin, this bot",
      "plugins_short": "plugins, this bot"
    },
    "activity": {
      "title": "This bot's activity",
      "last_used_today": "Last used today",
      "last_used_one": "Last used yesterday",
      "last_used_n": "Last used {n} days ago",
      "less": "Less",
      "more": "More",
      "months": [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec"
      ],
      "days": [
        "",
        "Mon",
        "",
        "Wed",
        "",
        "Fri",
        ""
      ]
    },
    "setup": {
      "title": "Set up",
      "count": "{n} of {total}",
      "you_are_here": "You are here",
      "next": "Next",
      "open": "Open",
      "all_done": "All 6 are set up.",
      "not_counted": "Helper can't see this one, so it isn't counted.",
      "close": "Close",
      "copy": "Copy",
      "copied": "Copied",
      "source": "{file}, line {line}",
      "state_done": "done",
      "state_not_done": "to do",
      "state_not_counted": "not counted",
      "state_not_known": "Helper could not check this one just now"
    }
  }
}

// ---- src/dash-rules.js ----
// The Dashboard tab's fixed rules (dash-v1). Pure code, no React, no Hermes: src/dash.js reads Hermes and hands
// the answers here. No AI anywhere. What each rule reads (content/dash-setup-list-v2.json, docs/answers/
// hhtech-dash-reads.md and -reads2.md, "For builder:"):
//   install        always done: this page runs only inside an installed Hermes
//   (dash-v2: bot = the bot the app has open; Lead, 11 Nov)
//   model          setup.runtime_check { profile: bot } says ok: true (Hermes's own free plan counts)
//   personality    profiles.describe { name: bot }: soul is not empty and not one of Hermes's starter texts
//   chat_apps      host.status(): gateway_platforms names at least one chat app (switched on, with its key)
//   scheduled_job  cron.manage { action: 'list', profile: bot, include_disabled: true }: at least one job
//   second_bot     profiles.list: two or more bots
// A read that failed or has not come back is "not known" (null): never shown as done, never "You are here".
// dash-v2 (the two branches joined): the starter personality texts, which bot, and the six rules (doneFlags) are in
// src/setup-reads.js, the one copy the Dashboard and Helper's set-up conversation both use.

/* ---------- the path ---------- */
// Each of the 11 stops: 'done' (seen done: filled), 'todo' (seen, not done), 'here' (the first seen stop not done:
// "You are here"), 'unknown' (seen, but its read failed or is still out: drawn as not done, never "You are here"),
// or 'quiet' (Helper cannot see it: the smaller mark that never fills). The line itself has no state.
function pathStates(flags, items = DASH_DATA.items) {
  const states = items.map(it => {
    if (!it.counts) return 'quiet'
    const f = flags[it.id]
    return f === true ? 'done' : f === false ? 'todo' : 'unknown'
  })
  // "You are here" only where it is known: the first counted stop not done, when every counted stop before it is
  // seen done. A stop before it that could not be read (unknown) places nobody (review, dash-v1).
  const firstOpen = states.findIndex(s => s === 'todo' || s === 'unknown')
  const here = firstOpen >= 0 && states[firstOpen] === 'todo' ? firstOpen : -1
  if (here >= 0) states[here] = 'here'
  const counted = items.filter(it => it.counts)
  const done = counted.filter(it => flags[it.id] === true).length
  return { states, here, done, total: counted.length, allDone: done === counted.length }
}

/* ---------- Activity: the days the open bot was used ---------- */
// Rows of host.listPersistedSessions that are Hermes's own work, left out: scheduled jobs (cron), the task board
// (kanban), tool and helper-agent runs, and 'local', the source Hermes's own first-run chat ("Getting started") came
// back with (hhtech-dash-reads2.md section 3). Chats with no message are left out too.
const NOT_THE_PERSON = ['cron', 'kanban', 'tool', 'subagent', 'local']
// dash-v2: while Hermes is still writing that first-run chat it is not 'local' yet. Read in three brand-new homes on
// the first opening (dev/checks/dash-v2/fresh-probe-65b108b.out): source 'gui', 1 to 3 messages, title "Getting
// started"; some seconds later 'local' with 4 messages. So a fresh install showed "Last used today" (hhtech-dash-run,
// 2 of 3 homes). The field that tells it apart at once is its title (Hermes's CHAT_TITLE, agent/onboarding_text.py;
// a repeated run is "Getting started #2"): a chat with that title and no more than Hermes's own four messages is
// left out. With more messages the person has gone on in it, and it is a chat of theirs.
const FIRST_RUN_TITLE = /^Getting started( #\d+)?$/
const FIRST_RUN_MAX_MESSAGES = 4
const isFirstRunChat = s => typeof s.title === 'string' && FIRST_RUN_TITLE.test(s.title.trim()) && s.message_count <= FIRST_RUN_MAX_MESSAGES
// A time from a row as a Date: seconds (Hermes writes seconds); a number above 1e11 is read as milliseconds.
const dashTime = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? new Date(v > 1e11 ? v : v * 1000) : null)
// The person's own calendar day of a Date (their computer's clock), as 'YYYY-MM-DD'.
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// The days with a chat, each with how many chats touched it: a chat marks the day it started and the day it was
// last used (rows have no per-message dates, so the days between are not marked).
function chatDays(sessions) {
  const days = new Map()
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s || typeof s !== 'object') continue
    if (NOT_THE_PERSON.includes(String(s.source || '').toLowerCase())) continue
    if (!(typeof s.message_count === 'number' && s.message_count > 0)) continue
    if (isFirstRunChat(s)) continue
    const first = dashTime(s.started_at)
    const last = dashTime(s.last_active) || dashTime(s.last_activity_at) || first
    const keys = new Set([first, last].filter(Boolean).map(dayKey))
    for (const k of keys) days.set(k, (days.get(k) || 0) + 1)
  }
  return days
}

// How bright a day's square is: no chat, 1, 2, 3 or more.
const dayLevel = n => (n >= 3 ? 3 : n > 0 ? n : 0)

// The grid: `weeks` columns, Sunday on top, the last column holds today; days after today are not drawn.
// months: a month's name over the first column whose Sunday is in it (not over the first or the last column).
function activityGrid(days, today, weeks) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - (weeks - 1) * 7)
  const cells = []
  const months = []
  let prev = -1
  for (let w = 0; w < weeks; w++) {
    const sunday = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7)
    if (sunday.getMonth() !== prev && w > 0 && w < weeks - 1) months.push({ week: w, month: sunday.getMonth() })
    prev = sunday.getMonth()
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)
      if (day > today && dayKey(day) !== dayKey(today)) continue
      const key = dayKey(day)
      cells.push({ week: w, day: d, key, level: dayLevel(days.get(key) || 0), today: key === dayKey(today) })
    }
  }
  return { cells, months }
}

// "Last used": whole calendar days between the newest day with a chat and today. null = no chat at all.
function daysSinceUsed(days, today) {
  if (!days.size) return null
  const newest = [...days.keys()].sort().pop()
  const [y, m, d] = newest.split('-').map(Number)
  const then = new Date(y, m - 1, d)
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(0, Math.round((now - then) / 86400000))
}

function lastUsedLine(n, words = DASH_DATA.words.activity) {
  if (n === null) return null
  if (n === 0) return words.last_used_today
  if (n === 1) return words.last_used_one
  return words.last_used_n.replace('{n}', String(n))
}

// How many weeks fit a width: squares of `cell` px with `gap` px between, after the room the day names take.
const weeksThatFit = (width, cell, gap, maxWeeks = 52) => Math.max(1, Math.min(maxWeeks, Math.floor((width + gap) / (cell + gap))))

/* ---------- the top box ---------- */
// Skills: the different skill names across all bots (one read per bot, host.skills.list). One failed read: not
// shown (a part would be too low).
function distinctSkills(perBot) {
  if (!Array.isArray(perBot) || !perBot.length) return null
  const names = new Set()
  for (const r of perBot) {
    if (!r || !r.ok || !Array.isArray(r.value)) return null
    for (const s of r.value) if (s && typeof s.name === 'string' && s.name.trim()) names.add(s.name.trim())
  }
  return names.size
}
// Plugins (dash-v2; Lead, 11 Nov, his words "active plugins"): the plugins switched on for the open bot, plus 1 for
// Helper itself (Helper is never in that list: hhtech-dash-icons.md point 2). A row of plugins.manage list is the
// person's when its source is not 'bundled' (Hermes's own parts; tui_gateway/methods_tools.py counts user_count the
// same way), and switched on when its status is 'enabled' ('not enabled' and 'disabled' are not: hermes_cli/
// plugins_cmd.py _plugin_status). A row that does not say where it comes from is not taken for the person's. A
// failed read, or an answer without the list of rows: not shown, never a bare 1.
function pluginCount(read) {
  if (!read || !read.ok || !read.value || typeof read.value !== 'object') return null
  const rows = read.value.plugins
  if (!Array.isArray(rows)) return null
  return rows.filter(r => r && typeof r === 'object' && typeof r.source === 'string' && r.source !== 'bundled' && r.status === 'enabled').length + 1
}
// A tile's word under its number (hhcontent): the number 1 takes the _one word, every other number, and a tile with
// no number yet, the plain one. narrow: at the narrow size a tile that has a short word takes it (the plugins tile:
// "plugins on in this bot" is 126 px wide and a tile has 112 px there, measured in the app; Lead, 11 Nov: then the
// short variant).
function tileWord(key, n, words = DASH_DATA.words.stats, narrow = false) {
  const k = narrow && words[`${key}_short`] ? `${key}_short` : key
  return n === 1 ? words[`${k}_one`] : words[k]
}

// ---- src/dash-css.js ----
// Generated by scripts/build.mjs from src/dash.css (the style sheet of the Dashboard tab).
// Edit the CSS, then build; tests/dash-css.test.mjs checks it.
const DASH_CSS = ".hhd-main{--hhd-round:1;display:flex;flex-direction:column;gap:14px;padding:6px 32px 20px;min-width:0}\n.hhd-compact.hhd-main{gap:12px;padding:4px 24px 16px}\n.hhd-card{display:flex;flex-direction:column;min-width:0;background:var(--ui-bg-elevated);border-radius:calc(12px*var(--hhd-round));padding:18px 22px}\n.hhd-compact .hhd-card{padding:14px 16px}\nhtml:not(.dark) .hhd-card{box-shadow:inset 0 0 0 1px var(--ui-stroke-tertiary)}\n.hhd-title{font-size:11px;line-height:16px;font-weight:600;letter-spacing:.9px;text-transform:uppercase;color:var(--ui-accent);white-space:nowrap}\n.hhd-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}\n.hhd-compact .hhd-stats{gap:8px}\n.hhd-tile{display:flex;align-items:center;gap:12px;min-width:0;background:var(--ui-bg-elevated);border-radius:calc(12px*var(--hhd-round));padding:14px 16px}\n.hhd-compact .hhd-tile{flex-direction:column;align-items:flex-start;gap:10px;padding:12px}\nhtml:not(.dark) .hhd-tile{box-shadow:inset 0 0 0 1px var(--ui-stroke-tertiary)}\n.hhd-tile-icon{flex:none;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:calc(10px*var(--hhd-round));background:color-mix(in srgb,var(--ui-accent) 13%,transparent);color:var(--ui-accent)}\n.hhd-compact .hhd-tile-icon{width:32px;height:32px}\n.hhd-tile-words{display:flex;flex-direction:column;min-width:0}\n.hhd-tile-num{font-size:28px;line-height:32px;font-weight:600;letter-spacing:-.8px;font-variant-numeric:tabular-nums;color:var(--ui-text-primary)}\n.hhd-compact .hhd-tile-num{font-size:24px;line-height:28px}\n.hhd-tile-label{font-size:12px;line-height:17px;color:var(--ui-text-tertiary);white-space:nowrap}\n.hhd-compact .hhd-tile-label{white-space:normal}\n.hhd-wait{display:block;width:30px;height:20px;margin:6px 0;border-radius:calc(7px*var(--hhd-round));background:var(--ui-bg-tertiary)}\n.hhd-compact .hhd-wait{margin:4px 0}\n.hhd-act{flex-direction:row;align-items:stretch;gap:24px;padding:12px 22px}\n.hhd-compact .hhd-act{gap:16px;padding:10px 16px}\n.hhd-act-words{flex:none;display:flex;flex-direction:column;gap:1px;min-width:0}\n.hhd-act-words .hhd-title{margin-bottom:3px}\n.hhd-lu{font-size:12px;line-height:17px;color:var(--ui-text-secondary);white-space:nowrap}\n.hhd-key{margin-top:auto;display:inline-flex;align-items:center;gap:3px;font-size:10.5px;line-height:14px;color:var(--ui-text-tertiary);white-space:nowrap}\n.hhd-key-sq{width:8px;height:8px;border-radius:2px}\n.hhd-key-first{margin-left:4px}\n.hhd-key-last{margin-right:4px}\n.hhd-gridwrap{flex:1;min-width:0;display:flex;align-items:flex-end;justify-content:flex-end;gap:6px}\n.hhd-daynames{flex:none;display:grid;grid-template-rows:repeat(7,8px);gap:2px;width:22px;font-size:9.5px;line-height:8px;color:var(--ui-text-tertiary)}\n.hhd-months{position:relative;height:13px;font-size:10px;line-height:12px;color:var(--ui-text-tertiary)}\n.hhd-month{position:absolute;top:0;white-space:nowrap}\n.hhd-grid{display:grid;grid-template-rows:repeat(7,8px);grid-auto-columns:8px;gap:2px}\n.hhd-sq{width:8px;height:8px;border-radius:2px}\n.hhd-l0{background:var(--ui-bg-tertiary)}\n.hhd-l1{background:color-mix(in srgb,var(--ui-accent) 35%,transparent)}\n.hhd-l2{background:color-mix(in srgb,var(--ui-accent) 65%,transparent)}\n.hhd-l3{background:var(--ui-accent)}\n.hhd-today{outline:1px solid var(--ui-text-secondary);outline-offset:1px}\n.hhd-head{display:flex;align-items:baseline;gap:12px;min-width:0}\n.hhd-count{font-size:13px;color:var(--ui-text-secondary);white-space:nowrap}\n.hhd-count-n{font-size:15px;font-weight:600;color:var(--ui-text-primary)}\n.hhd-road{position:relative;margin:4px 0 0;width:100%}\n.hhd-compact .hhd-road{margin-top:2px}\n.hhd-lines{position:absolute;inset:0;overflow:visible;pointer-events:none}\n.hhd-line{fill:none;stroke:var(--ui-text-quaternary);stroke-width:1;stroke-linecap:round}\n.hhd-stop{position:absolute;transform:translate(-50%,-50%);display:block;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;font:inherit}\n.hhd-stop:focus-visible{outline:none}\n.hhd-dot{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;box-sizing:border-box}\n.hhd-compact .hhd-dot{width:32px;height:32px}\n.hhd-done .hhd-dot{background:var(--ui-accent);color:var(--background)}\n.hhd-todo .hhd-dot{background:var(--ui-bg-tertiary);color:var(--ui-text-tertiary)}\n.hhd-here .hhd-dot{width:50px;height:50px;background:color-mix(in srgb,var(--ui-accent) 18%,var(--ui-bg-elevated));color:var(--ui-accent);border:2px solid var(--ui-accent);outline:5px solid color-mix(in srgb,var(--ui-accent) 14%,transparent);outline-offset:0}\n.hhd-compact .hhd-here .hhd-dot{width:42px;height:42px}\n.hhd-quiet .hhd-dot{width:30px;height:30px;background:var(--ui-bg-elevated);border:1.5px solid var(--ui-text-quaternary);color:var(--ui-text-quaternary)}\n.hhd-compact .hhd-quiet .hhd-dot{width:26px;height:26px}\n.hhd-sel .hhd-dot,.hhd-stop:focus-visible .hhd-dot{outline:2px solid var(--ui-text-secondary);outline-offset:4px}\n.hhd-label{position:absolute;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:3px}\n.hhd-up .hhd-label{bottom:calc(100% + 6px);flex-direction:column-reverse}\n.hhd-down .hhd-label{top:calc(100% + 6px)}\n.hhd-here.hhd-up .hhd-label{bottom:calc(100% + 9px)}\n.hhd-here.hhd-down .hhd-label{top:calc(100% + 9px)}\n.hhd-name{display:block;font-size:12px;line-height:16px;color:var(--ui-text-tertiary);text-align:center;white-space:nowrap}\n.hhd-compact .hhd-name{font-size:11px;line-height:15px;white-space:normal}\n.hhd-done .hhd-name{color:var(--ui-text-secondary)}\n.hhd-here .hhd-name{color:var(--ui-text-primary);font-weight:600}\n.hhd-quiet .hhd-name{color:var(--ui-text-quaternary)}\n.hhd-you{display:block;font-size:11px;line-height:15px;font-weight:600;letter-spacing:.2px;color:var(--ui-accent);white-space:nowrap}\n.hhd-next{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:12px;border-top:1px solid var(--ui-stroke-tertiary);min-width:0}\n.hhd-compact .hhd-next{margin-top:8px;padding-top:10px}\n.hhd-next-words{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}\n.hhd-next-line{display:flex;align-items:baseline;gap:10px;min-width:0}\n.hhd-next-label{font-size:11px;line-height:14px;letter-spacing:.8px;text-transform:uppercase;color:var(--ui-accent);font-weight:600}\n.hhd-next-name{font-size:13px;font-weight:600;color:var(--ui-text-primary)}\n.hhd-next-why{font-size:12.5px;line-height:17px;color:var(--ui-text-tertiary)}\n.hhd-alldone{color:var(--ui-accent)}\n.hhd-open-word{display:inline-flex;align-items:center}\n.hhd-open-chev{display:inline-flex;margin-left:4px}\n.hhd-steps{position:relative;display:flex;flex-direction:column;gap:10px;margin-top:14px;border-radius:calc(12px*var(--hhd-round));background:var(--ui-bg-tertiary);padding:16px 40px 14px 18px}\n.hhd-compact .hhd-steps{gap:8px;margin-top:12px;padding:12px 34px 12px 14px}\n.hhd-caret{position:absolute;top:-7px;width:14px;height:14px;background:var(--ui-bg-tertiary);transform:rotate(45deg);border-radius:2px;clip-path:polygon(0 0,100% 0,0 100%)}\n.hhd-compact .hhd-caret{display:none}\n.hhd-steps-head{display:flex;align-items:center;gap:10px;min-width:0}\n.hhd-steps-icon{flex:none;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:color-mix(in srgb,var(--ui-accent) 18%,transparent);color:var(--ui-accent)}\n.hhd-steps-name{font-size:14px;font-weight:600;color:var(--ui-text-primary)}\n.hhd-steps-why{font-size:12.5px;line-height:17px;color:var(--ui-text-secondary)}\n.hhd-ol{margin:0;padding:0 0 0 20px;list-style:decimal;font-size:13px;line-height:20px;color:var(--ui-text-primary)}\n.hhd-compact .hhd-ol{line-height:19px}\n.hhd-ol li::marker{color:var(--ui-accent);font-weight:600}\n.hhd-li{margin:0 0 2px}\n.hhd-route{margin:4px 0 2px}\n.hhd-term{display:flex;flex-direction:column;gap:6px;min-width:0}\n.hhd-term-when{font-size:12px;line-height:17px;color:var(--ui-text-secondary)}\n.hhd-paste{display:flex;flex-direction:column;gap:4px;min-width:0}\n.hhd-paste-text{min-width:0;flex:1 1 auto;overflow-x:auto;font-size:12px;line-height:18px;color:var(--ui-text-secondary)}\n.hhd-paste-box{flex-wrap:wrap}\n.hhd-word{white-space:nowrap}\n.hhd-paste-for{font-size:11.5px;line-height:16px;color:var(--ui-text-tertiary)}\n.hhd-quietline{font-size:11.5px;line-height:16px;color:var(--ui-text-tertiary)}\n.hhd-foot{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0}\n.hhd-foot .hhd-src{font-size:10.5px;color:var(--ui-text-quaternary)}\n.hhd-close{position:absolute;right:10px;top:10px}"

// ---- src/dash.js ----
// The Dashboard tab (dash-v1, as Pēteris picked it: design/dash-r5 way (ii), r6 Activity, r7 tiles, icons and line).
// Three parts, top to bottom: the top box (three numbers: bots and skills for the whole Hermes, plugins for the open
// bot), Activity (the open bot's days with a chat, GitHub's grid), Set up (the path of 11 stops). Every word comes
// from the team's content/dash-setup-list-v2.json and content/dash-words-v1.json (src/dash-data.js); every rule from
// src/dash-rules.js and src/setup-reads.js; every class from the K and D tables (src/look.js).
// No AI call, no warning colours, nothing stored: the reads run each time the tab is put on screen.
// Reads, all read-only, always naming the bot (hhtech-dash-reads.md and -reads2.md, "For builder:"):
//   first   profiles.list (the bots: the bots number, and A second bot)
//   then    setup.runtime_check, profiles.describe, cron.manage list, host.status() and host.listPersistedSessions
//           (not in the SDK docs: feature-checked), all for the bot the app has open
//           (dash-v2; Lead, 11 Nov: "The count must not mix two bots. Every per-bot rule on the path (A model, Its
//           personality, Chat apps, Scheduled jobs) reads the bot the app has open, the same bot as the plugins tile
//           and Activity; it rereads when the open bot changes. Install and A second bot are for the whole Hermes.")
//   then    host.skills.list for each bot (the skills number)
//   last    plugins.manage list for the open bot (slow: up to a second)

// Every icon on the tab is Hermes's own (design/dash-r7/notes.md, the table; docs/answers/hhtech-dash-icons.md).
// codicon: Hermes's Codicon component; tabler: Hermes's Tabler set through the SDK's `icons`. hermes: where Hermes
// shows that icon for the same thing (apps/desktop/src/..., v0.23.0); nearest: Hermes has no icon for this thing.
const DASH_ICONS = {
  bots: { codicon: 'hubot', hermes: 'plugins/hermes-bots/roster-pane-toolbar.tsx:139' },
  skills: { codicon: 'zap', hermes: 'components/assistant-ui/reference-kinds.ts:107' },
  plugins: { codicon: 'extensions', hermes: 'app/settings/plugin-settings.tsx:67' },
  install: { codicon: 'cloud-download', hermes: 'components/update-status.tsx:389', nearest: true },
  model: { tabler: 'Box', hermes: 'app/settings/constants.ts:714' },
  first_chat: { codicon: 'robot', hermes: 'app/chat/sidebar/index.tsx:216' },
  personality: { codicon: 'edit', hermes: 'app/chat/sidebar/profile-switcher.tsx:1374' },
  chat_apps: { codicon: 'comment', hermes: 'app/chat/sidebar/index.tsx:230' },
  tools_apps: { codicon: 'symbol-misc', hermes: 'app/chat/sidebar/index.tsx:223' },
  skills_stop: { codicon: 'zap', hermes: 'components/assistant-ui/reference-kinds.ts:107' },
  memory: { tabler: 'Brain', hermes: 'app/settings/constants.ts:776' },
  scheduled_job: { codicon: 'watch', hermes: 'app/chat/sidebar/index.tsx:247' },
  second_bot: { codicon: 'hubot', hermes: 'plugins/hermes-bots/roster-pane-toolbar.tsx:139' },
  safety: { tabler: 'Lock', hermes: 'app/settings/constants.ts:756' },
  // the page's own small controls: the close mark on an opened stop, the tick of "everything is set up"
  close: { codicon: 'close', hermes: 'components/ui/sheet.tsx:76' },
  check: { codicon: 'check', hermes: 'components/ui/select.tsx:113' },
  // the small down arrow after "Open" on the Next row: the steps open below (hhdesign's review of 65b108b, point 5)
  open: { codicon: 'chevron-down', hermes: 'components/ui/select.tsx:38' }
}
const stopIcon = id => DASH_ICONS[id === 'skills' ? 'skills_stop' : id]

// Icon sizes (px) at the places Hermes draws them: 16 in its sidebar and Settings rows, 14 in Settings' sub-rows
// (hhtech-dash-icons.md point 1); 20 on the tiles (hhdesign's r7 size).
const ICON_CLASS = { 14: K.icon14, 16: K.icon16, 20: K.icon20 }
function DashIcon({ icon, size }) {
  if (icon.tabler) {
    const Tabler = icons && icons[icon.tabler]
    return Tabler ? jsx(Tabler, { className: ICON_CLASS[size], 'aria-hidden': true }) : null
  }
  return jsx(Codicon, { name: icon.codicon, size, 'aria-hidden': true })
}

// How long a read may take before it counts as failed (makeReader, src/setup-reads.js).
const DASH_READ_MS = 30000
const DASH_SLOW_READ_MS = 60000

// The element's own width, from a ResizeObserver on our own markup (0 until measured).
// A long word with a "/" before its end (a web address) may break after its last "/" only.
function pathBreak(word) {
  const at = word.lastIndexOf('/')
  if (word.length < 24 || at <= 0 || at >= word.length - 1) return word
  return [word.slice(0, at + 1), jsx('wbr', {}, 'b'), word.slice(at + 1)]
}

function useDashWidth() {
  const [width, setWidth] = useState(0)
  const holder = useRef(null)
  if (!holder.current) {
    const box = { observer: null }
    box.ref = node => {
      if (box.observer) box.observer.disconnect()
      box.observer = null
      if (!node || typeof ResizeObserver !== 'function') return
      box.observer = new ResizeObserver(entries => {
        const e = entries[entries.length - 1]
        if (e) setWidth(old => (old === Math.round(e.contentRect.width) ? old : Math.round(e.contentRect.width)))
      })
      box.observer.observe(node)
    }
    holder.current = box
  }
  return [width, holder.current.ref]
}

// The path's shape (r5/r7 build.js setup()): 11 points across the road, high and low in turn, joined by soft curves.
function roadShape(width, compact, here, count = DASH_DATA.items.length) {
  const A = compact ? 16 : 20
  // the name's row: one line of 16 px, or at the narrow size up to two lines of 15 px
  const NAMEH = compact ? 37 : 22
  const YOUH = compact ? 18 : 19
  const RB = compact ? 22 : 26
  const pad = compact ? 16 : 30
  const yu = here >= 0 && here % 2 === 0
  const yd = here >= 0 && here % 2 === 1
  const top = RB + NAMEH + (yu ? YOUH : 0) + 2
  const height = top + 2 * A + RB + NAMEH + (yd ? YOUH : 0) + 2
  const points = Array.from({ length: count }, (_, i) => [pad + (i * (width - 2 * pad)) / (count - 1), top + (i % 2 ? 2 * A : 0)])
  const segments = points.slice(1).map((b, i) => {
    const a = points[i]
    const dx = (b[0] - a[0]) / 2
    return `M ${a[0]} ${a[1]} C ${a[0] + dx} ${a[1]} ${b[0] - dx} ${b[1]} ${b[0]} ${b[1]}`
  })
  // the width a name may take at the narrow size: the room between the stops on its side, less a gap
  const nameRoom = Math.max(40, Math.floor((2 * (width - 2 * pad)) / (count - 1)) - 8)
  return { points, segments, height, nameRoom }
}
// Before the road is measured (and in the tests, which have no layout): this width.
const ROAD_WIDTH_UNMEASURED = 560
// The left side's width under which the tab takes hhdesign's narrow sizes (r5-r7: 720 px wide side at 1180, 580 at 940).
const DASH_COMPACT_UNDER_PX = 640
// Activity's squares: 8 px, 2 px apart; until the grid is measured, 16 weeks (the job's number).
const SQ = 8
const SQ_GAP = 2
const WEEKS_UNMEASURED = 16

const fill = (s, map) => s.replace(/\{(\w+)\}/g, (m, k) => (k in map ? String(map[k]) : m))

// The official Hermes docs: the only web address the page ever hands to the person's browser (the Dashboard's source
// tags; Helper's "Open the Quickstart").
const HERMES_DOCS_BASE = 'https://hermes-agent.nousresearch.com/docs/'
// It must begin with that address as written, and be a web address that reads back exactly as given: one with ".."
// in its path (a way out of /docs/) reads back shorter and is refused.
function isHermesDocsUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(HERMES_DOCS_BASE) || /[\s"'<>\\%@]/.test(url)) return false
  try {
    return new URL(url).href === url
  } catch {
    return false
  }
}
// Opens a docs page in the person's browser (the SDK's door to the OS); anything else, or a missing door, is ignored.
function openHermesDocs(ctx, url) {
  if (!isHermesDocsUrl(url)) return
  try {
    const p = ctx.os && typeof ctx.os.openExternal === 'function' ? ctx.os.openExternal(url) : null
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch {}
}

function makeDashboard(ctx) {
  const read = makeReader(ctx)
  const request = (method, params, ms = DASH_READ_MS) => read(() => host.request(method, params, ms), ms)

  // Opens a docs page in the person's browser (the SDK's door to the OS; only the official docs).
  const docsHref = file => HERMES_DOCS_BASE + String(file).replace(/\.(md|mdx)$/, '').replace(/(^|\/)index$/, '$1')
  const openDocs = url => openHermesDocs(ctx, url)
  // Opens one of Hermes's own places (a route hhtech ran); a missing door is ignored. Nothing is changed.
  const goTo = to => {
    try {
      if (to === 'new-chat') host.newChat()
      else host.navigate(to)
    } catch {}
  }

  // The stop the person left open (dash-v2; hhtech's run: a route button takes them to Hermes's own screen, the page
  // is built again when they come back, and the steps they were following were gone). Kept here, in the page's own
  // memory, until Hermes starts again; nothing is written anywhere. Closing the stop forgets it.
  const kept = { open: null }

  // The tab's state. The page holds it (src/page.js calls useDashboard on every draw, as it held the first build's
  // tabs), so it lives while the page is on screen. active: the Dashboard is the open tab. Each time it is opened
  // (and when the app opens another bot), everything is read again from the start: nothing that was read is kept.
  function useDashboard({ active }) {
    // the bot the app has open, as the app names it; when it gives no name (''), Hermes means its default bot
    const given = useValue(host.state.profile)
    const openBot = openBotName(given)
    const nameGiven = typeof given === 'string' && given.trim() !== ''
    const [reads, setReads] = useState({})
    useEffect(() => {
      if (!active) return undefined
      let alive = true
      setReads({})
      const put = patch => alive && setReads(r => ({ ...r, ...patch }))
      // A host door that is missing or throws when looked at counts as missing (not every Hermes has every door).
      const door = get => {
        try {
          const fn = get()
          return typeof fn === 'function' ? fn : null
        } catch {
          return null
        }
      }
      ;(async () => {
        const bots = await read(() => host.profiles.list(), DASH_READ_MS)
        if (!alive) return
        const rows = bots.ok ? botRows(bots.value) : null
        put({ bots: rows ? bots : { ok: false } })
        // the bot every per-bot read names: the open one by the app's own name; with no name given, the one Hermes
        // marks as default in its list of bots (else Hermes's own name for it, "default")
        const bot = nameGiven ? openBot : mainBotName(rows) || openBot
        const listSessions = door(() => host.listPersistedSessions)
        const getStatus = door(() => host.status)
        const sessions = listSessions ? read(() => listSessions(null, { profile: bot, limit: 500 }), DASH_READ_MS) : Promise.resolve({ ok: false })
        const status = getStatus ? read(() => getStatus(), DASH_READ_MS) : Promise.resolve({ ok: false })
        const [model, soul, cron, st, ses] = await Promise.all([
          // the open bot, by the name the app itself gives (never a guessed bot): so these are read also when the
          // bots read failed
          request('setup.runtime_check', { profile: bot }),
          request('profiles.describe', { name: bot }),
          request('cron.manage', { action: 'list', profile: bot, include_disabled: true }),
          status,
          sessions
        ])
        if (!alive) return
        put({ model, soul, cron, status: st, sessions: ses, pathRead: true })
        const skills = rows ? await Promise.all(rows.map(b => read(() => host.skills.list(b.name), DASH_READ_MS))) : null
        if (!alive) return
        put({ skills: skills || [{ ok: false }] })
        const plugins = await request('plugins.manage', { action: 'list', profile: bot }, DASH_SLOW_READ_MS)
        put({ plugins })
      })().catch(() => {})
      return () => {
        alive = false
        // the tab was left (or another bot opened): what was read goes
        setReads({})
      }
    }, [active, openBot, nameGiven])
    const [open, setOpenNow] = useState(() => kept.open)
    const setOpen = to => {
      const next = typeof to === 'function' ? to(open) : to
      kept.open = next
      setOpenNow(next)
    }
    const [roadWidth, roadRef] = useDashWidth()
    const [gridWidth, gridRef] = useDashWidth()
    const stepsBox = useRef(null)
    // a stop just opened: its steps are brought into view (at the narrow size the page scrolls to them)
    // (a stop found open on coming back is brought into view the same way)
    const [reveal, setReveal] = useState(() => kept.open !== null)
    // It waits until the steps are on screen and the path's reads are back (Activity arrives with them and moves
    // what is under it), so a stop found open on coming back, also to another tab first, is not missed.
    const settled = !!reads.pathRead
    useEffect(() => {
      if (!reveal || !active || !settled) return
      const el = stepsBox.current
      if (!el) return
      setReveal(false)
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
    }, [reveal, active, settled, open])
    const toggle = id => {
      setOpen(o => (o === id ? null : id))
      if (open !== id) setReveal(true)
    }
    return { reads, open, setOpen, toggle, roadWidth, roadRef, gridWidth, gridRef, stepsBox }
  }

  // The tab, drawn from that state. compact: the left side is narrow (hhdesign's 940 px sizes).
  function renderDashboard(state, { compact = false } = {}) {
    const W = DASH_DATA.words
    const { reads, open, setOpen, toggle, roadWidth, roadRef, gridWidth, gridRef, stepsBox } = state

    /* ---------- the top box: three tiles ---------- */
    const rows = reads.bots && reads.bots.ok ? botRows(reads.bots.value) : null
    const numbers = {
      // undefined = still reading (the waiting block); null = the read failed (no number at all)
      bots: reads.bots ? (rows ? rows.length : null) : undefined,
      skills: reads.skills ? distinctSkills(reads.skills) : undefined,
      plugins: reads.plugins ? pluginCount(reads.plugins) : undefined
    }
    const tile = key =>
      jsxs(
        'div',
        {
          className: D.tile,
          'data-hh': `tile-${key}`,
          children: [
            jsx('span', { className: D.tileIcon, children: jsx(DashIcon, { icon: DASH_ICONS[key], size: 20 }) }, 'i'),
            jsxs(
              'span',
              {
                className: D.tileWords,
                children: [
                  numbers[key] === undefined
                    ? jsx('i', { className: D.wait, 'data-hh': 'wait', 'aria-hidden': true }, 'n')
                    : numbers[key] === null
                      ? null
                      : jsx('b', { className: D.tileNum, 'data-hh': 'number', children: String(numbers[key]) }, 'n'),
                  jsx('span', { className: D.tileLabel, children: tileWord(key, numbers[key], W.stats, compact) }, 'l'),
                  // for a screen reader only: the number is still being read, or could not be read
                  numbers[key] === undefined
                    ? jsx('span', { className: K.srOnly, children: W.stats.waiting }, 'sr')
                    : numbers[key] === null
                      ? jsx('span', { className: K.srOnly, children: W.stats.not_known }, 'sr')
                      : null
                ]
              },
              'w'
            )
          ]
        },
        key
      )
    const stats = jsx('section', { className: D.stats, 'data-hh': 'stats', children: ['bots', 'skills', 'plugins'].map(tile) }, 'stats')

    /* ---------- Activity: shown only when the read worked ---------- */
    let activity = null
    const ses = reads.sessions
    if (ses && ses.ok && ses.value && Array.isArray(ses.value.sessions)) {
      const today = new Date()
      const days = chatDays(ses.value.sessions)
      const weeks = gridWidth ? weeksThatFit(gridWidth - 22 - 6, SQ, SQ_GAP) : WEEKS_UNMEASURED
      const grid = activityGrid(days, today, weeks)
      const last = lastUsedLine(daysSinceUsed(days, today))
      const level = n => [D.l0, D.l1, D.l2, D.l3][n]
      activity = jsxs(
        'section',
        {
          className: cx(D.card, D.act),
          'data-hh': 'activity',
          children: [
            jsxs(
              'div',
              {
                className: D.actWords,
                children: [
                  jsx('span', { className: D.title, children: W.activity.title }, 't'),
                  last ? jsx('span', { className: D.lastUsed, 'data-hh': 'last-used', children: last }, 'lu') : null,
                  jsxs(
                    'span',
                    {
                      className: D.key,
                      'aria-hidden': true,
                      children: [
                        W.activity.less,
                        ...[0, 1, 2, 3].map(n => jsx('i', { className: cx(D.keySq, level(n), n === 0 && D.keyFirst, n === 3 && D.keyLast) }, n)),
                        W.activity.more
                      ]
                    },
                    'k'
                  )
                ]
              },
              'w'
            ),
            jsxs(
              'div',
              {
                className: D.gridWrap,
                ref: gridRef,
                'aria-hidden': true,
                children: [
                  jsx('div', { className: D.dayNames, children: W.activity.days.map((d, i) => jsx('span', { children: d }, i)) }, 'd'),
                  jsxs(
                    'div',
                    {
                      children: [
                        jsx('div', { className: D.months, children: grid.months.map(m => jsx('span', { className: D.month, style: { left: `${m.week * (SQ + SQ_GAP)}px` }, children: W.activity.months[m.month] }, m.week)) }, 'm'),
                        jsx(
                          'div',
                          {
                            className: D.grid,
                            'data-hh': 'grid',
                            'data-weeks': weeks,
                            children: grid.cells.map(c =>
                              jsx('i', { className: cx(D.sq, level(c.level), c.today && D.today), 'data-day': c.key, 'data-level': c.level, style: { gridColumn: c.week + 1, gridRow: c.day + 1 } }, c.key)
                            )
                          },
                          'g'
                        )
                      ]
                    },
                    'mg'
                  )
                ]
              },
              'gw'
            )
          ]
        },
        'activity'
      )
    }

    /* ---------- Set up: the path ---------- */
    const items = DASH_DATA.items
    const ready = !!reads.pathRead
    const flags = ready ? doneFlags(reads) : { install: true }
    const path = pathStates(ready ? flags : {}, items)
    // before the path's reads are back: every counted stop waits as not done, nobody is "here", no count
    const states = ready ? path.states : items.map(it => (it.counts ? 'todo' : 'quiet'))
    const here = ready ? path.here : -1
    const width = roadWidth || ROAD_WIDTH_UNMEASURED
    const shape = roadShape(width, compact, here)
    const stateClass = { done: D.done, todo: D.todo, unknown: D.todo, here: D.here, quiet: D.quiet }
    const stateWord = { done: W.setup.state_done, todo: W.setup.state_not_done, unknown: W.setup.state_not_known, here: W.setup.you_are_here, quiet: W.setup.state_not_counted }
    const stops = items.map((it, i) => {
      const s = states[i]
      const size = s === 'quiet' ? 14 : 16
      return jsxs(
        'button',
        {
          type: 'button',
          className: cx(D.stop, stateClass[s], i % 2 ? D.down : D.up, open === it.id && D.sel),
          style: { left: `${shape.points[i][0]}px`, top: `${shape.points[i][1]}px` },
          'aria-label': `${it.mark}: ${stateWord[s]}`,
          'aria-expanded': open === it.id,
          'aria-controls': open === it.id ? 'helper-dash-steps' : undefined,
          'data-hh': 'stop',
          'data-stop': it.id,
          'data-state': s,
          onClick: () => toggle(it.id),
          children: [
            jsx('span', { className: D.dot, children: jsx(DashIcon, { icon: stopIcon(it.id), size }) }, 'd'),
            // the name, and under it (outward from the line) "You are here"; at the narrow size a long name may take
            // two lines, no wider than the room to the next stop on its side
            jsxs(
              'span',
              {
                className: D.label,
                'aria-hidden': true,
                style: compact ? { width: `${shape.nameRoom}px` } : undefined,
                children: [
                  jsx('span', { className: D.name, children: it.mark }, 'n'),
                  s === 'here' ? jsx('span', { className: D.you, 'data-hh': 'you-are-here', children: W.setup.you_are_here }, 'y') : null
                ]
              },
              'l'
            )
          ]
        },
        it.id
      )
    })
    const road = jsxs(
      'div',
      {
        className: D.road,
        ref: roadRef,
        style: { height: `${shape.height}px` },
        'data-hh': 'road',
        children: [
          jsx(
            'svg',
            {
              className: D.lines,
              width,
              height: shape.height,
              'aria-hidden': true,
              children: shape.segments.map((d, i) => jsx('path', { d, className: D.line, 'data-hh': 'line' }, i))
            },
            'svg'
          ),
          ...stops
        ]
      },
      'road'
    )

    let under = null
    const openItem = open ? items.find(it => it.id === open) : null
    if (openItem) {
      const i = items.indexOf(openItem)
      under = jsxs(
        'div',
        {
          className: D.steps,
          id: 'helper-dash-steps',
          ref: stepsBox,
          'data-hh': 'steps',
          'data-stop': openItem.id,
          children: [
            jsx('i', { className: D.caret, style: { left: `${shape.points[i][0] - 7}px` }, 'aria-hidden': true }, 'caret'),
            jsxs(
              'div',
              {
                className: D.stepsHead,
                children: [
                  jsx('span', { className: D.stepsIcon, children: jsx(DashIcon, { icon: stopIcon(openItem.id), size: 14 }) }, 'i'),
                  jsx('h3', { className: D.stepsName, children: openItem.name }, 'n')
                ]
              },
              'head'
            ),
            jsx('p', { className: D.stepsWhy, children: openItem.why }, 'why'),
            jsx(
              'ol',
              {
                className: D.ol,
                children: openItem.steps.map((s, k) =>
                  jsxs(
                    'li',
                    {
                      className: D.li,
                      children: [
                        jsx('span', { children: s.text }, 't'),
                        s.route
                          ? jsx('div', { className: D.route, children: jsx(Button, { variant: 'secondary', size: 'xs', 'data-hh': 'route', onClick: () => goTo(s.route.to), children: s.route.label }) }, 'r')
                          : null
                      ]
                    },
                    k
                  )
                )
              },
              'ol'
            ),
            openItem.terminal
              ? jsxs(
                  'div',
                  {
                    className: D.term,
                    'data-hh': 'terminal',
                    children: [
                      jsx('p', { className: D.termWhen, children: openItem.terminal.when }, 'w'),
                      ...openItem.terminal.paste.map((p, k) =>
                        jsxs(
                          'div',
                          {
                            className: D.paste,
                            children: [
                              jsx('span', { className: D.pasteFor, children: p.for }, 'f'),
                              jsxs(
                                'div',
                                {
                                  className: `${K.bubblePaste} ${D.pasteBox}`,
                                  'data-hh': 'paste',
                                  children: [
                                    // a command breaks only at its spaces, each word kept whole (a web address broke at
                                    // its hyphen and read as two words), except that a web address may break after its last
                                    // "/" (an invisible <wbr>: copied by hand it is the same text); Copy goes under it when
                                    // there is no room beside
                                    jsx(
                                      'code',
                                      {
                                        className: `${K.mono} ${D.pasteText}`,
                                        'data-hh': 'paste-text',
                                        children: p.text.split(' ').flatMap((word, i) => [i ? ' ' : null, jsx('span', { className: D.word, children: pathBreak(word) }, i)])
                                      },
                                      't'
                                    ),
                                    jsx(CopyButton, { text: p.text, label: W.setup.copy, appearance: 'button', buttonSize: 'xs', buttonVariant: 'ghost' }, 'c')
                                  ]
                                },
                                'p'
                              )
                            ]
                          },
                          k
                        )
                      )
                    ]
                  },
                  'term'
                )
              : null,
            openItem.counts ? null : jsx('p', { className: D.quietLine, 'data-hh': 'not-counted', children: W.setup.not_counted }, 'nc'),
            jsx(
              'div',
              {
                className: D.foot,
                children: openItem.sources.map(src => {
                  const url = docsHref(src.file)
                  return jsx(
                    'a',
                    {
                      className: `${K.chipLink} ${D.src}`,
                      href: url,
                      target: '_blank',
                      rel: 'noreferrer',
                      title: url,
                      'data-hh': 'source',
                      onClick: e => {
                        e.preventDefault()
                        openDocs(url)
                      },
                      // a middle click too goes to the web browser, never inside Hermes (as the first build's source tags)
                      onAuxClick: e => {
                        e.preventDefault()
                        openDocs(url)
                      },
                      children: fill(W.setup.source, { file: src.file, line: src.line })
                    },
                    `${src.file}:${src.line}`
                  )
                })
              },
              'foot'
            ),
            jsx(
              'div',
              {
                className: D.close,
                children: jsx(Button, { variant: 'ghost', size: 'icon-xs', 'aria-label': W.setup.close, 'data-hh': 'close', onClick: () => setOpen(null), children: jsx(DashIcon, { icon: DASH_ICONS.close, size: 14 }) })
              },
              'x'
            )
          ]
        },
        'steps'
      )
    } else if (ready && here >= 0) {
      const it = items[here]
      // the word and its arrow as one piece: Hermes's Button puts its own gap between its children, and the arrow
      // stands 4 px after the word (seen: about 14 px when they were two children)
      const openWord = jsx('span', { className: D.openWord, children: [W.setup.open, jsx('span', { className: D.openChev, children: jsx(DashIcon, { icon: DASH_ICONS.open, size: 12 }) }, 'c')] })
      under = jsxs(
        'div',
        {
          className: D.next,
          'data-hh': 'next',
          children: [
            jsxs(
              'span',
              {
                className: D.nextWords,
                children: [
                  jsxs(
                    'span',
                    {
                      className: D.nextLine,
                      children: [jsx('span', { className: D.nextLabel, children: W.setup.next }, 'l'), jsx('b', { className: D.nextName, children: it.name }, 'n')]
                    },
                    'a'
                  ),
                  jsx('span', { className: D.nextWhy, children: it.why }, 'w')
                ]
              },
              'words'
            ),
            // "Open", then Hermes's small down arrow: the steps open below (hhdesign's review of 65b108b, point 5)
            jsx(Button, { variant: 'link', size: 'inline', 'data-hh': 'open-next', onClick: () => toggle(it.id), children: openWord }, 'open')
          ]
        },
        'next'
      )
    } else if (ready && path.allDone) {
      under = jsxs(
        'div',
        {
          className: D.next,
          'data-hh': 'all-done',
          children: [jsx('span', { className: D.allDone, children: jsx(DashIcon, { icon: DASH_ICONS.check, size: 16 }) }, 'i'), jsx('span', { className: D.nextWhy, children: W.setup.all_done }, 't')]
        },
        'done'
      )
    }

    const setup = jsxs(
      'section',
      {
        className: D.card,
        'data-hh': 'setup',
        children: [
          jsxs(
            'div',
            {
              className: D.head,
              children: [
                jsx('h2', { className: D.title, children: W.setup.title }, 't'),
                ready
                  ? jsx(
                      'span',
                      {
                        className: D.count,
                        'data-hh': 'count',
                        // "{n} of {total}": the number done in bold, as r5 to r7 draw it
                        children: W.setup.count.split('{n}').flatMap((part, k) =>
                          k === 0 ? fill(part, { total: path.total }) : [jsx('b', { className: D.countN, children: String(path.done) }, 'n'), fill(part, { total: path.total })]
                        )
                      },
                      'c'
                    )
                  : null
              ]
            },
            'head'
          ),
          road,
          under
        ]
      },
      'setup'
    )

    return jsxs('div', {
      className: cx(D.main, compact && D.compact),
      'data-hh': 'dashboard',
      'data-compact': compact,
      children: [jsx('style', { 'data-hh': 'dash-css', children: DASH_CSS }, 'css'), stats, activity, setup]
    })
  }

  return { useDashboard, renderDashboard }
}

// ---- src/bubble-link.js ----
// The piece between Helper's speech bubble and the character. One component, so another form
// replaces this file without touching the bubble or the answers.
// What it gets: a layout cell (.hh-linkcell in src/talk.css), 22 by 24 px, that starts 1 px inside
// the bubble's lower edge, in front of the bubble. The cell is placed by CSS alone; nothing is
// measured and nothing goes through React state, so it cannot lag behind the bubble.
// Drawn now: hhdesign's talk-r5 tail (option 4, his pick of 10 Nov 20:05): a short curved tail of
// one fixed size, 22 by 24 px, leaning toward the middle of the face and stopping. It is never
// stretched: when the bubble sits higher there is more air under the tail, the tail stays the same.

const BUBBLE_LINK = { width: 22, height: 24 }
// design/talk-r5/talk.css, word for word: the fill, and a 1 px edge on the two curved sides only;
// the short side lies on the bubble's own edge and stays open, so bubble and tail read as one shape.
const SHAPE = 'M3,0 C6,9 4,17 0,24 C9,20 18,11 21,0'

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

// ---- src/quotes.js ----
// Quote marks (talk v2 look, point 4; hhdesign's review of e86b410, point 4): in a line Helper or its settings
// page shows as words to read, a pair of straight double quotes is drawn as curly ones (“Bots”). Done where the
// line is drawn, never in the data. Never used on text to paste, the settings text box, anything the person
// typed (their messages, a kept thing in the list or a faint "Kept: ..." line, the line quoted back on the
// settings page), or anything that is matched or stored; tests/talk-look.test.mjs checks those four.
// A quote mark with no partner stays straight.
// Apostrophes (hhdesign's review of d1ceddc, section 3 point 3): in the same step, a straight ' between two
// letters is drawn as ’ (I’m, What’s, Helper’s), with the same four exceptions.
// asTyped: the person's own words filled into the line (a name such as O'Neil, lineFor's asTyped): left as typed.
const curlPart = s => s.replace(/"([^"\n]*)"/g, '\u201c$1\u201d').replace(/(\p{L})'(?=\p{L})/gu, '$1\u2019')
const typedRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function curlyQuotes(text, asTyped = []) {
  if (typeof text !== 'string') return text
  const keep = (Array.isArray(asTyped) ? asTyped : []).filter(s => typeof s === 'string' && /['"]/.test(s) && text.includes(s))
  if (!keep.length) return curlPart(text)
  let out = ''
  let at = 0
  for (const m of text.matchAll(new RegExp(keep.map(typedRe).join('|'), 'g'))) {
    out += curlPart(text.slice(at, m.index)) + m[0]
    at = m.index + m[0].length
  }
  return out + curlPart(text.slice(at))
}

// A name in curly marks with no space in it (a skill such as “email-inbox-triage”) is kept on one line with its
// marks (hhdesign's review of d1ceddc, section 3 point 1: it broke at its hyphen and read as two words), unless
// it is longer than NAME_WHOLE_MAX characters: then it may be wider than the bubble's text width at 360 px, and
// it breaks as before. The longest of the 186 skill names has 31 characters; its width in the app: see
// docs/build/talk-v2-c18-report.md. src/talk-view.js draws each { whole } part in a span with white-space:nowrap.
const NAME_WHOLE_MAX = 31
const QUOTED_NAME = /\u201c([^\u201c\u201d\s]+)\u201d/g
// text already drawn by curlyQuotes -> null when no name in it is kept whole, else its parts in order: strings,
// and { whole: '“name”' } for each name kept whole
function namesWhole(text) {
  if (typeof text !== 'string' || !text.includes('\u201c')) return null
  const parts = []
  let at = 0
  for (const m of text.matchAll(QUOTED_NAME)) {
    if (Array.from(m[1]).length > NAME_WHOLE_MAX) continue
    if (m.index > at) parts.push(text.slice(at, m.index))
    parts.push({ whole: m[0] })
    at = m.index + m[0].length
  }
  if (!parts.length) return null
  if (at < text.length) parts.push(text.slice(at))
  return parts
}

// Text the person is to type (talk-live-3; Lead's call on question 5 of the c18 report, 11 Nov 05:08): in a line that
// says "type" (the word, any case), a /command (a slash and letters, after a space or at the start, before a space, an
// end mark or the end) and a phrase in quote marks (straight or curly). src/reveal.js draws each in the paste box's
// code style (a quoted phrase keeps its marks, outside it), and its word-by-word pace takes a quoted phrase as one
// word (TYPED_PHRASE).
// A line that does not say "type" has none: "click “New session”" names a button, and "/home" may be a folder.
//   typedParts(text, typeLine) -> null, or the parts in order: strings (a phrase's quote marks among them), and
//   { typed: '/usage' } for each piece to type
//   typeLine: whether the whole line says "type" (a part of a line, as Said draws it, is judged by its whole line)
const TYPE_WORD = /\btype\b/i
const TYPED_PHRASE = /(["\u201c])([^"\u201c\u201d\n]+)(["\u201d])/g
const TYPED_RX = /(^|\s)(\/[a-z][a-z-]*)(?=$|[\s.,;:!?])|(["\u201c])([^"\u201c\u201d\n]+)(["\u201d])/g
function typedParts(text, typeLine = TYPE_WORD.test(String(text))) {
  if (typeof text !== 'string' || !typeLine) return null
  const parts = []
  let at = 0
  for (const m of text.matchAll(TYPED_RX)) {
    const start = m[2] ? m.index + m[1].length : m.index
    if (start > at) parts.push(text.slice(at, start))
    // review: a quoted phrase keeps its quote marks, drawn outside the code style, so every reader still sees and
    // hears where it starts and ends
    if (m[2]) parts.push({ typed: m[2] })
    else parts.push(m[3], { typed: m[4] }, m[5])
    at = m.index + m[0].length
  }
  if (!parts.length) return null
  if (at < text.length) parts.push(text.slice(at))
  // neighbouring strings (a phrase's marks and the words beside them) as one
  return parts.reduce((out, p) => (typeof p === 'string' && typeof out[out.length - 1] === 'string' ? (out[out.length - 1] += p, out) : (out.push(p), out)), [])
}

// ---- src/talk-view.js ----
// The parts of Helper's conversation window (design/talk-r5: option 4, the things to pick inside the
// message box), drawn from plain data. page.js holds the conversation and decides what is said;
// nothing here keeps state of its own except the box of things to pick, which measures itself.
// One thing in the conversation (an "entry"):
//   { id, who: 'you', text }
//   { id, who: 'helper', line, text,
//     answers: null | { kind, hint, items: [{ id, label }] }   things to pick, in the message box
//     next:    null | { kind: 'paste', label, text }           a button that opens text to paste
//                   | { kind: 'part', label, to }              a button that opens a Hermes screen
//                   | { kind: 'line', label, line }            a button that makes Helper say one more line
//                   | { kind: 'settings', label }              a button that opens Helper's settings page
//                   | { kind: 'forget-all', label }            a button that asks "Delete everything ...?"
//                   | { kind: 'where', line, text }            no button: in its place, where to find the screen
//     paste:   null | text        text to paste shown at once (the "your own Hermes can" line)
//     rows:    null | [text]      the list of what Helper keeps (A1)
//     hint:    null | text        a small faint line under the line (N_HINT)
//     note:    null | { text, link, first, workTold }   the faint "Kept: ..." line, above the line it belongs to
//     used:    null | { text, link, topic }   the faint "From what I keep: ..." line, the same place
//     opened:  true once a 'paste' button was pressed }
// Classes come from the T table (src/talk.css); the text to paste wears Hermes's own classes.
// A Helper line drawn as words to read: curly marks and apostrophes, names in marks kept whole (src/quotes.js), and
// (talk-live-3) text to type in the paste box's code style (src/reveal.js drawnWords)
const drawn = (text, asTyped) => drawnWords(curlyQuotes(text, asTyped))

// The small arrow on a button: down when it opens something under itself, right when it leads on.
// (talk v2 look: once its part is open, the style sheet turns the down arrow up.)
const nextIcon = next => (next.kind === 'paste' || next.kind === 'steps' ? 'chevron-down' : 'arrow-right')
const ANSWERS_LABEL = 'Answers to pick'
// A button that opens something under its line, and closes it again.
const opens = next => next.kind === 'paste' || next.kind === 'steps'

// The list of what Helper keeps, one row per thing (A1). Its rows hold what the person typed: drawn as
// they are, quote marks included.
const Rows = ({ rows }) => jsx('ul', { className: T.rows, 'data-hh': 'kept-rows', children: rows.map((r, i) => jsx('li', { children: r }, i)) })
// The box "From the Hermes docs" (S1, S2): the docs page's own words, set apart from Helper's line so
// it is plainly not Helper speaking (helper-wants-v1.md 1.2), in Hermes's own quote look (hhdesign's
// notes-wants.md rule A: a 2 px line on its left, 12 px in, italic), directly under Helper's line.
const DocsBox = ({ docs, wait }) =>
  jsxs('div', {
    className: cx(T.docs, wait && T.wait),
    'aria-hidden': wait ? true : undefined,
    'data-hh': 'docs',
    children: [
      jsx('p', { className: T.docsHead, 'data-hh': 'docs-head', children: drawn(docs.head) }, 'h'),
      jsx('p', { className: T.docsWords, 'data-hh': 'docs-words', children: drawn(docs.words) }, 'w')
    ]
  })
// The clicks to add an optional skill: Hermes's own numbered list (rule B), and the faint line after them.
const Steps = ({ next }) => [
  jsx('ol', { className: T.steps, 'data-hh': 'steps', children: next.steps.map((s, i) => jsx('li', { children: drawn(s) }, i)) }, 'steps'),
  next.after ? jsx('p', { className: T.after, 'data-hh': 'steps-after', children: drawn(next.after) }, 'after') : null
]
// Text to paste inside a Helper line (notes-wants.md item 4): Hermes's own small code card with Copy at its
// top right; smaller in an older line. Drawn exactly as it will be pasted.
const BubblePaste = ({ text, old }) =>
  jsxs('div', {
    className: K.bubblePaste,
    'data-hh': 'paste',
    children: [
      jsx('span', { className: old ? K.bubblePasteTextOld : K.bubblePasteText, 'data-hh': 'paste-text', children: text }, 't'),
      jsx(CopyButton, { text, label: 'Copy', appearance: 'button', buttonSize: 'xs', buttonVariant: 'ghost' }, 'c')
    ]
  })

// The faint lines that go with a Helper line: "Kept: ..." with its link, the first-time line under
// it once, and "From what I keep: ..." with Change. Small faint text on Helper's side, never a
// question; the link is the only thing to press. hhdesign draws them just above the line.
// kept: the record as it is now. A faint line whose thing is no longer kept (forgotten, or replaced
// by a newer one) keeps its words, struck through (<del>), so it no longer reads as kept; its link
// still works. The first-time line under it is about where things are kept and stays as it is.
function notesOf(entry, onNote, kept) {
  const out = []
  const words = (text, gone) => (gone ? jsx('del', { className: T.gone, 'data-hh': 'kept-gone', children: text }, 'gone') : text)
  if (entry.note) {
    const gone = noteForgotten(entry.note, kept)
    out.push(
      jsxs('p', {
        className: T.note,
        'data-hh': 'kept-note',
        'data-forgotten': gone ? 'true' : undefined,
        children: [
          words(entry.note.text, gone),
          jsx('button', { type: 'button', className: T.link, 'data-hh': 'kept-link', onClick: () => onNote(entry, 'see'), children: entry.note.link }, 'link'),
          entry.note.first ? jsx('span', { className: T.noteFirst, 'data-hh': 'kept-first', children: entry.note.first }, 'first') : null,
          // live-v2 changes-4: below the first-time line, the line that the AI is told what the person does (once)
          entry.note.workTold ? jsx('span', { className: T.noteFirst, 'data-hh': 'kept-work-told', children: entry.note.workTold }, 'work-told') : null
        ]
      }, `${entry.id}-kept`)
    )
  }
  if (entry.used) {
    const gone = noteForgotten(entry.used, kept)
    out.push(
      jsxs('p', {
        className: T.note,
        'data-hh': 'used-note',
        'data-forgotten': gone ? 'true' : undefined,
        children: [words(entry.used.text, gone), jsx('button', { type: 'button', className: T.link, 'data-hh': 'used-link', onClick: () => onNote(entry, 'change'), children: entry.used.link }, 'link')]
      }, `${entry.id}-used`)
    )
  }
  return out
}

// Helper's older line, small, on its side. A button it had stays as a small underlined link; a line
// about where a screen is stays under it, and so does the docs quote. talk v2 look (hhdesign's
// notes-wants.md rule C point 3, settled by Lead): steps or text to paste opened under it close when the
// line moves up into the older lines (src/page.js), and its link stays, so one click opens them again
// here; no wall of text. Text to paste that came with the line itself (H1's) stays.
function OldLine({ entry, onNext }) {
  const next = entry.next
  const pasteText = entry.paste || (next && next.kind === 'paste' && entry.opened ? next.text : null)
  // talk-live-3 (hhtech-run-c18, Lead's call): a button whose press made Helper say its line is done; in the older
  // line its label is plain faint text, not a link. A button that opens something under its line (text to paste,
  // steps) or a Hermes screen stays a link, so it can be used again.
  const done = next && entry.pressed && (next.kind === 'line' || next.kind === 'forget-all' || next.kind === 'setup')
  return jsxs('div', {
    className: T.old,
    'data-hh': 'old',
    'data-line': entry.line,
    children: [
      jsx('span', { className: K.srOnly, children: 'Helper said: ' }, 'who'),
      drawn(entry.text, entry.asTyped),
      entry.docs ? jsx(DocsBox, { docs: entry.docs }, 'docs') : null,
      entry.rows ? jsx(Rows, { rows: entry.rows }, 'rows') : null,
      entry.hint ? jsx('p', { className: T.where, 'data-hh': 'hint', children: drawn(entry.hint) }, 'hint') : null,
      next && next.kind === 'where' ? jsx('p', { className: T.where, 'data-hh': 'where', 'data-line': next.line, children: drawn(next.text) }, 'where') : null,
      done ? jsx('p', { className: T.where, 'data-hh': 'old-pressed', 'data-kind': next.kind, children: next.label }, 'next') : null,
      next && next.kind !== 'where' && !done
        ? jsxs(
            'button',
            {
              type: 'button',
              className: T.oldLink,
              'data-hh': 'old-link',
              'data-kind': next.kind,
              'aria-expanded': opens(next) ? !!entry.opened : undefined,
              onClick: () => onNext(entry),
              children: [next.label, jsx(Codicon, { name: nextIcon(next) }, 'icon')]
            },
            'next'
          )
        : null,
      pasteText ? jsx(BubblePaste, { text: pasteText, old: true }, 'paste') : null,
      next && next.kind === 'steps' && entry.opened ? Steps({ next }) : null
    ]
  })
}

// The conversation so far: everything said before Helper's newest sentence, and last the faint
// lines of the newest sentence. It scrolls when it is full and stays at its newest when its room
// changes (the style sheet does that: the outer box stacks from its bottom). A screen reader hears
// who said each line; the eye sees it by the side.
// Which edges of the conversation have something hidden behind them (rule C point 1), as data-fade.
function convFade(el) {
  const above = el.scrollHeight - el.clientHeight + el.scrollTop > 1
  const below = el.scrollTop < -1
  const v = above && below ? 'both' : above ? 'top' : below ? 'bottom' : ''
  if (el.dataset.fade !== v) el.dataset.fade = v
}
function Conversation({ entries, newest, kept, onNext, onNote, scrollRef }) {
  // talk v2 look (hhdesign's notes-wants.md rule C point 1): an edge of the conversation fades out over
  // 20 px, as Hermes's own FadeScroll does, but only an edge that has something hidden behind it. The
  // conversation stacks from its bottom (column-reverse), so in Chromium its scrollTop is 0 at the newest
  // end and below 0 when scrolled up. Set on our own element, at each draw, scroll and size change.
  useLayoutEffect(() => {
    const el = scrollRef && scrollRef.current
    if (!el || !el.dataset) return
    convFade(el)
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => convFade(el)) : null
    if (ro) {
      ro.observe(el)
      if (el.firstElementChild) ro.observe(el.firstElementChild)
    }
    return () => {
      if (ro) ro.disconnect()
    }
  }, [scrollRef])
  const items = []
  for (const e of entries) {
    if (e.who === 'you') items.push(jsxs('div', { className: T.me, 'data-hh': 'me', children: [jsx('span', { className: K.srOnly, children: 'You said: ' }, 'who'), e.text] }, e.id))
    else {
      items.push(...notesOf(e, onNote, kept))
      items.push(jsx(OldLine, { entry: e, onNext }, e.id))
    }
  }
  if (newest) items.push(...notesOf(newest, onNote, kept))
  return jsx('div', {
    className: T.conv,
    ref: scrollRef,
    onScroll: e => convFade(e.currentTarget),
    role: 'group',
    'aria-label': 'Conversation so far',
    'data-hh': 'conversation',
    children: jsx('div', { className: T.convIn, 'data-hh': 'conversation-lines', children: items })
  })
}

// Helper's newest sentence, in the filled bubble. The words appear one by one (src/reveal.js) and
// hold their place from the first word, so the bubble has its final size at once. The list of what
// is kept, a faint hint, a button or text to paste sit inside the bubble under a thin line; their
// room is held too, and they show (and can be reached with the keyboard) when the line is said.
//   said: every word of the line is on screen
function Bubble({ entry, clock, fresh, said, onNext }) {
  const next = entry.next
  const pasteText = entry.paste || (next && next.kind === 'paste' && entry.opened ? next.text : null)
  const inside = []
  if (entry.rows) inside.push(jsx(Rows, { rows: entry.rows }, 'rows'))
  if (entry.hint) inside.push(jsx('p', { className: T.where, 'data-hh': 'hint', children: drawn(entry.hint) }, 'hint'))
  if (next && next.kind === 'where') inside.push(jsx('p', { className: T.where, 'data-hh': 'where', 'data-line': next.line, children: drawn(next.text) }, 'where'))
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
          'aria-expanded': opens(next) ? !!entry.opened : undefined,
          onClick: () => said && onNext(entry),
          children: [next.label, jsx(Codicon, { name: nextIcon(next) }, 'icon')]
        },
        'next'
      )
    )
  if (pasteText) inside.push(jsx(BubblePaste, { text: pasteText }, 'paste'))
  const steps = next && next.kind === 'steps' && entry.opened
  if (steps) inside.push(...Steps({ next }).filter(Boolean))
  const column = pasteText || entry.rows || entry.hint || steps
  return jsxs('div', {
    className: T.bubble,
    'data-hh': 'bubble',
    'data-line': entry.line,
    'data-said': said,
    'aria-live': 'polite',
    children: [
      jsx(Said, { clock, id: entry.key, text: curlyQuotes(entry.text, entry.asTyped), className: T.line, fresh }, entry.key),
      // rule A: the docs quote belongs to the sentence, directly under it, with no divider between them;
      // the thin divider comes after it, and only when something follows
      entry.docs ? jsx(DocsBox, { docs: entry.docs, wait: !said }, 'docs') : null,
      inside.length
        ? jsx('div', { className: cx(T.inBubble, column && T.inBubbleColumn, !said && T.wait), 'aria-hidden': said ? undefined : true, 'data-hh': 'in-bubble', children: inside }, 'in')
        : null
    ]
  })
}

// While Helper works on an answer: a small bubble with three dots, sitting on the piece below it.
// talk-live row 7: the lit dot moves on by the style sheet alone (.hh-wait, src/talk.css), so the page is
// not drawn again for it and the label is said once; reduced: all three dots the same and still.
function BusyDots({ reduced = false }) {
  return jsx('div', {
    className: cx(T.bubble, T.dots, reduced ? T.dotsStill : T.dotsWait),
    'data-hh': 'busy-dots',
    role: 'status',
    'aria-label': 'Helper is working on an answer',
    children: [0, 1, 2].map(i => jsx('i', {}, i))
  })
}

// How many columns a list of things to pick takes (talk-r5): four are two rows of two, three or two
// are one row, so no row is ever half empty; one column when a label would wrap. talk v2 look
// (hhdesign's review of e86b410, section 3 point 1): four picks in a window 420 px or wider stay two by
// two when a label wraps to two lines inside its pick (the grid gives the other pick in its row the same
// height); only a label that would need three lines puts them in one column. Under 420 px as before.
// (columnsFor, linesAllowed and FOUR_TWO_LINES_PX live in src/layout.js, which tests can load alone.)
// A label is taller than that many lines of 19 px.
const LINE_PX = 19
const wraps = (el, lines) => [...el.querySelectorAll('[data-hh="answer-label"]')].some(s => s.getBoundingClientRect().height > LINE_PX * (lines + 0.5))

// The things to pick, inside the message box above the line where the person types. The box grows
// to its rows' height in 0.3 s (a CSS transition on an explicit height, measured from the rows),
// only once Helper's line is said, and shrinks to nothing in 0.3 s right after a pick or a send;
// the character, the bubble and the conversation above ride up and down with it. While it shrinks
// the old labels stay, so nothing jumps; the next list comes in when it has shrunk. Under reduce
// motion Hermes's own rule cuts the transition to nothing, so it changes at once.
//   answers: the newest line's things to pick (or null); open: show them now; width: of the window
function Picks({ answers, open, onPick, width, onSettled }) {
  const rows = useRef(null)
  const [shown, setShown] = useState(open ? answers : null)
  const [height, setHeight] = useState(0)
  const [stacked, setStacked] = useState('')
  if (open && answers !== shown) setShown(answers)
  // Closed: the old labels while they shrink away, else the next list, already there at height 0
  // while its line is said, so that it can grow.
  const list = open ? answers : shown || answers
  const key = list ? list.items.map(a => a.id).join('|') + '@' + width : ''
  const cols = list ? columnsFor(list.items.length, stacked === key) : 1
  // measured after each draw, before the screen is painted: whether a label wraps, then the height
  useLayoutEffect(() => {
    const el = rows.current
    if (!el) return
    if (cols > 1 && stacked !== key && wraps(el, linesAllowed(list.items.length, width))) return setStacked(key)
    const next = open ? el.scrollHeight : 0
    if (next !== height) setHeight(next)
  })
  if (!list) return null
  return jsx('div', {
    className: T.picks,
    style: { height: `${height}px` },
    'data-hh': 'picks',
    'data-open': open,
    'aria-hidden': open ? undefined : true,
    onTransitionEnd: e => {
      if (e.target !== e.currentTarget) return
      if (!open) setShown(null)
      // talk v2 look: once the box has its new height, the conversation above shows its newest end
      // (hhdesign's notes-wants.md item 1), once per change
      if (onSettled) onSettled()
    },
    children: jsx('div', {
      className: T.answers,
      ref: rows,
      role: 'group',
      'aria-label': ANSWERS_LABEL,
      style: { '--hh-cols': cols },
      'data-hh': 'answers',
      'data-kind': list.kind,
      'data-columns': cols,
      children: list.items.map(a =>
        jsx('button', { type: 'button', className: cx(T.answer, a.more && T.more), 'data-hh': 'answer', 'data-answer': a.id, 'data-more': a.more ? true : undefined, tabIndex: open ? 0 : -1, onClick: () => open && onPick(a), children: jsx('span', { 'data-hh': 'answer-label', children: a.label }) }, a.id)
      )
    })
  })
}

// The row under the bubble: the piece between bubble and character in its cell, and the character
// on the message box's top edge. (The things to pick are in the message box since talk-r5.)
function Under({ character }) {
  return jsxs('div', {
    className: T.under,
    'data-hh': 'under',
    children: [
      jsx('div', { className: T.linkCell, 'aria-hidden': true, 'data-hh': 'bubble-link-cell', children: jsx(BubbleLink, {}) }, 'link'),
      jsx('div', { className: T.charSpace }, 'space'),
      jsx('div', { className: T.character, 'data-hh': 'character', children: character }, 'character')
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
// conversation window: the newest sentence in a bubble above the character, the conversation so
// far above it; talk v2 = design/talk-r5 (option 4: the things to pick inside the message box,
// shown only sometimes), what Helper keeps (src/kept.js) and Helper's settings page
// (src/settings-page.js). What Helper says is decided by code (src/talk.js) from hhcontent's
// pre-written lines; there is no AI step.
// Look: the left side wears Hermes's own UI kit components and the class strings its own screens
// use (K in src/look.js). Helper's window has the one style sheet of our own (src/talk.css, the T
// table), put into a <style> element inside our own page.

// One press of an arrow key on the edge to drag moves it this far.
const GRIP_KEY_PX = 16
// Keys that are not typing by themselves: pressing one alone does not end the word-by-word reveal.
const LONE_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']
// The longest conversation kept in page memory.
const LOG_MAX = 200

// dash-v1: three tabs, Dashboard, Learn, My setup (Pēteris's pick, 11 Nov 2026); their names from the Dashboard's
// data (content/dash-setup-list-v2.json page_words). Only Dashboard is built: Learn and My setup show one quiet line.
const TABS = TAB_IDS.map(id => ({ id, label: DASH_DATA.words.tabs[id] }))

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

// opts.settingsPage: Helper's page in Hermes's Settings was registered (src/main.js); then "See what
// I keep" and "Open Helper settings" open it. opts.pluginId: whose settings page that is.
function makePage(ctx, opts = {}) {
  const settingsPage = !!opts.settingsPage
  // The documented address of a plugin's settings page (desktop-plugin-sdk.md, "Deep link"),
  // written out here rather than imported, so the plugin still loads on a Hermes too old to have it.
  const settingsHref = `/settings?tab=plugins&plugin=${encodeURIComponent(opts.pluginId || 'helper')}`
  // Kept while the plugin is loaded, shared by every mount of the page:
  // busy = how many model calls are running (the character shows busy while it is above 0);
  // clock = which words of Helper's lines are visible (a line is revealed once, then stays whole).
  const busy = makeBusy()
  const clock = makeRevealClock({ setInterval: (fn, ms) => ctx.setInterval(fn, ms) })
  const { useDashboard, renderDashboard } = makeDashboard(ctx)
  const sleep = ms => new Promise(resolve => ctx.setTimeout(resolve, ms))
  // Last successful model check (ok or none), shared by every mount of the page while the plugin
  // is loaded. A failed check is not kept, so the next open asks again.
  let lastCheck = null
  // What Helper keeps about the person: one record in storage under 'kept' (src/kept.js), read
  // back cleaned. The settings page writes the same record, so it is read again every time the
  // page is put on screen.
  const readKept = () => cleanKept(ctx.storage.get('kept', null))
  // changes-14: the met mark, true or nothing
  const readMet = () => {
    try {
      return ctx.storage.get('met', false) === true
    } catch {
      return false
    }
  }
  // The conversation, kept while the plugin is loaded (leaving the page and coming back keeps
  // it). Nothing of it is written anywhere: it is gone when Hermes restarts. visit = what Helper
  // knows in this visit (src/talk.js), its `kept` the stored record; log = what was said, each
  // entry with an id; typed = the message that led to "Which one do you mean?", kept only while
  // that line is the newest; stored = the record as last written or read.
  let memory = null
  const remembered = () => {
    if (!memory) {
      const kept = readKept()
      // changes-14 (keeps.met): Helper has said hello before, stored under its own key 'met' (no Forget removes
      // it). Set: the window opens with BACK and asks nothing; else OPEN with "What's your name?". A kept name
      // counts as met too (src/talk.js laterVisit); met is then written, so it outlives a Forget all.
      const metStored = readMet()
      memory = { visit: laterVisit(kept, metStored), log: [], nextId: 1, typed: '', stored: JSON.stringify(keptToStore(kept)), metStored }
      memory.log = saidEntries(openingLine(memory.visit), true)
      // setup-chat: a later visit opens with the set-up conversation's returning line (BACK_REC, BACK_Q ...). It is said
      // at once from what is kept, as if nothing could be read; the page then reads Hermes (the look) and, when the
      // person has done nothing yet and the reads change the line (the thing is now done: BACK_DONE), says that instead.
      // What the first, unread line would keep is not kept.
      if (SETUP_BUILT && memory.visit.met) {
        const before = JSON.stringify(memory.visit.kept)
        memory.log = setupOpening(memory.visit, LOOK_UNSEEN).flatMap(setupEntries)
        memory.opening = { kept: before, ids: memory.log.map(e => e.id) }
        for (const k of Object.keys(memory.visit.kept)) delete memory.visit.kept[k]
        Object.assign(memory.visit.kept, JSON.parse(before))
      }
      writeKept()
    }
    return memory
  }
  // The page is on screen again (Hermes draws it fresh after Settings): the record as stored now.
  const rereadKept = () => {
    const m = remembered()
    const kept = readKept()
    // setup-chat: the set-up answers were there and are all gone now (Helper's settings page: "Ask me the set-up
    // questions again", or each row deleted): the conversation starts the questions again (RESTART)
    const had = k => ['setup_new', 'setup_goal', 'setup_current'].some(x => k[x])
    if (SETUP_BUILT && had(m.visit.kept) && !had(kept)) m.setupRestart = true
    for (const k of Object.keys(m.visit.kept)) delete m.visit.kept[k]
    Object.assign(m.visit.kept, kept)
    m.stored = JSON.stringify(keptToStore(kept))
  }
  // After everything the person does: the record is written when it changed, and removed whole
  // when nothing is left in it (told with it). A storage that fails is not kept from answering.
  const writeKept = () => {
    // changes-14: the met mark, written once when the visit has it (the opening ended, or Skip); never removed
    if (memory.visit.met && !memory.metStored) {
      try {
        ctx.storage.set('met', true)
        memory.metStored = true
      } catch {}
    }
    const next = keptToStore(memory.visit.kept)
    const text = JSON.stringify(next)
    if (text === memory.stored) return
    try {
      if (next) ctx.storage.set('kept', next)
      else ctx.storage.remove('kept')
      memory.stored = text
    } catch {}
  }
  const helperEntry = said => {
    const id = memory.nextId++
    return { id, key: `h${id}`, who: 'helper', opened: false, ...said }
  }
  const youEntry = text => ({ id: memory.nextId++, who: 'you', text })
  // offer-t1: what Helper says for one result, as the entries of the conversation: its line and, when the line carries
  // an offer, a second bubble with the offer's question, whose things to pick show in the message box as every other
  // pick. send: whether the line may ever be sent to the AI; the offer's question never is. ask-fix-t1 (PICK_FIRST):
  // the things to pick of the line before stay under it.
  const saidEntries = (said, send) => {
    const { offer, samePicks, ...line } = said
    if (samePicks) {
      const last = [...memory.log].reverse().find(e => e.who === 'helper')
      if (last && last.answers) line.answers = last.answers
    }
    const out = [{ ...helperEntry(line), send }]
    if (offer) out.push({ ...helperEntry({ line: 'offer-' + offer.set, text: offer.text, source: null, answers: offer.answers, next: null, paste: null, note: null, used: null, hint: null, rows: null, docs: null }), send: false, offer: true })
    return out
  }

  // setup-chat: one line of the set-up conversation (src/setup-chat.js) as the entries of the conversation. Nothing
  // of the set-up conversation is ever among the lines sent to the AI (send: false). A line that ends with an offer
  // (NOT_NOW, ALL_DONE, BACK) gets the offer's bubble under it.
  const setupEntries = s => {
    const { setupOffer, rec, recBy, pasteLabel, ...line } = s
    const out = [{ ...helperEntry(line), send: false }]
    if (setupOffer) {
      const offer = offerSaid(setupOffer, memory.visit)
      out.push({ ...helperEntry({ line: 'offer-' + offer.set, text: offer.text, source: null, answers: offer.answers, next: null, paste: null, note: null, used: null, hint: null, rows: null, docs: null }), send: false, offer: true })
    }
    return out
  }
  // The look: Helper reads what is set up, on this computer (src/setup-look.js). No AI call, nothing sent.
  const look = makeLook(ctx, host)

  /* ---------- talk-live: Helper's AI step (src/live-turn.js; none at all when AI_MODE is no_ai_step) ---------- */
  // Kept while the plugin is loaded, like the conversation: the turn that waits for the person's AI (one at a
  // time), how many of Helper's calls Hermes still works on (also after the page stopped waiting for one: no new
  // call starts until it is 0, so at most one Helper call is ever in Hermes), the model status the page checked
  // last, and the mounted page's setters (null while the page is off screen: a turn that ends then still adds its
  // line to the conversation kept in memory).
  const live = { n: 0, waiting: null, inHermes: 0, status: { state: 'checking' }, view: null }
  // The values a line sent to the AI must not hold (input.never_sent, name_check): the kept name and this
  // visit's name, the kept answers in Helper's words and as stored, and what the person asked Helper to keep.
  const keptValues = () => {
    const v = memory.visit
    const out = [v.name, v.kept.name]
    for (const [k, x] of Object.entries(v.kept)) {
      if (k === 'told' || k === 'name') continue
      if (k === 'asked') out.push(...(Array.isArray(x) ? x : []))
      else if (typeof x === 'string') out.push(x, keptWords(k, x))
    }
    return out.filter(s => typeof s === 'string' && s.trim())
  }
  // setup-chat: after the ordinary talk answered a message typed in place of an answer to Q_NEW or Q_GOAL, the line
  // that asks that question again, once (SETUP_REASK, SETUP_REASK_GOAL); not after the lines that ask it themselves
  const setupReask = result => {
    if (!SETUP_BUILT || !result || ['F1', 'F2', 'F3', 'WORK_SECRET', 'WORK_LONG', 'WORK_LONG_2', 'WORK_ASK', 'K1', 'OPEN'].includes(result.kind)) return []
    const again = setupAfter(memory.visit)
    return again ? setupEntries(again) : []
  }
  // The waiting turn ends: with the AI's line (final) or its no-AI line. Only once, and only if it still waits.
  const liveFinish = (w, final) => {
    if (live.waiting !== w) return
    live.waiting = null
    w.stopTimer()
    w.endBusy()
    const result = final || w.out
    const said = lineFor(result, memory.visit, w.typed, { settingsPage, keptShown: keptWasShown(memory.log) })
    writeKept()
    memory.log = [...memory.log.map(e => (e.opened ? { ...e, opened: false } : e)), ...saidEntries(said, w.sendHelper), ...slowAfter(said), ...setupReask(result)].slice(-LOG_MAX)
    if (live.view) {
      live.view.setLog(memory.log)
      live.view.setFocusAsk(true)
    }
  }
  // live-v2 changes-5: the visit's first AI call (w.firstTurn: the first message that went to the AI, its one or two
  // calls) gave no answer in 12 s or gave no_reply text: the AI step is off for the rest of the visit and SLOW_A is owed,
  // once. A later message whose call fails so only turns the AI step off.
  // setup-chat (hhtech-live-run2, For builder 2; Lead's points 15 and 16): SLOW_A is owed to the written answer that
  // replaced the slow one, so it shows right after that answer or not at all in this visit: when the turn was already
  // closed (the person moved on before the 12 s) it is dropped, never hung under a later, unrelated line.
  const slowFail = w => {
    memory.visit.aiOff = true
    if (w.firstTurn && !memory.visit.slow) memory.visit.slow = live.waiting === w ? 'due' : 'dropped'
  }
  // The entry of SLOW_A right after the line just said, when it is owed and may follow that line (src/live-turn.js
  // slowFollows); it is then said for this visit. It is never sent to the AI (no call follows it in this visit).
  // Called only for the written answer of the turn that failed (liveFinish): when SLOW_A may not follow that answer (a
  // don't-know line, a question, things to pick or an offer, a paste box), it is dropped for this visit.
  const slowAfter = said => {
    if (memory.visit.slow !== 'due') return []
    if (!slowFollows(memory.visit, said)) {
      memory.visit.slow = 'dropped'
      return []
    }
    memory.visit.slow = 'said'
    return [{ ...helperEntry(SLOW_LINE), send: false }]
  }
  // Something the person does while a turn waits (a new message, Skip, a button that makes Helper speak): the
  // waiting message gets its no-AI line at once (content/helper-talk-live-v2.json order.fallback.one_at_a_time).
  const liveClose = () => {
    if (live.waiting) liveFinish(live.waiting, null)
    // setup-chat: a move of the set-up conversation that still waits for the look is answered at once from what was
    // read last (or as "couldn't check"), and a recommendation that still waits for the AI's sentence gets its
    // written one at once: every message is answered, in order, before the next thing the person does
    if (memory && memory.lookWait) memory.lookWait()
    if (memory && memory.recWait) memory.recWait(null)
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
    // The width the person dragged Helper's window to (remembered), and whether Helper is folded
    // away to its strip (not remembered: it starts open, so the greeting is seen first).
    const [helperWidth, setHelperWidth] = useState(initial.helperWidth)
    const [folded, setFolded] = useState(false)
    // Put on screen (again): the stored record may have changed on Helper's settings page.
    useState(rereadKept)
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
    const [modelStatus] = useModelStatus()
    // dash-v1: the Dashboard's state, read again each time its tab is opened (src/dash.js)
    const dashboard = useDashboard({ active: tab === 'dashboard' })
    // talk-live: the AI step reads the model status this page checked, and ends a waiting turn on this page
    live.status = modelStatus
    // (review) the page drawn last holds the view; a page that leaves lets go only of its own
    const mineView = useRef(null)
    mineView.current = { setLog, setFocusAsk }
    live.view = mineView.current
    useEffect(
      () => () => {
        if (live.view === mineView.current) live.view = null
      },
      []
    )
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

    // The message box takes the keyboard when asked to (a pick, Helper
    // opened from its strip); a request that finds no box is dropped, so it can't steal focus later.
    useEffect(() => {
      if (!focusAsk) return
      if (askBox.current) askBox.current.focus()
      setFocusAsk(false)
    }, [focusAsk])

    // "More" pressed: its button is gone, so the keyboard goes to the first of the next picks (in the
    // same message box), not to the page.
    const [focusPick, setFocusPick] = useState(false)
    useEffect(() => {
      if (!focusPick) return
      const box = askBox.current && askBox.current.closest('[data-hh=composer]')
      const first = box && box.querySelector('[data-hh=answer]')
      if (first) first.focus()
      else if (askBox.current) askBox.current.focus()
      setFocusPick(false)
    }, [focusPick])

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

    const helperShown = fit.helper !== 'strip'

    // Puts Helper away or brings it back, with the keyboard following (to the strip, or to the
    // message box). The strip and Escape go through it; only the
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
    const scrollToNewest = () => {
      const el = helperScroll.current
      if (el) el.scrollTop = el.scrollHeight
    }
    useEffect(scrollToNewest, [newestId, helperShown])
    // talk v2 look, point 9 (hhdesign's notes-wants.md item 1): the person's newest message must stay whole
    // above the bubble. When the bubble's height changes after its line is said (steps or text to paste
    // opened or closed under it), the conversation goes to its newest end, once per change: a
    // ResizeObserver on our own bubble, made once for each bubble element. A change of the bubble's width
    // (the window resized) is left alone; the style sheet keeps the newest end in place then.
    const bubbleWatch = useRef({ node: null, ro: null, last: null })
    useEffect(() => {
      const w = bubbleWatch.current
      const conv = helperScroll.current
      const node = conv && conv.parentNode ? conv.parentNode.querySelector(':scope > [data-hh="bubble"]') : null
      if (node === w.node) return
      if (w.ro) w.ro.disconnect()
      Object.assign(w, { node, ro: null, last: null })
      if (!node || typeof ResizeObserver !== 'function') return
      w.ro = new ResizeObserver(() => {
        const r = node.getBoundingClientRect()
        if (w.last && r.width === w.last.width && r.height !== w.last.height && node.dataset.said === 'true') scrollToNewest()
        w.last = { width: r.width, height: r.height }
      })
      w.ro.observe(node)
    })
    useEffect(() => () => bubbleWatch.current.ro && bubbleWatch.current.ro.disconnect(), [])

    /* ---------- the conversation: what the person does, what Helper says back ---------- */
    const visit = remembered().visit
    function addToLog(entries) {
      // talk v2 look (hhdesign's notes-wants.md rule C point 3, settled by Lead): only the newest line keeps
      // its opened part; the line that moves up into the older lines closes its steps or text to paste, and
      // its link stays, so one click opens them again. No wall of text.
      setLog(old => (memory.log = [...old.map(e => (e.opened ? { ...e, opened: false } : e)), ...entries].slice(-LOG_MAX)))
    }
    // Helper's answer to something the person did. shown: the person's side of it, as their message.
    // What Helper keeps is written straight after (src/kept.js), so storage never lags the lines.
    // pressed: shown is the label of a button or pick the person pressed, not their words: never sent to the AI as
    // "Person: ..." (hhtech-live-run: "Person: Skip")
    function answer(result, shown, typed = '', pressed = false) {
      if (!result) return
      // live-v2 changes-2: the conversation shows that something was kept (src/talk.js keptWasShown)
      const said = lineFor(result, visit, typed, { settingsPage, keptShown: keptWasShown(memory.log) })
      writeKept()
      // talk-live: each line notes whether it may ever be sent to the AI (src/live-request.js sendable)
      const may = sendable(result)
      addToLog([shown ? { ...youEntry(shown), send: pressed ? false : may.you } : null, ...saidEntries(said, may.helper), ...(typed ? setupReask(result) : [])].filter(Boolean))
      setFocusAsk(true)
    }

    // setup-chat: one move of the set-up conversation (src/setup-chat.js): the person's side shows at once; when the
    // move needs the look, Hermes is read first (no AI call; the character shows busy meanwhile), then Helper's lines.
    function runSetup(mv, shown) {
      liveClose()
      memory.opening = null
      if (shown) addToLog([{ ...youEntry(shown), send: false }])
      const finish = seen => {
        const says = mv.go(seen)
        writeKept()
        const put = list => {
          memory.log = [...memory.log.map(e => (e.opened ? { ...e, opened: false } : e)), ...list.flatMap(setupEntries)].slice(-LOG_MAX)
          if (live.view) {
            live.view.setLog(memory.log)
            live.view.setFocusAsk(true)
          }
        }
        // setup-chat point 6: only the recommendation's sentence may be the AI's. One call, at most 12 s (the dots
        // show meanwhile: the person's message is still the newest line); the reply stands only when it passes
        // no_reply, c26, the name check and s1 to s8 (src/setup-rec.js); else the written sentence, and nothing says
        // so. No call: with no AI step, with no model ready, after a call failed in this visit, or while Hermes
        // still works on an earlier call of Helper's.
        // (only where the AI writes, ai_writes: with ai_picks_line the AI only ever picks one of Helper's lines)
        const i = SETUP_AI_BUILT && AI_MODE === 'ai_writes' && shown ? says.findIndex(s => s.rec) : -1
        if (i < 0 || visit.aiOff === true || !live.status || live.status.state !== 'ok' || live.inHermes > 0) return put(says)
        const names = [visit.name, visit.kept.name]
        const instructions = recInstructions(says[i].rec, visit.kept, seen, names)
        const first = !visit.aiTried
        visit.aiTried = true
        const off = () => {
          visit.aiOff = true
          // the slow-AI line may not follow a line with things to pick, so it is dropped for this visit (as after any
          // such answer), never hung under a later line
          if (first && !visit.slow) visit.slow = 'dropped'
        }
        let ended = false
        const endBusy = busy.begin()
        const end = text => {
          if (ended) return
          ended = true
          stop()
          endBusy()
          memory.recWait = null
          put(says.map((s, k) => (k === i && text ? { ...s, text: text + s.text.slice(s.text.lastIndexOf(' Want the steps?')), recBy: 'ai' } : s)))
        }
        const stop = ctx.setTimeout(() => {
          off()
          end(null)
        }, LIVE_SECONDS * 1000)
        memory.recWait = end
        live.inHermes++
        Promise.resolve()
          .then(() => askRec((method, params, timeout) => host.request(method, params, timeout), instructions))
          .then(
            res => {
              const j = judgeRec(res && res.text, says[i].rec.item, names, instructions)
              if (j.noReply) off()
              end(j.text || null)
            },
            () => {
              off()
              end(null)
            }
          )
          .finally(() => {
            live.inHermes--
          })
      }
      if (!mv.look) return finish(memory.seen || LOOK_UNSEEN)
      const endLook = busy.begin()
      let looked = false
      const once = seen => {
        if (looked) return
        looked = true
        memory.lookWait = null
        endLook()
        finish(seen)
      }
      // the person does something else before the reads are back (see liveClose)
      memory.lookWait = () => once(memory.seen || LOOK_UNSEEN)
      look().then(seen => {
        memory.seen = seen
        once(seen)
      })
    }
    // setup-chat: "Ask me the set-up questions again" was pressed on Helper's settings page (see rereadKept)
    useEffect(() => {
      if (!memory.setupRestart) return
      memory.setupRestart = false
      runSetup(setupRestartMove(visit), null)
    }, [])
    // setup-chat: the opening of a later visit, once the look has come back (see remembered())
    useEffect(() => {
      const o = memory.opening
      if (!SETUP_BUILT || !o || o.started) return
      o.started = true
      look().then(seen => {
        memory.seen = seen
        if (memory.opening !== o) return
        memory.opening = null
        // only while the opening lines are still all there is
        if (memory.log.length !== o.ids.length || memory.log.some((e, i) => e.id !== o.ids[i])) return
        const was = memory.log.map(e => [e.line, e.text])
        for (const k of Object.keys(visit.kept)) delete visit.kept[k]
        Object.assign(visit.kept, JSON.parse(o.kept))
        visit.setup = undefined
        visit.lastOffer = null
        const entries = setupOpening(visit, seen).flatMap(setupEntries)
        writeKept()
        if (JSON.stringify(entries.map(e => [e.line, e.text])) === JSON.stringify(was)) return
        memory.log = entries
        if (live.view) live.view.setLog(memory.log)
      })
    }, [])

    // The message box: Send or Enter (Shift+Enter makes a new line). Code decides the answer
    // (src/talk.js): a pasted key first, on the full text. A key is never shown back or kept.
    // talk-live: with an AI step (src/ai-mode.js), a message code is not sure of may go to the person's AI
    // (src/live-turn.js liveWhyNot says when not); then the message shows at once, Helper's bubble is the three
    // dots until the AI's line or, at the latest after 12 s, the no-AI line comes. With no_ai_step nothing is sent.
    function send() {
      const typed = draft
      if (!typed.trim()) return
      setDraft('')
      liveClose()
      // setup-chat: an answer to the set-up conversation's open question, a step word, "what should I set up first",
      // "start again": taken by its fixed rules, with no AI call
      if (SETUP_BUILT) {
        const mv = setupTyped(typed, visit, hasTopicWord)
        if (mv) {
          const cs = Array.from(typed.trim())
          return runSetup(mv, cs.length > MAX_INPUT_CHARS ? cs.slice(0, MAX_INPUT_CHARS).join('') + '…' : cs.join(''))
        }
      }
      const before = { last: visit.last, lastKey: visit.lastKey, liveRows: visit.liveRows || null, lastAnswer: visit.lastAnswer || null, lastAnswerKey: visit.lastAnswerKey || null, lastOffer: visit.lastOffer || null, lastTopic: visit.lastTopic || null }
      // Helper's last line for the checks c18 and c23: its line, not the offer's question under it
      const lastHelper = [...memory.log].reverse().find(e => e.who === 'helper' && !e.offer)
      const lines = lastLines(memory.log, keptValues())
      const { pre, out: result } = turnParts(typed, visit)
      // Kept only while "Which one do you mean?" (or W2, skill and plugin compared) is open, for the
      // pick that answers it. A message
      // with a key in it never gets that line, so a key is never kept here.
      memory.typed = result.kind === 'W1' || result.kind === 'W2' ? typed : ''
      const chars = Array.from(typed.trim())
      const shown = chars.length > MAX_INPUT_CHARS ? chars.slice(0, MAX_INPUT_CHARS).join('') + '…' : chars.join('')
      // hhtech-weak-ai: visit.aiOff, set below when a call gave no answer in 12 s or gave thinking text
      const why = liveWhyNot({ pre, text: typed, status: live.status, inHermes: live.inHermes, off: visit.aiOff === true })
      if (why) return answer(result, result.kind === 'K1' ? null : shown, typed)
      // a name given in the same message is cut off: only the part after it is sent (Lead's answer 4)
      const message = pre.name_taken ? nameWithMore(typed)[1] : typed
      const may = sendable(result)
      writeKept()
      // live-v2 changes-5: whether this is the visit's first message that goes to the AI (only its failure owes SLOW_A)
      const firstTurn = !visit.aiTried
      visit.aiTried = true
      const w = { n: ++live.n, out: result, typed, sendHelper: may.helper, endBusy: busy.begin(), stopTimer: () => {}, firstTurn }
      live.waiting = w
      addToLog([{ ...youEntry(shown), send: may.you }])
      const started = Date.now()
      // no answer in 12 s: the written line, and (changes-5 no_reply's "the same as no answer in 12 s") no more calls in
      // this visit
      w.stopTimer = ctx.setTimeout(() => {
        slowFail(w)
        liveFinish(w, null)
      }, LIVE_SECONDS * 1000)
      // Helper's calls, counted while Hermes works on them (host.request keeps its 90 s limit)
      // hhtech-weak-ai: a call with no answer 12 s after it started turns the AI step off for the rest of this visit
      // (also when the person moved on before), since a slow or thinking model is held by each abandoned call for minutes
      const request = (method, params, timeout) => {
        live.inHermes++
        let ended = false
        const stopWatch = ctx.setTimeout(() => {
          if (!ended) slowFail(w)
        }, LIVE_SECONDS * 1000)
        let p
        try {
          p = Promise.resolve(host.request(method, params, timeout))
        } catch (err) {
          p = Promise.reject(err)
        }
        // setup-chat (hhtech-live-run section 6 point 1, live-run2 and ask-run: with no AI that answers Helper's calls,
        // every message still tried one, each failing at once): a call that fails makes no AI answer for this visit, so
        // no further call is tried and no dots show. Why the model check let them through is NOT found: the page already
        // makes no call unless setup.runtime_check said ok (liveWhyNot), so in hhtech's home D that check must have
        // said ok while llm.oneshot had no provider; what it answered there is in no record the Builder can read.
        // So the first call of a visit is still tried (dots once). Lead (setup-chat-2): it stays so; hhtech found that
        // setup.runtime_check answers the same in a home where the call works and in one where it fails, so it cannot
        // gate the call.
        return p
          .catch(err => {
            visit.aiOff = true
            throw err
          })
          .finally(() => {
            ended = true
            stopWatch()
            live.inHermes--
          })
      }
      // live-v2 changes-4: what the person does, as kept, for the work line (src/live-request.js checks it again)
      askLive({ text: typed, message, pre, out: result, before, lines, lastLine: lastHelper ? lastHelper.text : '', request, msLeft: () => LIVE_SECONDS * 1000 - (Date.now() - started), alive: () => live.waiting === w, work: visit.kept.work || null, names: [visit.name, visit.kept.name] })
        .then(got => {
          // hhtech-weak-ai, changes-5 no_reply: thinking text from any call turns the AI step off for the rest of this
          // visit, also when it comes after the 12 s; from the visit's first call it owes SLOW_A
          if (got && got.thinking) slowFail(w)
          if (live.waiting !== w) return
          liveFinish(w, liveApply(visit, got, result, before, typed))
        })
        .catch(() => liveFinish(w, null))
    }

    // Something picked in the message box: it becomes the person's message, and Helper answers at
    // once. The pick goes by its id, never through the key words: an answer to a topic question, a
    // topic under "Which one do you mean?", a topic, "You, Helper" / "My Hermes", Yes / No under
    // a delete question, a group of the wants or one of its rows. "More" is not a message: the next
    // ones take the picks' place under the same line.
    function pickAnswer(item) {
      if (item.more) {
        const items = pageOf(item.more)
        setFocusPick(true)
        return setLog(old => (memory.log = old.map((e, i) => (i === old.length - 1 && e.answers ? { ...e, answers: { ...e.answers, items } } : e))))
      }
      // setup-chat: an answer of the set-up conversation, or the pick "Set up Hermes" under an offer
      if (item.setup || (SETUP_BUILT && item.offer && offerIsSetup(item.offer))) {
        const mv = item.setup ? setupPress(item.setup, visit) : setupAskMove(visit)
        return mv ? runSetup(mv, item.label) : undefined
      }
      liveClose()
      let result
      if (item.answer) result = pick(item.answer[0], item.answer[1], visit)
      else if (item.which) result = press(item.which, memory.typed, visit)
      else if (item.rm) result = rmPick(item.rm, visit)
      else if (item.forget) result = forgetAnswer(item.forget[0], item.forget[1], visit)
      else if (item.group) result = pickGroup(item.group, visit)
      else if (item.want) result = pickWant(item.want, visit)
      else if (item.offer) result = pressOffer(item.offer, visit) // offer-t1: a thing picked under an offer, by its id
      else result = pickTopic(item.topic, visit)
      answer(result, item.label, '', true)
    }

    // Opens one of Hermes's own screens (a missing door is ignored).
    function go(to) {
      try {
        host.navigate(to)
      } catch {}
    }

    // A button in a Helper line: text to paste opens under it (and closes again); a part opens
    // Hermes's own screen; a line makes Helper say one more pre-written line; "Open Helper
    // settings" opens Helper's page in Settings; "Delete all of it" asks first.
    function pressNext(entry) {
      const next = entry.next
      if (!next) return
      if (next.kind === 'paste' || next.kind === 'steps') return setLog(old => (memory.log = old.map(e => (e.id === entry.id ? { ...e, opened: !e.opened } : e))))
      if (next.kind === 'line' || next.kind === 'forget-all') {
        liveClose()
        const result = next.kind === 'line' ? sayLine(next.line, visit) : askForgetAll(visit)
        if (!result) return
        // talk-live-3: the button is done; its older line draws the label as plain faint text (src/talk-view.js)
        setLog(old => (memory.log = old.map(e => (e.id === entry.id ? { ...e, pressed: true } : e))))
        return answer(result, next.label, '', true)
      }
      if (next.kind === 'settings') return go(settingsHref)
      // setup-chat: "What did you look at?" under the look line; "Open the Quickstart" (the docs page, in the browser)
      if (next.kind === 'setup') {
        const mv = setupPress(next.setup, visit)
        if (!mv) return
        setLog(old => (memory.log = old.map(e => (e.id === entry.id ? { ...e, pressed: true } : e))))
        return runSetup(mv, next.label)
      }
      if (next.kind === 'docs') return openHermesDocs(ctx, next.url)
      if (next.kind === 'part') go(next.to)
    }

    // The links in the faint lines: "See what I keep" opens Helper's settings page (or, where that
    // page cannot open, shows the list in the conversation); "Change" asks the question again.
    function pressNote(entry, which) {
      if (which === 'change' && entry.used) {
        liveClose()
        return answer(change(entry.used.topic, visit), entry.used.link, '', true)
      }
      if (which !== 'see' || !entry.note) return
      if (settingsPage) return go(settingsHref)
      liveClose()
      answer(seeKept(visit), entry.note.link, '', true)
    }

    // Skip, at "What's your name?" and "What do you do?".
    function skipOpening() {
      liveClose()
      answer(skip(visit), 'Skip', '', true)
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

    // the tab names' look: one value in src/look.js (TAB_LOOK)
    const tabLook = TAB_LOOKS[TAB_LOOK]
    const tabRow = jsx('div', {
      className: K.tabs,
      role: 'tablist',
      'aria-label': DASH_DATA.words.tabListLabel,
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
            className: cx(tabLook.tab, on ? tabLook.on : tabLook.idle),
            ref: tabRefs.current.set[t.id],
            onClick: () => saveTab(t.id),
            onKeyDown: e => onTabKey(e, i),
            children: jsx('span', { className: on ? tabLook.labelOn : tabLook.label, children: t.label })
          },
          t.id
        )
      })
    })

    const header = jsx('div', { className: K.head, 'data-hh': 'header', children: tabRow })

    /* ---------- the tab's panel: the Dashboard, or one quiet line for a tab not built yet ---------- */
    const panel =
      tab === 'dashboard'
        ? renderDashboard(dashboard, { compact: fit.main < DASH_COMPACT_UNDER_PX })
        : jsx('p', { className: K.notBuilt, 'data-hh': 'not-built', children: DASH_DATA.words.notBuilt }, 'not-built')

    const main = jsx(
      'main',
      {
        className: K.detail,
        'data-hh': 'detail',
        // The tabs' panel (the tabs point here with aria-controls).
        role: 'tabpanel',
        id: 'hh-tabpanel',
        'aria-labelledby': `hh-tab-${tab}`,
        children: jsx('div', { className: K.detailScroll, 'data-hh': 'scroll', children: panel })
      },
      'main'
    )

    /* ---------- Helper's conversation window (design/talk-r5: option 4, the things to pick in the message box) ---------- */
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
            // the things to pick (talk-r5, option 4): above the line where the person types
            jsx(Picks, { answers: toPick, open: !!toPick && said, onPick: pickAnswer, width: fit.helperPx, onSettled: scrollToNewest }, 'picks'),
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
            jsx(Conversation, { entries: older, newest: inBubble, kept: visit.kept, onNext: pressNext, onNote: pressNote, scrollRef: helperScroll }, 'conversation'),
            inBubble ? jsx(Bubble, { entry: inBubble, clock, fresh, said, onNext: pressNext }, 'bubble') : jsx(BusyDots, { reduced }, 'bubble'),
            jsx(Under, { character }, 'under'),
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

    // The left side: the tabs, and under them the open tab.
    const left = jsxs(
      'div',
      {
        className: K.left,
        'data-hh': 'left',
        children: [header, jsx('div', { className: K.body, 'data-hh': 'body', children: [main] }, 'body')]
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

// ---- src/settings-page.js ----
// Helper's page in Hermes's Settings (Settings, then Plugins, then Helper): what Helper keeps,
// shown and edited as a short file (his words of 10 Nov 20:05: "like memory.md"; hhdesign's
// design/talk-r5 way 1; the words are hhcontent's, JSON keeps.settings_file). One text box, one
// line per kept thing with Helper's reason in brackets. Save reads every line back by fixed rules
// (src/settings-file.js, all or nothing) and asks once before it forgets anything; Undo changes
// puts the box back as stored; "Forget all of this" deletes the record after a Yes.
// It reads and writes the same stored record as Helper's conversation (storage key 'kept'), so
// the conversation sees a change the next time it is put on screen. No model, nothing sent.
// talk-live: in a build with an AI step (src/ai-mode.js) the row has a second top line, "Nothing on this page is
// sent to any AI." (lines_by_mode.settings_top_line_2); with no AI step none. Left out: a link to Hermes's own
// Memory & Context, whose address is not in the plugin docs.

const SETTINGS_WORDS = TALK_DATA.keeps.settings_file
// live changes-6: when the set-up conversation's two answers go to the AI too (its AI step, SETUP_AI_BUILT) the line
// names the three rows; else only what the person does is sent, and the line says that (setup-chat changes-1:
// settings_top_line_2_work_only)
const SETTINGS_TOP_LINE_2 = LIVE_DATA.lines_by_mode[SETUP_BUILT && SETUP_AI_BUILT ? 'settings_top_line_2' : 'settings_top_line_2_work_only'][AI_MODE]
const SETTINGS_BOX_ROWS = 7
// The quote around a line that cannot be read ("{line}"): the line is shown in its own chip without it.
const SETTINGS_QUOTE = SETTINGS_WORDS.read.messages.quote.split('{line}')

function makeSettingsPage(ctx) {
  const read = () => cleanKept(ctx.storage.get('kept', null))
  const write = rec => {
    const next = keptToStore(rec)
    if (next) ctx.storage.set('kept', next)
    else ctx.storage.remove('kept')
  }

  return function HelperSettings() {
    const [stored, setStored] = useState(read)
    const [box, setBox] = useState(() => renderKept(stored))
    // What shows under the box: null, { kind: 'saved' | 'refused', lines }, or { kind: 'ask', question }
    const [said, setSaid] = useState(null)
    // "Forget all of this": null, 'ask' (the question shows) or 'done'
    const [forget, setForget] = useState(null)
    // the box differs from what is stored
    const changed = box !== renderKept(stored)

    // After a write: read it back and draw the box again from storage, with Helper's reasons.
    function showStored() {
      const back = read()
      setStored(back)
      setBox(renderKept(back))
      return back
    }
    function save(answer) {
      const r = saveBox(stored, box, answer)
      if (r.result === 'saved') {
        // setup-chat: the box holds the name, what you do and the kept answers; the set-up conversation's rows are not
        // in it, so a save of the box leaves them as they are
        write({ ...r.stored, ...Object.fromEntries(SETUP_ALL_KEYS.filter(k => stored[k] !== undefined).map(k => [k, stored[k]])) })
        showStored()
        setSaid({ kind: 'saved', lines: r.message })
      } else if (r.result === 'refused') setSaid({ kind: 'refused', lines: r.message })
      else if (r.result === 'ask') setSaid({ kind: 'ask', question: r.question })
      else setSaid(null) // No: nothing saved, the box stays as typed
      setForget(null)
    }
    function undo() {
      showStored()
      setSaid(null)
      setForget(null)
    }
    function forgetAll() {
      ctx.storage.remove('kept')
      showStored()
      setSaid(null)
      setForget('done')
    }

    // After Save (hhdesign's review of e86b410, section 3 point 3): a refusal in three rows. Row 1, the line's
    // number, in the page's own text (the one that catches the eye; no warning colour, no icon); row 2, the line itself as
    // the box holds it, with no quote marks, small mono in a chip that wraps anywhere; row 3, the fix, in the
    // caption size. A secret: row 1 only, the line is never shown again. The words are the data's
    // (keeps.settings_file.read.messages and why), so they are the same as settings_read.py's.
    const refusalRows = lines => {
      const [first, quoted, fix] = lines
      const [pre, post] = SETTINGS_QUOTE
      const line = quoted != null && quoted.startsWith(pre) && quoted.endsWith(post) ? quoted.slice(pre.length, quoted.length - post.length) : quoted
      return [
        jsx('p', { className: K.settingsText, 'data-hh': 'refused-first', children: curlyQuotes(first) }, 'first'),
        line != null ? jsx('code', { className: K.settingsRefusedLine, 'data-hh': 'refused-line', children: line }, 'line') : null,
        fix != null ? jsx('p', { className: K.settingsRefusedFix, 'data-hh': 'refused-fix', children: curlyQuotes(fix) }, 'fix') : null
      ]
    }
    const message = said
      ? said.kind === 'ask'
        ? jsxs('div', {
            className: K.settingsAsk,
            'data-hh': 'settings-ask',
            children: [
              // read out when it comes; the keyboard goes to No, the answer that changes nothing
              jsx('p', { className: K.settingsText, role: 'status', children: curlyQuotes(said.question) }, 'q'),
              jsx(Button, { size: 'sm', onClick: () => save('yes'), 'data-hh': 'settings-yes', children: SETTINGS_WORDS.would_delete.answers[0].label }, 'yes'),
              jsx(Button, { size: 'sm', variant: 'text', autoFocus: true, onClick: () => save('no'), 'data-hh': 'settings-no', children: SETTINGS_WORDS.would_delete.answers[1].label }, 'no')
            ]
          })
        : said.kind === 'refused'
          ? jsx('div', { className: K.settingsRefused, role: 'status', 'data-hh': 'settings-refused', children: refusalRows(said.lines) })
          : jsx('div', { className: K.settingsMessage, role: 'status', 'data-hh': `settings-${said.kind}`, children: said.lines.map((l, i) => jsx('p', { children: curlyQuotes(l) }, i)) })
      : null

    const boxRow = jsx(ListRow, {
      wide: true,
      title: curlyQuotes(SETTINGS_WORDS.top_line),
      description: SETTINGS_TOP_LINE_2 ? curlyQuotes(SETTINGS_TOP_LINE_2) : undefined,
      below: jsxs('div', {
        className: K.settingsBelow,
        children: [
          jsx(Textarea, {
            className: K.settingsBox,
            rows: SETTINGS_BOX_ROWS,
            spellCheck: false,
            value: box,
            placeholder: SETTINGS_WORDS.empty,
            'aria-label': SETTINGS_WORDS.top_line,
            'data-hh': 'settings-box',
            onChange: e => {
              setBox(e.target.value)
              // the forget question goes away when the text is changed while it shows
              if (said && said.kind !== 'refused') setSaid(null)
            },
            // Esc inside the box must not close Settings and lose what was typed
            // (docs/answers/hhtech-hours-r2.md section 2: Hermes closes Settings on Esc)
            onKeyDown: e => {
              if (e.key === 'Escape') e.stopPropagation()
            }
          }, 'box'),
          ...SETTINGS_WORDS.under_box.map((l, i) => jsx('p', { className: K.settingsHint, children: curlyQuotes(l) }, `u${i}`)),
          // the message after Save and the buttons: 8 px above the message (the column's gap), 4 px under it
          jsxs('div', {
            className: K.settingsSaveGroup,
            children: [
              message,
              said && said.kind === 'ask'
                ? null
                : jsxs('div', {
                    className: K.settingsButtons,
                    children: [
                      // as Hermes's own plugin settings form: Save and Undo wait for a change
                      jsx(Button, { size: 'sm', disabled: !changed, onClick: () => save(undefined), 'data-hh': 'settings-save', children: SETTINGS_WORDS.buttons[0] }, 'save'),
                      jsx(Button, { size: 'sm', variant: 'text', disabled: !changed, onClick: undo, 'data-hh': 'settings-undo', children: SETTINGS_WORDS.buttons[1] }, 'undo')
                    ]
                  }, 'buttons')
            ]
          }, 'save-group')
        ]
      })
    })

    // setup-chat (content/helper-setup-chat-v1.json keeps): the four rows the set-up conversation keeps, each with
    // Delete, and the button "Ask me the set-up questions again". (The data also names a Change on each row; it is
    // not built: Delete, or the button, and the conversation asks again.) The two labels are the data's own words
    // (keeps.settings_page).
    const dropKeys = keys => {
      const next = { ...read() }
      for (const k of keys) delete next[k]
      write(next)
      showStored()
      setSaid(null)
    }
    const rows = SETUP_BUILT ? setupRows(stored) : []
    const setupBlock = rows.length
      ? jsxs('div', {
          className: K.settingsRule,
          'data-hh': 'settings-setup',
          children: [
            ...rows.map(([key, name, shows]) =>
              jsx(ListRow, { title: curlyQuotes(name), description: curlyQuotes(shows), action: jsx(Button, { size: 'sm', variant: 'text', onClick: () => dropKeys(SETUP_ROW_KEYS[key]), 'aria-label': `Delete: ${name}`, 'data-hh': 'settings-setup-delete', 'data-key': key, children: 'Delete' }, 'd') }, key)
            ),
            stored.setup_new || stored.setup_goal || stored.setup_current
              ? jsx('div', { className: K.settingsButtons, children: jsx(Button, { size: 'sm', onClick: () => dropKeys(SETUP_ASKED_KEYS), 'data-hh': 'settings-setup-again', children: 'Ask me the set-up questions again' }, 'again') }, 'again')
              : null
          ]
        })
      : null

    const facts = jsxs('div', { className: K.settingsFacts, 'data-hh': 'settings-facts', children: [jsx('p', { children: curlyQuotes(SETTINGS_WORDS.also_tell) }, 'tell'), ...SETTINGS_WORDS.facts.map((f, i) => jsx('p', { children: curlyQuotes(f) }, i))] })

    // "Forget all of this" (hhdesign's review of e86b410, section 1 point 1): under a thin divider, one of
    // Hermes's own settings rows (ListRow: the title, its one faint line under it, the action on the right as
    // Hermes's underlined bold text action, textStrong), not a filled button. The Yes / No question keeps its
    // place under the row. Hermes's own memory row stays out: its address is not in the plugin docs.
    const FA = SETTINGS_WORDS.forget_all
    const forgetRow = hasKept(stored)
      ? jsxs('div', {
          className: K.settingsRule,
          'data-hh': 'settings-forget',
          children: [
            jsx(ListRow, {
              title: curlyQuotes(FA.label),
              description: curlyQuotes(FA.under),
              action: jsx(Button, { size: 'sm', variant: 'textStrong', onClick: () => setForget('ask'), 'aria-label': FA.label, 'data-hh': 'settings-forget-all', children: FA.action }, 'f')
            }, 'row'),
            forget === 'ask'
              ? jsxs('div', {
                  className: K.settingsForgetAsk,
                  'data-hh': 'settings-forget-ask',
                  children: [
                    jsx('p', { className: K.settingsText, role: 'status', children: curlyQuotes(FA.question) }, 'q'),
                    // (FA.with_question, "What was already sent to your AI cannot be taken back.", is
                    // left out: in this build nothing is ever sent to an AI)
                    jsxs('div', {
                      className: K.settingsButtons,
                      children: [
                        jsx(Button, { size: 'sm', variant: 'secondary', onClick: forgetAll, 'data-hh': 'settings-forget-yes', children: FA.answers[0].label }, 'yes'),
                        jsx(Button, { size: 'sm', variant: 'text', autoFocus: true, onClick: () => setForget(null), 'data-hh': 'settings-forget-no', children: FA.answers[1].label }, 'no')
                      ]
                    }, 'b')
                  ]
                }, 'ask')
              : null
          ]
        })
      : forget === 'done'
        ? jsx('div', { className: K.settingsRule, 'data-hh': 'settings-forget', children: jsx('p', { className: K.settingsMessage, role: 'status', 'data-hh': 'settings-forgot', children: curlyQuotes(FA.after_yes) }) })
        : null

    return jsxs('div', { className: K.settingsPage, 'data-hh': 'settings-page', children: [boxRow, setupBlock, facts, forgetRow] })
  }
}

// ---- src/main.js ----
// Plugin entry: one sidebar row, one full page, and Helper's page in Hermes's Settings (Settings,
// then Plugins, then Helper). Nothing else is registered: no tools, hooks, panes, timers or network.
// registerSettingsPage is new in Hermes (desktop-plugin-sdk.md, "Plugin settings pages"): on a host
// without it the plugin still loads, without the settings page, and Helper's conversation then
// shows what it keeps in the conversation itself, with "Delete all of it".

const ID = 'helper'
const PATH = '/helper'

export default {
  id: ID,
  name: 'Helper',
  register(ctx) {
    const settingsPage = typeof ctx.registerSettingsPage === 'function'
    const Page = makePage(ctx, { settingsPage, pluginId: ID })
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: PATH }, render: () => jsx(Page, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: PATH, label: 'Helper', codicon: 'compass' } }
    ])
    if (settingsPage) {
      const Settings = makeSettingsPage(ctx)
      ctx.registerSettingsPage({ id: 'settings', title: 'Helper', icon: 'compass', render: () => jsx(Settings, {}) })
    }
  }
}
