// The Helper page: header with two text tabs, step list, open step, helper panel.
// B1 = the page shell; B2 = the "Your setup" cards; B3a = the native pass (hhdesign's
// b1-design-review.md fixes) and narrow windows (src/layout.js); B3 = Setup steps 1-4 from
// hhcontent's data (src/steps.js) and the helper panel from Pēteris's sketch. The helper's model
// call is B4: until then everything the helper says is fixed text chosen by code (src/helper-chat.js).
// Look: Hermes's own UI kit components (Button, Switch, Textarea, Tip, GlyphSpinner, Codicon,
// RowButton, CopyButton) and, where Hermes has no kit component (its text tabs and vertical strips
// aren't in the SDK), the class strings its own screens use (src/look.js). No CSS of our own.
import { host, Button, Codicon, GlyphSpinner, RowButton, Switch, Textarea, Tip, PRIMARY_ICON_BTN, composerInputBacking, composerSurfaceRing } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { K, cx } from './look.js'
import { Character, CHARACTER_PX } from './character.js'
import { FACE, RISE, expressionFor, asksQuestion, makeBusy } from './expressions.js'
import { makeEyes } from './eyes.js'
import { makeRevealClock, Said, wordsOf } from './reveal.js'
import { prefersReducedMotion, watchReducedMotion } from './motion.js'
import { readState, otherSide } from './state.js'
import { checkModel, NO_MODEL_LINE, NO_MODEL_SMALL, NO_MODEL_PROGRESS, NO_MODEL_BOX, CANT_CHECK_LINE, RECHECK_AFTER_MS } from './model-status.js'
import { STEPS, LATER_STEPS, VERSION_LINE, LINES, stepByNumber, railLines, docsUrl, isDocsUrl, chipLabel, nextAfter, fitsGoal } from './steps.js'
import { greetingEntry, answerEntry, doneEntry, typedEntries } from './helper-chat.js'
import { makeSetupCards, renderYourSetup, PasteBox } from './setup-tab.js'
import { layoutFor, RAIL_PX, RAIL_NUMBERS_PX, HELPER_PX } from './layout.js'

// Column widths (layout only; every colour, font and line comes from Hermes's classes).
const RAIL_WIDTH = `${RAIL_PX}px`
const RAIL_NUMBERS_WIDTH = `${RAIL_NUMBERS_PX}px`
const HELPER_WIDTH = `${HELPER_PX}px`
// The character's row, directly above the message box (layout only, in px like the widths above):
// at the box's left end, 14 px in (the form's own 12 px side padding plus 14); pulled down over
// the form's 4 px top padding and by the part of the drawing that hangs below the edge (8 of its
// 200 units: 5.6 px at 140 px wide), so the drawing's edge line lies on the box's top border and
// the finger ends about 5 px over it, at any CHARACTER_PX; in front of the box; mouse presses pass
// through it to the box.
const BELOW_EDGE_PX = ((FACE.view.y + FACE.view.height - FACE.edge) * CHARACTER_PX) / FACE.view.width
const CHARACTER_ROW = { position: 'relative', zIndex: 1, paddingLeft: 26, paddingRight: 12, marginBottom: -(4 + BELOW_EDGE_PX), pointerEvents: 'none' }
// Keys that are not typing by themselves: pressing one alone does not end the word-by-word reveal.
const LONE_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']

