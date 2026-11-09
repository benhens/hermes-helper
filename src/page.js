// The Helping Hand page: header with two text tabs, step list, open step, helper panel.
// B1 = the page shell. Step texts are placeholders until hhcontent's data arrives (B3); the
// "Your setup" cards are B2; the helper's model call is B4. B3a = the native pass (hhdesign's
// b1-design-review.md fixes 1-6, 7 and 8) and narrow windows (src/layout.js).
// Look: Hermes's own UI kit components (Button, Switch, Textarea, Tip, EmptyState, GlyphSpinner,
// Codicon, RowButton) and, where Hermes has no kit component (its text tabs and vertical strips
// aren't in the SDK), the class strings its own screens use (src/look.js). No CSS of our own.
import { host, Button, Codicon, EmptyState, GlyphSpinner, RowButton, Switch, Textarea, Tip, PRIMARY_ICON_BTN, composerInputBacking, composerSurfaceRing } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { K, cx } from './look.js'
import { Character } from './character.js'
import { readState, otherSide, STEP_COUNT } from './state.js'
import { checkModel, modelLabel, NO_MODEL_LINE, NO_MODEL_SMALL, NO_MODEL_PROGRESS, NO_MODEL_BOX, CANT_CHECK_LINE, RECHECK_AFTER_MS } from './model-status.js'
import { PLACEHOLDER_STEPS, LATER_STEPS, VERSION_LINE } from './placeholder-steps.js'
import { makeSetupCards, renderYourSetup } from './setup-tab.js'
import { layoutFor, RAIL_PX, RAIL_NUMBERS_PX, HELPER_PX } from './layout.js'

// Column widths (layout only; every colour, font and line comes from Hermes's classes).
const RAIL_WIDTH = `${RAIL_PX}px`
const RAIL_NUMBERS_WIDTH = `${RAIL_NUMBERS_PX}px`
const HELPER_WIDTH = `${HELPER_PX}px`

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
  const useSetupCards = makeSetupCards(ctx)
  const sleep = ms => new Promise(resolve => ctx.setTimeout(resolve, ms))
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
    const [chosen, setChosen] = useState({})
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

    const currentStep = PLACEHOLDER_STEPS[step - 1]
    const noModel = modelStatus.state === 'none'
    // The model's name as Hermes's model button shows it, the free tier's label, or "your model"
    // (src/model-status.js, docs/answers/hhtech-model-display-name.md). Never host.state.model.
    const modelName = modelStatus.state === 'ok' ? modelLabel(modelStatus.name) : ''

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
                    jsx('span', { className: K.rowTitle, children: s.title }),
                    jsx('span', { className: K.rowSub, children: jsx('span', { className: K.truncate, children: s.short }) })
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
              jsx('div', { className: K.rowList, children: PLACEHOLDER_STEPS.map(stepRow) }),
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

    // The open step is wide enough for the facts side by side (and the three choices in a row).
    const wideStep = fit.columns === 2
    const stepView = currentStep.heading
      ? [
          stepHeader(currentStep.heading, jsx('p', { className: K.prose, children: currentStep.intro })),
          jsx('dl', {
            className: cx(K.pairGrid, wideStep && K.twoColumns),
            'data-hh': 'facts',
            'data-columns': fit.columns,
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
                className: cx(K.choices, wideStep && K.threeColumns),
                role: 'group',
                'aria-label': currentStep.question,
                'data-hh': 'choices',
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

    /* ---------- helper panel ---------- */
    // "Check again" is always secondary: the step's own button is the screen's one primary button.
    const checkAgain = () =>
      jsx(Button, { variant: 'secondary', size: 'sm', disabled: modelStatus.state === 'checking', onClick: () => recheck(), children: 'Check again' })

    const say = (text, actions, small) =>
      jsxs(
        'div',
        {
          className: K.bubble,
          'data-hh': 'bubble',
          children: [
            jsx('p', { className: K.bubbleText, children: text }),
            small ? jsx('p', { className: K.caption, children: small }) : null,
            actions ? jsx('div', { className: K.bubbleActions, children: actions }) : null
          ]
        },
        'say'
      )

    // The character: one swappable component (src/character.js), unchanged.
    const character = mood => jsx('div', { className: K.characterRow, children: jsx(Character, { size: 72, mood }) }, 'who')
    // The newest things the helper says sit just above the message box (hhdesign fix 3).
    const newest = children => jsx('div', { className: K.helperNewest, 'data-hh': 'helper-newest', children }, 'newest')

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

    let helperBody
    if (noModel) {
      // content/v1-strings.md part 1: the progress line, the fixed bubble with its small line and
      // "Check again". No model call anywhere.
      helperBody = [contextLine('info', NO_MODEL_PROGRESS, false), newest([say(NO_MODEL_LINE, checkAgain(), NO_MODEL_SMALL), character('straight')])]
    } else {
      const where = tab === 'setup' ? `On step ${step}: ${currentStep.title}` : setup.bots.length > 1 ? `On Your setup, bot ${setup.bot}` : 'On Your setup'
      helperBody = [
        modelStatus.state === 'checking'
          ? contextLine('', 'Checking your model', true)
          : modelStatus.state === 'error'
            ? null
            : contextLine('location', where, false),
        chatlog
          ? jsx('div', { 'data-hh': 'chatlog', children: jsx(EmptyState, { className: K.logEmpty, title: 'No messages yet', description: 'What you and the helper say shows here.' }) }, 'log')
          : modelStatus.state === 'error'
            ? newest([say(CANT_CHECK_LINE, checkAgain()), character('straight')])
            : newest([say('Open a step and ask me about it here. I explain things; I don’t change your settings.'), character('smile')])
      ]
    }

    // One line that grows as you type, then the model's name and send on the same row (hhdesign
    // fix 2). With no model the box stays, empty and greyed, with hhdesign's words.
    const composer = jsx('form', {
      className: K.composerForm,
      onSubmit: e => e.preventDefault(),
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
                  placeholder: noModel ? NO_MODEL_BOX : tab === 'setup' ? 'Ask about this step' : 'Ask about your setup',
                  'aria-label': 'Ask the helper'
                })
              }),
              modelName
                ? jsx('span', { className: K.composerModel, 'data-hh': 'model-name', children: jsx('span', { className: K.truncate, children: modelName }) })
                : null,
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
            composer,
            noModel ? null : jsx('p', { className: K.composerNote, children: 'It explains; it doesn’t change your settings.' })
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
