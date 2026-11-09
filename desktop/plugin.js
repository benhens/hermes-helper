// Helping Hand: a Hermes Desktop plugin. Built by scripts/build.mjs from src/; edit src/, not this file.
// Licence: MIT (see LICENSE).
import { Button, Codicon, EmptyState, GlyphSpinner, PRIMARY_ICON_BTN, ROUTES_AREA, RowButton, SIDEBAR_NAV_AREA, SegmentedControl, Switch, Textarea, Tip, composerInputBacking, composerSurfaceRing, host, useValue } from '@hermes/plugin-sdk'
import { useEffect, useId, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

// ---- src/state.js ----
// Page and helper-panel state, kept in ctx.storage on the person's computer (build-v1.md P5, P11).
// Keys: side (right | left), helper (open | hidden | closed), tab (setup | yours), step (1-4),
// chatlog (true | false). Anything unexpected in storage falls back to the default.

const STEP_COUNT = 4

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
    chatlog: get('chatlog', false) === true
  }
}

function otherSide(side) {
  return side === 'left' ? 'right' : 'left'
}

// ---- src/model-status.js ----
// "Is a model connected?" without calling a model (build-v1.md section 5).
// Asks Hermes's own readiness check, setup.runtime_check, the one its onboarding uses. Never decides
// from setup.status: on a fresh Desktop running the Nous free tier that still says "not configured".
// Result: { state: 'ok', name } | { state: 'none' } | { state: 'error' }.
//   ok    = a model and its sign-in or key resolve. name may be '' when Hermes doesn't say one.
//   none  = runtime_check answered ok: false.
//   error = the check itself failed, timed out or answered nonsense. Never shown as "no model".

const NO_MODEL_LINE =
  "Hermes has no model connected yet, so I can't answer typed questions. The steps still work with the buttons."
// hhcontent's wording (content/v1-strings.md part 1).
const CANT_CHECK_LINE = "Can't check right now. This page couldn't reach your Hermes. Press Check again in a moment."
const CHECK_TIMEOUT_MS = 20000
// The page checks when it opens and when the person presses "Check again"; an open within this
// time of the last successful check (ok or none) reuses its answer, so switching pages never polls
// Hermes. A failed check is never reused: the next open asks again.
const RECHECK_AFTER_MS = 30000

