// The "Your setup" tab: reads the person's Hermes through read-only calls, hands each answer to the
// fixed rules in src/setup-cards.js, and draws the cards (build-v1.md section 8).
// Reads (all read-only; never .env, auth.json or config.get):
//   card 1  host.state.gateway                      card 4  profiles.describe { name } -> soul
//   card 2  setup.runtime_check (+ setup.status)    card 5  host.skills.list(profile)
//   card 3  llm.oneshot, only when Check is pressed card 6  host.toolsets.list(profile) -> memory
//   card 7  nothing: the person runs the test in their own chat and presses a button
// Reads start the first time the tab is opened, and again on "Check again". Nothing polls.
import { host, useValue, Button, CopyButton, GlyphSpinner, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { K, cx } from './look.js'
import { checkModel } from './model-status.js'
import { askModel } from './model-call.js'
import { STATUS, PASSES, REMEMBER, ANSWER_CALL, cardTitle, gatewayCard, modelCard, answersCard, soulCard, skillsCard, memoryCard, rememberCard } from './setup-cards.js'

// profiles.describe's own limit is Hermes's 30 s default; host.skills/toolsets get the same limit here.
export const READ_TIMEOUT_MS = 30000

// The bot (profile) Hermes is running now; '' from Hermes means the default one.
export function runningBotName(profile) {
  return typeof profile === 'string' && profile.trim() ? profile.trim() : 'default'
}

// What ctx.storage keeps for card 7: { [bot]: 'yes' | 'no' }. Anything else is dropped.
export function readRemember(value) {
  const out = {}
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) if (v === 'yes' || v === 'no') out[k] = v
  }
  return out
}

const DOT = { works: K.dotWorks, fix: K.dotFix, cant: K.dotCant }

export function makeSetupCards(ctx) {
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

export function PasteBox({ text, label }) {
  return jsxs('div', {
    className: K.cardPaste,
    children: [
      jsx('span', { className: K.cardPasteText, children: text }),
      jsx(CopyButton, { text, label, appearance: 'button', buttonSize: 'xs', buttonVariant: 'ghost' })
    ]
  })
}

export function renderYourSetup(s, { openStep, cardColumns = 2 }) {
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
