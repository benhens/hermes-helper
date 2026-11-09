// The Helping Hand page: header with two tabs, step list, open step, helper panel.
// B1 = the page shell. Step texts are placeholders until hhcontent's data arrives (B3); the
// "Your setup" cards are B2; the helper's model call is B4. What is real in B1: the layout, the
// Hermes-native look, the helper's Move / Hide / Close states (remembered), and the model check.
// Look: Hermes's own UI kit components (Button, SegmentedControl, Switch, Textarea, Tip, EmptyState,
// GlyphSpinner, Codicon, RowButton) and, where Hermes has no kit component, the class strings its own
// screens use (src/look.js). No CSS of our own.
import { host, useValue, Button, Codicon, EmptyState, GlyphSpinner, RowButton, SegmentedControl, Switch, Textarea, Tip, PRIMARY_ICON_BTN, composerInputBacking, composerSurfaceRing } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { K, cx } from './look.js'
import { Character } from './character.js'
import { readState, otherSide, STEP_COUNT } from './state.js'
import { checkModel, NO_MODEL_LINE, CANT_CHECK_LINE, RECHECK_AFTER_MS } from './model-status.js'
import { PLACEHOLDER_STEPS, LATER_STEPS, VERSION_LINE } from './placeholder-steps.js'

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

export function makePage(ctx) {
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