async function checkModel(request, currentModel) {
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

// ---- src/placeholder-steps.js ----
// Placeholder step data for the B1 page shell. hhcontent is writing the real steps (B3); they
// replace this file. Step 2 carries the accepted round 3 drawing's text so the layout can be judged.

const PLACEHOLDER_STEPS = [
  { number: 1, title: 'What you want Hermes to do', short: 'Your goal, in your words' },
  {
    number: 2,
    title: 'The brain',
    short: 'What a model is, where it runs',
    heading: 'The brain: what a model is, and where it runs',
    intro:
      'Hermes doesn’t think by itself. It sends your words to a model, the AI that does the thinking. A provider is whoever runs that model.',
    compare: [
      { title: 'On a provider’s servers', text: 'Strong and quick, you pay for what you use, and your words leave this computer.' },
      {
        title: 'On this computer',
        text: 'Free to run and private, but slower. It needs at least 64,000 tokens of context, which a small laptop may struggle with.'
      }
    ],
    question: 'Do you already have a model working? Is privacy or cost more important to you?',
    options: [
      { id: 'keep', label: 'Keep my model', text: 'It already answers' },
      { id: 'private', label: 'Privacy first', text: 'Try a model on this computer' },
      { id: 'provider', label: 'Pick a provider', text: 'Compare cost and strength' }
    ],
    sources: ['Hermes docs › Configuring models', 'Local models', 'Quickstart']
  },
  { number: 3, title: 'Where Hermes runs', short: 'This computer, or one that is always on' },
  { number: 4, title: 'Connecting things', short: 'Tools, skills, plugins, MCP' }
]

// Steps 5-7 show greyed under "After these", with no content (build-v1.md section 6).
const LATER_STEPS = [
  { number: 5, title: 'Personality and memory' },
  { number: 6, title: 'Messaging' },
  { number: 7, title: 'Several bots' }
]
const VERSION_LINE = 'Hermes v0.23 · docs checked 8 Nov 2026'

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
  head: 'flex shrink-0 items-center gap-3 px-6 pb-2 pt-[calc(var(--titlebar-height)+1.5rem)]',
  // Title: plugins/hermes-bots/group-room-ui.tsx RoomHeader <h2>
  title: 'min-w-0 truncate px-1 text-[0.9375rem] font-semibold text-foreground',
  headEnd: 'ml-auto flex shrink-0 items-center gap-0.5',
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
  rowText: 'min-w-0 flex-1',
  rowTitle: 'block truncate text-[0.78rem] font-medium text-foreground/85',
  rowTitleOff: 'block truncate text-[0.78rem] font-normal text-muted-foreground/60',
  rowSub: 'flex min-w-0 items-center gap-1 text-[0.62rem] text-muted-foreground/50',
  truncate: 'truncate',
  // CapRow's meta chip, used as the step number
  rowNumber: 'shrink-0 rounded bg-(--ui-bg-quinary) px-1 py-px text-[0.6rem] tabular-nums leading-3.5 text-(--ui-text-tertiary)',
  // DetailColumn footer caption (app/master-detail.tsx)
  railFoot: 'shrink-0 px-2 pb-1 pt-3 text-[0.65rem] text-muted-foreground/50',

  // ---- open step (app/master-detail.tsx DetailColumn; app/capabilities/primitives.tsx DetailHeader) ----
  detail: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
  detailScroll: 'min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]',
  detailInner: 'mx-auto max-w-2xl space-y-5 px-5 py-4',
  stepTitle: 'min-w-0 text-[0.9375rem] font-semibold tracking-tight',
  // Chat text (plugins/hermes-bots/group-room-ui.tsx RoomMessage body)
  prose: 'mt-1 text-pretty text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground',
  // Settings row title + caption (app/settings/primitives.tsx ListRow)
  pairGrid: 'grid gap-5 sm:grid-cols-2',
  pairTitle: 'text-[length:var(--conversation-text-font-size)] font-medium text-foreground',
  caption: 'mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)',
  // Settings SectionHeading (app/settings/primitives.tsx)
  question: 'mb-2.5 flex items-center gap-2 pt-2 text-[length:var(--conversation-text-font-size)] font-medium',
  // Choice cards: Hermes's first-run setup chooser (components/ui/chip.tsx, card variant)
  choices: 'grid gap-2 sm:grid-cols-3',
  choice: 'flex min-w-0 items-center gap-2.5 rounded-[6px] px-3 py-2.5 text-left text-[13px] border text-foreground transition-colors',
  choiceOn: 'border-primary bg-primary/15',
  choiceOff: 'border-transparent bg-muted hover:bg-accent/60',
  choiceText: 'min-w-0',
  choiceLabel: 'block',
  choiceSub: 'block text-xs text-muted-foreground',
  // Source tags: app/master-detail.tsx ToolChip
  chips: 'flex flex-wrap items-center gap-1.5',
  chipsLabel: 'text-xs text-muted-foreground',
  chip: 'rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5 font-mono text-[0.65rem] text-(--ui-text-tertiary)',
  // Video slot: a quiet scaffold line (components/chat/scaffold-row.tsx)
  scaffold: 'flex min-w-0 items-center gap-1.5 text-[length:var(--conversation-tool-font-size)] leading-(--conversation-line-height) text-(--conversation-scaffold-text)',
  scaffoldGlyph: 'grid size-3.5 shrink-0 place-items-center',
  actions: 'flex flex-wrap items-center gap-2',

  // ---- helper panel (a page column, like Hermes's right sidebar; master-detail.tsx DetailPane header) ----
  helper: 'flex min-h-0 shrink-0 flex-col bg-(--ui-sidebar-surface-background)',
  helperRight: 'border-l border-(--ui-stroke-tertiary)',
  helperLeft: 'border-r border-(--ui-stroke-tertiary)',
  helperTop: 'flex h-9 shrink-0 items-center gap-2 px-3',
  helperTopLabel: 'min-w-0 truncate text-xs font-medium text-foreground',
  // RoomHeader's ghost icon buttons (plugins/hermes-bots/group-room-ui.tsx)
  iconTone: 'text-(--ui-text-tertiary)',
  helperBody: 'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-3 pt-1',
  // Widget bubble in a chat (components/chat/widget-shell.ts WIDGET_SHELL_CLASS)
  bubble: 'rounded-3xl bg-(--ui-widget-surface-background) px-3.5 py-3',
  bubbleText: 'text-pretty text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground',
  bubbleActions: 'mt-2.5 flex flex-wrap items-center gap-2',
  characterRow: 'flex items-end gap-2 pl-2',
  // Chat log: the user's bubble and an empty log (RoomMessage; components/ui/empty-state.tsx)
  logEmpty: 'min-h-24',
  // Composer: plugins/hermes-bots/group-room-ui.tsx RoomComposer + ROOM_COMPOSER_INPUT_CLASS
  composerForm: 'px-3 pb-3 pt-1',
  composerSurface: 'relative isolate rounded-2xl',
  composerGrid: "grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-(--composer-control-gap) gap-y-1 px-(--composer-surface-pad-x) py-(--composer-surface-pad-y) [grid-template-areas:'reply_reply_reply''files_files_files''attach_input_send']",
  composerInputCell: 'min-w-0 [grid-area:reply]',
  composerInput: '!border-transparent !bg-transparent !shadow-none min-h-(--composer-input-min-height) px-1 py-1 text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) placeholder:text-(--ui-text-tertiary)',
  composerModel: 'mb-1 min-w-0 truncate px-1 font-mono text-[0.6875rem] text-(--ui-text-tertiary) [grid-area:input]',
  composerSend: 'mb-1 [grid-area:send]',
  composerNote: 'px-3 pb-3 text-center text-[0.65rem] text-muted-foreground/50',

  // ---- hidden helper: one round button at the page edge (components/ui/fan-menu.tsx discs) ----
  peekColumn: 'flex shrink-0 flex-col items-center px-2 pt-2',
  peekButton: 'rounded-full'
}