export const TABS = [
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

export function makePage(ctx) {
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
  // The chat log, kept while the plugin is loaded (leaving the page and coming back keeps it;
  // nothing is written to disk). Each entry gets an id for React's list keys.
  let chatMemory = null
  let nextEntryId = 1
  let nextTurn = 1
  // Entries added by one action share a turn (an answer and its note, a question and its reply).
  const withIds = entries => {
    const turn = nextTurn++
    return entries.filter(Boolean).map(e => ({ ...e, id: nextEntryId++, turn }))
  }
  const LOG_MAX = 200
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
    const [side, setSide] = useState(initial.side)
    const [helper, setHelper] = useState(initial.helper)
    const [tab, setTab] = useState(initial.tab)
    const [step, setStep] = useState(initial.step)
    const [chatlog, setChatlog] = useState(initial.chatlog)
    const [answers, setAnswers] = useState(initial.answers)
    const [log, setLog] = useState(() => chatMemory || (chatMemory = withIds([greetingEntry()])))
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
    // When the model-check line (no model / can't check) appeared: the last log entry then.
    const statusSeen = useRef({ kind: null, after: 0 })
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
    // The helper's scrolling area: kept at the bottom, where the newest words are.
    const helperScroll = useRef(null)
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

    // The helper comes on screen (the page opens with it, or the person opens it from the strip or
    // "Show helper"): the character rises from behind the message box, once, and Helper's words
    // wait until it is up. Not on a tab change that leaves the helper on screen. (In a window so
    // narrow that the helper is folded away on Setup but has its column on Your setup, changing
    // the tab does bring it on screen, so it rises then too.) `risen` keeps a later redraw from
    // asking for the rising again. Declared before the effect that hands the
    // clock its lines, so the wait is in place first.
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

    // What Helper is saying on screen right now, in reading order (filled while the words are
    // drawn below); after every draw the clock hears it and reveals what is new, word by word.
    const saidNow = []
    useEffect(() => {
      clock.show(helperShown ? saidNow : [])
    })

    // (Whether the eyes follow the cursor is the drawing's own rule: not while busy, never under
    // reduce motion. src/character.js.)
    const busyNow = calls > 0

    // Something new was said, the log was switched on, or the helper came back: show the newest
    // words, at the bottom of the helper's scrolling area.
    useEffect(() => {
      const el = helperScroll.current
      if (el) el.scrollTop = el.scrollHeight
    }, [log.length, chatlog, helperShown, modelStatus.state])

    // Picking an answer: saved, and the helper says "Your answer: …" with the fact it points to.
    function choose(option) {
      if (answers[currentStep.id] === option.id) return
      const next = { ...answers, [currentStep.id]: option.id }
      setAnswers(next)
      ctx.storage.set('answers', next)
      addToLog([answerEntry(currentStep, option.id)])
    }

    // "I understand, next step": the step's next_rule picks the next step (code, not the model).
    // After the last step the helper says so once.
    function finishStep() {
      const to = nextAfter(currentStep, answers[currentStep.id])
      if (to !== 'done') return saveStep(to)
      if (!(chatMemory || log).some(e => e.kind === 'done')) addToLog([doneEntry()])
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

    /* ---------- helper panel (Pēteris's sketch, inputs/pb-sketch-9nov-helper-chat.png) ---------- */
    // "Check again" is always secondary: the step's own button is the screen's one primary button.
    const checkAgain = () =>
      jsx(Button, { variant: 'secondary', size: 'sm', disabled: modelStatus.state === 'checking', onClick: () => recheck(), children: 'Check again' }, 'again')

    // What the page itself has to say about the model check: no model (content/v1-strings.md part 1)
    // or the check failed (its "Can't check right now"). It counts as said when it appeared, so
    // anything the person does afterwards (an answer, a pasted key) still shows as the newest.
    const statusEntry = noModel
      ? { id: 'status', who: 'helper', kind: 'no-model', lines: [NO_MODEL_LINE], small: NO_MODEL_SMALL, action: 'recheck' }
      : modelStatus.state === 'error'
        ? { id: 'status', who: 'helper', kind: 'error', lines: [CANT_CHECK_LINE], action: 'recheck' }
        : null
    const statusKind = statusEntry ? statusEntry.kind : null
    if (statusSeen.current.kind !== statusKind) statusSeen.current = { kind: statusKind, after: log.length ? log[log.length - 1].id : 0 }
    const statusAfter = statusSeen.current.after

    // One line Helper says, revealed word by word (src/reveal.js) and noted for the clock. Lines
    // of the newest turn are fresh: they are revealed. An older line met for the first time (the
    // Chat log switched on later) is shown whole.
    const say = (e, part, line, className, fresh) => {
      const key = `${e.id}${e.id === 'status' ? '-' + e.kind : ''}:${part}`
      // Under reduce motion no line is fresh: it is whole from its first draw.
      const appears = fresh && !reduced
      saidNow.push({ key, words: wordsOf(line).length, fresh: appears, text: line })
      return jsx(Said, { clock, id: key, text: line, className, fresh: appears }, part)
    }

    // One thing the helper (or the person) said, as plain text: no bubble, no card. Helper's texts
    // appear in order: its lines, then its small note; the person's own words appear at once, and
    // so do buttons, links and text to paste.
    const entryParts = (e, fresh) => {
      const you = e.who === 'you'
      const parts = e.lines.map((line, i) => (you ? jsx('p', { className: K.logYou, children: line }, 'l' + i) : say(e, 'l' + i, line, K.say, fresh)))
      if (e.small) parts.push(say(e, 'small', e.small, K.caption, fresh))
      if (e.fact) parts.push(say(e, 'fact', e.fact.text, K.caption, fresh), jsx('div', { children: factSource(e.fact) }, 'fact-src'))
      if (e.paste) parts.push(jsx(PasteBox, { text: e.paste, label: 'Copy' }, 'paste'))
      if (e.after) parts.push(say(e, 'after', e.after, K.say, fresh))
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

    // The step list's short title, as in the sketch ("On step 2: The brain"); the full title is the
    // open step's heading.
    const where = tab === 'setup' ? `On step ${currentStep.number}: ${railLines(currentStep).title}` : setup.bots.length > 1 ? `On Your setup, bot ${setup.bot}` : 'On Your setup'
    const topLine = noModel
      ? contextLine('info', NO_MODEL_PROGRESS, false)
      : modelStatus.state === 'checking'
        ? contextLine('', 'Checking your model', true)
        : modelStatus.state === 'error'
          ? null
          : contextLine('location', where, false)

    // Chat log off: only the newest thing the helper said. On: the whole back-and-forth, newest at
    // the bottom. Either way it sits low in the panel with empty space above it.
    // Fresh = part of the newest thing said (the newest turn, or the model-check line while nothing
    // was said after it): these are the lines that appear word by word.
    const newestTurn = log.length ? log[log.length - 1].turn : null
    const statusNewest = !!statusEntry && !log.some(e => e.id > statusAfter)
    const isFresh = e => (e.id === 'status' ? statusNewest : e.turn === newestTurn)
    let wordsView
    if (chatlog) {
      const entries = statusEntry ? [...log.filter(e => e.id <= statusAfter), statusEntry, ...log.filter(e => e.id > statusAfter)] : log
      wordsView = jsx(
        'ol',
        {
          className: K.log,
          'data-hh': 'chatlog',
          'aria-label': 'Chat log',
          'aria-live': 'polite',
          children: entries.map(e =>
            jsxs(
              'li',
              {
                className: K.logEntry,
                'data-who': e.who,
                'data-kind': e.kind,
                children: [jsx('span', { className: K.logWho, children: e.who === 'you' ? 'You' : 'Helper' }, 'who'), jsx('div', { className: K.sayStack, children: entryParts(e, isFresh(e)) }, 'what')]
              },
              e.id
            )
          )
        },
        'log'
      )
    } else {
      // The newest turn's helper lines (an answer with its note, a reply after a long message); the
      // model-check line when nothing was said since it appeared.
      const fromHelper = log.filter(e => e.turn === newestTurn && e.who === 'helper')
      const shown = statusNewest ? [statusEntry] : fromHelper.length ? fromHelper : [log[log.length - 1]]
      wordsView = jsx(
        'div',
        {
          className: K.sayStack,
          'data-hh': 'say',
          'data-kind': shown[shown.length - 1].kind,
          'aria-live': 'polite',
          children: shown.map(e => jsx('div', { className: K.sayStack, children: entryParts(e, isFresh(e)) }, e.id))
        },
        'say'
      )
    }
    const helperBody = [topLine, jsx('div', { className: K.helperNewest, 'data-hh': 'helper-newest', children: wordsView }, 'newest')]

    // Which expression the character shows (src/expressions.js). Asking: the last thing Helper
    // said ends with a question mark and all of it is on screen.
    const lastSaid = saidNow.length ? saidNow[saidNow.length - 1] : null
    const question = !!lastSaid && asksQuestion(lastSaid.text) && clock.shown(lastSaid.key, lastSaid.words, lastSaid.fresh) >= lastSaid.words
    const expression = expressionFor({ revealing, busy: busyNow, question })

    // The character has its own row directly above the message box, at the box's left end, its
    // finger ends over the box's top border (CHARACTER_ROW). It rises when the helper opens.
    const characterRow = jsx(
      'div',
      {
        className: K.characterRow,
        style: CHARACTER_ROW,
        'data-hh': 'character',
        children: jsx(Character, { size: CHARACTER_PX, expression, rising: !risen.current, reduced, eyes: eyes.current })
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
            jsx('div', { className: K.helperBody, ref: helperScroll, 'data-hh': 'helper-body', children: helperBody }),
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