// Joins class names, skipping empty ones. Only K values go in.
function cx(...names) {
  return names.filter(Boolean).join(' ')
}

// Every codicon the plugin names (sidebar row and page). scripts/check-hermes-classes.mjs checks
// they exist in the codicon font Hermes ships; a test checks the code names no others.
const ICONS = ['compass', 'arrow-swap', 'chevron-left', 'chevron-right', 'close', 'arrow-up', 'play-circle', 'location']

// ---- src/character.js ----
// The helper's character: hhdesign's drawn hand (design/hermes-look-r3), inline SVG.
// One self-contained piece so it can be swapped or removed (Pēteris is still deciding whether it
// stays): the page uses it only through <Character>, in the helper panel and the hidden-helper button.
// Colours: the body is the theme accent (--ui-accent) blended into the page surface; face lines use
// the theme's main text colour. All as inline styles, so there is no stylesheet to clean up.

const BODY =
  'M31 73c-5.5 0-9-3.4-9-9v-10.5c-4.6-1.1-9-5.3-9.6-10.4-.5-4.3 3.4-6.9 7.1-4.6 1 .6 1.8 1.4 2.5 2.4V29c0-11 8.6-19 20-19s20 8 20 19v35c0 5.6-3.5 9-9 9z'

const SURFACE = 'var(--ui-editor-surface-background)'
const mix = pct => `color-mix(in oklab, var(--ui-accent) ${pct}%, ${SURFACE})`
const INK = { fill: 'var(--ui-text-primary)' }
const INK_LINE = { fill: 'none', stroke: 'var(--ui-text-primary)', strokeWidth: 2, strokeLinecap: 'round' }

function Character({ size = 72, mood = 'smile', shadow = true, label = 'Helping Hand' }) {
  const gid = 'hh-g' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const mouth = mood === 'smile' ? 'M39 43.5q4.5 4 9 0' : 'M39.5 45h8'
  return jsxs('svg', {
    viewBox: '0 0 80 80',
    width: size,
    height: size,
    style: { display: 'block', flex: 'none' },
    role: label ? 'img' : undefined,
    'aria-label': label || undefined,
    'aria-hidden': label ? undefined : true,
    'data-hh-character': '',
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

// ---- src/page.js ----
// The Helping Hand page: header with two tabs, step list, open step, helper panel.
// B1 = the page shell. Step texts are placeholders until hhcontent's data arrives (B3); the
// "Your setup" cards are B2; the helper's model call is B4. What is real in B1: the layout, the
// Hermes-native look, the helper's Move / Hide / Close states (remembered), and the model check.
// Look: Hermes's own UI kit components (Button, SegmentedControl, Switch, Textarea, Tip, EmptyState,
// GlyphSpinner, Codicon, RowButton) and, where Hermes has no kit component, the class strings its own
// screens use (src/look.js). No CSS of our own.

// Column widths (layout only; every colour, font and line comes from Hermes's classes).
const RAIL_WIDTH = '16rem'
const HELPER_WIDTH = '20rem'

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

function makePage(ctx) {
  // Last successful model check (ok or none), shared by every mount of the page while the plugin
  // is loaded. A failed check is not kept, so the next open asks again.
  let lastCheck = null

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
        result = await checkModel(
          (method, params, timeout) => host.request(method, params, timeout),
          () => host.state.model.get()
        )
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
    const [chosen, setChosen] = useState({})
    const [draft, setDraft] = useState('')
    const [focusAsk, setFocusAsk] = useState(false)
    const [modelStatus, recheck] = useModelStatus()
    const liveModel = useValue(host.state.model)
    const askBox = useRef(null)

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

    const currentStep = PLACEHOLDER_STEPS[step - 1]
    const noModel = modelStatus.state === 'none'
    const modelName = modelStatus.state === 'ok' ? (typeof liveModel === 'string' && liveModel.trim()) || modelStatus.name : ''

    function askAboutStep() {
      if (helper !== 'open') saveHelper('open')
      setFocusAsk(true)
    }

    /* ---------- header: name, the two tabs, "Show helper" when the helper is closed ---------- */
    const header = jsxs('div', {
      className: K.head,
      'data-hh': 'header',
      children: [
        jsx('h2', { className: K.title, children: 'Helping Hand' }),
        jsx(SegmentedControl, { options: TABS, value: tab, onChange: saveTab }),
        jsx('div', {
          className: K.headEnd,
          children:
            helper === 'closed'
              ? jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => saveHelper('open'), children: 'Show helper' })
              : null
        })
      ]
    })

    /* ---------- step list ---------- */
    const stepRow = s =>
      jsx(
        'div',
        {
          className: cx(K.row, s.number === step ? K.rowActive : K.rowIdle),
          children: jsxs(RowButton, {
            className: K.rowButton,
            'aria-current': s.number === step ? 'step' : undefined,
            onClick: () => saveStep(s.number),
            children: [
              jsx('span', { className: K.rowNumber, children: s.number }),
              jsxs('span', {
                className: K.rowText,
                children: [
                  jsx('span', { className: K.rowTitle, children: s.title }),
                  jsx('span', { className: K.rowSub, children: jsx('span', { className: K.truncate, children: s.short }) })
                ]
              })
            ]
          })
        },
        s.number
      )

    const laterRow = s =>
      jsx(
        'div',
        {
          className: cx(K.row, K.rowIdle),
          'aria-disabled': true,
          children: jsxs('div', {
            className: K.rowButton,
            children: [
              jsx('span', { className: K.rowNumber, children: s.number }),
              jsx('span', { className: K.rowText, children: jsx('span', { className: K.rowTitleOff, children: s.title }) })
            ]
          })
        },
        s.number
      )

    const rail = jsxs(
      'nav',
      {
        className: K.rail,
        style: { width: RAIL_WIDTH },
        'aria-label': 'Steps',
        'data-hh': 'steps',
        children: [
          jsxs('div', {
            className: K.railScroll,
            children: [
              jsx('div', { className: cx(K.sectionLabel, K.sectionLabelPad), children: 'Steps' }),
              jsx('div', { className: K.rowList, children: PLACEHOLDER_STEPS.map(stepRow) }),
              jsx('div', { className: cx(K.sectionLabel, K.sectionLabelGap), children: 'After these' }),
              jsx('div', { className: K.rowList, children: LATER_STEPS.map(laterRow) })
            ]
          }),
          jsx('div', { className: K.railFoot, children: VERSION_LINE })
        ]
      },
      'rail'
    )

    /* ---------- open step ---------- */
    const stepActions = jsxs('div', {
      className: K.actions,
      children: [
        step < STEP_COUNT
          ? jsx(Button, { size: 'sm', onClick: () => saveStep(step + 1), children: 'I understand, next step' })
          : null,
        !noModel && helper !== 'closed'
          ? jsx(Button, { variant: 'secondary', size: 'sm', onClick: askAboutStep, children: 'Ask about this step' })
          : null
      ]
    })

    const stepHeader = (title, intro) =>
      jsxs('header', {
        children: [
          jsx('div', { className: K.sectionLabel, children: `Step ${step} of ${STEP_COUNT}` }),
          jsx('h3', { className: K.stepTitle, children: title }),
          intro
        ]
      })

    const stepView = currentStep.heading
      ? [
          stepHeader(currentStep.heading, jsx('p', { className: K.prose, children: currentStep.intro })),
          jsx('dl', {
            className: K.pairGrid,
            children: currentStep.compare.map(c =>
              jsxs('div', { children: [jsx('dt', { className: K.pairTitle, children: c.title }), jsx('dd', { className: K.caption, children: c.text })] }, c.title)
            )
          }),
          jsxs('div', {
            className: K.scaffold,
            children: [
              jsx('span', { className: K.scaffoldGlyph, children: jsx(Codicon, { name: 'play-circle', size: '0.875rem' }) }),
              jsx('span', { children: 'A short video for this step comes later. It will need the internet when you press Play.' })
            ]
          }),
          jsxs('section', {
            children: [
              jsx('div', { className: K.question, children: currentStep.question }),
              jsx('div', {
                className: K.choices,
                role: 'group',
                'aria-label': currentStep.question,
                children: currentStep.options.map(o =>
                  jsx(
                    'button',
                    {
                      type: 'button',
                      'aria-pressed': chosen[step] === o.id,
                      className: cx(K.choice, chosen[step] === o.id ? K.choiceOn : K.choiceOff),
                      onClick: () => setChosen(c => ({ ...c, [step]: o.id })),
                      children: jsxs('span', {
                        className: K.choiceText,
                        children: [jsx('span', { className: K.choiceLabel, children: o.label }), jsx('span', { className: K.choiceSub, children: o.text })]
                      })
                    },
                    o.id
                  )
                )
              })
            ]
          }),
          jsxs('div', {
            className: K.chips,
            children: [jsx('span', { className: K.chipsLabel, children: 'Source' }), ...currentStep.sources.map(s => jsx('span', { className: K.chip, children: s }, s))]
          }),
          stepActions
        ]
      : [stepHeader(currentStep.title, jsx('p', { className: K.caption, children: 'The text for this step is still being written.' })), stepActions]

    const yoursView = [
      jsxs('header', {
        children: [
          jsx('h3', { className: K.stepTitle, children: 'Your setup' }),
          jsx('p', { className: K.caption, children: 'Read from your Hermes. Nothing is changed.' })
        ]
      }),
      jsx(EmptyState, { title: 'The setup checks come next', description: 'This tab will show what works in your Hermes and what needs a fix.' })
    ]

    const main = jsx(
      'main',
      {
        className: K.detail,
        'data-hh': 'detail',
        children: jsx('div', { className: K.detailScroll, children: jsxs('div', { className: K.detailInner, children: tab === 'setup' ? stepView : yoursView }) })
      },
      'main'
    )

    /* ---------- helper panel ---------- */
    const checkAgain = (variant = 'default') =>
      jsx(Button, { variant, size: 'sm', disabled: modelStatus.state === 'checking', onClick: () => recheck(), children: 'Check again' })

    const say = (text, actions) =>
      jsxs('div', {
        className: K.bubble,
        'data-hh': 'bubble',
        children: [jsx('p', { className: K.bubbleText, children: text }), actions ? jsx('div', { className: K.bubbleActions, children: actions }) : null]
      })

    const withCharacter = (bubble, mood) =>
      [bubble, jsx('div', { className: K.characterRow, children: jsx(Character, { size: 72, mood }) }, 'who')]

    const contextLine = (icon, text, spinning) =>
      jsxs('div', {
        className: K.scaffold,
        role: 'status',
        children: [jsx('span', { className: K.scaffoldGlyph, children: spinning ? jsx(GlyphSpinner, {}) : jsx(Codicon, { name: icon, size: '0.875rem' }) }), jsx('span', { className: K.truncate, children: text })]
      })

    let helperBody
    if (noModel) {
      // build-v1.md P7: the one fixed line and "Check again", nothing more. No model call anywhere.
      helperBody = withCharacter(say(NO_MODEL_LINE, checkAgain('default')), 'straight')
    } else {
      const where = tab === 'setup' ? `On step ${step}: ${currentStep.title}` : 'On Your setup'
      helperBody = [
        modelStatus.state === 'checking'
          ? contextLine('', 'Checking your model', true)
          : modelStatus.state === 'error'
            ? null
            : contextLine('location', where, false),
        modelStatus.state === 'error' ? say(CANT_CHECK_LINE, checkAgain('secondary')) : null,
        chatlog
          ? jsx('div', { 'data-hh': 'chatlog', children: jsx(EmptyState, { className: K.logEmpty, title: 'No messages yet', description: 'What you and the helper say shows here.' }) })
          : modelStatus.state === 'error'
            ? jsx('div', { className: K.characterRow, children: jsx(Character, { size: 72, mood: 'straight' }) })
            : withCharacter(say('Open a step and ask me about it here. I explain things; I don’t change your settings.'), 'smile')
      ].flat()
    }

    const composer = noModel
      ? null
      : jsxs('form', {
          className: K.composerForm,
          onSubmit: e => e.preventDefault(),
          children: [
            jsxs('div', {
              className: cx(K.composerSurface, composerSurfaceRing),
              children: [
                jsx('div', { 'aria-hidden': true, className: composerInputBacking }),
                jsxs('div', {
                  className: K.composerGrid,
                  children: [
                    jsx('div', {
                      className: K.composerInputCell,
                      children: jsx(Textarea, {
                        ref: askBox,
                        rows: 2,
                        className: K.composerInput,
                        value: draft,
                        onChange: e => setDraft(e.target.value.slice(0, 500)),
                        placeholder: tab === 'setup' ? 'Ask about this step' : 'Ask about your setup',
                        'aria-label': 'Ask the helper'
                      })
                    }),
                    jsx('span', { className: K.composerModel, 'data-hh': 'model-name', children: modelStatus.state === 'checking' ? '' : modelName }),
                    jsx(Button, {
                      'aria-label': 'Send',
                      className: cx(PRIMARY_ICON_BTN, K.composerSend),
                      disabled: true,
                      type: 'submit',
                      children: jsx(Codicon, { name: 'arrow-up', size: '0.875rem' })
                    })
                  ]
                })
              ]
            })
          ]
        })

    let helperArea = null
    if (helper === 'open') {
      helperArea = jsxs(
        'div',
        {
          className: cx(K.helper, side === 'right' ? K.helperRight : K.helperLeft),
          style: { width: HELPER_WIDTH },
          role: 'complementary',
          'aria-label': 'Helper',
          'data-hh': 'helper',
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
                    jsx(HelperIconButton, { icon: side === 'right' ? 'chevron-right' : 'chevron-left', label: 'Hide the helper', onClick: () => saveHelper('hidden') }),
                    jsx(HelperIconButton, { icon: 'close', label: 'Close the helper', tip: false, onClick: () => saveHelper('closed') })
                  ]
                })
              ]
            }),
            jsxs('div', { className: K.helperBody, children: helperBody }),
            composer,
            noModel ? null : jsx('p', { className: K.composerNote, children: 'It explains; it doesn’t change your settings.' })
          ]
        },
        'helper'
      )
    } else if (helper === 'hidden') {
      helperArea = jsx(
        'div',
        {
          className: K.peekColumn,
          'data-hh': 'helper-hidden',
          children: jsx(Tip, {
            label: 'Show the helper',
            children: jsx(Button, {
              'aria-label': 'Show the helper',
              className: K.peekButton,
              size: 'icon',
              variant: 'floating',
              onClick: () => saveHelper('open'),
              children: jsx(Character, { size: 24, shadow: false, label: '' })
            })
          })
        },
        'helper'
      )
    }

    const columns = tab === 'setup' ? [rail, main] : [main]
    return jsxs('div', {
      className: K.root,
      'data-hh': 'page',
      children: [header, jsx('div', { className: K.body, children: side === 'left' ? [helperArea, ...columns] : [...columns, helperArea] })]
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
